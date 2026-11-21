const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { conBasesPostgres, contextoOperativo } = require('./postgres-fixture');
const { ejecutarMigracionesEnPool } = require('../database/migraciones-tenant');
const { allQuery, getQuery, runQuery, ejecutarConContextoTenant } = require('../server/repositories/db');
const catalogo = require('../server/repositories/catalogo.repo');
const cajas = require('../server/repositories/cajas.repo');
const inventario = require('../server/repositories/inventario.repo');
const ventas = require('../server/repositories/ventas.repo');

async function crearUsuario(nombre, rol, tenantId) {
    const pin = randomUUID();
    const insercion = await runQuery(
        'INSERT INTO usuarios (tenant_id, nombre, nombre_usuario, pin_o_password, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [tenantId, nombre, nombre, pin, rol]
    );
    assert.ok(insercion.lastID);
    return insercion.lastID;
}

const campo = async (sql, params) => Object.values(await getQuery(sql, params))[0];
const stockDirecto = (id) => campo('SELECT stock FROM productos WHERE id = $1', [id]);
const stockInsumo = (id) => campo('SELECT stock_actual FROM insumos WHERE id = $1', [id]);
const cupoCombo = (id) => campo('SELECT limite_unidades_restante FROM productos WHERE id = $1', [id]);
const formatoFecha = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

async function comprobarOperacion(tenantId) {
    const admin = await crearUsuario('Responsable', 'admin', tenantId);
    const operador = await crearUsuario('Operador', 'user', tenantId);
    await runQuery(`
        INSERT INTO configuracion_negocio
            (id, regimen_tributario, emite_factura, iva_porcentaje, it_porcentaje, usa_vencimiento, usa_recetas_ensamblaje)
        VALUES (1, 'regimen_general', 1, 13, 3, 1, 1)
        ON CONFLICT (id) DO UPDATE SET regimen_tributario = excluded.regimen_tributario,
            emite_factura = 1, iva_porcentaje = 13, it_porcentaje = 3, usa_vencimiento = 1, usa_recetas_ensamblaje = 1
    `);

    const categoria = await catalogo.crearCategoria('Artículos compuestos');
    assert.ok(categoria.id);
    assert.deepEqual(await catalogo.crearCategoria(categoria.nombre), categoria);
    const base = await inventario.crearInsumo('Componente base', 'unidades', 12, 2);
    const alternativo = await inventario.crearInsumo('Componente alternativo', 'unidades', 10, 3);
    assert.equal((await inventario.obtenerInsumos()).length, 2);

    const directo = await catalogo.crearProducto('Artículo con lote', 8, 4, categoria.nombre, 3, 'unidades', 0, '2090-08-01', admin);
    const sinLotes = await catalogo.crearProducto('Artículo sin lote', 5, 1, categoria.nombre, 1);
    const receta = await catalogo.crearProductoConInsumos({
        nombre: 'Artículo ensamblado', precio: 10, categoria: categoria.nombre,
        tipoComposicion: 'receta', insumosReceta: [{ insumoId: base, cantidad: 1 }]
    });
    const asignacion = await catalogo.asignarIngredienteReceta(receta.id, base, 2);
    assert.equal(asignacion.nuevoCostoProducto, 4);
    await assert.rejects(catalogo.crearProductoConInsumos({
        nombre: 'Producto incompleto', precio: 10, categoria: 'Categoría transitoria', tipoComposicion: 'receta',
        insumosReceta: [{ insumoId: base, cantidad: 1 }, { insumoId: base, cantidad: 1 }]
    }), /duplicado/);
    assert.deepEqual(await catalogo.obtenerCategorias(), [categoria]);

    const combo = await catalogo.crearProductoConInsumos({
        nombre: 'Paquete promocional', precio: 22, categoria: categoria.nombre, tipoComposicion: 'combo',
        componentesCombo: [{ productoId: receta.id, cantidad: 1 }, { productoId: directo, cantidad: 1 }],
        limiteMaximoActivo: true, limiteUnidadesTotal: 3
    });
    const grupo = await catalogo.crearGrupoModificadores({
        nombre: 'Variante',
        opciones: [{ nombre: 'Sustitución', insumoId: alternativo, insumoReemplazadoId: base, cantidadInsumo: 1, precioAdicional: 2 }]
    }, admin);
    await catalogo.asignarModificadoresAProducto(receta.id, [grupo, grupo], admin);
    const productos = await catalogo.obtenerProductos();
    assert.equal(productos.length, 4);
    const fichaReceta = productos.find((producto) => producto.id === receta.id);
    assert.equal(fichaReceta.unidades_disponibles, 6);
    assert.deepEqual(fichaReceta.grupos_modificadores_ids, [grupo]);
    const [opcion] = fichaReceta.grupos_modificadores[0].opciones;
    assert.equal(productos.find((producto) => producto.id === combo.id).unidades_disponibles, 3);

    const estacion = await cajas.crearCajaFisica('Terminal principal', admin);
    const caja = await cajas.abrirCaja(operador, 50, estacion);
    const venta = (items, metodoPago, datos = {}) => ventas.registrarVentaCompleta({
        cajaId: caja, usuarioId: operador, items, metodoPago, ...datos
    });
    const efectivo = await venta([{ productoId: receta.id, cantidad: 1, modificadores: [opcion.id] }], 'efectivo', {
        montoRecibido: 20, opcionesExtra: { tipoComprobante: 'factura' }
    });
    assert.equal(efectivo.nroFactura, '1');
    assert.equal(efectivo.cambio, 8);
    const qr = await venta([{ productoId: directo, cantidad: 1 }], 'qr', { opcionesExtra: { referenciaQr: 'QR-001' } });
    const mixta = await venta([{ productoId: combo.id, cantidad: 1 }], 'mixto', {
        opcionesExtra: { descuentoTotal: 2, montoEfectivo: 7, montoQr: 13, referenciaQr: 'QR-002' }, montoRecibido: 10
    });
    assert.equal(mixta.cambio, 3);
    assert.equal(mixta.montoTotal, 20);
    const pagos = (id) => allQuery('SELECT metodo_pago, monto, referencia FROM movimientos_pagos WHERE movimiento_id = $1 ORDER BY id', [id]);
    assert.deepEqual(await pagos(efectivo.movimientoId), [{ metodo_pago: 'efectivo', monto: 12, referencia: null }]);
    assert.deepEqual(await pagos(qr.movimientoId), [{ metodo_pago: 'qr', monto: 8, referencia: 'QR-001' }]);
    assert.deepEqual(await pagos(mixta.movimientoId), [
        { metodo_pago: 'efectivo', monto: 7, referencia: null },
        { metodo_pago: 'qr', monto: 13, referencia: 'QR-002' }
    ]);

    assert.equal(await stockInsumo(base), 10);
    assert.equal(await stockInsumo(alternativo), 9);
    assert.equal(await stockDirecto(directo), 1);
    assert.equal(await cupoCombo(combo.id), 2);
    await assert.rejects(venta([{ productoId: directo, cantidad: 2 }], 'qr'), /stock insuficiente/i);
    assert.equal((await ventas.obtenerMovimientosCaja(caja)).length, 3);

    await inventario.registrarCompraInsumo(base, 10, 40);
    await inventario.registrarCompraInsumo(alternativo, 1, 9);
    await inventario.registrarCompraProductoDirecto(directo, 2, 20, '2090-08-01');
    assert.equal(await campo('SELECT costo FROM productos WHERE id = $1', [combo.id]), 14);
    await runQuery('UPDATE configuracion_negocio SET iva_porcentaje = 10, it_porcentaje = 2 WHERE id = 1');
    const ticket = await getQuery(`
        SELECT regimen_tributario, iva_porcentaje, it_porcentaje, iva_monto, it_monto
        FROM movimientos WHERE id = $1
    `, [efectivo.movimientoId]);
    assert.deepEqual(ticket, {
        regimen_tributario: 'regimen_general', iva_porcentaje: 13, it_porcentaje: 3, iva_monto: 1.56, it_monto: 0.36
    });
    assert.deepEqual(await allQuery(`
        SELECT precio_unitario, costo_unitario FROM detalle_movimientos WHERE movimiento_id IN ($1, $2, $3) ORDER BY id
    `, [efectivo.movimientoId, qr.movimientoId, mixta.movimientoId]), [
        { precio_unitario: 12, costo_unitario: 3 },
        { precio_unitario: 8, costo_unitario: 4 },
        { precio_unitario: 22, costo_unitario: 8 }
    ]);
    assert.equal(await campo('SELECT costo_adicional FROM detalle_movimientos_modificadores'), -1);
    assert.deepEqual(await allQuery('SELECT costo_unitario_congelado FROM detalle_movimientos_combos ORDER BY id'), [
        { costo_unitario_congelado: 4 }, { costo_unitario_congelado: 4 }
    ]);

    await ventas.anularMovimientoConPermiso(admin, mixta.movimientoId, 'Devolución del paquete');
    assert.equal(await stockInsumo(base), 22);
    assert.equal(await stockDirecto(directo), 4);
    assert.equal(await cupoCombo(combo.id), 3);
    assert.equal(await campo('SELECT SUM(stock) FROM producto_lotes WHERE producto_id = $1', [directo]), 4);
    await assert.rejects(ventas.anularMovimientoConPermiso(admin, mixta.movimientoId, 'Reintento de devolución'), /ya fue anulado/);

    // Ambas líneas pasan la primera validación por separado. La segunda agota el cupo
    // durante la escritura y debe revertir el ticket, los pagos y el primer descuento.
    const grupoPaquete = await catalogo.crearGrupoModificadores({
        nombre: 'Presentación', opciones: [{ nombre: 'Separar artículos' }]
    }, admin);
    await catalogo.asignarModificadoresAProducto(combo.id, [grupoPaquete], admin);
    const presentacion = (await catalogo.obtenerGruposModificadores()).find((fila) => fila.id === grupoPaquete).opciones[0];
    await assert.rejects(venta([
        { productoId: combo.id, cantidad: 2 },
        { productoId: combo.id, cantidad: 2, modificadores: [presentacion.id] }
    ], 'qr'), /Error de concurrencia: Límite de venta/);
    assert.equal((await ventas.obtenerMovimientosCaja(caja)).length, 3);
    assert.equal(Number(await campo('SELECT COUNT(*) FROM movimientos_pagos')), 4);
    assert.equal(Number(await campo('SELECT COUNT(*) FROM detalle_movimientos')), 3);
    assert.equal(await cupoCombo(combo.id), 3);
    assert.equal(await stockDirecto(directo), 4);
    assert.equal(await stockInsumo(base), 22);

    const unitaria = await venta([{ productoId: sinLotes, cantidad: 1 }], 'efectivo');
    assert.equal(await stockDirecto(sinLotes), 0);
    await ventas.anularMovimientoConPermiso(admin, unitaria.movimientoId, 'Devolución unitaria');
    assert.equal(await stockDirecto(sinLotes), 1);
    await ventas.registrarIngresoEfectivo(caja, 5, 'Cambio', operador);
    await ventas.registrarEgreso(caja, 3, 'Gasto operativo', 'efectivo', operador);

    const abierta = await cajas.obtenerCajaAbierta(operador);
    assert.equal(abierta.id, caja);
    assert.equal(abierta.efectivo_esperado, null);
    assert.equal(abierta.efectivo_real, null);
    assert.equal(abierta.qr_esperado, 0);
    assert.equal(abierta.qr_real, null);
    assert.match(abierta.fecha_apertura, formatoFecha);
    assert.equal((await cajas.obtenerCajasAbiertas()).length, 1);
    assert.equal((await cajas.obtenerResumenCaja(caja)).total_ventas, 20);
    const cierre = await cajas.cerrarCaja(caja, 63, operador, 8);
    assert.deepEqual([cierre.efectivoEsperado, cierre.diferenciaEfectivo, cierre.qrEsperado, cierre.diferenciaQr], [64, -1, 8, 0]);
    const [cerrada] = await cajas.obtenerHistorialCajas(estacion);
    assert.equal(cerrada.estado, 'cerrada');
    assert.match(cerrada.fecha_cierre, formatoFecha);
    await assert.rejects(venta([{ productoId: directo, cantidad: 1 }], 'qr'), /no está abierta/);
    const anulada = (await ventas.obtenerMovimientosCaja(caja)).find((mov) => mov.id === mixta.movimientoId);
    assert.equal(anulada.estado, 'anulado');
    assert.match(anulada.fecha_anulacion, formatoFecha);
    assert.equal(await ventas.obtenerSiguienteNumeroFactura(), 2);

    await assert.rejects(inventario.registrarMermaInsumo(base, 23, 'Control de merma', admin), /stock insuficiente/i);
    await assert.rejects(inventario.registrarMermaProductoDirecto(directo, 5, 'Control de merma', admin), /stock insuficiente/i);
    await inventario.registrarMermaInsumo(base, 0.25, 'Ajuste físico de insumo', admin);
    await inventario.registrarMermaProductoDirecto(directo, 0.5, 'Ajuste físico de artículo', admin);
    assert.equal(await stockInsumo(base), 21.75);
    assert.equal(await stockDirecto(directo), 3.5);
    assert.equal(await campo('SELECT SUM(stock) FROM producto_lotes WHERE producto_id = $1', [directo]), 3.5);

    const dia = abierta.fecha_apertura.slice(0, 10);
    const kardex = await inventario.obtenerKardexDetallado({ productoId: directo, insumoId: base, desde: dia, hasta: dia });
    assert.ok(kardex.kardexProductosDirectos.some((fila) => fila.tipo === 'reingreso_anulacion'));
    assert.ok(kardex.kardexInsumos.some((fila) => fila.tipo === 'merma'));
    assert.ok(kardex.kardexInsumos.every((fila) => formatoFecha.test(fila.fecha_hora)));
    assert.ok((await inventario.obtenerPrediccionComprasInsumos()).length > 0);
    assert.equal((await inventario.verificarIntegridadKardexDirecto()).integridadOk, true);
    assert.equal((await inventario.verificarIntegridadKardexInsumos()).integridadOk, true);
}

async function comprobarConcurrencia(tenantId) {
    const admin = await crearUsuario('Supervisor', 'admin', tenantId);
    const operadorA = await crearUsuario('Operador A', 'user', tenantId);
    const operadorB = await crearUsuario('Operador B', 'user', tenantId);
    const estacionA = await cajas.crearCajaFisica('Terminal A', admin);
    const estacionB = await cajas.crearCajaFisica('Terminal B', admin);
    const aperturas = await Promise.allSettled([
        cajas.abrirCaja(operadorA, 0, estacionA),
        cajas.abrirCaja(operadorA, 0, estacionA)
    ]);
    const abiertas = aperturas.filter((r) => r.status === 'fulfilled');
    assert.equal(abiertas.length, 1);
    assert.match(aperturas.find((r) => r.status === 'rejected').reason.message, /turno abierto/i);
    const cajaA = abiertas[0].value;
    const cajaB = await cajas.abrirCaja(operadorB, 0, estacionB);
    const producto = await catalogo.crearProducto('Última unidad', 8, 3, '', 1);
    const item = [{ productoId: producto, cantidad: 1 }];
    const intentos = await Promise.allSettled([
        ventas.registrarVentaCompleta(cajaA, item, 'efectivo', 8, 'Venta A', operadorA),
        ventas.registrarVentaCompleta(cajaB, item, 'efectivo', 8, 'Venta B', operadorB)
    ]);
    assert.equal(intentos.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(intentos.find((r) => r.status === 'rejected').reason.message, /stock insuficiente/i);
    assert.equal(await stockDirecto(producto), 0);
    assert.equal(Number(await campo('SELECT COUNT(*) FROM movimientos WHERE caja_id IN ($1, $2)', [cajaA, cajaB])), 1);
    const movimiento = intentos.find((r) => r.status === 'fulfilled').value.movimientoId;
    const anulaciones = await Promise.allSettled([
        ventas.anularMovimientoConPermiso(admin, movimiento, 'Devolución concurrente'),
        ventas.anularMovimientoConPermiso(admin, movimiento, 'Devolución concurrente')
    ]);
    assert.equal(anulaciones.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(anulaciones.find((r) => r.status === 'rejected').reason.message, /ya fue anulado/);
    assert.equal(await stockDirecto(producto), 1);

    const [ventaFinal, cierre] = await Promise.allSettled([
        ventas.registrarVentaCompleta(cajaA, item, 'efectivo', 8, 'Última venta', operadorA),
        cajas.cerrarCaja(cajaA, 0, operadorA, 0)
    ]);
    assert.equal(cierre.status, 'fulfilled', cierre.reason?.message);
    assert.equal(cierre.value.efectivoEsperado, ventaFinal.status === 'fulfilled' ? 8 : 0);
    if (ventaFinal.status === 'rejected') assert.match(ventaFinal.reason.message, /no está abierta/);
    await cajas.cerrarCaja(cajaB, 0, operadorB, 0);
}

test('PostgreSQL completa el turno y protege la operación concurrente', { timeout: 60_000 }, () =>
    conBasesPostgres(['operativa'], async ({ operativa }) => {
        await ejecutarMigracionesEnPool(operativa);
        const contexto = contextoOperativo(operativa);
        await ejecutarConContextoTenant(contexto, async () => {
            await comprobarOperacion(contexto.tenantId);
            await comprobarConcurrencia(contexto.tenantId);
        });
    })
);
