const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { chmod, mkdir, mkdtemp, readdir, rename, rm, stat, unlink, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { Client } = require('pg');
const { obtenerPool, cerrarPoolsPostgres } = require('../database/postgres');
const { obtenerPoolTenant, obtenerTenantPorSlug, validarSlug } = require('../server/tenancy/tenant-registry');

class ErrorBackup extends Error {}

async function prepararConexion(databaseUrl, directorio) {
    const url = new URL(databaseUrl);
    const conexion = new Client({ connectionString: databaseUrl }).connectionParameters;
    const { database, host, port, user, password } = conexion;
    const env = { ...process.env, PGHOST: host, PGPORT: String(port), PGDATABASE: database, PGUSER: user };
    for (const clave of ['PGPASSWORD', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGREQUIRESSL']) delete env[clave];
    env.PGCONNECT_TIMEOUT = url.searchParams.get('connect_timeout') || env.PGCONNECT_TIMEOUT || '10';
    env.PGSSLMODE = url.searchParams.get('sslmode')
        || (process.env.PG_SSL_CA
            ? 'verify-full'
            : (process.env.PG_SSL === 'true' || url.searchParams.get('ssl') === 'true' ? 'require' : env.PGSSLMODE || 'prefer'));
    if (process.env.PG_SSL_CA) env.PGSSLROOTCERT = process.env.PG_SSL_CA;
    for (const clave of ['sslrootcert', 'sslcert', 'sslkey', 'options', 'application_name']) {
        const valor = url.searchParams.get(clave);
        if (valor !== null) env[clave === 'application_name' ? 'PGAPPNAME' : `PG${clave.toUpperCase()}`] = valor;
    }
    if (password) {
        const campos = [host, port, database, user, password].map(String);
        if (campos.some((campo) => /[\r\n]/.test(campo))) throw new ErrorBackup('La conexión contiene un valor incompatible con pgpass.');
        env.PGPASSFILE = join(directorio, 'pgpass');
        await writeFile(env.PGPASSFILE, campos.map((campo) => campo.replace(/[\\:]/g, '\\$&')).join(':') + '\n', {
            mode: 0o600, flag: 'wx'
        });
    }
    return { env, database };
}

function ejecutarPgDump(archivo, env) {
    return new Promise((resolve, reject) => {
        const proceso = spawn(process.env.PG_DUMP_PATH || 'pg_dump', [
            '--format=custom', '--no-password', '--file', archivo
        ], { env, stdio: 'ignore', windowsHide: true });
        proceso.once('error', (error) => reject(new ErrorBackup(error.code === 'ENOENT'
            ? 'pg_dump no está disponible. Agrégalo al PATH o configura PG_DUMP_PATH.'
            : 'No se pudo iniciar pg_dump.')));
        proceso.once('close', (codigo) => {
            if (codigo === 0) resolve();
            else reject(new ErrorBackup(`pg_dump no completó el respaldo (código ${codigo ?? 'interrumpido'}).`));
        });
    });
}

async function podarRespaldos(directorio, prefijo, maximo) {
    const entradas = await readdir(directorio, { withFileTypes: true });
    const archivos = entradas.filter((entrada) => entrada.isFile() && entrada.name.startsWith(prefijo)
        && /^\d{8}T\d{9}Z-[a-f0-9-]{36}\.dump$/.test(entrada.name.slice(prefijo.length)));
    const ordenados = archivos.map(({ name }) => name).sort().reverse();
    for (const archivo of ordenados.slice(maximo)) await unlink(join(directorio, archivo));
}

async function respaldarTenant(slug) {
    const normalizado = validarSlug(slug);
    const tenant = await obtenerTenantPorSlug(normalizado);
    if (!tenant) throw new ErrorBackup('El tenant solicitado debe estar registrado y activo.');
    const pool = await obtenerPoolTenant(tenant);
    if (pool === obtenerPool(process.env.CONTROL_DATABASE_URL)) {
        throw new ErrorBackup('El tenant requiere una base operativa separada del registro de control.');
    }
    const { rows: [base] } = await pool.query(
        "SELECT current_database() AS nombre, to_regclass('control_tenants') IS NOT NULL AS control"
    );
    if (base.control || base.nombre !== tenant.database_name) {
        throw new ErrorBackup('La conexión operativa no coincide con el registro del tenant.');
    }
    const maximo = Number(process.env.MAX_BACKUPS_LOCAL ?? 30);
    if (!Number.isSafeInteger(maximo) || maximo < 1) throw new ErrorBackup('MAX_BACKUPS_LOCAL debe ser un entero positivo.');

    const directorio = resolve(process.env.BACKUP_DIR || 'backups');
    await mkdir(directorio, { recursive: true, mode: 0o700 });
    const temporal = await mkdtemp(join(directorio, '.pg-dump-'));
    const archivo = join(temporal, 'respaldo.dump');
    const prefijo = `caja-backup-${normalizado}-`;
    const fecha = new Date().toISOString().replace(/[-:.]/g, '');
    const destino = join(directorio, `${prefijo}${fecha}-${randomUUID()}.dump`);
    try {
        const { env, database } = await prepararConexion(pool.options.connectionString, temporal);
        if (database !== base.nombre) throw new ErrorBackup('La base de pg_dump no coincide con el registro del tenant.');
        await ejecutarPgDump(archivo, env);
        if (!(await stat(archivo)).size) throw new ErrorBackup('pg_dump generó un archivo vacío.');
        await chmod(archivo, 0o600);
        await rename(archivo, destino);
    } finally {
        await rm(temporal, { recursive: true, force: true });
    }
    try {
        await podarRespaldos(directorio, prefijo, maximo);
    } catch {
        console.warn('El respaldo se generó, pero no se completó la retención local.');
    }

    const control = obtenerPool(process.env.CONTROL_DATABASE_URL);
    await control.query(`
        UPDATE control_tenants
        SET ultimo_backup_exitoso = CURRENT_TIMESTAMP,
            actualizado_en = CURRENT_TIMESTAMP
        WHERE tenant_id = $1
    `, [tenant.tenant_id]);
    return destino;
}

if (require.main === module) {
    if (process.argv.length !== 3) {
        console.error('Uso: npm run backup -- <slug>');
        process.exitCode = 1;
    } else {
        respaldarTenant(process.argv[2])
            .finally(cerrarPoolsPostgres)
            .then((archivo) => console.log(`Respaldo lógico PostgreSQL generado en ${archivo}`))
            .catch((error) => {
                console.error(error instanceof ErrorBackup ? error.message : 'No se pudo generar el respaldo PostgreSQL.');
                process.exitCode = 1;
            });
    }
}

module.exports = { respaldarTenant };
