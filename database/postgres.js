/**
 * Conexiones PostgreSQL perezosas para el control plane y los tenants.
 *
 * No abre conexiones durante `next build`. Cada URL recibe su propio pool y
 * nunca se construye a partir de datos enviados por el navegador.
 */
const { Pool } = require('pg');
const { readFileSync } = require('node:fs');

const pools = new Map();

function obtenerSslDesdeEntorno() {
    if (process.env.PG_SSL !== 'true') return undefined;
    const caPath = String(process.env.PG_SSL_CA || '').trim();
    if (!caPath) return { rejectUnauthorized: true };
    return {
        rejectUnauthorized: true,
        ca: readFileSync(caPath, 'utf8')
    };
}

function obtenerPool(databaseUrl, options = {}) {
    if (!databaseUrl || typeof databaseUrl !== 'string') {
        throw new Error('Se requiere una URL PostgreSQL para abrir la conexión.');
    }

    const clave = databaseUrl;
    if (!pools.has(clave)) {
        pools.set(clave, new Pool({
            connectionString: databaseUrl,
            max: Number(options.max || process.env.PG_POOL_MAX || 10),
            idleTimeoutMillis: Number(options.idleTimeoutMillis || 30_000),
            connectionTimeoutMillis: Number(options.connectionTimeoutMillis || 5_000),
            ssl: options.ssl ?? obtenerSslDesdeEntorno()
        }));
    }

    return pools.get(clave);
}

async function cerrarPoolsPostgres() {
    const cierres = Array.from(pools.values(), (pool) => pool.end());
    await Promise.all(cierres);
    pools.clear();
}

async function enTransaccionPostgres(pool, ejecutar) {
    const client = await pool.connect();
    let errorRollback;
    try {
        await client.query('BEGIN');
        const resultado = await ejecutar(client);
        await client.query('COMMIT');
        return resultado;
    } catch (error) {
        await client.query('ROLLBACK').catch((errorCierre) => { errorRollback = errorCierre; });
        throw error;
    } finally {
        client.release(errorRollback);
    }
}

module.exports = { obtenerPool, cerrarPoolsPostgres, enTransaccionPostgres, obtenerSslDesdeEntorno };
