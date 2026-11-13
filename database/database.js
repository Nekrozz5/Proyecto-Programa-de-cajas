const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { ejecutarMigraciones } = require('./migraciones');

const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), 'caja.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance = null;
let promesaMigracion = null;

function asegurarConexionYMigraciones() {
    if (!dbInstance || !fs.existsSync(dbPath)) {
        dbInstance = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error al conectar con SQLite:', err.message);
            } else {
                console.log('Conectado exitosamente a la base de datos SQLite:', dbPath);
                dbInstance.run('PRAGMA busy_timeout = 5000;');
            }
        });
        promesaMigracion = ejecutarMigraciones(dbInstance).catch((err) => {
            console.error('Error crítico al ejecutar migraciones de SQLite:', err.message);
            throw err;
        });
    }
    return promesaMigracion;
}

// Ejecutar conexión y migraciones una sola vez al arrancar
asegurarConexionYMigraciones();

const dbProxy = {
    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        asegurarConexionYMigraciones()
            .then(() => {
                dbInstance.run(sql, params, callback);
            })
            .catch((err) => {
                if (typeof callback === 'function') {
                    callback(err);
                } else {
                    console.error('Error en dbProxy.run:', err.message);
                }
            });
    },
    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        asegurarConexionYMigraciones()
            .then(() => {
                dbInstance.get(sql, params, callback);
            })
            .catch((err) => {
                if (typeof callback === 'function') {
                    callback(err);
                } else {
                    console.error('Error en dbProxy.get:', err.message);
                }
            });
    },
    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        asegurarConexionYMigraciones()
            .then(() => {
                dbInstance.all(sql, params, callback);
            })
            .catch((err) => {
                if (typeof callback === 'function') {
                    callback(err);
                } else {
                    console.error('Error en dbProxy.all:', err.message);
                }
            });
    },
    serialize(callback) {
        asegurarConexionYMigraciones()
            .then(() => {
                dbInstance.serialize(callback);
            })
            .catch((err) => {
                console.error('Error en db.serialize tras migración:', err.message);
            });
    }
};

module.exports = dbProxy;
