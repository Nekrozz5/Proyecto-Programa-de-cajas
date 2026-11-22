const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client, Pool } = require('pg');
const { cerrarPoolsPostgres } = require('../database/postgres');
const { provisionarTenant } = require('../database/provisionar-tenant');
const { sembrarCafeteria } = require('./seed_cafeteria');

const DEMO_SLUG = 'demo';
const DEMO_DATABASE = 'negocio_demo';

function urlParaBase(urlTexto, database) {
    const url = new URL(urlTexto);
    url.pathname = `/${database}`;
    return url.toString();
}

async function crearBaseDemoSiNoExiste() {
    const controlUrl = process.env.CONTROL_DATABASE_URL;
    if (!controlUrl) throw new Error('CONTROL_DATABASE_URL no está configurada.');

    const admin = new Client({ connectionString: urlParaBase(controlUrl, 'postgres') });
    await admin.connect();
    try {
        const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DEMO_DATABASE]);
        if (!rows.length) {
            await admin.query(`CREATE DATABASE "${DEMO_DATABASE}"`);
            console.log(`Base de demostración creada: ${DEMO_DATABASE}`);
        } else {
            console.log(`Base de demostración existente: ${DEMO_DATABASE}`);
        }
    } finally {
        await admin.end();
    }
}

async function registrarTenantDemo() {
    const control = new Pool({ connectionString: process.env.CONTROL_DATABASE_URL });
    try {
        const existente = await control.query(
            'SELECT tenant_id FROM control_tenants WHERE slug = $1',
            [DEMO_SLUG]
        );
        if (existente.rowCount) {
            console.log('Tenant demo ya registrado; se conservará sin modificarlo.');
            return;
        }

        await control.query(`
            INSERT INTO control_tenants (tenant_id, nombre, slug, database_name, estado)
            VALUES ($1, 'Negocio Demo', $2, $3, 'activo')
        `, [crypto.randomUUID(), DEMO_SLUG, DEMO_DATABASE]);
        console.log('Tenant demo registrado en control_plane.');
    } finally {
        await control.end();
    }
}

function guardarResolverDemo(urlDemo) {
    const archivo = path.resolve(process.cwd(), '.env.local');
    if (!fs.existsSync(archivo)) return;

    const contenido = fs.readFileSync(archivo, 'utf8');
    const lineas = contenido.split(/\r?\n/);
    const indice = lineas.findIndex((linea) => linea.startsWith('TENANT_DATABASE_URLS_JSON='));
    const mapa = JSON.parse(process.env.TENANT_DATABASE_URLS_JSON || '{}');
    mapa[DEMO_SLUG] = urlDemo;
    const lineaNueva = `TENANT_DATABASE_URLS_JSON=${JSON.stringify(mapa)}`;

    if (indice >= 0) lineas[indice] = lineaNueva;
    else lineas.push(lineaNueva);

    fs.writeFileSync(archivo, lineas.join('\n'), 'utf8');
    console.log('Resolver demo guardado en .env.local. Reinicia Next.js para cargarlo.');
}

async function ejecutar() {
    const urlDemo = urlParaBase(process.env.CONTROL_DATABASE_URL, DEMO_DATABASE);
    if (process.argv.includes('--configure-only')) {
        guardarResolverDemo(urlDemo);
        return;
    }

    const password = process.env.DEMO_SEED_PASSWORD;
    const pin = process.env.DEMO_SEED_PIN;
    if (!password || !pin) {
        throw new Error('Configura DEMO_SEED_PASSWORD y DEMO_SEED_PIN antes de ejecutar el demo.');
    }

    await crearBaseDemoSiNoExiste();
    await registrarTenantDemo();

    const mapa = JSON.parse(process.env.TENANT_DATABASE_URLS_JSON || '{}');
    mapa[DEMO_SLUG] = urlDemo;
    process.env.TENANT_DATABASE_URLS_JSON = JSON.stringify(mapa);
    guardarResolverDemo(urlDemo);

    await provisionarTenant(DEMO_SLUG);
    await sembrarCafeteria({ slug: DEMO_SLUG, password, pin });
    console.log('Base demo cargada. Ábrela en http://demo.localhost:3000');
}

ejecutar()
    .finally(cerrarPoolsPostgres)
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
