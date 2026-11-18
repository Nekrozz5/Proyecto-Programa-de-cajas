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
            [nombre.trim(), unidadMedida ? String(unidadMedida).trim().toLowerCase() : 'unidades', stockInicialValidado, costoPorUnidadValidado, stockSeguridadValidado, tiempoEntregaValidado, fechaVencimiento || null]
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

// Helper para validación estricta de fecha en formato YYYY-MM-DD
function validarFormatoFechaYYYYMMDD(fechaStr) {
    if (!fechaStr) return null;
    let limpia = String(fechaStr).trim();
    if (!limpia) return null;

    if (/^\d{4}-\d{2}-\d{2}T/.test(limpia)) {
        limpia = limpia.split('T')[0];
    }

    const regex = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = limpia.match(regex);
    if (!match) {
        throw new Error(`Formato de fecha inválido: "${fechaStr}". Debe ser YYYY-MM-DD.`);
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (month < 1 || month > 12) {
        throw new Error(`Fecha inválida: mes ${month} fuera de rango (01-12).`);
    }

    const diasPorMes = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > diasPorMes[month - 1]) {
        throw new Error(`Fecha inválida: el día ${day} no es válido para el mes ${month} del año ${year}.`);
    }

    return limpia;
}

// Reabastecimiento directo de artículos terminados con Costo Promedio Ponderado (NIC 2)
async function registrarCompraProductoDirecto(productoId, cantidadComprada, costoTotalCompra, fechaVencimiento = null, datosFiscales = {}) {
    const cantValidada = numeroPositivo(cantidadComprada, 'La cantidad comprada');
    const costoValidado = redondear2(numeroNoNegativo(costoTotalCompra, 'El costo total de compra'));
    const fechaVencimientoValidada = validarFormatoFechaYYYYMMDD(fechaVencimiento);

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

        const costoUnitCompra = Number((costoValidado / cantValidada).toFixed(4));
        const cppResultante = Number(nuevoCostoUnitario.toFixed(4));

        // Gestión individual de lotes por fecha de vencimiento
        if (fechaVencimientoValidada) {
            const loteExistente = await getQuery(
                `SELECT id, stock, costo_unitario FROM producto_lotes WHERE producto_id = ? AND fecha_vencimiento = ? AND activo = 1`,
                [productoId, fechaVencimientoValidada]
            );

            if (loteExistente) {
                const stockLoteAnterior = Math.max(0, Number(loteExistente.stock || 0));
                const valorLoteAnterior = stockLoteAnterior * Number(loteExistente.costo_unitario || 0);
                const nuevoStockLote = Number((stockLoteAnterior + cantValidada).toFixed(4));
                const nuevoCostoLote = nuevoStockLote > 0
                    ? Number(((valorLoteAnterior + costoValidado) / nuevoStockLote).toFixed(4))
                    : costoUnitCompra;

                await runQuery(
                    `UPDATE producto_lotes SET stock = ?, costo_unitario = ? WHERE id = ?`,
                    [nuevoStockLote, nuevoCostoLote, loteExistente.id]
                );
            } else {
                await runQuery(
                    `INSERT INTO producto_lotes (producto_id, fecha_vencimiento, stock, costo_unitario, activo)
                     VALUES (?, ?, ?, ?, 1)`,
                    [productoId, fechaVencimientoValidada, Number(cantValidada.toFixed(4)), costoUnitCompra]
                );
            }
        }

        // Sincronizar siempre el stock total y vencimiento en la tabla productos
        const lotesRes = await getQuery(
            `SELECT COALESCE(SUM(stock), 0) as total_stock,
                    MIN(CASE WHEN stock > 0 THEN fecha_vencimiento ELSE NULL END) as proximo_vencimiento,
                    COUNT(*) as total_lotes
             FROM producto_lotes
             WHERE producto_id = ? AND activo = 1`,
            [productoId]
        );

        const tieneLotes = lotesRes && Number(lotesRes.total_lotes) > 0;
        const stockSincronizado = tieneLotes
            ? Math.max(Number(nuevoStock.toFixed(4)), Number(Number(lotesRes.total_stock).toFixed(4)))
            : Number(nuevoStock.toFixed(4));

        const vencimientoActualizado = (tieneLotes && lotesRes.proximo_vencimiento)
            ? lotesRes.proximo_vencimiento
            : (fechaVencimientoValidada || prod.fecha_vencimiento);

        await runQuery(
            `UPDATE productos
             SET tipo_inventario = 'directo',
                 stock = ?,
                 costo = ?,
                 fecha_vencimiento = ?
             WHERE id = ?`,
            [stockSincronizado, cppResultante, vencimientoActualizado, productoId]
        );

        const provNombre = datosFiscales?.proveedorNombre ? String(datosFiscales.proveedorNombre).trim() : null;
        const provNit = datosFiscales?.proveedorNit ? String(datosFiscales.proveedorNit).trim() : null;
        const nroFac = datosFiscales?.nroFacturaCompra ? String(datosFiscales.nroFacturaCompra).trim() : null;
        const conFac = datosFiscales?.conFactura || nroFac ? 1 : 0;
        const usuarioId = datosFiscales?.usuarioId ? Number(datosFiscales.usuarioId) : null;

        let motivoKardex = provNombre ? `Compra directo a: ${provNombre}` : 'Compra de stock directo (CPP)';
        if (fechaVencimientoValidada) motivoKardex += ` [Lote Vence: ${fechaVencimientoValidada}]`;
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
                stockSincronizado,
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
            nuevoStock: stockSincronizado,
            nuevoCostoUnitario: cppResultante,
            fechaVencimiento: vencimientoActualizado
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
            estadoAlerta,
            fechaVencimiento: ins.fecha_vencimiento
        });
    }

    return reporte;
}

/**
 * Actualiza los datos de un insumo (nombre, unidad_medida, stock_seguridad, tiempo_entrega_dias).
 * Si se indica ajuste de stock o costo para calibración, registra el movimiento en movimientos_insumos
 * con tipo 'ajuste' y recalcula en cascada el costo de recetas y combos vinculados.
 */
async function actualizarInsumo(insumoId, datos = {}, usuarioId = null) {
    const id = Number(insumoId);
    if (!Number.isFinite(id) || id <= 0) {
        throw new Error('ID de insumo inválido.');
    }

    return await enTransaccion(async () => {
        const insumoActual = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [id]);
        if (!insumoActual) {
            throw new Error('Insumo no encontrado o inactivo.');
        }

        const nombreFinal = datos.nombre !== undefined ? String(datos.nombre).trim() : insumoActual.nombre;
        if (!nombreFinal) {
            throw new Error('El nombre del insumo no puede estar vacío.');
        }

        const unidadFinal = datos.unidad_medida !== undefined
            ? String(datos.unidad_medida).trim().toLowerCase()
            : (datos.unidadMedida !== undefined ? String(datos.unidadMedida).trim().toLowerCase() : insumoActual.unidad_medida);
        if (!unidadFinal) {
            throw new Error('La unidad de medida no puede estar vacía.');
        }

        const stockSeguridadInput = datos.stock_seguridad !== undefined ? datos.stock_seguridad : datos.stockSeguridad;
        const stockSeguridadFinal = stockSeguridadInput !== undefined
            ? Number(numeroNoNegativo(stockSeguridadInput, 'El stock de seguridad').toFixed(4))
            : Number(insumoActual.stock_seguridad || 0);

        const tiempoEntregaInput = datos.tiempo_entrega_dias !== undefined ? datos.tiempo_entrega_dias : datos.tiempoEntregaDias;
        const tiempoEntregaFinal = tiempoEntregaInput !== undefined
            ? numeroNoNegativo(tiempoEntregaInput, 'El tiempo de entrega en días')
            : Number(insumoActual.tiempo_entrega_dias || 1);

        const fechaVencimientoFinal = datos.fecha_vencimiento !== undefined
            ? datos.fecha_vencimiento
            : (datos.fechaVencimiento !== undefined ? datos.fechaVencimiento : insumoActual.fecha_vencimiento);

        // Calibración o ajuste de stock / costo inicial
        const stockAjusteInput = datos.stock_actual !== undefined
            ? datos.stock_actual
            : (datos.stockActual !== undefined
                ? datos.stockActual
                : (datos.nuevoStock !== undefined ? datos.nuevoStock : (datos.ajusteStock !== undefined ? datos.ajusteStock : undefined)));

        const costoAjusteInput = datos.costo_por_unidad !== undefined
            ? datos.costo_por_unidad
            : (datos.costoPorUnidad !== undefined
                ? datos.costoPorUnidad
                : (datos.nuevoCosto !== undefined ? datos.nuevoCosto : (datos.ajusteCosto !== undefined ? datos.ajusteCosto : undefined)));

        const hayAjusteStock = stockAjusteInput !== undefined && Number(stockAjusteInput) !== Number(insumoActual.stock_actual);
        const hayAjusteCosto = costoAjusteInput !== undefined && Number(costoAjusteInput) !== Number(insumoActual.costo_por_unidad);

        if (hayAjusteStock || hayAjusteCosto) {
            const nuevoStock = stockAjusteInput !== undefined
                ? Number(numeroNoNegativo(stockAjusteInput, 'El stock del insumo').toFixed(4))
                : Number(insumoActual.stock_actual || 0);
            const nuevoCosto = costoAjusteInput !== undefined
                ? Number(numeroNoNegativo(costoAjusteInput, 'El costo por unidad del insumo').toFixed(6))
                : Number(insumoActual.costo_por_unidad || 0);

            const diferenciaStock = Number((nuevoStock - Number(insumoActual.stock_actual || 0)).toFixed(4));
            const motivoAjuste = datos.motivo || datos.motivoAjuste || `Ajuste de calibración (Stock: ${insumoActual.stock_actual} -> ${nuevoStock}, Costo: ${insumoActual.costo_por_unidad} -> ${nuevoCosto})`;

            await runQuery(
                `UPDATE insumos
                 SET nombre = ?, unidad_medida = ?, stock_actual = ?, costo_por_unidad = ?, stock_seguridad = ?, tiempo_entrega_dias = ?, fecha_vencimiento = ?
                 WHERE id = ?`,
                [nombreFinal, unidadFinal, nuevoStock, nuevoCosto, stockSeguridadFinal, tiempoEntregaFinal, fechaVencimientoFinal ? String(fechaVencimientoFinal).trim() : null, id]
            );

            await runQuery(
                `INSERT INTO movimientos_insumos (
                    insumo_id, usuario_id, tipo, cantidad, stock_resultante,
                    costo_unitario, costo_promedio_resultante, monto_total_compra, motivo
                 )
                 VALUES (?, ?, 'ajuste', ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    usuarioId ? Number(usuarioId) : null,
                    Math.abs(diferenciaStock),
                    nuevoStock,
                    nuevoCosto,
                    nuevoCosto,
                    redondear2(nuevoStock * nuevoCosto),
                    motivoAjuste
                ]
            );

            // Recalcular en cascada el costo de todos los productos y combos que usan este insumo
            const productosAfectados = await allQuery(`SELECT DISTINCT producto_id FROM recetas WHERE insumo_id = ?`, [id]);
            for (const prod of productosAfectados) {
                await recalcularCostoProductoPorReceta(prod.producto_id);
            }
        } else {
            await runQuery(
                `UPDATE insumos
                 SET nombre = ?, unidad_medida = ?, stock_seguridad = ?, tiempo_entrega_dias = ?, fecha_vencimiento = ?
                 WHERE id = ?`,
                [nombreFinal, unidadFinal, stockSeguridadFinal, tiempoEntregaFinal, fechaVencimientoFinal ? String(fechaVencimientoFinal).trim() : null, id]
            );
        }

        return await getQuery(`SELECT * FROM insumos WHERE id = ?`, [id]);
    });
}

/**
 * Da de baja lógica a un insumo o material (activo = 0).
 * Requiere justificativo obligatorio y valida que no esté amarrado a recetas o modificadores activos.
 * Si tenía stock físico restante, registra el movimiento de ajuste para mantener balanceado el Kardex.
 */
async function eliminarInsumo(insumoId, motivo, adminId) {
    const id = Number(insumoId);
    if (!id || isNaN(id)) throw new Error('ID de insumo inválido.');

    const motivoLimpio = motivo ? String(motivo).trim() : '';
    if (!motivoLimpio || motivoLimpio.length < 3) {
        throw new Error('Es obligatorio justificar el motivo de eliminación del insumo (mínimo 3 caracteres).');
    }

    return await enTransaccion(async () => {
        const insumo = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [id]);
        if (!insumo) throw new Error('El material o insumo no existe o ya fue eliminado.');

        // 1. Validar que no esté amarrado a recetas de productos activos
        const recetasQueLoUsan = await allQuery(
            `SELECT p.nombre 
             FROM recetas r
             JOIN productos p ON r.producto_id = p.id
             WHERE r.insumo_id = ? AND p.activo = 1`,
            [id]
        );
        if (recetasQueLoUsan.length > 0) {
            const nombres = recetasQueLoUsan.map((r) => `"${r.nombre}"`).join(', ');
            throw new Error(`No se puede eliminar el insumo "${insumo.nombre}" porque se utiliza en la receta activa de: ${nombres}. Quítalo o edita esas recetas antes de darlo de baja.`);
        }

        // 2. Validar que no esté amarrado a modificadores activos
        const modificadoresQueLoUsan = await allQuery(
            `SELECT DISTINCT g.nombre as grupo_nombre, o.nombre as opcion_nombre
             FROM modificadores_opciones o
             JOIN grupos_modificadores g ON o.grupo_id = g.id
             WHERE (o.insumo_id = ? OR o.insumo_reemplazado_id = ?) AND o.activo = 1 AND g.activo = 1`,
            [id, id]
        );
        if (modificadoresQueLoUsan.length > 0) {
            const nombres = modificadoresQueLoUsan.map((m) => `"${m.opcion_nombre}" (${m.grupo_nombre})`).join(', ');
            throw new Error(`No se puede eliminar el insumo "${insumo.nombre}" porque está asignado al modificador activo: ${nombres}.`);
        }

        // 3. Si tenía stock remanente, registrar ajuste de salida en el Kardex
        const stockActual = Number(insumo.stock_actual || 0);
        if (stockActual > 0) {
            await runQuery(
                `INSERT INTO movimientos_insumos (
                    insumo_id, usuario_id, tipo, cantidad, stock_resultante,
                    costo_unitario, costo_promedio_resultante, monto_total_compra, motivo
                 ) VALUES (?, ?, 'ajuste', ?, 0, ?, 0, 0, ?)`,
                [
                    id,
                    adminId ? Number(adminId) : null,
                    -stockActual,
                    Number(insumo.costo_por_unidad || 0),
                    `Baja / Eliminación justificada: ${motivoLimpio}`
                ]
            );
        }

        // 4. Baja lógica
        await runQuery(
            `UPDATE insumos SET activo = 0, stock_actual = 0 WHERE id = ?`,
            [id]
        );

        return { id, nombre: insumo.nombre, eliminado: true, motivo: motivoLimpio };
    });
}

module.exports = {
    crearInsumo,
    actualizarInsumo,
    eliminarInsumo,
    obtenerInsumos,
    registrarCompraInsumo,
    registrarMermaInsumo,
    registrarCompraProductoDirecto,
    registrarMermaProductoDirecto,
    verificarIntegridadKardexDirecto,
    verificarIntegridadKardexInsumos,
    obtenerKardexDetallado,
    obtenerPrediccionComprasInsumos,
    validarFormatoFechaYYYYMMDD
};
