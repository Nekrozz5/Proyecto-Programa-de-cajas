// =====================================================================
// PRUEBA DE MIGRACIÓN v8 -> v9 -> v10 SOBRE COPIAS (nunca toca caja.db real)
// Uso: node scratch/test_migracion_v8_v9.js
//
// Escenario A: BD sintética construida con las migraciones v1..v8 del commit HEAD
//              + datos representativos, luego se aplica el código actual (v9 y v10).
// Escenario B: COPIA del respaldo real backups/caja-backup-2026-11-13_16-49-28.db (v5)
//              migrada v5 -> v10.
// Escenario C: Idempotencia (re-ejecutar migraciones sobre v10 no cambia nada).
// Escenario D: Fallo forzado dentro de la migración -> ROLLBACK completo.
// Escenario E: COPIA de caja.db actual (en v9) migrada v9 -> v10: verifica respaldo
//              automático pre-migración, relleno de snapshot fiscal (9 movimientos)
//              y siembra de saldos de apertura del Kardex para los 11 productos directos.
// =====================================================================
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const sqlite3 = require('sqlite3');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(__dirname, 'tmp');
const TMP_BACKUPS = path.join(TMP, 'backups_auto');
fs.mkdirSync(TMP_BACKUPS, { recursive: true });
process.env.BACKUP_DIR = TMP_BACKUPS;

const logOriginal = console.log;
const warnOriginal = console.warn;
let logsCapturados = [];
const silenciar = () => {
    logsCapturados = [];
    console.log = (...a) => logsCapturados.push(a.join(' '));
    console.warn = (...a) => logsCapturados.push(a.join(' '));
};
const restaurar = () => { console.log = logOriginal; console.warn = warnOriginal; };

// --- Cargar migraciones v1..v8 desde main ---
const srcHead = execSync('git show main:database/migraciones.js', { cwd: ROOT })
    .toString()
    .replace("require('../server/secretos')", `require(${JSON.stringify(path.join(ROOT, 'server', 'secretos.js'))})`);
const rutaHead = path.join(TMP, 'migraciones_HEAD_v8.js');
fs.writeFileSync(rutaHead, srcHead);
const { ejecutarMigraciones: migrarHastaV8 } = require(rutaHead);
const { ejecutarMigraciones: migrarActual } = require(path.join(ROOT, 'database', 'migraciones.js'));

const abrir = (f) => new Promise((res, rej) => { const d = new sqlite3.Database(f, (e) => (e ? rej(e) : res(d))); });
const all = (d, sql, p = []) => new Promise((res, rej) => d.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (d, sql, p = []) => new Promise((res, rej) => d.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const cerrar = (d) => new Promise((res) => d.close(() => res()));
const borrar = (f) => { for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(f + s); } catch (_) {} } };

let fallos = 0;
function check(cond, msg) {
    console.log(`  ${cond ? 'OK  ' : 'FALLA'} ${msg}`);
    if (!cond) fallos++;
}

async function version(d) { return (await all(d, 'PRAGMA user_version'))[0].user_version; }

async function snapshot(d) {
    const tablas = await all(d, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const snap = {};
    for (const { name } of tablas) {
        const cols = (await all(d, `PRAGMA table_info("${name}")`)).map((c) => c.name);
        const filas = await all(d, `SELECT rowid AS __rid, * FROM "${name}" ORDER BY rowid`);
        snap[name] = { cols, filas };
    }
    return snap;
}

function compararSnapshots(antes, despues, { ignorar = {} } = {}) {
    let filasComparadas = 0;
    let celdasComparadas = 0;
    const diffs = [];
    for (const [tabla, { cols, filas }] of Object.entries(antes)) {
        const post = despues[tabla];
        if (!post) { diffs.push(`Tabla desaparecida: ${tabla}`); continue; }
        const mapaPost = new Map(post.filas.map((f) => [f.id !== undefined ? `id:${f.id}` : `rid:${f.__rid}`, f]));
        if (post.filas.length < filas.length) diffs.push(`${tabla}: filas ${filas.length} -> ${post.filas.length}`);
        for (const f of filas) {
            const clave = f.id !== undefined ? `id:${f.id}` : `rid:${f.__rid}`;
            const g = mapaPost.get(clave);
            if (!g) { diffs.push(`${tabla} ${clave}: fila perdida`); continue; }
            filasComparadas++;
            for (const c of cols) {
                if ((ignorar[tabla] || []).includes(c)) continue;
                if (!(c in g)) { diffs.push(`${tabla}.${c}: columna perdida`); continue; }
                celdasComparadas++;
                if (f[c] !== g[c]) diffs.push(`${tabla} ${clave}.${c}: ${JSON.stringify(f[c])} -> ${JSON.stringify(g[c])}`);
            }
        }
    }
    return { filasComparadas, celdasComparadas, diffs };
}

function hashSnap(s) { return crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16); }

async function sembrarDatosV8(d) {
    const hash = '$2a$10$abcdefghijklmnopqrstuuJ0pY7m4C2c3bq8g6i7x6t3m8m8m8m8m';
    await run(d, `INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('admin_prueba', ?, 'admin', 1)`, [hash]);
    await run(d, `INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('cajero_prueba', ?, 'user', 1)`, [hash]);
    await run(d, `INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('cajero_baja', ?, 'user', 0)`, [hash]);
    const admin = (await all(d, `SELECT id FROM usuarios WHERE nombre='admin_prueba'`))[0].id;
    const caj = (await all(d, `SELECT id FROM usuarios WHERE nombre='cajero_prueba'`))[0].id;

    await run(d, `INSERT INTO cajas_fisicas (nombre, activa) VALUES ('Caja 2 - Barra', 1)`);
    await run(d, `INSERT INTO cajas (usuario_id, monto_inicial, efectivo_esperado, efectivo_real, qr_esperado, diferencia_efectivo, estado, fecha_apertura, fecha_cierre, caja_fisica_id, veces_reabierta, historial_reaperturas)
                  VALUES (?, 100, 225, 220, 30, -5, 'cerrada', '2026-11-10 12:00:00', '2026-11-10 22:00:00', 1, 1, '[2026-11-10] admin: corrección')`, [caj]);
    await run(d, `INSERT INTO cajas (usuario_id, monto_inicial, estado, fecha_apertura, caja_fisica_id) VALUES (?, 50, 'abierta', '2026-11-15 12:00:00', 2)`, [caj]);

    await run(d, `INSERT INTO productos (nombre, precio, costo, categoria, tipo_inventario, stock) VALUES ('Coca 500ml', 10, 6, 'Bebidas', 'directo', 20)`);
    await run(d, `INSERT INTO productos (nombre, precio, costo, categoria, tipo_inventario) VALUES ('Café', 15, 4.5, 'Cafés', 'receta')`);
    await run(d, `INSERT INTO productos (nombre, precio, costo, categoria, tipo_inventario) VALUES ('Servicio libre', 12, 0, 'Otros', 'libre')`);
    await run(d, `INSERT INTO insumos (nombre, unidad_medida, stock_actual, costo_por_unidad) VALUES ('Café molido', 'g', 1000, 0.15)`);
    await run(d, `INSERT INTO recetas (producto_id, insumo_id, cantidad_requerida) VALUES (2, 1, 30)`);

    const movs = [
        [1, 1, 'ingreso', 25, 'efectivo', 50, 25, 'Venta en mostrador', 'completado', null, null, null],
        [2, 1, 'ingreso', 30, 'qr', 30, 0, 'Venta en mostrador', 'completado', null, null, null],
        [3, 1, 'ingreso', 100, 'efectivo', null, 0, '[REPOSICIÓN DE EFECTIVO] Sencillo del dueño', 'completado', null, null, null],
        [4, 1, 'egreso', 15, 'efectivo', null, 0, 'Compra de hielo', 'completado', null, null, null],
        [5, 1, 'ingreso', 10, 'efectivo', 10, 0, 'Venta en mostrador [ANULADO: error]', 'anulado', admin, '2026-11-10 13:00:00', 'error'],
        [6, 1, 'ingreso', 50, 'efectivo', null, 0, 'Inyección de cambio (formato antiguo)', 'completado', null, null, null],
        [7, 2, 'ingreso', 12, 'efectivo', 12, 0, 'Venta rápida sin detalle (caso borde)', 'completado', null, null, null],
        [8, 2, 'egreso', 8, 'qr', null, 0, 'Pago QR proveedor', 'completado', null, null, null]
    ];
    for (const m of movs) {
        await run(d, `INSERT INTO movimientos (id, caja_id, usuario_id, tipo, monto, metodo_pago, monto_recibido, cambio, descripcion, estado, fecha_hora, anulado_por, fecha_anulacion, motivo_anulacion)
                      VALUES (?, ?, ${caj}, ?, ?, ?, ?, ?, ?, ?, '2026-11-10 12:3${m[0]}:00', ?, ?, ?)`, m);
    }
    await run(d, `INSERT INTO detalle_movimientos (movimiento_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal) VALUES (1, 1, 1, 10, 6, 10), (1, 2, 1, 15, 4.5, 15), (2, 2, 2, 15, 4.5, 30), (5, 1, 1, 10, 6, 10)`);
    await run(d, `INSERT INTO movimientos_insumos (insumo_id, movimiento_id, tipo, cantidad, costo_unitario, motivo) VALUES (1, 1, 'consumo_venta', 30, 0.15, 'Venta Ticket #1'), (1, 2, 'consumo_venta', 60, 0.15, 'Venta Ticket #2'), (1, NULL, 'compra', 1000, 0.15, 'Compra inicial')`);
}

async function verificacionesPostV10(d, etiqueta) {
    const ic = await all(d, 'PRAGMA integrity_check');
    check(ic.length === 1 && ic[0].integrity_check === 'ok', `[${etiqueta}] PRAGMA integrity_check = ok`);
    const fk = await all(d, 'PRAGMA foreign_key_check');
    check(fk.length === 0, `[${etiqueta}] PRAGMA foreign_key_check sin violaciones (${fk.length})`);
    const sqlMov = (await all(d, `SELECT sql FROM sqlite_master WHERE name='movimientos'`))[0].sql;
    check(/'mixto'/.test(sqlMov), `[${etiqueta}] CHECK de movimientos.metodo_pago incluye 'mixto'`);
    const colsMov = (await all(d, `PRAGMA table_info(movimientos)`)).map((c) => c.name);
    check(['regimen_tributario', 'iva_porcentaje', 'it_porcentaje', 'iva_monto', 'it_monto'].every((c) => colsMov.includes(c)), `[${etiqueta}] Columnas de snapshot fiscal creadas en movimientos`);
    const sinReg = (await all(d, `SELECT COUNT(*) n FROM movimientos WHERE regimen_tributario IS NULL`))[0].n;
    check(sinReg === 0, `[${etiqueta}] Todos los movimientos tienen regimen_tributario rellenado (nulos=${sinReg})`);
    const colsKardex = (await all(d, `PRAGMA table_info(movimientos_productos_directos)`)).map((c) => c.name);
    check(colsKardex.includes('costo_promedio_resultante'), `[${etiqueta}] movimientos_productos_directos tiene costo_promedio_resultante`);
    const colsKardexIns = (await all(d, `PRAGMA table_info(movimientos_insumos)`)).map((c) => c.name);
    check(colsKardexIns.includes('stock_resultante') && colsKardexIns.includes('costo_promedio_resultante'), `[${etiqueta}] movimientos_insumos tiene stock_resultante y costo_promedio_resultante (v11)`);
    const idxEstacion = await all(d, `SELECT name FROM sqlite_master WHERE type='index' AND name='una_caja_abierta_por_estacion'`);
    check(idxEstacion.length === 1, `[${etiqueta}] Índice único parcial una_caja_abierta_por_estacion creado (v11)`);
    const desc = await all(d, `SELECT m.id, m.monto, COALESCE(SUM(p.monto),0) pagos FROM movimientos m LEFT JOIN movimientos_pagos p ON p.movimiento_id = m.id GROUP BY m.id HAVING ABS(m.monto - pagos) > 0.001`);
    check(desc.length === 0, `[${etiqueta}] movimientos_pagos cuadra con monto en todas las filas`);
    const efqr = await all(d, `SELECT id FROM movimientos WHERE ABS(monto_efectivo + monto_qr - monto) > 0.001`);
    check(efqr.length === 0, `[${etiqueta}] monto_efectivo + monto_qr = monto en todas las filas`);
}

(async () => {
    for (const f of fs.readdirSync(TMP_BACKUPS)) { try { fs.unlinkSync(path.join(TMP_BACKUPS, f)); } catch (_) {} }

    // ================= ESCENARIO A =================
    console.log('\n=== ESCENARIO A: BD sintética v8 (rama main) -> v11 (código actual) ===');
    const fA = path.join(TMP, 'escenarioA_v8.db');
    borrar(fA);
    let d = await abrir(fA);
    silenciar(); const vA0 = await migrarHastaV8(d); restaurar();
    check(vA0 === 8 && (await version(d)) === 8, `BD construida con migraciones de main queda en v8 (user_version=${await version(d)})`);
    await sembrarDatosV8(d);
    const antesA = await snapshot(d);
    await run(d, `VACUUM INTO '${path.join(TMP, 'escenarioD_v8.db').replace(/\\/g, '/')}'`).catch(() => {});

    const backupsAntes = fs.readdirSync(TMP_BACKUPS).length;
    silenciar(); await migrarActual(d); restaurar();
    const backupsDespues = fs.readdirSync(TMP_BACKUPS).filter((f) => f.startsWith('caja-pre-migracion-'));
    check(backupsDespues.length > backupsAntes, `Respaldo automático pre-migración creado (${backupsDespues[backupsDespues.length - 1]})`);
    check((await version(d)) === 11, `Migración aplicada: user_version = ${await version(d)}`);

    const despuesA = await snapshot(d);
    const cmpA = compararSnapshots(antesA, despuesA);
    check(cmpA.diffs.length === 0, `Comparación fila a fila: ${cmpA.filasComparadas} filas / ${cmpA.celdasComparadas} celdas idénticas; diferencias=${cmpA.diffs.length}`);
    await verificacionesPostV10(d, 'A');

    const kardexA = await all(d, `SELECT producto_id, tipo, cantidad, stock_resultante, costo_unitario, costo_promedio_resultante, motivo FROM movimientos_productos_directos`);
    check(kardexA.length === 1 && kardexA[0].stock_resultante === 20, `Kardex directo sembró saldo de apertura para 'Coca 500ml' (stock=20, costo=6)`);

    // ================= ESCENARIO C =================
    console.log('\n=== ESCENARIO C: idempotencia (re-ejecutar migraciones sobre v11) ===');
    const h1 = hashSnap(await snapshot(d));
    silenciar(); await migrarActual(d); restaurar();
    const h2 = hashSnap(await snapshot(d));
    check(h1 === h2 && (await version(d)) === 11, `Snapshot idéntico tras re-ejecución (hash ${h1} = ${h2})`);
    await cerrar(d);

    // ================= ESCENARIO D =================
    console.log('\n=== ESCENARIO D: fallo forzado en v9 -> ROLLBACK ===');
    const fD = path.join(TMP, 'escenarioD_v8.db');
    d = await abrir(fD);
    const antesD = await snapshot(d);
    await run(d, `CREATE TABLE movimientos_v9 (x INTEGER)`);
    let error = null;
    silenciar(); console.error = () => {};
    try { await migrarActual(d); } catch (e) { error = e; }
    restaurar(); console.error = warnOriginal;
    check(error !== null, `La migración v9 falló como se esperaba: "${error && error.message}"`);
    check((await version(d)) === 8, `user_version sigue en 8 tras el fallo (=${await version(d)})`);
    await run(d, `DROP TABLE movimientos_v9`);
    const cmpD = compararSnapshots(antesD, await snapshot(d));
    check(cmpD.diffs.length === 0, `Datos intactos tras ROLLBACK: ${cmpD.filasComparadas} filas comparadas, diferencias=${cmpD.diffs.length}`);
    await cerrar(d);

    // ================= ESCENARIO B =================
    console.log('\n=== ESCENARIO B: COPIA del respaldo real (backups/caja-backup-2026-11-13_16-49-28.db) v5 -> v11 ===');
    const origenB = path.join(ROOT, 'backups', 'caja-backup-2026-11-13_16-49-28.db');
    const fB = path.join(TMP, 'escenarioB_copia_backup.db');
    borrar(fB);
    fs.copyFileSync(origenB, fB);
    d = await abrir(fB);
    const antesB = await snapshot(d);
    silenciar(); await migrarActual(d); restaurar();
    check((await version(d)) === 11, `Copia real migrada v5 -> v${await version(d)}`);
    const cmpB = compararSnapshots(antesB, await snapshot(d), { ignorar: { usuarios: ['pin_o_password', 'activo'] } });
    check(cmpB.diffs.length === 0, `Comparación fila a fila: ${cmpB.filasComparadas} filas / ${cmpB.celdasComparadas} celdas idénticas; diferencias=${cmpB.diffs.length}`);
    await verificacionesPostV10(d, 'B');
    await cerrar(d);

    // ================= ESCENARIO E: COPIA de caja.db real (-> v11) =================
    console.log('\n=== ESCENARIO E: COPIA de caja.db actual -> v11 (verifica reclasificación, saldos de apertura y reparación métrica) ===');
    const fE = path.join(TMP, 'escenarioE_copia_caja_actual.db');
    borrar(fE);
    const dbReal = await abrir(path.join(ROOT, 'caja.db'));
    const vRealAntes = await version(dbReal);
    await run(dbReal, `VACUUM INTO '${fE.replace(/\\/g, '/')}'`);
    await cerrar(dbReal);

    d = await abrir(fE);
    check(vRealAntes === 9 || vRealAntes === 11, `Copia de caja.db inicia en v${vRealAntes}`);
    const antesE = await snapshot(d);
    silenciar(); await migrarActual(d); restaurar();
    const logsV10 = logsCapturados.filter((l) => l.includes('[Migraciones') || l.includes('[Migraciones Backup]'));
    logsV10.forEach((l) => console.log('  LOG:', l));

    check((await version(d)) === 11, `Copia de caja.db migrada a v11`);
    const cmpE = compararSnapshots(antesE, await snapshot(d), {
        ignorar: {
            usuarios: ['pin_o_password', 'activo'],
            insumos: ['costo_por_unidad'],
            productos: ['costo']
        }
    });
    check(cmpE.diffs.length === 0, `Comparación fila a fila hacia v11: ${cmpE.filasComparadas} filas / ${cmpE.celdasComparadas} celdas idénticas; diferencias=${cmpE.diffs.length}`);
    await verificacionesPostV10(d, 'E');

    const aperturasE = await all(d, `SELECT p.id, p.nombre, p.stock, k.cantidad, k.stock_resultante, k.costo_unitario, k.costo_promedio_resultante, k.monto_total, k.motivo FROM productos p INNER JOIN movimientos_productos_directos k ON k.producto_id = p.id WHERE p.tipo_inventario = 'directo' ORDER BY p.id`);
    check(aperturasE.length >= 11 && aperturasE.every((r) => r.stock === r.stock_resultante), `11 productos directos de caja.db sembrados con saldo de apertura exacto`);

    // Verificar que los 5 insumos métricos de cafetería tengan costo_por_unidad > 0
    const insumosCero = await all(d, `SELECT id, nombre, costo_por_unidad FROM insumos WHERE id IN (54, 55, 56, 57, 63) AND costo_por_unidad <= 0`);
    check(insumosCero.length === 0, `5 insumos métricos de cafetería tienen costo_por_unidad reparado con 4 decimales (> 0)`);
    await cerrar(d);

    const dbRealCheck = await abrir(path.join(ROOT, 'caja.db'));
    const vRealDespues = await version(dbRealCheck);
    await cerrar(dbRealCheck);
    check(vRealAntes === vRealDespues, `caja.db real intacta durante prueba en copia (sigue en v${vRealDespues})`);

    console.log(`\nRESULTADO: ${fallos === 0 ? 'TODAS LAS VERIFICACIONES PASARON' : fallos + ' VERIFICACIÓN(ES) FALLARON'}`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { restaurar(); console.error('ERROR FATAL', e); process.exit(2); });
