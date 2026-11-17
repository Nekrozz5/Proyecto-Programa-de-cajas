// Diagnóstico de solo lectura sobre caja.db real (no modifica nada)
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database(process.argv[2] || 'caja.db', sqlite3.OPEN_READONLY);
const all = (s) => new Promise((r, j) => db.all(s, [], (e, x) => (e ? j(e) : r(x))));
(async () => {
    console.log('Productos directos con stock y sus filas de Kardex:');
    console.table(await all(`SELECT p.id, p.nombre, p.stock, (SELECT COUNT(*) FROM movimientos_productos_directos k WHERE k.producto_id = p.id) filas_kardex FROM productos p WHERE p.tipo_inventario = 'directo'`));
    console.log('Movimientos por categoría contable / método:');
    console.table(await all(`SELECT tipo, categoria_contable, metodo_pago, estado, COUNT(*) n, SUM(monto) total FROM movimientos GROUP BY 1,2,3,4`));
    console.log('Ingresos sin detalle (clasificados como aporte_cambio por la migración):');
    console.table(await all(`SELECT id, monto, metodo_pago, categoria_contable, substr(descripcion,1,50) d FROM movimientos m WHERE tipo='ingreso' AND NOT EXISTS (SELECT 1 FROM detalle_movimientos x WHERE x.movimiento_id = m.id)`));
    db.close();
})();
