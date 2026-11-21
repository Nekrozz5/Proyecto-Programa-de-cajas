/**
 * Acceso a PostgreSQL operativo con aislamiento por tenant y transacción.
 */
const { types } = require('pg');
const { obtenerPoolTenant } = require('../tenancy/tenant-registry');
const {
    exigirContextoTenant,
    ejecutarConContextoTenant
} = require('../tenancy/tenant-context');
const { redondear2 } = require('../domain/costos');

const tiposPos = {
    getTypeParser(oid, formato = 'text') {
        // El POS devuelve importes como números. PostgreSQL conserva los decimales al operar.
        if (oid === types.builtins.NUMERIC && formato === 'text') return Number;
        return types.getTypeParser(oid, formato);
    }
};

async function obtenerPoolOperativo() {
    const { pool, tenant } = exigirContextoTenant();
    return pool || obtenerPoolTenant(tenant);
}

async function consultaPostgres(sqlTexto, params) {
    const contexto = exigirContextoTenant();
    const cliente = contexto.client || await obtenerPoolOperativo();
    return cliente.query({ text: sqlTexto, values: params, types: tiposPos });
}

async function runQuery(sqlTexto, params = []) {
    const resultado = await consultaPostgres(sqlTexto, params);
    return {
        lastID: resultado.rows[0]?.id ?? null,
        changes: resultado.rowCount ?? 0
    };
}

async function getQuery(sqlTexto, params = []) {
    const { rows } = await consultaPostgres(sqlTexto, params);
    return rows[0];
}

async function allQuery(sqlTexto, params = []) {
    const { rows } = await consultaPostgres(sqlTexto, params);
    return rows;
}

function numeroPositivo(valor, nombreCampo = 'El valor') {
    if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') {
        throw new Error(`${nombreCampo} debe ser un número finito mayor a 0.`);
    }
    const num = Number(valor);
    if (!Number.isFinite(num) || num <= 0) throw new Error(`${nombreCampo} debe ser un número finito mayor a 0.`);
    return num;
}

function numeroNoNegativo(valor, nombreCampo = 'El valor') {
    if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') {
        throw new Error(`${nombreCampo} debe ser un número finito mayor o igual a 0.`);
    }
    const num = Number(valor);
    if (!Number.isFinite(num) || num < 0) throw new Error(`${nombreCampo} debe ser un número finito mayor o igual a 0.`);
    return num;
}

async function enTransaccion(fn) {
    const contexto = exigirContextoTenant();
    if (contexto.client) return fn();

    const pool = await obtenerPoolOperativo();
    const client = await pool.connect();
    let errorRollback;
    try {
        await client.query('BEGIN');
        const resultado = await ejecutarConContextoTenant({ ...contexto, client }, fn);
        const cierre = await client.query('COMMIT');
        if (cierre.command === 'ROLLBACK') {
            throw new Error('PostgreSQL revirtió la transacción al intentar confirmarla.');
        }
        return resultado;
    } catch (err) {
        await client.query('ROLLBACK').catch((error) => { errorRollback = error; });
        throw err;
    } finally {
        client.release(errorRollback);
    }
}

module.exports = {
    runQuery, getQuery, allQuery, enTransaccion,
    ejecutarConContextoTenant, obtenerPoolOperativo,
    redondear2, numeroPositivo, numeroNoNegativo
};
