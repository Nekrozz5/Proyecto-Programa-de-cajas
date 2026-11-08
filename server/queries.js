const db = require('../database/database');

// ==========================================
// HELPERS INTERNOS PARA ASYNC / AWAIT
// ==========================================
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// ==========================================
// 1. USUARIOS, ROLES Y PERMISOS
// ==========================================
async function verificarUsuario(nombre, pin) {
    return await getQuery(
        `SELECT id, nombre, rol FROM usuarios WHERE nombre = ? AND pin_o_password = ? AND activo = 1`,
        [nombre, pin]
    );
}

async function obtenerUsuarioPorId(id) {
    return await getQuery(`SELECT id, nombre, rol FROM usuarios WHERE id = ? AND activo = 1`, [id]);
}

async function obtenerUsuarios() {
    return await allQuery(`SELECT id, nombre, rol FROM usuarios WHERE activo = 1`);
}

async function crearUsuario(nombre, pin, rol) {
    const res = await runQuery(
        `INSERT INTO usuarios (nombre, pin_o_password, rol) VALUES (?, ?, ?)`,
        [nombre, pin, rol]
    );
    return res.lastID;
}

async function crearUsuarioConPermiso(adminId, nuevoNombre, pin, nuevoRol) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || ejecutor.rol !== 'admin') {
        throw new Error('Permiso denegado: solo un administrador puede registrar usuarios.');
    }
    if (!['admin', 'user'].includes(nuevoRol)) {
        throw new Error("Rol inválido. Debe ser 'admin' o 'user'.");
    }
    return await crearUsuario(nuevoNombre, pin, nuevoRol);
}

async function borrarUsuarioConPermiso(adminId, usuarioABorrarId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || ejecutor.rol !== 'admin') {
        throw new Error('Permiso denegado: solo un administrador puede eliminar usuarios.');
    }
    if (Number(adminId) === Number(usuarioABorrarId)) {
        throw new Error('Operación no permitida: no puedes eliminar tu propio usuario.');
    }
    const res = await runQuery(`UPDATE usuarios SET activo = 0 WHERE id = ?`, [usuarioABorrarId]);
    return res.changes > 0;
}

// ==========================================
// 2. INSUMOS (MATERIA PRIMA) Y RECETAS (ESCANDALLO / BOM)
// ==========================================
async function crearInsumo(nombre, unidadMedida, stockInicial = 0, costoPorUnidad = 0, stockSeguridad = 0, tiempoEntregaDias = 1) {
    const res = await runQuery(
        `INSERT INTO insumos (nombre, unidad_medida, stock_actual, costo_por_unidad, stock_seguridad, tiempo_entrega_dias)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nombre, unidadMedida, stockInicial, costoPorUnidad, stockSeguridad, tiempoEntregaDias]
    );
    const insumoId = res.lastID;

    if (stockInicial > 0) {
        await runQuery(
            `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
             VALUES (?, 'compra', ?, ?, 'Inventario inicial')`,
            [insumoId, stockInicial, costoPorUnidad]
        );
    }
    return insumoId;
}

async function obtenerInsumos() {
    return await allQuery(`SELECT * FROM insumos WHERE activo = 1 ORDER BY nombre`);
}

// Recalcula el costo de un producto sumando el costo de todos los ingredientes de su receta
async function recalcularCostoProductoPorReceta(productoId) {
    const calculo = await getQuery(
        `SELECT COALESCE(SUM(r.cantidad_requerida * i.costo_por_unidad), 0) as nuevo_costo
         FROM recetas r
         INNER JOIN insumos i ON r.insumo_id = i.id
         WHERE r.producto_id = ?`,
        [productoId]
    );
    const costoActualizado = Number((calculo.nuevo_costo || 0).toFixed(4));
    await runQuery(`UPDATE productos SET costo = ? WHERE id = ?`, [costoActualizado, productoId]);
    return costoActualizado;
}

// Compra de insumo con Costo Promedio Ponderado (CPP) y actualización en cascada de recetas
async function registrarCompraInsumo(insumoId, cantidadComprada, costoTotalCompra, motivo = 'Compra a proveedor') {
    if (cantidadComprada <= 0) throw new Error('La cantidad comprada debe ser mayor a 0.');

    const insumo = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
    if (!insumo) throw new Error('Insumo no encontrado.');

    const stockAnterior = Math.max(0, insumo.stock_actual);
    const valorAnterior = stockAnterior * insumo.costo_por_unidad;
    const nuevoStock = insumo.stock_actual + cantidadComprada;

    // Fórmula de Costo Promedio Ponderado (NIC 2)
    const nuevoCostoUnitario = nuevoStock > 0
        ? (valorAnterior + costoTotalCompra) / (stockAnterior + cantidadComprada)
        : (costoTotalCompra / cantidadComprada);

    await runQuery(
        `UPDATE insumos SET stock_actual = ?, costo_por_unidad = ? WHERE id = ?`,
        [Number(nuevoStock.toFixed(4)), Number(nuevoCostoUnitario.toFixed(4)), insumoId]
    );

    await runQuery(
        `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
         VALUES (?, 'compra', ?, ?, ?)`,
        [insumoId, cantidadComprada, Number((costoTotalCompra / cantidadComprada).toFixed(4)), motivo]
    );

    // Actualizar en cascada el costo de todos los productos que usan este insumo
    const productosAfectados = await allQuery(`SELECT DISTINCT producto_id FROM recetas WHERE insumo_id = ?`, [insumoId]);
    for (const prod of productosAfectados) {
        await recalcularCostoProductoPorReceta(prod.producto_id);
    }

    return {
        insumoId,
        nuevoStock: Number(nuevoStock.toFixed(4)),
        nuevoCostoUnitario: Number(nuevoCostoUnitario.toFixed(4))
    };
}

// Registrar merma o desperdicio físico (leche cortada, recorte de madera dañado, etc.)
async function registrarMermaInsumo(insumoId, cantidadPerdida, motivo) {
    if (!motivo || motivo.trim() === '') {
        throw new Error('Debes especificar el motivo de la merma (ej. Leche derramada, corte defectuoso).');
    }
    const insumo = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
    if (!insumo) throw new Error('Insumo no encontrado.');
    if (insumo.stock_actual < cantidadPerdida) {
        throw new Error(`No puedes descontar ${cantidadPerdida} ${insumo.unidad_medida}. Stock actual: ${insumo.stock_actual}`);
    }

    const nuevoStock = Number((insumo.stock_actual - cantidadPerdida).toFixed(4));
    await runQuery(`UPDATE insumos SET stock_actual = ? WHERE id = ?`, [nuevoStock, insumoId]);

    await runQuery(
        `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
         VALUES (?, 'merma', ?, ?, ?)`,
        [insumoId, cantidadPerdida, insumo.costo_por_unidad, motivo.trim()]
    );

    return {
        insumoId,
        stockRestante: nuevoStock,
        costoPerdida: Number((cantidadPerdida * insumo.costo_por_unidad).toFixed(2))
    };
}

// Asignar un insumo a la receta de un producto (ej. Capuchino -> 0.5 litros de Leche)
async function asignarIngredienteReceta(productoId, insumoId, cantidadRequerida) {
    if (cantidadRequerida <= 0) throw new Error('La cantidad en la receta debe ser mayor a 0.');

    await runQuery(
        `INSERT INTO recetas (producto_id, insumo_id, cantidad_requerida)
         VALUES (?, ?, ?)
         ON CONFLICT(producto_id, insumo_id) DO UPDATE SET cantidad_requerida = excluded.cantidad_requerida`,
        [productoId, insumoId, cantidadRequerida]
    );

    // Cambiar automáticamente el producto a modalidad 'receta'
    await runQuery(`UPDATE productos SET tipo_inventario = 'receta', stock = NULL WHERE id = ?`, [productoId]);

    // Actualizar el costo del producto según su nueva receta
    const nuevoCosto = await recalcularCostoProductoPorReceta(productoId);
    return { productoId, insumoId, cantidadRequerida, nuevoCostoProducto: nuevoCosto };
}

// Calcula cuántos productos se pueden fabricar hoy según el insumo más escaso (Cuello de botella)
async function calcularDisponibilidadProducto(productoId) {
    const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [productoId]);
    if (!prod) throw new Error('Producto no encontrado.');

    if (prod.tipo_inventario === 'libre') {
        return { producto: prod.nombre, tipo: 'libre', disponibles: Infinity };
    }
    if (prod.tipo_inventario === 'directo') {
        return { producto: prod.nombre, tipo: 'directo', disponibles: Math.floor(prod.stock || 0) };
    }

    const ingredientes = await allQuery(
        `SELECT r.cantidad_requerida, i.nombre as insumo_nombre, i.stock_actual, i.unidad_medida
         FROM recetas r
         INNER JOIN insumos i ON r.insumo_id = i.id
         WHERE r.producto_id = ?`,
        [productoId]
    );

    if (ingredientes.length === 0) {
        return { producto: prod.nombre, tipo: 'receta_vacia', disponibles: 0 };
    }

    let maximoPosible = Infinity;
    let insumoLimitante = null;

    for (const ing of ingredientes) {
        const alcanzables = Math.floor(ing.stock_actual / ing.cantidad_requerida);
        if (alcanzables < maximoPosible) {
            maximoPosible = alcanzables;
            insumoLimitante = `${ing.insumo_nombre} (${ing.stock_actual} ${ing.unidad_medida} disponibles)`;
        }
    }

    return {
        producto: prod.nombre,
        tipo: 'receta',
        disponibles: Math.max(0, maximoPosible),
        insumoLimitante
    };
}

// ==========================================
// 3. PRODUCTOS DEL CATÁLOGO
// ==========================================
async function crearProducto(nombre, precio, costo = 0, categoria = 'General', stock = null) {
    const tipoInventario = stock !== null ? 'directo' : 'libre';
    const res = await runQuery(
        `INSERT INTO productos (nombre, precio, costo, categoria, tipo_inventario, stock)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nombre, precio, costo, categoria, tipoInventario, stock]
    );
    return res.lastID;
}

async function obtenerProductos() {
    const productos = await allQuery(`SELECT * FROM productos WHERE activo = 1 ORDER BY categoria, nombre`);
    for (const p of productos) {
        const disp = await calcularDisponibilidadProducto(p.id);
        p.unidades_disponibles = disp.disponibles;
        p.insumo_limitante = disp.insumoLimitante || null;
    }
    return productos;
}

// ==========================================
// 4. APERTURA DE CAJA, VENTAS Y ANULACIONES
// ==========================================
async function obtenerCajaAbierta() {
    return await getQuery(`SELECT * FROM cajas WHERE estado = 'abierta' LIMIT 1`);
}

async function abrirCaja(usuarioId, montoInicial) {
    const cajaAbierta = await obtenerCajaAbierta();
    if (cajaAbierta) {
        throw new Error('Ya existe una caja abierta. Ciérrala antes de abrir un nuevo turno.');
    }
    const res = await runQuery(
        `INSERT INTO cajas (usuario_id, monto_inicial, estado) VALUES (?, ?, 'abierta')`,
        [usuarioId, montoInicial]
    );
    return res.lastID;
}

async function registrarVentaCompleta(cajaId, items, metodoPago, montoRecibido = null, descripcion = 'Venta en mostrador') {
    if (!items || items.length === 0) {
        throw new Error('La venta debe incluir al menos un producto.');
    }

    let montoTotal = 0;
    const itemsProcesados = [];
    const consumoAcumuladoInsumos = {};

    for (const item of items) {
        const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [item.productoId]);
        if (!prod) throw new Error(`Producto con ID ${item.productoId} no existe.`);

        if (prod.tipo_inventario === 'directo') {
            if ((prod.stock || 0) < item.cantidad) {
                throw new Error(`Stock insuficiente para ${prod.nombre}. Disponible: ${prod.stock}`);
            }
        }

        if (prod.tipo_inventario === 'receta') {
            const receta = await allQuery(
                `SELECT r.insumo_id, r.cantidad_requerida, i.nombre, i.stock_actual, i.unidad_medida, i.costo_por_unidad
                 FROM recetas r
                 INNER JOIN insumos i ON r.insumo_id = i.id
                 WHERE r.producto_id = ?`,
                [prod.id]
            );

            for (const ing of receta) {
                const requeridoTotalItem = ing.cantidad_requerida * item.cantidad;
                if (!consumoAcumuladoInsumos[ing.insumo_id]) {
                    consumoAcumuladoInsumos[ing.insumo_id] = {
                        insumoId: ing.insumo_id,
                        nombre: ing.nombre,
                        stockActual: ing.stock_actual,
                        unidad: ing.unidad_medida,
                        costoUnitario: ing.costo_por_unidad,
                        cantidadTotalRequerida: 0
                    };
                }
                consumoAcumuladoInsumos[ing.insumo_id].cantidadTotalRequerida += requeridoTotalItem;
            }
        }

        const subtotal = Number((prod.precio * item.cantidad).toFixed(2));
        montoTotal += subtotal;

        itemsProcesados.push({
            productoId: prod.id,
            nombre: prod.nombre,
            cantidad: item.cantidad,
            precioUnitario: prod.precio,
            costoUnitario: prod.costo,
            subtotal,
            tipoInventario: prod.tipo_inventario
        });
    }

    for (const insumoId in consumoAcumuladoInsumos) {
        const info = consumoAcumuladoInsumos[insumoId];
        if (info.stockActual < info.cantidadTotalRequerida) {
            throw new Error(
                `Insumo insuficiente (${info.nombre}): el pedido requiere ${info.cantidadTotalRequerida} ${info.unidad}, pero solo quedan ${info.stockActual} ${info.unidad}.`
            );
        }
    }

    let cambio = 0;
    let recibidoFinal = montoTotal;
    if (metodoPago === 'efectivo') {
        recibidoFinal = montoRecibido !== null ? Number(montoRecibido) : montoTotal;
        if (recibidoFinal < montoTotal) {
            throw new Error(`El monto recibido (${recibidoFinal}) es menor al total a cobrar (${montoTotal}).`);
        }
        cambio = Number((recibidoFinal - montoTotal).toFixed(2));
    }

    const movRes = await runQuery(
        `INSERT INTO movimientos (caja_id, tipo, monto, metodo_pago, monto_recibido, cambio, descripcion, estado)
         VALUES (?, 'ingreso', ?, ?, ?, ?, ?, 'completado')`,
        [cajaId, montoTotal, metodoPago, recibidoFinal, cambio, descripcion]
    );
    const movimientoId = movRes.lastID;

    for (const det of itemsProcesados) {
        await runQuery(
            `INSERT INTO detalle_movimientos (movimiento_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [movimientoId, det.productoId, det.cantidad, det.precioUnitario, det.costoUnitario, det.subtotal]
        );

        if (det.tipoInventario === 'directo') {
            await runQuery(
                `UPDATE productos SET stock = ROUND(stock - ?, 4) WHERE id = ?`,
                [det.cantidad, det.productoId]
            );
        }
    }

    for (const insumoId in consumoAcumuladoInsumos) {
        const info = consumoAcumuladoInsumos[insumoId];
        await runQuery(
            `UPDATE insumos SET stock_actual = ROUND(stock_actual - ?, 4) WHERE id = ?`,
            [info.cantidadTotalRequerida, info.insumoId]
        );
        await runQuery(
            `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
             VALUES (?, 'consumo_venta', ?, ?, ?)`,
            [info.insumoId, info.cantidadTotalRequerida, info.costoUnitario, `Venta Ticket #${movimientoId}`]
        );
    }

    return {
        movimientoId,
        montoTotal: Number(montoTotal.toFixed(2)),
        metodoPago,
        montoRecibido: recibidoFinal,
        cambio
    };
}

async function registrarEgreso(cajaId, monto, descripcion, metodoPago = 'efectivo') {
    if (!descripcion || descripcion.trim() === '') {
        throw new Error('Debes indicar el motivo del egreso.');
    }
    const res = await runQuery(
        `INSERT INTO movimientos (caja_id, tipo, monto, metodo_pago, descripcion, estado)
         VALUES (?, 'egreso', ?, ?, ?, 'completado')`,
        [cajaId, monto, metodoPago, descripcion.trim()]
    );
    return res.lastID;
}

async function anularMovimientoConPermiso(adminId, movimientoId, motivoAnulacion) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || ejecutor.rol !== 'admin') {
        throw new Error('Permiso denegado: solo el administrador puede anular movimientos.');
    }

    const mov = await getQuery(`SELECT * FROM movimientos WHERE id = ?`, [movimientoId]);
    if (!mov) throw new Error('Movimiento no encontrado.');
    if (mov.estado === 'anulado') throw new Error('Este movimiento ya fue anulado.');

    const detalles = await allQuery(
        `SELECT d.*, p.tipo_inventario
         FROM detalle_movimientos d
         INNER JOIN productos p ON d.producto_id = p.id
         WHERE d.movimiento_id = ?`,
        [movimientoId]
    );

    for (const det of detalles) {
        if (det.tipo_inventario === 'directo') {
            await runQuery(`UPDATE productos SET stock = ROUND(stock + ?, 4) WHERE id = ?`, [det.cantidad, det.producto_id]);
        } else if (det.tipo_inventario === 'receta') {
            const receta = await allQuery(`SELECT * FROM recetas WHERE producto_id = ?`, [det.producto_id]);
            for (const ing of receta) {
                const cantidadDevolver = Number((ing.cantidad_requerida * det.cantidad).toFixed(4));
                const insumo = await getQuery(`SELECT costo_por_unidad FROM insumos WHERE id = ?`, [ing.insumo_id]);
                await runQuery(`UPDATE insumos SET stock_actual = ROUND(stock_actual + ?, 4) WHERE id = ?`, [cantidadDevolver, ing.insumo_id]);
                await runQuery(
                    `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
                     VALUES (?, 'reingreso_anulacion', ?, ?, ?)`,
                    [ing.insumo_id, cantidadDevolver, insumo ? insumo.costo_por_unidad : 0, `Anulación Ticket #${movimientoId}`]
                );
            }
        }
    }

    const nuevaDesc = `${mov.descripcion} [ANULADO: ${motivoAnulacion || 'Error'}]`;
    await runQuery(`UPDATE movimientos SET estado = 'anulado', descripcion = ? WHERE id = ?`, [nuevaDesc, movimientoId]);
    return true;
}

async function obtenerMovimientosCaja(cajaId) {
    return await allQuery(`SELECT * FROM movimientos WHERE caja_id = ? ORDER BY fecha_hora DESC`, [cajaId]);
}

// ==========================================
// 5. ARQUEO DE CAJA Y ESTADÍSTICAS PREDICTIVAS
// ==========================================
async function cerrarCaja(cajaId, efectivoRealFisico) {
    const caja = await getQuery(`SELECT * FROM cajas WHERE id = ?`, [cajaId]);
    if (!caja) throw new Error('Caja no encontrada.');
    if (caja.estado === 'cerrada') throw new Error('Esta caja ya fue cerrada.');

    const resumen = await allQuery(
        `SELECT tipo, metodo_pago, SUM(monto) as total
         FROM movimientos
         WHERE caja_id = ? AND estado = 'completado'
         GROUP BY tipo, metodo_pago`,
        [cajaId]
    );

    let ingresosEfectivo = 0, egresosEfectivo = 0, ingresosQR = 0, egresosQR = 0;
    for (const fila of resumen) {
        if (fila.tipo === 'ingreso' && fila.metodo_pago === 'efectivo') ingresosEfectivo = fila.total;
        if (fila.tipo === 'egreso' && fila.metodo_pago === 'efectivo') egresosEfectivo = fila.total;
        if (fila.tipo === 'ingreso' && fila.metodo_pago === 'qr') ingresosQR = fila.total;
        if (fila.tipo === 'egreso' && fila.metodo_pago === 'qr') egresosQR = fila.total;
    }

    const efectivoEsperado = Number((caja.monto_inicial + ingresosEfectivo - egresosEfectivo).toFixed(2));
    const qrEsperado = Number((ingresosQR - egresosQR).toFixed(2));
    const diferenciaEfectivo = Number((Number(efectivoRealFisico) - efectivoEsperado).toFixed(2));

    await runQuery(
        `UPDATE cajas
         SET estado = 'cerrada',
             efectivo_esperado = ?,
             efectivo_real = ?,
             qr_esperado = ?,
             diferencia_efectivo = ?,
             fecha_cierre = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [efectivoEsperado, efectivoRealFisico, qrEsperado, diferenciaEfectivo, cajaId]
    );

    return {
        cajaId,
        fondoInicial: caja.monto_inicial,
        ingresosEfectivo,
        egresosEfectivo,
        efectivoEsperado,
        efectivoReal: Number(efectivoRealFisico),
        diferenciaEfectivo,
        ingresosQR,
        qrEsperado,
        ventasTotalesTurno: Number((ingresosEfectivo + ingresosQR).toFixed(2))
    };
}

async function obtenerPrediccionComprasInsumos(diasAnalisis = 30, diasCobertura = 7) {
    const insumos = await obtenerInsumos();
    const reporte = [];

    for (const ins of insumos) {
        const consumo = await getQuery(
            `SELECT COALESCE(SUM(cantidad), 0) as total_consumido
             FROM movimientos_insumos
             WHERE insumo_id = ?
               AND tipo IN ('consumo_venta', 'merma')
               AND fecha_hora >= datetime('now', ?)`,
            [ins.id, `-${diasAnalisis} days`]
        );

        const promedioDiario = consumo.total_consumido / Math.max(1, diasAnalisis);
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
            consumoTotalPeriodo: Number(consumo.total_consumido.toFixed(3)),
            consumoPromedioDiario: Number(promedioDiario.toFixed(3)),
            puntoReordenROP: Number(puntoReorden.toFixed(3)),
            cantidadSugeridaCompra: Number(cantidadSugeridaCompra.toFixed(2)),
            costoEstimadoCompra: Number((cantidadSugeridaCompra * ins.costo_por_unidad).toFixed(2)),
            estadoAlerta
        });
    }

    return reporte;
}

// ==========================================
// 6. ESTADÍSTICAS Y CONTABILIDAD (PANEL ADMIN)
// ==========================================
async function obtenerEstadisticasCaja(cajaId) {
    const kpiVentas = await getQuery(
        `SELECT COUNT(id) as cantidad_tickets, COALESCE(SUM(monto), 0) as ventas_totales
         FROM movimientos WHERE caja_id = ? AND tipo = 'ingreso' AND estado = 'completado'`,
        [cajaId]
    );

    const kpiCostos = await getQuery(
        `SELECT COALESCE(SUM(d.cantidad * d.costo_unitario), 0) as costo_total_ventas
         FROM detalle_movimientos d
         INNER JOIN movimientos m ON d.movimiento_id = m.id
         WHERE m.caja_id = ? AND m.estado = 'completado'`,
        [cajaId]
    );

    const kpiEgresos = await getQuery(
        `SELECT COALESCE(SUM(monto), 0) as total_egresos
         FROM movimientos WHERE caja_id = ? AND tipo = 'egreso' AND estado = 'completado'`,
        [cajaId]
    );

    const rendimientoProductos = await allQuery(
        `SELECT 
            p.id,
            p.nombre,
            p.categoria,
            COALESCE(SUM(CASE WHEN m.caja_id = ? AND m.estado = 'completado' THEN d.cantidad ELSE 0 END), 0) as unidades_vendidas,
            COALESCE(SUM(CASE WHEN m.caja_id = ? AND m.estado = 'completado' THEN d.subtotal ELSE 0 END), 0) as ingresos_generados,
            COALESCE(SUM(CASE WHEN m.caja_id = ? AND m.estado = 'completado' THEN (d.subtotal - (d.cantidad * d.costo_unitario)) ELSE 0 END), 0) as ganancia_generada
         FROM productos p
         LEFT JOIN detalle_movimientos d ON p.id = d.producto_id
         LEFT JOIN movimientos m ON d.movimiento_id = m.id
         WHERE p.activo = 1
         GROUP BY p.id
         ORDER BY unidades_vendidas DESC`,
        [cajaId, cajaId, cajaId]
    );

    const ticketPromedio = kpiVentas.cantidad_tickets > 0
        ? kpiVentas.ventas_totales / kpiVentas.cantidad_tickets
        : 0;

    const gananciaBruta = Number((kpiVentas.ventas_totales - kpiCostos.costo_total_ventas).toFixed(2));
    const flujoNetoOperativo = Number((gananciaBruta - kpiEgresos.total_egresos).toFixed(2));

    return {
        ventasTotales: kpiVentas.ventas_totales,
        cantidadTickets: kpiVentas.cantidad_tickets,
        ticketPromedio: Number(ticketPromedio.toFixed(2)),
        costoTotalVentas: Number(kpiCostos.costo_total_ventas.toFixed(2)),
        gananciaBruta,
        totalEgresos: kpiEgresos.total_egresos,
        flujoNetoOperativo,
        productosMasVendidos: rendimientoProductos.filter(p => p.unidades_vendidas > 0),
        productosSinRotacion: rendimientoProductos.filter(p => p.unidades_vendidas === 0)
    };
} // <-- AQUÍ FALTABA CERRAR LA FUNCIÓN ANTES DE LA SECCIÓN 7

// ==========================================
// 7. TENDENCIAS HORARIAS, MÉTODOS DE PAGO Y EXPORTACIÓN EXCEL (CSV)
// ==========================================
async function obtenerDesgloseMetodosPago(cajaId) {
    const filas = await allQuery(
        `SELECT metodo_pago, COUNT(id) as transacciones, COALESCE(SUM(monto), 0) as total
         FROM movimientos
         WHERE caja_id = ? AND tipo = 'ingreso' AND estado = 'completado'
         GROUP BY metodo_pago`,
        [cajaId]
    );

    const sumaTotal = filas.reduce((acc, f) => acc + f.total, 0);

    return filas.map(f => ({
        metodoPago: f.metodo_pago,
        transacciones: f.transacciones,
        montoTotal: Number(f.total.toFixed(2)),
        porcentaje: sumaTotal > 0 ? Number(((f.total / sumaTotal) * 100).toFixed(1)) : 0
    }));
}

async function obtenerTendenciasVentas() {
    const ventasPorHora = await allQuery(
        `SELECT strftime('%H:00', fecha_hora, 'localtime') as hora,
                COUNT(id) as cantidad_tickets,
                ROUND(SUM(monto), 2) as total_vendido
         FROM movimientos
         WHERE tipo = 'ingreso' AND estado = 'completado'
           AND date(fecha_hora) = date('now')
         GROUP BY hora
         ORDER BY hora ASC`
    );

    const comparativaSemanal = await allQuery(
        `SELECT date(fecha_hora, 'localtime') as fecha,
                COUNT(id) as cantidad_tickets,
                ROUND(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 2) as ingresos,
                ROUND(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 2) as egresos
         FROM movimientos
         WHERE estado = 'completado'
           AND fecha_hora >= datetime('now', '-7 days')
         GROUP BY fecha
         ORDER BY fecha ASC`
    );

    return { ventasPorHora, comparativaSemanal };
}

async function generarReporteCSV(cajaId = null) {
    const filtroCaja = cajaId ? `WHERE m.caja_id = ?` : ``;
    const params = cajaId ? [cajaId] : [];

    const filas = await allQuery(
        `SELECT m.id, m.caja_id, m.fecha_hora, m.tipo, m.metodo_pago,
                m.monto, m.monto_recibido, m.cambio, m.estado, m.descripcion
         FROM movimientos m
         ${filtroCaja}
         ORDER BY m.fecha_hora DESC`,
        params
    );

    const cabeceras = [
        'ID_Movimiento', 'ID_Caja', 'Fecha_Hora', 'Tipo', 'Metodo_Pago',
        'Monto_Bs', 'Recibido_Bs', 'Cambio_Bs', 'Estado', 'Descripcion'
    ].join(';');

    const lineas = filas.map(r => [
        r.id,
        r.caja_id,
        r.fecha_hora,
        r.tipo,
        r.metodo_pago,
        r.monto,
        r.monto_recibido ?? 0,
        r.cambio ?? 0,
        r.estado,
        `"${(r.descripcion || '').replace(/"/g, '""')}"`
    ].join(';'));

    return [cabeceras, ...lineas].join('\n');
}

module.exports = {
    verificarUsuario,
    obtenerUsuarioPorId,
    obtenerUsuarios,
    crearUsuario,
    crearUsuarioConPermiso,
    borrarUsuarioConPermiso,
    crearInsumo,
    obtenerInsumos,
    registrarCompraInsumo,
    registrarMermaInsumo,
    asignarIngredienteReceta,
    calcularDisponibilidadProducto,
    crearProducto,
    obtenerProductos,
    obtenerCajaAbierta,
    abrirCaja,
    registrarVentaCompleta,
    registrarEgreso,
    anularMovimientoConPermiso,
    obtenerMovimientosCaja,
    cerrarCaja,
    obtenerPrediccionComprasInsumos,
    obtenerEstadisticasCaja,
    obtenerDesgloseMetodosPago,
    obtenerTendenciasVentas,
    generarReporteCSV
};