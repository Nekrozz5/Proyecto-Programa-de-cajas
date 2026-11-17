/**
 * server/repositories/db.js
 * Capa de abstracción y helpers para SQLite con promesas y serialización de transacciones.
 * Respeta PRAGMA foreign_keys, modo WAL y control concurrente según GEMINI.md.
 */

const db = require('../../database/database');
const { redondear2 } = require('../domain/costos');
const {
    db: drizzleDb,
    schema,
    eq,
    ne,
    gt,
    gte,
    lt,
    lte,
    and,
    or,
    sql,
    desc,
    asc,
    like,
    inArray,
    notInArray,
    isNull,
    isNotNull
} = require('../../database/drizzle');

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function numeroPositivo(valor, nombreCampo = 'El valor') {
    if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') {
        throw new Error(`${nombreCampo} debe ser un número finito mayor a 0.`);
    }
    const num = Number(valor);
    if (!Number.isFinite(num) || num <= 0) {
        throw new Error(`${nombreCampo} debe ser un número finito mayor a 0.`);
    }
    return num;
}

function numeroNoNegativo(valor, nombreCampo = 'El valor') {
    if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') {
        throw new Error(`${nombreCampo} debe ser un número finito mayor o igual a 0.`);
    }
    const num = Number(valor);
    if (!Number.isFinite(num) || num < 0) {
        throw new Error(`${nombreCampo} debe ser un número finito mayor o igual a 0.`);
    }
    return num;
}

// Mutex / cola para serializar transacciones en la conexión única de SQLite
let colaTransaccion = Promise.resolve();
async function enTransaccion(fn) {
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
        await runQuery('ROLLBACK').catch((rollbackErr) => {
            console.error('Error durante ROLLBACK de transacción:', rollbackErr.message);
        });
        throw err;
    } finally {
        liberar();
    }
}

module.exports = {
    db,
    // Drizzle ORM
    drizzleDb,
    schema,
    eq,
    ne,
    gt,
    gte,
    lt,
    lte,
    and,
    or,
    sql,
    desc,
    asc,
    like,
    inArray,
    notInArray,
    isNull,
    isNotNull,
    // Helpers tradicionales
    runQuery,
    getQuery,
    allQuery,
    enTransaccion,
    redondear2,
    numeroPositivo,
    numeroNoNegativo
};
