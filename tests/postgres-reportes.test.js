const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const ExcelJS = require('exceljs');
const { conBasesPostgres, contextoOperativo } = require('./postgres-fixture');
const { ejecutarMigracionesEnPool } = require('../database/migraciones-tenant');
const { allQuery, enTransaccion, ejecutarConContextoTenant, runQuery } = require('../server/repositories/db');
const cajas = require('../server/repositories/cajas.repo');
const catalogo = require('../server/repositories/catalogo.repo');
const inventario = require('../server/repositories/inventario.repo');
const ventas = require('../server/repositories/ventas.repo');
const reportes = require('../server/repositories/reportes.repo');
const analiticas = require('../server/repositories/analiticas.repo');

const DIA_MS = 86_400_000;
const inicioHoyBolivia = (ahora) => Math.floor((ahora - 4 * 3_600_000) / DIA_MS) * DIA_MS + 4 * 3_600_000;
const fechaUtc = (ms) => new Date(ms).toISOString();

async function crearUsuario(tenantId, nombre, rol) {
    const clave = randomUUID();
    const fila = await runQuery(`INSERT INTO usuarios (tenant_id, nombre, nombre_usuario, pin_o_password, rol)
        VALUES ($1, $2, $3, $4, $5) RETURNING id`, [tenantId, nombre, nombre, clave, rol]);
    return fila.lastID;
}

async function prepararTurnos({ medianoche, tenantId, diferencia = 0, negocio = 'Taller de prueba' }) {
    const [admin, operador] = await enTransaccion(async () => {
        await runQuery(`INSERT INTO configuracion_negocio
            (id, nombre_negocio, regimen_tributario, emite_factura, iva_porcentaje, it_porcentaje, usa_vencimiento)
            VALUES (1, $1, 'regimen_general', 1, 13, 3, 1)
            ON CONFLICT (id) DO UPDATE SET nombre_negocio = excluded.nombre_negocio,
                regimen_tributario = 'regimen_general', emite_factura = 1, iva_porcentaje = 13,
                it_porcentaje = 3, usa_vencimiento = 1`, [negocio]);
        return [await crearUsuario(tenantId, 'Responsable', 'admin'), await crearUsuario(tenantId, 'Operador', 'user')];
    });

    const estacion = await cajas.crearCajaFisica('Terminal principal', admin);
    const caja = await cajas.abrirCaja(operador, 50, estacion);
    const productoA = await catalogo.crearProducto('Artículo A', 10 + diferencia, 2, 'Repuestos', 6, 'unidades', 10);
    const productoB = await catalogo.crearProducto('Artículo B', 10, 3, 'Repuestos', 6);
    const vence = fechaUtc(medianoche + 6 * DIA_MS).slice(0, 10);
    const insumo = await inventario.crearInsumo('Componente', 'unidad', 8, 4, 12, 1, vence);
    const receta = await catalogo.crearProductoConInsumos({
        nombre: 'Artículo ensamblado', precio: 8.5, categoria: 'Ensamblados',
        tipoComposicion: 'receta', insumosReceta: [{ insumoId: insumo, cantidad: 1 }]
    });
    await inventario.registrarCompraInsumo(insumo, 2, 8, 'Reposición', 'Proveedor A', {
        nroFacturaCompra: '101', proveedorNit: '1234'
    });
    await inventario.registrarCompraProductoDirecto(productoB, 2, 6, vence, {
        nroFacturaCompra: '102', proveedorNombre: 'Proveedor B', proveedorNit: '2345'
    });
    const grupo = await catalogo.crearGrupoModificadores({
        nombre: 'Complementos', tipoSeleccion: 'multiple', opciones: [
            { nombre: 'Terminación especial', precioAdicional: 1 },
            { nombre: 'Etiqueta', precioAdicional: 0.5 }, { nombre: 'Empaque' }
        ]
    }, admin);
    await catalogo.asignarModificadoresAProducto(receta.id, [grupo], admin);
    const opciones = await allQuery('SELECT id FROM modificadores_opciones WHERE grupo_id = $1 ORDER BY id', [grupo]);
    const items = [
        { productoId: productoA, cantidad: 1 }, { productoId: productoB, cantidad: 1 },
        { productoId: receta.id, cantidad: 1, modificadores: opciones.map(({ id }) => Number(id)) }
    ];
    const mixta = await ventas.registrarVentaCompleta({
        cajaId: caja, usuarioId: operador, items, metodoPago: 'mixto', montoRecibido: 15,
        opcionesExtra: { descuentoTotal: 0.01, montoEfectivo: 12, montoQr: 17.99 + diferencia, tipoComprobante: 'factura' }
    });
    assert.equal(mixta.cambio, 3);
    const egreso = await ventas.registrarEgreso(caja, 5, 'Reparación', 'efectivo', operador, {
        tipoComprobante: 'factura', nroFactura: '103', proveedorNit: '3456', proveedorNombre: 'Proveedor C'
    });
    const aporte = await ventas.registrarIngresoEfectivo(caja, 3, 'Sencillo', operador);
    const anulada = await ventas.registrarVentaCompleta(caja, [items[1]], 'efectivo', 10, 'Venta anulada', operador);
    await ventas.anularMovimientoConPermiso(admin, anulada.movimientoId, 'Devolución de prueba');
    await cajas.cerrarCaja(caja, 60, operador, 17.99 + diferencia);

    const otraCaja = await cajas.abrirCaja(operador, 0, estacion);
    const historica = await ventas.registrarVentaCompleta({
        cajaId: otraCaja, usuarioId: operador, items: [items[0]], metodoPago: 'qr',
        opcionesExtra: { tipoComprobante: 'factura' }
    });
    const fueraDeSemana = await ventas.registrarVentaCompleta(otraCaja, [items[1]], 'efectivo', 10, 'Venta antigua', operador);

    await enTransaccion(async () => {
        await runQuery('UPDATE cajas SET fecha_apertura = $1, fecha_cierre = $2 WHERE id = $3', [fechaUtc(medianoche), fechaUtc(medianoche + 6000), caja]);
        await runQuery('UPDATE cajas SET fecha_apertura = $1 WHERE id = $2', [fechaUtc(medianoche - 8 * DIA_MS), otraCaja]);
        await runQuery('UPDATE movimientos SET fecha_hora = $1 WHERE id IN ($2, $3, $4, $5)', [fechaUtc(medianoche), mixta.movimientoId, egreso, aporte, anulada.movimientoId]);
        await runQuery('UPDATE movimientos SET fecha_anulacion = $1 WHERE id = $2', [fechaUtc(medianoche + 5000), anulada.movimientoId]);
        await runQuery('UPDATE movimientos SET fecha_hora = $1, regimen_tributario = NULL WHERE id = $2', [fechaUtc(medianoche - 1000), historica.movimientoId]);
        await runQuery('UPDATE movimientos SET fecha_hora = $1 WHERE id = $2', [fechaUtc(medianoche - 8 * DIA_MS), fueraDeSemana.movimientoId]);
        await runQuery('UPDATE movimientos_insumos SET fecha_hora = $1', [fechaUtc(medianoche + 1000)]);
        await runQuery('UPDATE movimientos_productos_directos SET fecha_hora = $1', [fechaUtc(medianoche + 2000)]);
    });
    return { caja: Number(caja), otraCaja: Number(otraCaja), dia: fechaUtc(medianoche).slice(0, 10) };
}

async function leerHojas(buffer) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer);
    return Object.fromEntries(libro.worksheets.map((hoja) => {
        const filas = [];
        hoja.eachRow((fila) => {
            if (fila.getCell(1).value !== 'Fecha de Generación (Hora Local Bolivia)') {
                filas.push(Array.from(fila.values.slice(1), (valor) => valor ?? null));
            }
        });
        return [hoja.name, filas];
    }));
}

async function leerReportes({ caja, otraCaja, dia }) {
    const filtros = { desde: dia, hasta: dia };
    const resumenCaja = await cajas.obtenerResumenCaja(caja);
    return {
        kpi: await reportes.obtenerEstadisticasCaja(caja),
        kpiHistorico: await reportes.obtenerEstadisticasCaja(otraCaja),
        arqueo: [resumenCaja.efectivo_esperado, resumenCaja.qr_esperado],
        pagos: await reportes.obtenerDesgloseMetodosPago(caja),
        tendencias: await reportes.obtenerTendenciasVentas(),
        analiticas: await analiticas.obtenerMetricasInteligencia({ dias: 2 }),
        historicoMatriz: await analiticas.obtenerMatrizRendimiento(30),
        csv: await reportes.generarReporteCSV(null, filtros),
        excel: await leerHojas(await reportes.generarReporteExcel(null, filtros)),
        rcv: await reportes.obtenerComprasFacturadasRCV(filtros),
        rcvTxt: await reportes.generarRCVComprasTXT(filtros),
        rcvExcel: await leerHojas(await reportes.generarRCVComprasExcel(filtros))
    };
}

test('reportes y analíticas concilian resultados explícitos de dos tenants PostgreSQL aislados', { timeout: 60_000 }, async () => {
    const medianoche = inicioHoyBolivia(Date.now());
    await assert.rejects(reportes.obtenerTendenciasVentas(), /contexto de tenant obligatorio/i);

    await conBasesPostgres(['taller', 'tienda'], async (pools) => {
        const [taller, tienda] = Object.entries(pools).map(([slug, pool]) => contextoOperativo(pool, slug));
        await Promise.all([taller, tienda].map(({ pool }) => ejecutarMigracionesEnPool(pool)));
        const bajoTenant = ejecutarConContextoTenant;
        const [turnoA, turnoB] = await Promise.all([
            bajoTenant(taller, () => prepararTurnos({ medianoche, tenantId: taller.tenantId })),
            bajoTenant(tienda, () => prepararTurnos({ medianoche, tenantId: tienda.tenantId, diferencia: 2, negocio: 'Tienda de prueba' }))
        ]);
        assert.deepEqual(turnoA, turnoB, 'los mismos IDs de turno deben resolverse en su propia base');
        const [a, b] = await Promise.all([
            bajoTenant(taller, () => leerReportes(turnoA)), bajoTenant(tienda, () => leerReportes(turnoB))
        ]);

        const { cantidadTickets, ventasTotales, descuentosTotales, costoTotalVentas, gananciaBruta,
            flujoNetoOperativo, debitoFiscalIva, impuestoTransaccionesIt, creditoFiscalIvaEgresos } = a.kpi;
        assert.deepEqual([cantidadTickets, ventasTotales, descuentosTotales, costoTotalVentas, gananciaBruta,
            flujoNetoOperativo, debitoFiscalIva, impuestoTransaccionesIt, creditoFiscalIvaEgresos],
        [1, 29.99, 0.01, 9, 20.99, 15.99, 3.9, 0.9, 0.65]);
        assert.deepEqual(a.arqueo, [60, 17.99]);
        assert.deepEqual(a.pagos.map(({ metodoPago, montoTotal, transacciones }) => [metodoPago, montoTotal, transacciones]),
            [['efectivo', 12, 1], ['qr', 17.99, 1]]);
        assert.deepEqual(a.kpi.productosMasVendidos.map((p) => p.ingresos_generados), [10, 10, 9.99]);
        assert.deepEqual(a.tendencias.ventasPorHora, [{ hora: '00:00', cantidad_tickets: 1, total_vendido: 29.99 }]);
        assert.deepEqual(a.tendencias.comparativaSemanal, [
            { fecha: fechaUtc(medianoche - DIA_MS).slice(0, 10), cantidad_tickets: 1, ingresos: 10, egresos: 0 },
            { fecha: turnoA.dia, cantidad_tickets: 1, ingresos: 29.99, egresos: 5 }
        ]);
        assert.equal(a.analiticas.matrizRendimiento.productos.find((p) => p.producto_nombre === 'Artículo B').unidades_vendidas, 1);
        assert.equal(a.historicoMatriz.productos.find((p) => p.producto_nombre === 'Artículo B').unidades_vendidas, 2);
        const { semaforoReposicion, radarVencimientos } = a.analiticas;
        assert.deepEqual(Object.fromEntries(semaforoReposicion.items.map((item) =>
            [item.nombre, [item.stock_actual, item.sugerencia_compra, item.costo_estimado_inversion]])), {
            'Artículo A': [4, 11, 22],
            Componente: [9, 9, 36]
        });
        assert.equal(semaforoReposicion.costoTotalInversion, 58);
        const perecedero = radarVencimientos.grupos.critico_7d.find((item) => item.nombre === 'Componente');
        assert.equal(perecedero.valor_en_riesgo, 36);
        assert.deepEqual(a.rcv.map(({ nro_factura, importe_total_compra, credito_fiscal }) =>
            [nro_factura, importe_total_compra, credito_fiscal]), [
            ['103', 5, 0.65], ['101', 8, 1.04], ['102', 6, 0.78]
        ]);
        const filasTxt = a.rcvTxt.split('\r\n').map((fila) => fila.split('|'));
        assert.deepEqual(filasTxt.map((fila) => [fila.length, fila[4], fila[7], fila[19]]), [
            [22, '103', '5.00', '0.65'], [22, '101', '8.00', '1.04'], [22, '102', '6.00', '0.78']
        ]);
        const [columnasRcv, ...filasRcv] = a.rcvExcel['RCV Compras'];
        assert.equal(columnasRcv.length, 22);
        assert.deepEqual(filasRcv.map((fila) => [fila[4], fila[7], fila[19]]), [
            ['103', 5, 0.65], ['101', 8, 1.04], ['102', 6, 0.78]
        ]);
        assert.equal(a.kpiHistorico.debitoFiscalIva, 1.3);
        const detalle = a.excel['Detalle Ventas (CMV)'];
        assert.ok(detalle.some((fila) => fila.includes('Terminación especial (+Bs 1.0), Etiqueta (+Bs 0.5), Empaque')));
        const prorrateo = Object.fromEntries(detalle.filter((fila) => fila[18] === 'completado')
            .map((fila) => [fila[5], fila.slice(12, 14)]));
        assert.deepEqual(prorrateo, { 'Artículo A': [0, 10], 'Artículo B': [0, 10], 'Artículo ensamblado': [0.01, 9.99] });
        assert.ok(a.excel['Kardex Productos'].some((fila) => fila.includes('reingreso_anulacion')));
        assert.ok(a.excel['Kardex Insumos'].some((fila) => fila.includes('consumo_venta')));
        assert.match(a.csv, /Taller de prueba/);
        const filasCsv = a.csv.split('\n').slice(4).map((fila) => fila.split(';'));
        assert.equal(filasCsv.length, 4);
        const ventaCsv = filasCsv.find((fila) => fila[7] === 'mixto');
        assert.deepEqual(ventaCsv.slice(12, 17), ['30.00', '0.01', '29.99', '12.00', '17.99']);
        assert.deepEqual(ventaCsv.slice(20, 24), ['9.00', '20.99', '3.90', '0.90']);
        assert.match(b.csv, /Tienda de prueba/);
        assert.doesNotMatch(b.csv, /Taller de prueba/);
        assert.equal(b.kpi.ventasTotales, 31.99);
        assert.deepEqual(b.arqueo, [60, 19.99]);
        assert.equal(b.tendencias.ventasPorHora[0].total_vendido, 31.99);
    }, { options: '-c timezone=Asia/Tokyo' });
});
