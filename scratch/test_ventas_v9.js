// =====================================================================
// PRUEBAS FUNCIONALES COMPLETAS (v9 + v10):
//  - Las 53 verificaciones originales (a..g + snapshot + Kardex)
//  - Nuevas pruebas solicitadas:
//    * IT configurable: it_base = 'todas_las_ventas' (defecto) vs 'solo_facturadas'
//    * Ventas con descuento + prorrateo proporcional de ganancia por producto
//    * Egresos con factura (snapshot y crédito fiscal IVA)
//    * Compra de productos directos (CPP + Kardex + Hoja 4)
//    * Merma de productos directos (registrarMermaProductoDirecto + Hoja 4 + Kardex)
//    * Combos y modificadores (reemplazo + extra) con pago mixto y su anulación
//    * Exportación Excel (7 hojas, incluyendo Hoja 6 "Kardex Productos" cronológica y filtro de fechas)
//    * Exportación CSV
//    * Exportación PDF (en Node con jsPDF + autoTable)
//    * Correo de cierre con ventas mixtas (construirHtmlCierre + datos de cierre)
//    * Consulta de control: verificarIntegridadKardexDirecto()
// Usa una BD TEMPORAL nueva (scratch/tmp/test_ventas_v9.db). Nunca toca caja.db.
// Uso: node scratch/test_ventas_v9.js
// =====================================================================
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const TMP = path.join(__dirname, 'tmp');
const TMP_BACKUPS = path.join(TMP, 'backups_auto');
fs.mkdirSync(TMP_BACKUPS, { recursive: true });
const DB = path.join(TMP, 'test_ventas_v9.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB + s); } catch (_) {} }
process.env.DATABASE_PATH = DB;
process.env.BACKUP_DIR = TMP_BACKUPS;
process.env.NODE_ENV = 'development';

const logOriginal = console.log;
const warnOriginal = console.warn;
console.log = () => {}; console.warn = () => {};
const q = require(path.join(__dirname, '..', 'server', 'queries.js'));
const mailer = require(path.join(__dirname, '..', 'server', 'mailer.js'));
const db = require(path.join(__dirname, '..', 'database', 'database.js'));

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = async (sql, p = []) => (await all(sql, p))[0];

let fallos = 0;
const filas = [];
function cmp(caso, concepto, esperado, obtenido) {
    const ok = typeof esperado === 'number'
        ? Math.abs(Number(obtenido) - esperado) < 0.005
        : esperado === obtenido;
    if (!ok) fallos++;
    filas.push({ caso, concepto, esperado, obtenido, resultado: ok ? 'OK' : 'FALLA' });
}
async function stockProd(id) { return Number((await get('SELECT stock FROM productos WHERE id = ?', [id])).stock); }
async function stockIns(id) { return Number((await get('SELECT stock_actual FROM insumos WHERE id = ?', [id])).stock_actual); }

(async () => {
    // =====================================================================
    // BLOQUE I: LAS 53 VERIFICACIONES ORIGINALES (casos a..g + 3 + 4)
    // =====================================================================
    const adminId = await q.crearUsuario('admin_test', 'Admin12345', 'admin');
    const cajeroId = await q.crearUsuario('cajero_test', '1234', 'user');
    const coca = await q.crearProducto('Coca 500ml', 10, 6, 'Bebidas', 100, 'unidades', 0, null, adminId);
    const servicio = await q.crearProducto('Servicio libre', 12, 0, 'Otros', null);
    await q.guardarConfiguracionContable(adminId, { regimenTributario: 'simplificado_control_interno' });

    let caja = await q.abrirCaja(cajeroId, 100, 1);
    const cajaId1 = typeof caja === 'object' ? (caja.id || caja.cajaId) : caja;

    // ---------- a) Efectivo con cambio ----------
    const va = await q.registrarVentaCompleta(cajaId1, [{ productoId: coca, cantidad: 2 }], 'efectivo', 50, 'Venta a', cajeroId);
    cmp('a) Efectivo', 'monto total', 20, va.montoTotal);
    cmp('a) Efectivo', 'recibido', 50, va.montoRecibido);
    cmp('a) Efectivo', 'cambio', 30, va.cambio);
    cmp('a) Efectivo', 'monto_efectivo', 20, va.montoEfectivo);
    cmp('a) Efectivo', 'monto_qr', 0, va.montoQr);
    cmp('a) Efectivo', 'stock Coca (100-2)', 98, await stockProd(coca));

    // ---------- b) QR ----------
    const vb = await q.registrarVentaCompleta(cajaId1, [{ productoId: coca, cantidad: 1 }, { productoId: servicio, cantidad: 1 }], 'qr', null, 'Venta b', cajeroId, null, { referenciaQr: 'QR-001' });
    cmp('b) QR', 'monto total', 22, vb.montoTotal);
    cmp('b) QR', 'monto_qr', 22, vb.montoQr);
    cmp('b) QR', 'cambio', 0, vb.cambio);
    const pagosB = await all('SELECT metodo_pago, monto, referencia FROM movimientos_pagos WHERE movimiento_id = ?', [vb.movimientoId]);
    cmp('b) QR', 'movimientos_pagos', 'qr:22:QR-001', pagosB.map((p) => `${p.metodo_pago}:${p.monto}:${p.referencia}`).join('|'));

    // ---------- c) Mixto (billete 20 para 10 en efectivo -> cambio 10) ----------
    const vc = await q.registrarVentaCompleta(cajaId1, [{ productoId: coca, cantidad: 3 }], 'mixto', 20, 'Venta c', cajeroId, null, { montoEfectivo: 10, montoQr: 20 });
    cmp('c) Mixto', 'monto total', 30, vc.montoTotal);
    cmp('c) Mixto', 'monto_efectivo', 10, vc.montoEfectivo);
    cmp('c) Mixto', 'monto_qr', 20, vc.montoQr);
    cmp('c) Mixto', 'cambio (20-10)', 10, vc.cambio);
    const pagosC = await all('SELECT metodo_pago, monto FROM movimientos_pagos WHERE movimiento_id = ? ORDER BY metodo_pago', [vc.movimientoId]);
    cmp('c) Mixto', 'movimientos_pagos', 'efectivo:10|qr:20', pagosC.map((p) => `${p.metodo_pago}:${p.monto}`).join('|'));
    cmp('c) Mixto', 'stock Coca (98-1-3)', 94, await stockProd(coca));
    let errMixto = null;
    try { await q.registrarVentaCompleta(cajaId1, [{ productoId: coca, cantidad: 1 }], 'mixto', null, 'mal', cajeroId, null, { montoEfectivo: 3, montoQr: 3 }); } catch (e) { errMixto = e.message; }
    cmp('c) Mixto', 'rechaza mixto que no cuadra (3+3≠10)', true, Boolean(errMixto));

    // ---------- d) Anulación de venta mixta ----------
    await q.anularMovimientoConPermiso(adminId, vc.movimientoId, 'Prueba de anulación mixta');
    const movC = await get('SELECT estado, monto_efectivo, monto_qr FROM movimientos WHERE id = ?', [vc.movimientoId]);
    cmp('d) Anulación mixta', 'estado', 'anulado', movC.estado);
    cmp('d) Anulación mixta', 'stock Coca restituido (94+3)', 97, await stockProd(coca));
    const kReing = await get(`SELECT cantidad, stock_resultante FROM movimientos_productos_directos WHERE movimiento_id = ? AND tipo = 'reingreso_anulacion'`, [vc.movimientoId]);
    cmp('d) Anulación mixta', 'Kardex reingreso cantidad', 3, kReing && kReing.cantidad);
    cmp('d) Anulación mixta', 'Kardex reingreso saldo', 97, kReing && kReing.stock_resultante);

    // ---------- e) Cierre con ventas mixtas ----------
    await q.registrarVentaCompleta(cajaId1, [{ productoId: coca, cantidad: 2 }, { productoId: servicio, cantidad: 1 }], 'mixto', null, 'Venta e', cajeroId, null, { montoEfectivo: 12, montoQr: 20 });
    await q.registrarIngresoEfectivo(cajaId1, 50, 'Sencillo del dueño', adminId);
    await q.registrarEgreso(cajaId1, 5, 'Compra de hielo', 'efectivo', cajeroId, {});
    const est1 = await q.obtenerEstadisticasCaja(cajaId1);
    const desg1 = await q.obtenerDesgloseMetodosPago(cajaId1);
    const cierre = await q.cerrarCaja(cajaId1, 175, cajeroId, 42, 'cierre de prueba');
    cmp('e) Cierre', 'ventas efectivo', 32, cierre.ventasEfectivo);
    cmp('e) Cierre', 'aportes de sencillo', 50, cierre.reposicionesEfectivo);
    cmp('e) Cierre', 'egresos efectivo', 5, cierre.egresosEfectivo);
    cmp('e) Cierre', 'efectivo esperado', 177, cierre.efectivoEsperado);
    cmp('e) Cierre', 'diferencia efectivo (175-177)', -2, cierre.diferenciaEfectivo);
    cmp('e) Cierre', 'QR esperado', 42, cierre.qrEsperado);
    cmp('e) Cierre', 'diferencia QR', 0, cierre.diferenciaQr);
    cmp('e) Cierre', 'ventas totales turno', 74, cierre.ventasTotalesTurno);
    cmp('e) Estadísticas', 'ventas totales', 74, est1.ventasTotales);
    cmp('e) Estadísticas', 'costo ventas (5 Coca × 6)', 30, est1.costoTotalVentas);
    cmp('e) Estadísticas', 'ganancia bruta', 44, est1.gananciaBruta);
    cmp('e) Estadísticas', 'flujo neto (44-5)', 39, est1.flujoNetoOperativo);
    cmp('e) Estadísticas', 'aportes (no son venta)', 50, est1.totalReposiciones);
    const dEf = desg1.find((x) => x.metodoPago === 'efectivo') || {};
    const dQr = desg1.find((x) => x.metodoPago === 'qr') || {};
    cmp('e) Desglose', 'efectivo total / trans', '32/2', `${dEf.montoTotal}/${dEf.transacciones}`);
    cmp('e) Desglose', 'QR total / trans', '42/2', `${dQr.montoTotal}/${dQr.transacciones}`);
    cmp('e) Simplificado', 'débito IVA en turno sin facturas', 0, est1.debitoFiscalIva);

    // ---------- f) Régimen general con factura (IVA 13% e IT 3%, it_base='solo_facturadas') ----------
    await q.guardarConfiguracionContable(adminId, { regimenTributario: 'regimen_general', ivaPorcentaje: 13, itPorcentaje: 3, itBase: 'solo_facturadas', nitNegocio: '1234567' });
    caja = await q.abrirCaja(cajeroId, 100, 1);
    const cajaId2 = typeof caja === 'object' ? (caja.id || caja.cajaId) : caja;
    const vf = await q.registrarVentaCompleta(cajaId2, [{ productoId: coca, cantidad: 10 }], 'efectivo', 100, 'Venta f', cajeroId, null, { tipoComprobante: 'factura', nroFactura: '001', clienteNitCi: '7654321', clienteRazonSocial: 'Cliente SRL' });
    await q.registrarVentaCompleta(cajaId2, [{ productoId: coca, cantidad: 2 }], 'qr', null, 'Venta f2 recibo', cajeroId);
    const estF = await q.obtenerEstadisticasCaja(cajaId2);
    cmp('f) Régimen general', 'tipo_comprobante guardado', 'factura', (await get('SELECT tipo_comprobante FROM movimientos WHERE id = ?', [vf.movimientoId])).tipo_comprobante);
    cmp('f) Régimen general', 'ventas facturadas', 100, estF.ventasFacturadas);
    cmp('f) Régimen general', 'ventas con recibo', 20, estF.ventasRecibo);
    cmp('f) Régimen general', 'débito fiscal IVA 13% de 100', 13, estF.debitoFiscalIva);
    cmp('f) Régimen general', 'IT 3% de 100 (solo facturado)', 3, estF.impuestoTransaccionesIt);
    cmp('f) Régimen general', 'regimen reportado', 'regimen_general', estF.regimenTributario);

    // ---------- 3) Snapshot fiscal por venta ----------
    const colsMov = (await all('PRAGMA table_info(movimientos)')).map((c) => c.name);
    const tieneSnapshot = ['regimen_tributario', 'iva_porcentaje', 'it_porcentaje', 'iva_monto', 'it_monto'].every((c) => colsMov.includes(c));
    cmp('3) Snapshot', 'movimientos tiene regimen/iva/it congelados', true, tieneSnapshot);
    await q.guardarConfiguracionContable(adminId, { regimenTributario: 'regimen_general', ivaPorcentaje: 15, itPorcentaje: 3, itBase: 'solo_facturadas', nitNegocio: '1234567' });
    const estF2 = await q.obtenerEstadisticasCaja(cajaId2);
    cmp('3) Snapshot', 'IVA de venta YA HECHA tras cambiar tasa a 15% (debe seguir 13)', 13, estF2.debitoFiscalIva);
    await q.guardarConfiguracionContable(adminId, { regimenTributario: 'regimen_general', ivaPorcentaje: 13, itPorcentaje: 3, nitNegocio: '1234567' });
    await q.cerrarCaja(cajaId2, 200, cajeroId, 20);

    // ---------- g) Modo simplificado ----------
    await q.guardarConfiguracionContable(adminId, { regimenTributario: 'simplificado_control_interno' });
    caja = await q.abrirCaja(cajeroId, 100, 1);
    const cajaId3 = typeof caja === 'object' ? (caja.id || caja.cajaId) : caja;
    await q.registrarVentaCompleta(cajaId3, [{ productoId: coca, cantidad: 2 }], 'efectivo', null, 'Venta g', cajeroId);
    const estG = await q.obtenerEstadisticasCaja(cajaId3);
    cmp('g) Simplificado', 'ventas totales', 20, estG.ventasTotales);
    cmp('g) Simplificado', 'débito IVA', 0, estG.debitoFiscalIva);
    cmp('g) Simplificado', 'IT', 0, estG.impuestoTransaccionesIt);
    cmp('g) Simplificado', 'regimen reportado', 'simplificado_control_interno', estG.regimenTributario);
    let errFacSimpl = null;
    try {
        await q.registrarVentaCompleta(cajaId3, [{ productoId: coca, cantidad: 1 }], 'efectivo', null, 'Factura en simplificado', cajeroId, null, { tipoComprobante: 'factura' });
    } catch (e) { errFacSimpl = e.message; }
    cmp('g) Simplificado', 'rechaza venta con factura en simplificado', true, Boolean(errFacSimpl));
    const estG2 = await q.obtenerEstadisticasCaja(cajaId3);
    cmp('g) Simplificado', 'IVA calculado en simplificado (debe ser 0)', 0, estG2.debitoFiscalIva);

    // ---------- 4) Kardex directo: coherencia de saldos tras las primeras 53 pruebas ----------
    const kardex1 = await all(`SELECT id, tipo, cantidad, stock_resultante, motivo FROM movimientos_productos_directos WHERE producto_id = ? ORDER BY id`, [coca]);
    let saldo1 = 0; let coherente1 = true;
    for (const k of kardex1) {
        const signo = ['inventario_inicial', 'compra', 'reingreso_anulacion'].includes(k.tipo) ? 1 : -1;
        saldo1 = Math.round((saldo1 + signo * k.cantidad) * 10000) / 10000;
        if (Math.abs(saldo1 - k.stock_resultante) > 0.0001) coherente1 = false;
    }
    cmp('4) Kardex', 'saldo recalculado = stock_resultante en cada fila', true, coherente1);
    cmp('4) Kardex', 'saldo final Kardex = productos.stock', await stockProd(coca), saldo1);
    await q.cerrarCaja(cajaId3, 120, cajeroId, 0);

    // =====================================================================
    // BLOQUE II: PRUEBAS NUEVAS SOLICITADAS
    // =====================================================================

    // ---------- h) IT configurable con it_base = 'todas_las_ventas' (por defecto) ----------
    await q.guardarConfiguracionContable(adminId, { regimenTributario: 'regimen_general', ivaPorcentaje: 13, itPorcentaje: 3 }); // sin pasar itBase -> defecto 'todas_las_ventas'
    const cfgDef = await q.obtenerConfiguracionNegocio();
    cmp('h) IT todas_las_ventas', 'it_base por defecto', 'todas_las_ventas', cfgDef.it_base);
    caja = await q.abrirCaja(cajeroId, 100, 1);
    const cajaId4 = typeof caja === 'object' ? (caja.id || caja.cajaId) : caja;
    // Venta con factura Bs 100 + Venta con recibo Bs 50 -> IVA sobre 100 (=13), IT sobre 150 (=4.50)
    await q.registrarVentaCompleta(cajaId4, [{ productoId: coca, cantidad: 10 }], 'efectivo', 100, 'Fac 100', cajeroId, null, { tipoComprobante: 'factura', nroFactura: '002', clienteNitCi: '111' });
    await q.registrarVentaCompleta(cajaId4, [{ productoId: coca, cantidad: 5 }], 'qr', null, 'Rec 50', cajeroId);
    const estH = await q.obtenerEstadisticasCaja(cajaId4);
    cmp('h) IT todas_las_ventas', 'IVA solo sobre facturado (13% de 100)', 13, estH.debitoFiscalIva);
    cmp('h) IT todas_las_ventas', 'IT sobre todas las ventas (3% de 150)', 4.5, estH.impuestoTransaccionesIt);
    await q.cerrarCaja(cajaId4, 200, cajeroId, 50);

    // ---------- i) Ventas con descuento + prorrateo proporcional de ganancia por producto ----------
    await q.guardarConfiguracionContable(adminId, { regimenTributario: 'simplificado_control_interno' });
    const galleta = await q.crearProducto('Galleta Choc', 20, 8, 'Dulces', 50, 'unidades', 0, null, adminId);
    caja = await q.abrirCaja(cajeroId, 100, 1);
    const cajaId5 = typeof caja === 'object' ? (caja.id || caja.cajaId) : caja;
    // Ticket: 2 Coca (sub=20, costo=12) + 1 Galleta (sub=20, costo=8) -> subtotalBruto=40, descuento=10, montoNeto=30
    // Prorrateo 50%/50%: cada línea recibe Bs 5 de descuento -> ingreso neto Coca=15 (ganancia 15-12=3), Galleta=15 (ganancia 15-8=7). Suma ganancias=10 === gananciaBruta(30-20)
    const vDesc = await q.registrarVentaCompleta(
        cajaId5,
        [{ productoId: coca, cantidad: 2 }, { productoId: galleta, cantidad: 1 }],
        'efectivo', 30, 'Venta con descuento', cajeroId, null, { descuento: 10 }
    );
    cmp('i) Descuento', 'subtotal bruto', 40, vDesc.subtotalBruto);
    cmp('i) Descuento', 'descuento aplicado', 10, vDesc.descuentoTotal);
    cmp('i) Descuento', 'monto neto cobrado', 30, vDesc.montoTotal);
    const estI = await q.obtenerEstadisticasCaja(cajaId5);
    const pCoca = estI.productosMasVendidos.find((p) => p.id === coca);
    const pGall = estI.productosMasVendidos.find((p) => p.id === galleta);
    const sumaIngresosProd = q.redondear2((pCoca?.ingresos_generados || 0) + (pGall?.ingresos_generados || 0));
    const sumaGananciasProd = q.redondear2((pCoca?.ganancia_generada || 0) + (pGall?.ganancia_generada || 0));
    cmp('i) Descuento', 'ingreso neto Coca prorrateado', 15, pCoca?.ingresos_generados);
    cmp('i) Descuento', 'ganancia neta Coca (15-12)', 3, pCoca?.ganancia_generada);
    cmp('i) Descuento', 'ganancia neta Galleta (15-8)', 7, pGall?.ganancia_generada);
    cmp('i) Descuento', 'SUM(ingresos por producto) === ventasTotales', estI.ventasTotales, sumaIngresosProd);
    cmp('i) Descuento', 'SUM(ganancia por producto) === gananciaBruta', estI.gananciaBruta, sumaGananciasProd);

    // ---------- j) Egreso con factura (crédito fiscal IVA y snapshot) ----------
    await q.guardarConfiguracionContable(adminId, { regimenTributario: 'regimen_general', ivaPorcentaje: 13, itPorcentaje: 3 });
    const egId = await q.registrarEgreso(cajaId5, 100, 'Compra insumos limpieza', 'efectivo', adminId, {
        categoriaContable: 'gasto_operativo',
        conFactura: true,
        tipoComprobante: 'factura',
        nroFactura: 'F-900',
        proveedorNit: '998877',
        proveedorNombre: 'Limpieza SRL'
    });
    const egRow = await get('SELECT tipo_comprobante, nro_factura, regimen_tributario, iva_porcentaje, iva_monto FROM movimientos WHERE id = ?', [egId]);
    cmp('j) Egreso con factura', 'snapshot iva_monto (13% de 100)', 13, egRow.iva_monto);
    const estJ = await q.obtenerEstadisticasCaja(cajaId5);
    cmp('j) Egreso con factura', 'egresosFacturados', 100, estJ.egresosFacturados);
    cmp('j) Egreso con factura', 'creditoFiscalIvaEgresos', 13, estJ.creditoFiscalIvaEgresos);

    // ---------- k) Compra de producto directo (CPP + Kardex) y Merma de producto directo ----------
    // Galleta tenía stock 49 (50 - 1 vendida) a costo 8 (valor = 392). Compramos 51 unidades por Bs 510 (costo unit compra = 10)
    // Nuevo stock = 100, nuevo valor = 902 -> nuevo CPP = 9.02
    const compDir = await q.registrarCompraProductoDirecto(galleta, 51, 510, null, {
        proveedorNombre: 'Distribuidora Dulce',
        proveedorNit: '445566',
        nroFacturaCompra: 'FC-77',
        conFactura: true,
        usuarioId: adminId
    });
    cmp('k) Compra directo', 'nuevoStock (49+51)', 100, compDir.nuevoStock);
    cmp('k) Compra directo', 'nuevoCostoUnitario CPP ((392+510)/100)', 9.02, compDir.nuevoCostoUnitario);
    const mermaDir = await q.registrarMermaProductoDirecto(galleta, 5, 'Paquetes aplastados', adminId);
    cmp('k) Merma directo', 'stockRestante (100-5)', 95, mermaDir.stockRestante);
    cmp('k) Merma directo', 'costoPerdida (5 × 9.02)', 45.1, mermaDir.costoPerdida);
    let errMermaExceso = null;
    try { await q.registrarMermaProductoDirecto(galleta, 500, 'Exceso', adminId); } catch (e) { errMermaExceso = e.message; }
    cmp('k) Merma directo', 'rechaza merma mayor al stock', true, Boolean(errMermaExceso));

    // ---------- l) Combos y modificadores (reemplazo + extra) con pago mixto y su anulación ----------
    const insCafe = await q.crearInsumo('Grano Café', 'g', 500, 0.2);
    const insLecheEntera = await q.crearInsumo('Leche Entera', 'ml', 2000, 0.01);
    const insLecheAlmendra = await q.crearInsumo('Leche Almendra', 'ml', 1000, 0.03);
    const prodLatteRes = await q.crearProductoConInsumos({
        nombre: 'Latte Clásico',
        precio: 18,
        categoria: 'Cafés',
        tipoComposicion: 'receta',
        insumosReceta: [
            { insumoId: insCafe, cantidad: 20, unidadReceta: 'g' },       // costo 4
            { insumoId: insLecheEntera, cantidad: 200, unidadReceta: 'ml' } // costo 2 -> total base 6
        ]
    });
    const latteId = prodLatteRes.id;
    const grupoLecheId = await q.crearGrupoModificadores({
        nombre: 'Tipo de Leche',
        tipoSeleccion: 'unica',
        esObligatorio: true,
        opciones: [
            { nombre: 'Entera Normal', precioAdicional: 0, esDefault: true },
            { nombre: 'Deslactosada Almendra', insumoId: insLecheAlmendra, cantidadInsumo: 200, insumoReemplazadoId: insLecheEntera, precioAdicional: 4 }
        ]
    }, adminId);
    const grupoExtraId = await q.crearGrupoModificadores({
        nombre: 'Shots Extra',
        tipoSeleccion: 'multiple',
        esObligatorio: false,
        opciones: [
            { nombre: 'Shot Extra Café', insumoId: insCafe, cantidadInsumo: 10, precioAdicional: 3 }
        ]
    }, adminId);
    await q.asignarModificadoresAProducto(latteId, [grupoLecheId, grupoExtraId], adminId);
    const grupos = await q.obtenerGruposModificadores(true);
    const opAlmendra = grupos.find((g) => g.id === grupoLecheId).opciones.find((o) => o.nombre.includes('Almendra')).id;
    const opShot = grupos.find((g) => g.id === grupoExtraId).opciones[0].id;

    // Venta de 1 Latte con reemplazo a Leche Almendra (+4) y Shot Extra (+3) -> precio = 18+4+3 = 25, pagado mixto (15 ef + 10 QR)
    // Consume: Café = 20+10 = 30g (500->470), Leche Entera = 200-200 = 0ml (sigue 2000), Leche Almendra = 200ml (1000->800)
    const vMod = await q.registrarVentaCompleta(
        cajaId5,
        [{ productoId: latteId, cantidad: 1, modificadores: [opAlmendra, opShot] }],
        'mixto', 20, 'Latte modificado mixto', cajeroId, null, { montoEfectivo: 15, montoQr: 10 }
    );
    cmp('l) Modificadores+Mixto', 'monto total (18+4+3)', 25, vMod.montoTotal);
    cmp('l) Modificadores+Mixto', 'cambio sobre porción efectivo (20-15)', 5, vMod.cambio);
    cmp('l) Modificadores+Mixto', 'Grano Café descontado (500-30)', 470, await stockIns(insCafe));
    cmp('l) Modificadores+Mixto', 'Leche Entera reemplazada intacta (2000)', 2000, await stockIns(insLecheEntera));
    cmp('l) Modificadores+Mixto', 'Leche Almendra descontada (1000-200)', 800, await stockIns(insLecheAlmendra));

    // Combo con límite: 1 Latte + 1 Galleta Choc a Bs 32, límite de 5 unidades
    const comboRes = await q.crearProductoConInsumos({
        nombre: 'Combo Merienda',
        precio: 32,
        categoria: 'Combos',
        tipoComposicion: 'combo',
        componentesCombo: [
            { productoId: latteId, cantidad: 1 },
            { productoId: galleta, cantidad: 1 }
        ],
        limiteMaximoActivo: true,
        limiteUnidadesTotal: 5
    });
    const comboId = comboRes.id;
    // Vendemos 2 combos con pago mixto (24 ef + 40 QR = 64)
    const vCombo = await q.registrarVentaCompleta(
        cajaId5,
        [{ productoId: comboId, cantidad: 2 }],
        'mixto', null, 'Venta combo mixto', cajeroId, null, { montoEfectivo: 24, montoQr: 40 }
    );
    cmp('l) Combo+Mixto', 'monto total (2 × 32)', 64, vCombo.montoTotal);
    cmp('l) Combo+Mixto', 'stock Galleta descontado (95-2)', 93, await stockProd(galleta));
    cmp('l) Combo+Mixto', 'Grano Café descontado (470 - 2×20)', 430, await stockIns(insCafe));
    cmp('l) Combo+Mixto', 'Leche Entera descontada (2000 - 2×200)', 1600, await stockIns(insLecheEntera));
    const limPostVenta = (await get('SELECT limite_unidades_restante FROM productos WHERE id = ?', [comboId])).limite_unidades_restante;
    cmp('l) Combo+Mixto', 'límite de unidades restante (5-2)', 3, limPostVenta);

    // Anulamos la venta del combo -> debe restituir stock directo, insumos y contador del combo
    await q.anularMovimientoConPermiso(adminId, vCombo.movimientoId, 'Cliente canceló combo');
    cmp('l) Anulación Combo', 'stock Galleta restituido (93+2)', 95, await stockProd(galleta));
    cmp('l) Anulación Combo', 'Grano Café restituido (430+40)', 470, await stockIns(insCafe));
    cmp('l) Anulación Combo', 'Leche Entera restituida (1600+400)', 2000, await stockIns(insLecheEntera));
    const limPostAnul = (await get('SELECT limite_unidades_restante FROM productos WHERE id = ?', [comboId])).limite_unidades_restante;
    cmp('l) Anulación Combo', 'límite combo restituido (3+2)', 5, limPostAnul);

    // Cerrar caja 5: Fondo 100 + Ef ventas (30 + 15 = 45) - Egreso (100) = 45 esperado; QR esperado = 10
    const cierre5 = await q.cerrarCaja(cajaId5, 45, cajeroId, 10, 'Cierre turno 5 completo');
    cmp('l) Cierre Turno 5', 'efectivoEsperado (100+45-100)', 45, cierre5.efectivoEsperado);
    cmp('l) Cierre Turno 5', 'qrEsperado (10)', 10, cierre5.qrEsperado);

    // ---------- m) Consulta de control: verificarIntegridadKardexDirecto() ----------
    const ctrlKardex = await q.verificarIntegridadKardexDirecto();
    cmp('m) Control Kardex', 'integridadOk en todos los productos directos', true, ctrlKardex.integridadOk);
    cmp('m) Control Kardex', 'totalDescuadres === 0', 0, ctrlKardex.totalDescuadres);

    // ---------- n) Exportación Excel (.xlsx), CSV, PDF y HTML de Correo de Cierre ----------
    const bufferExcel = await q.generarReporteExcel(null, { desde: '2020-01-01', hasta: '2099-12-31' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bufferExcel);
    const nombresHojas = wb.worksheets.map((w) => w.name);
    cmp('n) Excel', 'contiene las 7 hojas (incluyendo Kardex Productos)', true,
        ['Movimientos', 'Arqueos de Caja', 'Detalle Ventas (CMV)', 'Compras y Mermas', 'Inventario Kardex', 'Kardex Productos', 'Resumen Contable']
            .every((h) => nombresHojas.includes(h)));
    const hojaCompras = wb.getWorksheet('Compras y Mermas');
    let tieneCompraDirectaEnHoja4 = false;
    let tieneMermaDirectaEnHoja4 = false;
    hojaCompras.eachRow((row) => {
        const txt = JSON.stringify(row.values);
        if (txt.includes('Producto Directo') && txt.includes('Galleta Choc') && txt.includes('compra')) tieneCompraDirectaEnHoja4 = true;
        if (txt.includes('Producto Directo') && txt.includes('Galleta Choc') && txt.includes('merma')) tieneMermaDirectaEnHoja4 = true;
    });
    cmp('n) Excel Hoja 4', 'incluye compra de producto directo', true, tieneCompraDirectaEnHoja4);
    cmp('n) Excel Hoja 4', 'incluye merma de producto directo', true, tieneMermaDirectaEnHoja4);
    const hojaKardexCrono = wb.getWorksheet('Kardex Productos');
    cmp('n) Excel Hoja 6', 'Kardex Productos tiene filas cronológicas (>10)', true, hojaKardexCrono.rowCount > 10);

    // Filtro de fechas fuera de rango -> Kardex Productos vacío
    const bufferVacio = await q.generarReporteExcel(null, { desde: '1999-01-01', hasta: '1999-12-31' });
    const wbVacio = new ExcelJS.Workbook();
    await wbVacio.xlsx.load(bufferVacio);
    cmp('n) Excel Filtro Fechas', 'Kardex Productos respeta filtro de fechas (solo cabecera=1 fila)', 1, wbVacio.getWorksheet('Kardex Productos').rowCount);

    // CSV
    const csv = await q.generarReporteCSV(cajaId5);
    cmp('n) CSV', 'incluye BOM UTF-8 y filas de caja 5', true, csv.startsWith('\uFEFF') && csv.includes('Latte modificado mixto'));

    // Correo de cierre con ventas mixtas (turno 1 y turno 5)
    const datosCorreo1 = await q.obtenerDatosCierreParaNotificacion(cajaId1);
    const htmlCorreo1 = mailer.construirHtmlCierre(datosCorreo1);
    cmp('n) Correo Cierre', 'métricas de ventas mixtas Ef=32 / QR=42 / Total=74', '32|42|74',
        `${datosCorreo1.metricas.totalVentasEfectivo}|${datosCorreo1.metricas.totalVentasQR}|${datosCorreo1.metricas.totalVentas}`);
    cmp('n) Correo Cierre', 'HTML ejecutivo generado con montos y estación', true,
        htmlCorreo1.includes('Turno #1') && htmlCorreo1.includes('74') && htmlCorreo1.includes('Reporte_Turno_1.xlsx'));

    // PDF (importando app/admin/exportarPDF.js en Node mediante file:// URL)
    const { pathToFileURL } = require('url');
    const { exportarReportePDF } = await import(pathToFileURL(path.join(__dirname, '..', 'app', 'admin', 'exportarPDF.js')).href);
    const histCajas = await q.obtenerHistorialCajas();
    const cajaAudit = histCajas.find((c) => c.id === cajaId5);
    const movs5 = await q.obtenerMovimientosCaja(cajaId5);
    const desg5 = await q.obtenerDesgloseMetodosPago(cajaId5);
    const docPdf = exportarReportePDF({
        nombreNegocio: 'Cafetería Test',
        configuracionNegocio: await q.obtenerConfiguracionNegocio(),
        usuarioGenerador: 'admin_test',
        cajaAuditada: cajaAudit,
        estadisticas: estJ,
        movimientos: movs5,
        desglosePagos: desg5
    });
    const pdfBytes = docPdf.output('arraybuffer').byteLength;
    try { fs.unlinkSync(path.join(process.cwd(), `reporte_turno_${cajaId5}.pdf`)); } catch (_) {}
    cmp('n) PDF', 'genera documento PDF válido con tablas (>2 KB)', true, pdfBytes > 2000);

    console.log = logOriginal; console.warn = warnOriginal;
    console.log('\n=== RESULTADOS COMPLETOS: ESPERADO vs OBTENIDO ===');
    console.table(filas);
    console.log('\nControl de integridad Kardex vs productos.stock:');
    console.table(ctrlKardex.detalles);
    console.log(`\nRESULTADO: ${filas.length - fallos}/${filas.length} OK, ${fallos} FALLA(S)`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log = logOriginal; console.warn = warnOriginal;
    console.table(filas);
    console.error('ERROR FATAL:', e);
    process.exit(2);
});
