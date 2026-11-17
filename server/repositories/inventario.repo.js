/**
 * server/repositories/inventario.repo.js
 * Repositorio para la gestión de compras, mermas, control de stock y auditoría de Kardex
 * tanto de insumos (materia prima) como de productos directos (mercadería para reventa).
 * Cumple con NIC 2 (Costo Promedio Ponderado - CPP) y auditoría de integridad matemática.
 */

const {
    runQuery,
    getQuery,
    allQuery,
    enTransaccion,
    redondear2,
    numeroPositivo,
    numeroNoNegativo
} = require('./db');
const {
    recalcularCostoProductoPorReceta,
    recalcularCostoCombosQueContienenProducto
} = require('./catalogo.repo');

async function crearInsumo(nombre, unidadMedida, stockInicial = 0, costoPorUnidad = 0, stockSeguridad = 0, tiempoEntregaDias = 1, fechaVencimiento = null, proveedor = null, usuarioId = null) {
    if (!nombre || String(nombre).trim() === '') {
        throw new Error('El nombre del insumo es obligatorio.');
    }
    const stockInicialValidado = Number(numeroNoNegativo(stockInicial ?? 0, 'El stock inicial del insumo').toFixed(4));
    const costoPorUnidadValidado = Number(numeroNoNegativo(costoPorUnidad ?? 0, 'El costo por unidad del insumo').toFixed(6));
    const stockSeguridadValidado = Number(numeroNoNegativo(stockSeguridad ?? 0, 'El stock de seguridad').toFixed(4));
    const tiempoEntregaValidado = numeroNoNegativo(tiempoEntregaDias ?? 1, 'El tiempo de entrega en días');

    return await enTransaccion(async () => {
        const res = await runQuery(
            `INSERT INTO insumos (nombre, unidad_medida, stock_actual, costo_por_unidad, stock_seguridad, tiempo_entrega_dias, fecha_vencimiento)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nombre.trim(), unidadMedida || 'unidades', stockInicialValidado, costoPorUnidadValidado, stockSeguridadValidado, tiempoEntregaValidado, fechaVencimiento || null]
        );
        const insumoId = res.lastID;

        if (stockInicialValidado > 0) {
            const provNombre = proveedor && String(proveedor).trim() !== '' ? String(proveedor).trim() : null;
            const motivoInicial = provNombre
                ? `Inventario inicial (Proveedor: ${provNombre})`
                : 'Inventario inicial';
            await runQuery(
                `INSERT INTO movimientos_insumos (
                    insumo_id, usuario_id, tipo, cantidad, stock_resultante,
                    costo_unitario, costo_promedio_resultante, monto_total_compra, proveedor_nombre, motivo
                 )
                 VALUES (?, ?, 'inventario_inicial', ?, ?, ?, ?, ?, ?, ?)`,
                [
                    insumoId,
                    usuarioId ? Number(usuarioId) : null,
                    stockInicialValidado,
                    stockInicialValidado,
                    costoPorUnidadValidado,
                    costoPorUnidadValidado,
                    redondear2(stockInicialValidado * costoPorUnidadValidado),
                    provNombre,
                    motivoInicial
                ]
            );
        }
        return insumoId;
    });
}

async function obtenerInsumos() {
    return await allQuery(`SELECT * FROM insumos WHERE activo = 1 ORDER BY nombre`);
}

// Compra de insumo con Costo Promedio Ponderado (CPP) y actualización en cascada de recetas
async function registrarCompraInsumo(insumoId, cantidadComprada, costoTotalCompra, motivo = 'Compra a proveedor', distribuidora = null, datosFiscales = {}) {
    const cantValidada = Number(numeroPositivo(cantidadComprada, 'La cantidad comprada').toFixed(4));
    const costoValidado = redondear2(numeroNoNegativo(costoTotalCompra, 'El costo total de compra'));

    return await enTransaccion(async () => {
        const insumo = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
        if (!insumo) throw new Error('Insumo no encontrado.');

        const stockAnterior = Math.max(0, Number(insumo.stock_actual || 0));
        const valorAnterior = stockAnterior * Number(insumo.costo_por_unidad || 0);
        const nuevoStock = Number((Number(insumo.stock_actual || 0) + cantValidada).toFixed(4));

        // Fórmula de Costo Promedio Ponderado (NIC 2) con precisión de 6 decimales para unidades métricas (g / ml)
        const nuevoCostoUnitario = nuevoStock > 0
            ? (valorAnterior + costoValidado) / (stockAnterior + cantValidada)
            : (costoValidado / cantValidada);
        const cppResultante = Number(nuevoCostoUnitario.toFixed(6));
        const costoUnitCompra = Number((costoValidado / cantValidada).toFixed(6));

        await runQuery(
            `UPDATE insumos SET stock_actual = ?, costo_por_unidad = ? WHERE id = ?`,
            [nuevoStock, cppResultante, insumoId]
        );

        const provNombre = distribuidora && String(distribuidora).trim() !== ''
            ? String(distribuidora).trim()
            : (datosFiscales?.proveedorNombre ? String(datosFiscales.proveedorNombre).trim() : null);
        const provNit = datosFiscales?.proveedorNit ? String(datosFiscales.proveedorNit).trim() : null;
        const nroFac = datosFiscales?.nroFacturaCompra ? String(datosFiscales.nroFacturaCompra).trim() : null;
        const conFac = datosFiscales?.conFactura || nroFac ? 1 : 0;
        const usuarioId = datosFiscales?.usuarioId ? Number(datosFiscales.usuarioId) : null;

        let motivoFinal = provNombre
            ? `Compra a distribuidora: ${provNombre}`
            : (motivo || 'Compra a proveedor');
        if (nroFac) {
            motivoFinal += ` [Fact. #${nroFac}${provNit ? ` | NIT: ${provNit}` : ''}]`;
        }

        await runQuery(
            `INSERT INTO movimientos_insumos (
                insumo_id, tipo, cantidad, stock_resultante, costo_unitario, costo_promedio_resultante, motivo,
                proveedor_nombre, proveedor_nit, nro_factura_compra, con_factura, monto_total_compra, usuario_id
             )
             VALUES (?, 'compra', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                insumoId,
                cantValidada,
                nuevoStock,
                costoUnitCompra,
                cppResultante,
                motivoFinal,
                provNombre,
                provNit,
                nroFac,
                conFac,
                costoValidado,
                usuarioId
            ]
        );

        // Actualizar en cascada el costo de todos los productos que usan este insumo
        const productosAfectados = await allQuery(`SELECT DISTINCT producto_id FROM recetas WHERE insumo_id = ?`, [insumoId]);
        for (const prod of productosAfectados) {
            await recalcularCostoProductoPorReceta(prod.producto_id);
        }

        return {
            insumoId: Number(insumoId),
            nuevoStock,
            nuevoCostoUnitario: cppResultante
        };
    });
}

// Registrar merma o desperdicio físico (leche cortada, recorte de madera dañado, etc.)
async function registrarMermaInsumo(insumoId, cantidadPerdida, motivo, usuarioId = null) {
    const cantValidada = Number(numeroPositivo(cantidadPerdida, 'La cantidad de merma').toFixed(4));
    if (!motivo || String(motivo).trim() === '') {
        throw new Error('Debes especificar el motivo de la merma (ej. Leche derramada, corte defectuoso).');
    }

    return await enTransaccion(async () => {
        const insumo = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
        if (!insumo) throw new Error('Insumo no encontrado.');

        const r = await runQuery(
            `UPDATE insumos SET stock_actual = ROUND(stock_actual - ?, 4) WHERE id = ? AND stock_actual >= ?`,
            [cantValidada, insumoId, cantValidada]
        );
        if (r.changes === 0) {
            throw new Error(`Stock insuficiente para descontar ${cantValidada} ${insumo.unidad_medida} de ${insumo.nombre}. Stock actual: ${insumo.stock_actual}`);
        }

        const insumoActualizado = await getQuery(`SELECT stock_actual, costo_por_unidad FROM insumos WHERE id = ?`, [insumoId]);
        const nuevoStock = insumoActualizado ? Number(insumoActualizado.stock_actual) : Number((insumo.stock_actual - cantValidada).toFixed(4));
        const costoCpp = Number(insumoActualizado?.costo_por_unidad ?? insumo.costo_por_unidad ?? 0);
        const costoPerdida = redondear2(cantValidada * costoCpp);

        await runQuery(
            `INSERT INTO movimientos_insumos (
                insumo_id, usuario_id, tipo, cantidad, stock_resultante,
                costo_unitario, costo_promedio_resultante, monto_total_compra, motivo
             )
             VALUES (?, ?, 'merma', ?, ?, ?, ?, ?, ?)`,
            [
                insumoId,
                usuarioId ? Number(usuarioId) : null,
                cantValidada,
                nuevoStock,
                costoCpp,
                costoCpp,
                costoPerdida,
                String(motivo).trim()
            ]
        );

        return {
            insumoId: Number(insumoId),
            stockRestante: nuevoStock,
            costoUnitario: costoCpp,
            costoPerdida
        };
    });
}

// Reabastecimiento directo de artículos terminados con Costo Promedio Ponderado (NIC 2)
async function registrarCompraProductoDirecto(productoId, cantidadComprada, costoTotalCompra, fechaVencimiento = null, datosFiscales = {}) {
    const cantValidada = numeroPositivo(cantidadComprada, 'La cantidad comprada');
    const costoValidado = redondear2(numeroNoNegativo(costoTotalCompra, 'El costo total de compra'));

    return await enTransaccion(async () => {
        const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [productoId]);
        if (!prod) throw new Error('Producto no encontrado.');

        if (prod.tipo_inventario === 'receta') {
            throw new Error('El artículo seleccionado es de elaboración por Receta. Su stock y costo se gestionan reabasteciendo sus Insumos.');
        }

        const stockAnterior = Math.max(0, Number(prod.stock || 0));
        const valorAnterior = stockAnterior * Number(prod.costo || 0);
        const nuevoStock = stockAnterior + cantValidada;

        // Fórmula de Costo Promedio Ponderado (NIC 2) aplicada directamente al artículo
        const nuevoCostoUnitario = nuevoStock > 0
            ? (valorAnterior + costoValidado) / nuevoStock
            : (costoValidado / cantValidada);

        const vencimientoActualizado = fechaVencimiento && String(fechaVencimiento).trim() !== ''
            ? String(fechaVencimiento).trim()
            : prod.fecha_vencimiento;

        await runQuery(
            `UPDATE productos
             SET tipo_inventario = 'directo',
                 stock = ?,
                 costo = ?,
                 fecha_vencimiento = ?
             WHERE id = ?`,
            [Number(nuevoStock.toFixed(4)), Number(nuevoCostoUnitario.toFixed(4)), vencimientoActualizado, productoId]
        );

        const provNombre = datosFiscales?.proveedorNombre ? String(datosFiscales.proveedorNombre).trim() : null;
        const provNit = datosFiscales?.proveedorNit ? String(datosFiscales.proveedorNit).trim() : null;
        const nroFac = datosFiscales?.nroFacturaCompra ? String(datosFiscales.nroFacturaCompra).trim() : null;
        const conFac = datosFiscales?.conFactura || nroFac ? 1 : 0;
        const usuarioId = datosFiscales?.usuarioId ? Number(datosFiscales.usuarioId) : null;
        const costoUnitCompra = Number((costoValidado / cantValidada).toFixed(4));
        const cppResultante = Number(nuevoCostoUnitario.toFixed(4));

        let motivoKardex = provNombre ? `Compra directo a: ${provNombre}` : 'Compra de stock directo (CPP)';
        if (nroFac) motivoKardex += ` [Fact. #${nroFac}${provNit ? ` | NIT: ${provNit}` : ''}]`;

        await runQuery(
            `INSERT INTO movimientos_productos_directos (
                producto_id, usuario_id, tipo, cantidad, stock_resultante, costo_unitario, costo_promedio_resultante, monto_total,
                proveedor_nombre, proveedor_nit, nro_factura_compra, con_factura, motivo
             ) VALUES (?, ?, 'compra', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                productoId,
                usuarioId,
                cantValidada,
                Number(nuevoStock.toFixed(4)),
                costoUnitCompra,
                cppResultante,
                costoValidado,
                provNombre,
                provNit,
                nroFac,
                conFac,
                motivoKardex
            ]
        );

        await recalcularCostoCombosQueContienenProducto(productoId);

        return {
            productoId,
            nuevoStock: Number(nuevoStock.toFixed(4)),
            nuevoCostoUnitario: cppResultante
        };
    });
}

// Registrar merma o baja física de productos de stock directo (descuento atómico + Kardex)
async function registrarMermaProductoDirecto(productoId, cantidadPerdida, motivo, usuarioId = null) {
    const cantValidada = numeroPositivo(cantidadPerdida, 'La cantidad de merma del producto');
    if (!motivo || String(motivo).trim() === '') {
        throw new Error('Debes especificar el motivo de la merma del producto (ej. Envase dañado, vencimiento).');
    }

    return await enTransaccion(async () => {
        const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [productoId]);
        if (!prod) throw new Error('Producto no encontrado.');
        if (prod.tipo_inventario !== 'directo') {
            throw new Error(`Solo se puede registrar merma directa sobre artículos de stock directo (modalidad actual: "${prod.tipo_inventario}").`);
        }

        const r = await runQuery(
            `UPDATE productos SET stock = ROUND(stock - ?, 4) WHERE id = ? AND stock >= ?`,
            [cantValidada, productoId, cantValidada]
        );
        if (r.changes === 0) {
            throw new Error(
                `Stock insuficiente para descontar ${cantValidada} ${prod.unidad_medida || 'unidades'} de "${prod.nombre}". Stock actual: ${Number(prod.stock || 0)}`
            );
        }

        const prodActualizado = await getQuery(`SELECT stock, costo FROM productos WHERE id = ?`, [productoId]);
        const nuevoStock = Number(prodActualizado?.stock ?? 0);
        const costoCpp = Number(prodActualizado?.costo ?? prod.costo ?? 0);
        const costoPerdida = redondear2(cantValidada * costoCpp);

        await runQuery(
            `INSERT INTO movimientos_productos_directos (
                producto_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                costo_unitario, costo_promedio_resultante, monto_total, motivo
             ) VALUES (?, NULL, ?, 'merma', ?, ?, ?, ?, ?, ?)`,
            [
                productoId,
                usuarioId ? Number(usuarioId) : null,
                cantValidada,
                nuevoStock,
                costoCpp,
                costoCpp,
                costoPerdida,
                String(motivo).trim()
            ]
        );

        return {
            productoId: Number(productoId),
            stockRestante: nuevoStock,
            costoUnitario: costoCpp,
            costoPerdida
        };
    });
}

// Consulta de control de integridad: verifica que el saldo del Kardex coincida con productos.stock
async function verificarIntegridadKardexDirecto() {
    const filas = await allQuery(
        `SELECT p.id as producto_id,
                p.nombre,
                ROUND(COALESCE(p.stock, 0), 4) as stock_producto,
                ROUND(COALESCE((
                    SELECT SUM(CASE
                        WHEN mpd.tipo IN ('inventario_inicial', 'compra', 'reingreso_anulacion') THEN mpd.cantidad
                        WHEN mpd.tipo IN ('venta', 'merma') THEN -mpd.cantidad
                        WHEN mpd.tipo = 'ajuste' THEN mpd.cantidad
                        ELSE 0
                    END)
                    FROM movimientos_productos_directos mpd
                    WHERE mpd.producto_id = p.id
                ), 0), 4) as saldo_calculado_kardex,
                (
                    SELECT mpd2.stock_resultante
                    FROM movimientos_productos_directos mpd2
                    WHERE mpd2.producto_id = p.id
                    ORDER BY mpd2.id DESC
                    LIMIT 1
                ) as ultimo_stock_resultante,
                (
                    SELECT COUNT(*)
                    FROM movimientos_productos_directos mpd3
                    WHERE mpd3.producto_id = p.id
                ) as cantidad_movimientos
         FROM productos p
         WHERE p.activo = 1 AND p.tipo_inventario = 'directo'
         ORDER BY p.id ASC`
    );

    const detalles = filas.map((f) => {
        const stockProd = Number(f.stock_producto || 0);
        const saldoCalc = Number(f.saldo_calculado_kardex || 0);
        const ultResult = f.ultimo_stock_resultante !== null && f.ultimo_stock_resultante !== undefined
            ? Number(f.ultimo_stock_resultante)
            : 0;
        const difCalculado = redondear2(stockProd - saldoCalc);
        const difUltimo = redondear2(stockProd - ultResult);
        const cuadra = Math.abs(difCalculado) < 0.001 && Math.abs(difUltimo) < 0.001;
        return {
            productoId: f.producto_id,
            nombre: f.nombre,
            stockProducto: stockProd,
            saldoCalculadoKardex: saldoCalc,
            ultimoStockResultante: ultResult,
            cantidadMovimientos: Number(f.cantidad_movimientos || 0),
            diferencia: difCalculado,
            cuadra
        };
    });

    const descuadres = detalles.filter((d) => !d.cuadra);
    return {
        integridadOk: descuadres.length === 0,
        totalProductosDirectos: detalles.length,
        totalDescuadres: descuadres.length,
        descuadres,
        detalles
    };
}

// Consulta de control de integridad para Insumos: verifica que el saldo del Kardex de insumos coincida con insumos.stock_actual
async function verificarIntegridadKardexInsumos() {
    const filas = await allQuery(
        `SELECT i.id as insumo_id,
                i.nombre,
                i.unidad_medida,
                ROUND(COALESCE(i.stock_actual, 0), 4) as stock_insumo,
                ROUND(COALESCE((
                    SELECT SUM(CASE
                        WHEN mi.tipo IN ('inventario_inicial', 'compra', 'reingreso_anulacion') THEN mi.cantidad
                        WHEN mi.tipo IN ('consumo_venta', 'merma') THEN -mi.cantidad
                        WHEN mi.tipo = 'ajuste' THEN mi.cantidad
                        ELSE 0
                    END)
                    FROM movimientos_insumos mi
                    WHERE mi.insumo_id = i.id
                ), 0), 4) as saldo_calculado_kardex,
                (
                    SELECT mi2.stock_resultante
                    FROM movimientos_insumos mi2
                    WHERE mi2.insumo_id = i.id
                    ORDER BY mi2.id DESC
                    LIMIT 1
                ) as ultimo_stock_resultante,
                (
                    SELECT COUNT(*)
                    FROM movimientos_insumos mi3
                    WHERE mi3.insumo_id = i.id
                ) as cantidad_movimientos
         FROM insumos i
         WHERE i.activo = 1
         ORDER BY i.id ASC`
    );

    const detalles = filas.map((f) => {
        const stockIns = Number(f.stock_insumo || 0);
        const saldoCalc = Number(f.saldo_calculado_kardex || 0);
        const ultResult = f.ultimo_stock_resultante !== null && f.ultimo_stock_resultante !== undefined
            ? Number(f.ultimo_stock_resultante)
            : 0;
        const difCalculado = Number((stockIns - saldoCalc).toFixed(4));
        const difUltimo = Number((stockIns - ultResult).toFixed(4));
        const cuadra = Math.abs(difCalculado) < 0.001 && Math.abs(difUltimo) < 0.001;
        return {
            insumoId: f.insumo_id,
            nombre: f.nombre,
            unidadMedida: f.unidad_medida,
            stockInsumo: stockIns,
            saldoCalculadoKardex: saldoCalc,
            ultimoStockResultante: ultResult,
            cantidadMovimientos: Number(f.cantidad_movimientos || 0),
            diferencia: difCalculado,
            cuadra
        };
    });

    const descuadres = detalles.filter((d) => !d.cuadra);
    return {
        integridadOk: descuadres.length === 0,
        totalInsumos: detalles.length,
        totalDescuadres: descuadres.length,
        descuadres,
        detalles
    };
}

// Obtiene el Kardex cronológico de Productos Directos y/o Insumos para auditoría en pantalla y reportes
async function obtenerKardexDetallado({ productoId = null, insumoId = null, desde = null, hasta = null, limite = 200 } = {}) {
    const condProd = [];
    const paramsProd = [];
    if (productoId) {
        condProd.push(`mpd.producto_id = ?`);
        paramsProd.push(Number(productoId));
    }
    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(String(desde).trim())) {
        condProd.push(`date(mpd.fecha_hora, 'localtime') >= ?`);
        paramsProd.push(String(desde).trim());
    }
    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(hasta).trim())) {
        condProd.push(`date(mpd.fecha_hora, 'localtime') <= ?`);
        paramsProd.push(String(hasta).trim());
    }
    const whereProd = condProd.length > 0 ? `WHERE ${condProd.join(' AND ')}` : '';

    const condIns = [];
    const paramsIns = [];
    if (insumoId) {
        condIns.push(`mi.insumo_id = ?`);
        paramsIns.push(Number(insumoId));
    }
    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(String(desde).trim())) {
        condIns.push(`date(mi.fecha_hora, 'localtime') >= ?`);
        paramsIns.push(String(desde).trim());
    }
    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(hasta).trim())) {
        condIns.push(`date(mi.fecha_hora, 'localtime') <= ?`);
        paramsIns.push(String(hasta).trim());
    }
    const whereIns = condIns.length > 0 ? `WHERE ${condIns.join(' AND ')}` : '';

    const lim = Math.min(2000, Math.max(10, Number(limite) || 200));

    const [kardexProductosDirectos, kardexInsumos] = await Promise.all([
        allQuery(
            `SELECT mpd.id,
                    mpd.producto_id,
                    p.nombre as item_nombre,
                    COALESCE(p.unidad_medida, 'unidades') as unidad_medida,
                    mpd.movimiento_id,
                    COALESCE(u.nombre, 'Sistema') as operador,
                    mpd.tipo,
                    datetime(mpd.fecha_hora, 'localtime') as fecha_hora,
                    mpd.cantidad,
                    mpd.stock_resultante,
                    mpd.costo_unitario,
                    COALESCE(NULLIF(mpd.costo_promedio_resultante, 0), mpd.costo_unitario, p.costo, 0) as costo_promedio_resultante,
                    COALESCE(mpd.monto_total, ROUND(mpd.cantidad * mpd.costo_unitario, 2)) as monto_total,
                    COALESCE(mpd.proveedor_nombre, '') as proveedor_nombre,
                    COALESCE(mpd.nro_factura_compra, '') as nro_factura_compra,
                    mpd.motivo
             FROM movimientos_productos_directos mpd
             INNER JOIN productos p ON mpd.producto_id = p.id
             LEFT JOIN usuarios u ON mpd.usuario_id = u.id
             ${whereProd}
             ORDER BY mpd.id DESC
             LIMIT ${lim}`,
            paramsProd
        ),
        allQuery(
            `SELECT mi.id,
                    mi.insumo_id,
                    i.nombre as item_nombre,
                    i.unidad_medida,
                    mi.movimiento_id,
                    COALESCE(u.nombre, 'Sistema') as operador,
                    mi.tipo,
                    datetime(mi.fecha_hora, 'localtime') as fecha_hora,
                    mi.cantidad,
                    mi.stock_resultante,
                    mi.costo_unitario,
                    COALESCE(NULLIF(mi.costo_promedio_resultante, 0), mi.costo_unitario, i.costo_por_unidad, 0) as costo_promedio_resultante,
                    COALESCE(mi.monto_total_compra, ROUND(mi.cantidad * mi.costo_unitario, 2)) as monto_total,
                    COALESCE(mi.proveedor_nombre, '') as proveedor_nombre,
                    COALESCE(mi.nro_factura_compra, '') as nro_factura_compra,
                    mi.motivo
             FROM movimientos_insumos mi
             INNER JOIN insumos i ON mi.insumo_id = i.id
             LEFT JOIN usuarios u ON mi.usuario_id = u.id
             ${whereIns}
             ORDER BY mi.id DESC
             LIMIT ${lim}`,
            paramsIns
        )
    ]);

    return {
        kardexProductosDirectos,
        kardexInsumos
    };
}

async function obtenerPrediccionComprasInsumos(diasAnalisis = 30, diasCobertura = 7) {
    const insumos = await obtenerInsumos();
    const reporte = [];

    for (const ins of insumos) {
        const consumo = await getQuery(
            `SELECT COALESCE(SUM(
                CASE
                    WHEN tipo IN ('consumo_venta', 'merma') THEN cantidad
                    WHEN tipo = 'reingreso_anulacion' THEN -cantidad
                    ELSE 0
                END
             ), 0) as total_consumido
             FROM movimientos_insumos
             WHERE insumo_id = ?
               AND tipo IN ('consumo_venta', 'merma', 'reingreso_anulacion')
               AND date(fecha_hora, 'localtime') >= date('now', 'localtime', ?)`,
            [ins.id, `-${diasAnalisis} days`]
        );

        const totalConsumidoNeto = Math.max(0, Number(consumo.total_consumido || 0));
        const promedioDiario = totalConsumidoNeto / Math.max(1, diasAnalisis);
        const puntoReorden = (promedioDiario * ins.tiempo_entrega_dias) + ins.stock_seguridad;
        const stockObjetivo = (promedioDiario * diasCobertura) + ins.stock_seguridad;
        const cantidadSugeridaCompra = Math.max(0, stockObjetivo - ins.stock_actual);

        let estadoAlerta = 'OK';
        if (ins.stock_actual <= ins.stock_seguridad) {
            estadoAlerta = 'CRÍTICO (Bajo Stock de Seguridad)';
        } else if (ins.stock_actual <= puntoReorden) {
            estadoAlerta = 'COMPRAR AHORA (En Punto de Reorden)';
        }

        reporte.push({
            insumoId: ins.id,
            nombre: ins.nombre,
            unidad: ins.unidad_medida,
            stockActual: ins.stock_actual,
            consumoTotalPeriodo: Number(totalConsumidoNeto.toFixed(3)),
            consumoPromedioDiario: Number(promedioDiario.toFixed(3)),
            puntoReordenROP: Number(puntoReorden.toFixed(3)),
            cantidadSugeridaCompra: redondear2(cantidadSugeridaCompra),
            costoEstimadoCompra: redondear2(cantidadSugeridaCompra * ins.costo_por_unidad),
            estadoAlerta
        });
    }

    return reporte;
}

module.exports = {
    crearInsumo,
    obtenerInsumos,
    registrarCompraInsumo,
    registrarMermaInsumo,
    registrarCompraProductoDirecto,
    registrarMermaProductoDirecto,
    verificarIntegridadKardexDirecto,
    verificarIntegridadKardexInsumos,
    obtenerKardexDetallado,
    obtenerPrediccionComprasInsumos
};
