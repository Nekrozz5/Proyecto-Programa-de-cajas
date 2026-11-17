/**
 * database/drizzle.js
 * Instancia central de Drizzle ORM sobre better-sqlite3.
 * Configura modo WAL, busy_timeout de 5000ms y claves foráneas activas.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const schema = require('./schema');
const drizzleOrm = require('drizzle-orm');

const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), 'caja.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let sqliteInstance = null;
let drizzleInstance = null;

function obtenerInstanciaDrizzle() {
    if (!drizzleInstance) {
        sqliteInstance = new Database(dbPath);
        sqliteInstance.pragma('journal_mode = WAL');
        sqliteInstance.pragma('busy_timeout = 5000');
        sqliteInstance.pragma('foreign_keys = ON');

        drizzleInstance = drizzle(sqliteInstance, { schema });
    }
    return { db: drizzleInstance, sqlite: sqliteInstance };
}

// Proxy para acceso perezoso (evita inicializaciones durante next build)
const db = new Proxy({}, {
    get(target, prop) {
        const { db: instancia } = obtenerInstanciaDrizzle();
        const valor = instancia[prop];
        if (typeof valor === 'function') {
            return valor.bind(instancia);
        }
        return valor;
    }
});

module.exports = {
    db,
    schema,
    obtenerInstanciaDrizzle,
    // Re-exportar operadores comunes de Drizzle para comodidad de los repositorios
    eq: drizzleOrm.eq,
    ne: drizzleOrm.ne,
    gt: drizzleOrm.gt,
    gte: drizzleOrm.gte,
    lt: drizzleOrm.lt,
    lte: drizzleOrm.lte,
    and: drizzleOrm.and,
    or: drizzleOrm.or,
    sql: drizzleOrm.sql,
    desc: drizzleOrm.desc,
    asc: drizzleOrm.asc,
    like: drizzleOrm.like,
    inArray: drizzleOrm.inArray,
    notInArray: drizzleOrm.notInArray,
    isNull: drizzleOrm.isNull,
    isNotNull: drizzleOrm.isNotNull
};
