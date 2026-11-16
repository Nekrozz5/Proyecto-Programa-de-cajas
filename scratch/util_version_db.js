// Uso: node scratch/util_version_db.js <ruta.db> [<ruta.db> ...]
// Muestra PRAGMA user_version y conteo de filas por tabla (solo lectura).
const sqlite3 = require('sqlite3');

function q(db, sql) {
    return new Promise((res, rej) => db.all(sql, [], (e, r) => (e ? rej(e) : res(r))));
}

(async () => {
    for (const f of process.argv.slice(2)) {
        const db = new sqlite3.Database(f, sqlite3.OPEN_READONLY);
        try {
            const [v] = await q(db, 'PRAGMA user_version');
            const tablas = await q(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
            const conteos = {};
            for (const t of tablas) conteos[t.name] = (await q(db, `SELECT COUNT(*) n FROM "${t.name}"`))[0].n;
            console.log(JSON.stringify({ archivo: f, user_version: v.user_version, conteos }, null, 1));
        } catch (e) {
            console.log(f, 'ERROR', e.message);
        } finally {
            db.close();
        }
    }
})();
