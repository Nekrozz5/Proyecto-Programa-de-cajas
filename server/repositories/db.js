/**
 * Acceso común para SQLite local y PostgreSQL multi-tenant.
 * En AWS_MULTI_TENANT todas las consultas requieren un contexto AsyncLocalStorage.
 */
const db = require('../../database/database');
const { obtenerPoolTenant } = require('../tenancy/tenant-registry');
const {
    obtenerModoTenancy,
    obtenerContextoTenantActual,
    ejecutarConContextoTenant
} = require('../tenancy/tenant-context');
const { redondear2 } = require('../domain/costos');
const {
    db: drizzleDb, schema, eq, ne, gt, gte, lt, lte, and, or, sql,
    desc, asc, like, inArray, notInArray, isNull, isNotNull
} = require('../../database/drizzle');

function usaPostgres() {
    return obtenerModoTenancy() === 'AWS_MULTI_TENANT';
}

async function obtenerPoolOperativo() {
    const contexto = obtenerContextoTenantActual();
    if (!contexto || !contexto.tenantId || !contexto.tenant) {
        throw new Error('Contexto de tenant obligatorio para acceder a PostgreSQL.');
    }
    if (contexto.pool) return contexto.pool;
    return await obtenerPoolTenant(contexto.tenant);
}

function convertirParametrosPostgres(sqlTexto) {
    let indice = 0;
    return String(sqlTexto)
        .replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT')
        .replace(/COLLATE\s+NOCASE/gi, '')
        .replace(/\?/g, () => `$${++indice}`);
}

async function consultaPostgres(sqlTexto, params = []) {
    const contexto = obtenerContextoTenantActual();
    const cliente = contexto && contexto.client ? contexto.client : await obtenerPoolOperativo();
    return await cliente.query(convertirParametrosPostgres(sqlTexto), params);
}

function runQuery(sqlTexto, params = []) {
    if (usaPostgres()) {
        return consultaPostgres(sqlTexto, params).then((resultado) => ({
            lastID: resultado.rows && resultado.rows[0] ? resultado.rows[0].id || null : null,
            changes: resultado.rowCount || 0
        }));
    }
    return new Promise((resolve, reject) => {
        db.run(sqlTexto, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sqlTexto, params = []) {
    if (usaPostgres()) return consultaPostgres(sqlTexto, params).then((r) => r.rows[0]);
    return new Promise((resolve, reject) => {
        db.get(sqlTexto, params, (err, row) => err ? reject(err) : resolve(row));
    });
}

function allQuery(sqlTexto, params = []) {
    if (usaPostgres()) return consultaPostgres(sqlTexto, params).then((r) => r.rows);
    return new Promise((resolve, reject) => {
        db.all(sqlTexto, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
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

let colaTransaccion = Promise.resolve();
async function enTransaccion(fn) {
    if (usaPostgres()) {
        const pool = await obtenerPoolOperativo();
        const client = await pool.connect();
        const contexto = obtenerContextoTenantActual();
        try {
            await client.query('BEGIN');
            const resultado = await ejecutarConContextoTenant({ ...contexto, client }, fn);
            await client.query('COMMIT');
            return resultado;
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }

    const anterior = colaTransaccion;
    let liberar;
    colaTransaccion = new Promise((resolve) => { liberar = resolve; });
    await anterior;
    await runQuery('BEGIN IMMEDIATE');
    try {
        const resultado = await fn();
        await runQuery('COMMIT');
        return resultado;
    } catch (err) {
        await runQuery('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        liberar();
    }
}

module.exports = {
    db, drizzleDb, schema, eq, ne, gt, gte, lt, lte, and, or, sql,
    desc, asc, like, inArray, notInArray, isNull, isNotNull,
    runQuery, getQuery, allQuery, enTransaccion,
    ejecutarConContextoTenant, obtenerPoolOperativo,
    redondear2, numeroPositivo, numeroNoNegativo
};
