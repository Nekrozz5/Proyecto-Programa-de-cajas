const { randomBytes, randomInt, randomUUID } = require('node:crypto');
const { fork, spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { Pool } = require('pg');
const { cerrarPoolsPostgres } = require('../database/postgres');
const { ejecutarMigracionesControl } = require('../database/migraciones-control');
const { ejecutarMigracionesEnPool } = require('../database/migraciones-tenant');
const { crearTenant } = require('../server/tenancy/tenant-registry');
const { ejecutarConContextoTenant } = require('../server/repositories/db');
const { crearUsuario } = require('../server/repositories/auth.repo');

function urlPruebas() {
    if (!process.env.POSTGRES_TEST_URL) {
        throw new Error('Configura POSTGRES_TEST_URL con una base de mantenimiento y permiso CREATEDB.');
    }
    let url;
    let base;
    try {
        url = new URL(process.env.POSTGRES_TEST_URL);
        base = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
    } catch {
        throw new Error('POSTGRES_TEST_URL no es una URL PostgreSQL válida.');
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !base || url.searchParams.has('database') || url.searchParams.has('dbname')) {
        throw new Error('POSTGRES_TEST_URL debe indicar la base PostgreSQL en la ruta.');
    }
    if (['control_plane', 'negocio_001'].includes(base)) {
        throw new Error('POSTGRES_TEST_URL debe apuntar a una base de mantenimiento separada.');
    }
    return url;
}

function planificarBases(...nombres) {
    const mantenimiento = urlPruebas();
    const prefijo = `pos_f3_${randomBytes(10).toString('hex')}`;
    return Object.fromEntries(nombres.map((nombre, indice) => {
        const url = new URL(mantenimiento);
        const base = `${prefijo}_${indice}`;
        url.pathname = `/${base}`;
        for (const clave of ['database', 'dbname', 'options']) url.searchParams.delete(clave);
        return [nombre, { base, url: url.toString() }];
    }));
}

async function abrirBases(plan, opcionesPool) {
    const ssl = process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
    const admin = new Pool({ connectionString: urlPruebas().toString(), ssl, connectionTimeoutMillis: 5000 });
    const creadas = [];
    const pools = {};

    async function cerrar() {
        const cierres = await Promise.allSettled(Object.values(pools).map((pool) => pool.end()));
        try {
            for (const base of creadas.reverse()) {
                try {
                    await admin.query(`DROP DATABASE ${base} WITH (FORCE)`);
                } catch (error) {
                    cierres.push({ status: 'rejected', reason: error });
                }
            }
        } finally {
            await admin.end();
        }
        if (cierres.some(({ status }) => status === 'rejected')) {
            throw new Error('Falló la limpieza de las bases temporales PostgreSQL.');
        }
    }

    try {
        for (const [nombre, { base, url }] of Object.entries(plan)) {
            // Solo se eliminan nombres generados por el fixture y creados por esta ejecución.
            if (!/^pos_f3_[a-f0-9]{20}_\d+$/.test(base) || new URL(url).pathname !== `/${base}`) {
                throw new Error('Identificador inválido para una base temporal PostgreSQL.');
            }
            await admin.query(`CREATE DATABASE ${base} TEMPLATE template0`);
            creadas.push(base);
            pools[nombre] = new Pool({ ...opcionesPool, connectionString: url, ssl, connectionTimeoutMillis: 5000 });
        }
        return { pools, cerrar };
    } catch (error) {
        await cerrar();
        throw error;
    }
}

async function conBasesPostgres(nombres, ejecutar, opcionesPool = {}) {
    const plan = planificarBases(...nombres);
    const { pools, cerrar } = await abrirBases(plan, opcionesPool);
    try {
        return await ejecutar(pools, plan);
    } finally {
        try {
            await cerrarPoolsPostgres();
        } finally {
            await cerrar();
        }
    }
}

function contextoOperativo(pool, slug = 'fixture', tenantId = randomUUID()) {
    return { pool, tenantId, tenant: { tenant_id: tenantId, slug } };
}

function correrPlaywright(env, args) {
    return new Promise((resolve, reject) => {
        const proceso = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...args], {
            env, stdio: 'inherit', windowsHide: true,
        });
        proceso.once('error', reject);
        proceso.once('close', (codigo) => resolve(codigo ?? 1));
    });
}

async function conServidorE2E(env, ejecutar) {
    const proceso = fork(__filename, ['--servidor-e2e'], {
        env: { ...env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        windowsHide: true,
    });
    const cerrado = once(proceso, 'exit');
    try {
        const [port] = await Promise.race([
            once(proceso, 'message', { signal: AbortSignal.timeout(120_000) }),
            cerrado.then(() => { throw new Error('El servidor Next de E2E terminó durante el arranque.'); })
        ]);
        return await ejecutar({ ...env, POS_E2E_BOUND_PORT: String(port) });
    } finally {
        if (proceso.connected) proceso.disconnect();
        await cerrado;
    }
}

async function iniciarServidorE2E() {
    const hostname = '127.0.0.1';
    const server = createServer();
    const portSolicitado = Number(process.env.POS_E2E_PORT || 0);
    server.listen(portSolicitado, hostname);
    await once(server, 'listening');
    const { port } = server.address();
    const app = require('next')({ dev: true, hostname, port, httpServer: server });
    await app.prepare();
    server.on('request', app.getRequestHandler());
    process.send(port);
}

function prepararPlaywright(args) {
    return conBasesPostgres(['control', 'cafeteria', 'otro-negocio'], async (pools, plan) => {
        process.env.CONTROL_DATABASE_URL = plan.control.url;
        await ejecutarMigracionesControl();
        const env = {
            ...process.env,
            TENANCY_MODE: 'AWS_MULTI_TENANT',
            TENANT_HOST_SUFFIX: 'localhost',
            TENANT_DATABASE_URL: plan.cafeteria.url,
            TENANT_DATABASE_URLS_JSON: JSON.stringify({
                cafeteria: plan.cafeteria.url,
                'otro-negocio': plan['otro-negocio'].url,
            }),
            SESSION_SECRET: randomBytes(32).toString('hex'),
            POS_E2E_CLAVE: `A1${randomBytes(16).toString('hex')}`,
            POS_E2E_PIN: String(randomInt(1000, 10000)),
        };
        for (const slug of ['cafeteria', 'otro-negocio']) {
            const tenant = await crearTenant({ nombre: slug, slug, databaseName: plan[slug].base });
            await ejecutarMigracionesEnPool(pools[slug]);
            if (slug === 'cafeteria') {
                await pools[slug].query("INSERT INTO configuracion_negocio (id, nombre_negocio, configurado) VALUES (1, 'Cafetería de prueba', 1)");
                env.POS_E2E_TENANT_ID = tenant.tenant_id;
                await ejecutarConContextoTenant(contextoOperativo(pools[slug], slug, tenant.tenant_id), async () => {
                    await crearUsuario('Propietario E2E', env.POS_E2E_CLAVE, 'propietario');
                    await crearUsuario('Cajero E2E', env.POS_E2E_PIN, 'user');
                });
            } else {
                env.POS_E2E_OTRO_TENANT_ID = tenant.tenant_id;
            }
        }
        return conServidorE2E(env, (entorno) => correrPlaywright(entorno, args));
    });
}

if (require.main === module) {
    if (process.argv[2] === '--servidor-e2e' && process.send) {
        process.once('disconnect', () => process.exit(0));
        iniciarServidorE2E().catch(() => process.exit(1));
    } else {
        prepararPlaywright(process.argv.slice(2))
            .then((codigo) => { process.exitCode = codigo; })
            .catch((error) => {
                const codigo = /^[A-Z0-9]{5}$/.test(error.code) ? ` (${error.code})` : '';
                console.error(`Falló la preparación o limpieza de Playwright PostgreSQL${codigo}.`);
                process.exitCode = 1;
            });
    }
}

module.exports = { urlPruebas, conBasesPostgres, contextoOperativo };
