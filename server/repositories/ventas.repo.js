
/**
 * server/repositories/ventas.repo.js
 * Repositorio para la gestión de ventas, cobros mixtos (efectivo + QR),
 * egresos operativos, ingresos/aportes de sencillo, anulaciones y movimientos de turno.
 * Asegura atomicidad transaccional, inmutabilidad fiscal y control estricto de caja.
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
const { obtenerUsuarioPorId, esRolAdministrativo } = require('./auth.repo');
const { prorratearDescuentoTicket } = require('../domain/costos');
const {
    validarRegimenYPermisosVenta,
    validarRegimenYPermisosEgreso,
    calcularSnapshotFiscalVenta,
    calcularSnapshotFiscalEgreso
} = require('../domain/fiscal');

const redondearStock = (expresion) => `ROUND(CAST(${expresion} AS numeric), 4)::double precision`;
const fechaLocal = (columna) => `TO_CHAR(${columna} AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD HH24:MI:SS')`;

// La configuración inicial se crea desde su repositorio. El POS puede usar los
// valores por defecto sin abrir otra transacción mientras tiene bloqueado el turno.
const obtenerConfiguracionParaMovimiento = () => getQuery('SELECT * FROM configuracion_negocio WHERE id = 1');

async function restituirLote(productoId, cantidad) {
    const lote = await getQuery(
        `SELECT id FROM producto_lotes WHERE producto_id = $1 AND activo = 1 ORDER BY fecha_vencimiento ASC, id ASC LIMIT 1`,
        [productoId]
    );
    if (lote) {
        await runQuery(`UPDATE producto_lotes SET stock = ${redondearStock('stock + $1')} WHERE id = $2`, [cantidad, lote.id]);
    }
}

async function registrarVentaCompleta(
    cajaId,
    items,
    metodoPago,
    montoRecibido = null,
    descripcion = 'Venta en mostrador',
    usuarioId = null,
    cambioEntregado = null,
    opcionesExtra = {},
    canalVentaParam = null,
    datosEntregaParam = null,
    referenciaExternaParam = null
) {
    // Soporte para invocación mediante objeto único de parámetros
    if (typeof cajaId === 'object' && cajaId !== null && !Array.isArray(cajaId)) {
        const obj = cajaId;
        return await registrarVentaCompleta(
            obj.cajaId ?? obj.caja_id,
            obj.items,
            obj.metodoPago ?? obj.metodo_pago,
            obj.montoRecibido ?? obj.monto_recibido ?? null,
            obj.descripcion ?? 'Venta en mostrador',
            obj.usuarioId ?? obj.usuario_id ?? null,
            obj.cambioEntregado ?? obj.cambio ?? null,
            obj.opcionesExtra ?? obj,
            obj.canalVenta ?? obj.canal_venta ?? null,
            obj.datosEntrega ?? obj.datos_entrega ?? null,
            obj.referenciaExterna ?? obj.referencia_externa ?? null
        );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('La venta debe incluir al menos un producto.');
    }

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que registra la venta es obligatorio.');
    }

    const METODOS_PAGO_VALIDOS = ['efectivo', 'qr', 'mixto', 'pedidos_ya', 'yango'];
    if (!METODOS_PAGO_VALIDOS.includes(metodoPago)) {
        throw new Error("Método de pago inválido. Debe ser 'efectivo', 'qr', 'mixto', 'pedidos_ya' o 'yango'.");
    }

    const CANALES_VENTA_VALIDOS = ['local', 'mototaxi', 'pedidos_ya', 'yango'];
    let canalVenta = canalVentaParam
        || opcionesExtra?.canalVenta
        || opcionesExtra?.canal_venta
        || (metodoPago === 'pedidos_ya' ? 'pedidos_ya' : (metodoPago === 'yango' ? 'yango' : 'local'));

    if (!CANALES_VENTA_VALIDOS.includes(canalVenta)) {
        throw new Error(`Canal de venta inválido: "${canalVenta}". Debe ser 'local', 'mototaxi', 'pedidos_ya' o 'yango'.`);
    }

    const datosEntregaRaw = datosEntregaParam !== null && datosEntregaParam !== undefined
        ? datosEntregaParam
        : (opcionesExtra?.datosEntrega ?? opcionesExtra?.datos_entrega ?? null);
    const datosEntrega = typeof datosEntregaRaw === 'object' && datosEntregaRaw !== null
        ? JSON.stringify(datosEntregaRaw)
        : (datosEntregaRaw ? String(datosEntregaRaw).trim() : null);

    const refExtRaw = referenciaExternaParam !== null && referenciaExternaParam !== undefined
        ? referenciaExternaParam
        : (opcionesExtra?.referenciaExterna ?? opcionesExtra?.referencia_externa ?? null);
    const referenciaExterna = refExtRaw ? String(refExtRaw).trim() : null;

    // 1. Validar ítems y agrupar por (productoId + modificadores) sumando cantidades
    const mapaItemsAgrupados = new Map();
    for (const item of items) {
        if (!item || item.productoId === undefined || item.productoId === null) {
            throw new Error('Cada ítem debe especificar un productoId válido.');
        }
        const prodId = Number(item.productoId);
        if (!Number.isFinite(prodId) || prodId <= 0) {
            throw new Error('ID de producto inválido.');
        }
        const cant = numeroPositivo(item.cantidad, `La cantidad del producto ID ${prodId}`);

        // Normalizar modificadores ordenados numéricamente
        const modsNormalizados = Array.isArray(item.modificadores)
            ? item.modificadores
                .map((m) => (typeof m === 'object' && m !== null ? Number(m.id || m.opcionId) : Number(m)))
                .filter((id) => Number.isFinite(id) && id > 0)
                .sort((a, b) => a - b)
            : [];

        const loteId = (item.loteId && Number(item.loteId) > 0)
            ? Number(item.loteId)
            : ((item.lote_id && Number(item.lote_id) > 0) ? Number(item.lote_id) : null);

        const claveAgrupacion = `${prodId}_${loteId || 'auto'}__${modsNormalizados.join('_')}`;
        if (!mapaItemsAgrupados.has(claveAgrupacion)) {
            mapaItemsAgrupados.set(claveAgrupacion, {
                productoId: prodId,
                loteId,
                modificadoresIds: modsNormalizados,
                cantidadTotal: 0
            });
        }
        const agrupado = mapaItemsAgrupados.get(claveAgrupacion);
        agrupado.cantidadTotal = Number((agrupado.cantidadTotal + cant).toFixed(4));
    }

    return await enTransaccion(async () => {
        const operador = await obtenerUsuarioPorId(usuarioId);
        if (!operador) {
            throw new Error('El usuario que intenta registrar la venta no existe o está inactivo.');
        }

        // 2. Verificar que la caja exista, esté abierta y quien vende sea el dueño de la caja o un administrador
        const caja = await getQuery(
            `SELECT c.id, c.usuario_id, c.estado, c.caja_fisica_id,
                    COALESCE(cf.nombre, 'Caja Principal') as caja_fisica_nombre,
                    COALESCE(cf.habilita_respaldo_fiscal, 1) as habilita_respaldo_fiscal
             FROM cajas c
             LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
             WHERE c.id = $1 FOR NO KEY UPDATE OF c`,
            [cajaId]
        );
        if (!caja) {
            throw new Error('La caja indicada no existe.');
        }
        if (caja.estado !== 'abierta') {
            throw new Error('No se puede registrar una venta porque la caja no está abierta.');
        }
        if (Number(caja.usuario_id) !== Number(operador.id) && !esRolAdministrativo(operador.rol)) {
            throw new Error('Permiso denegado: solo el cajero titular de la caja abierta o un Administrador puede registrar ventas en este turno.');
        }

        let subtotalBruto = 0;
        const itemsProcesados = [];
        const consumoAcumuladoInsumos = {};
        const consumoAcumuladoDirecto = {};

        for (const itemAgrupado of mapaItemsAgrupados.values()) {
            const { productoId: prodId, loteId, modificadoresIds, cantidadTotal } = itemAgrupado;
            const prod = await getQuery(`SELECT * FROM productos WHERE id = $1 AND activo = 1`, [prodId]);
            if (!prod) throw new Error(`Producto con ID ${prodId} no existe.`);

            // Validar vigencia temporal en caso de combos
            if (prod.tipo_inventario === 'combo') {
                const ahora = new Date();
                if (prod.fecha_inicio_vigencia) {
                    const fInicio = new Date(prod.fecha_inicio_vigencia);
                    if (!isNaN(fInicio.getTime()) && ahora < fInicio) {
                        throw new Error(`La promoción "${prod.nombre}" aún no está vigente (inicia el ${fInicio.toLocaleString()}).`);
                    }
                }
                if (prod.fecha_fin_vigencia) {
                    const fFin = new Date(prod.fecha_fin_vigencia);
                    if (!isNaN(fFin.getTime()) && ahora > fFin) {
                        throw new Error(`La promoción "${prod.nombre}" ha finalizado (expiró el ${fFin.toLocaleString()}).`);
                    }
                }
            }

            // Cargar componentes si es combo
            let componentesCombo = [];
            if (prod.tipo_inventario === 'combo') {
                componentesCombo = await allQuery(
                    `SELECT cc.componente_producto_id, cc.cantidad,
                            p.nombre as componente_nombre, p.tipo_inventario as componente_tipo,
                            p.costo as componente_costo, p.stock as componente_stock
                      FROM combo_componentes cc
                      INNER JOIN productos p ON cc.componente_producto_id = p.id
                      WHERE cc.combo_producto_id = $1 AND p.activo = 1`,
                    [prod.id]
                );
                if (componentesCombo.length === 0) {
                    throw new Error(`El combo "${prod.nombre}" no tiene componentes válidos configurados.`);
                }
            }

            // Cargar receta base si corresponde
            let recetaBase = [];
            if (prod.tipo_inventario === 'receta') {
                recetaBase = await allQuery(
                    `SELECT r.insumo_id, r.cantidad_requerida, i.nombre, i.stock_actual, i.unidad_medida, i.costo_por_unidad
                     FROM recetas r
                     INNER JOIN insumos i ON r.insumo_id = i.id
                     WHERE r.producto_id = $1`,
                    [prod.id]
                );
            }

            // Validar y cargar modificadores
            let opcionesModificadores = [];
            if (modificadoresIds.length > 0) {
                opcionesModificadores = await allQuery(
                    `SELECT o.*, g.nombre as grupo_nombre, g.tipo_seleccion, g.es_obligatorio,
                            i.nombre as insumo_nombre, i.stock_actual as insumo_stock, i.costo_por_unidad as insumo_costo, i.unidad_medida as insumo_unidad,
                            ir.costo_por_unidad as insumo_reemplazado_costo, ir.nombre as insumo_reemplazado_nombre
                     FROM modificadores_opciones o
                     INNER JOIN grupos_modificadores g ON o.grupo_id = g.id
                     LEFT JOIN insumos i ON o.insumo_id = i.id
                     LEFT JOIN insumos ir ON o.insumo_reemplazado_id = ir.id
                     WHERE o.id = ANY($1::bigint[]) AND o.activo = 1 AND g.activo = 1`,
                    [modificadoresIds]
                );
            }

            // Insumos efectivos por unidad de producto
            const mapaInsumosPorUnidad = new Map();
            for (const ing of recetaBase) {
                mapaInsumosPorUnidad.set(ing.insumo_id, {
                    insumoId: ing.insumo_id,
                    cantidad: ing.cantidad_requerida,
                    nombre: ing.nombre,
                    unidad: ing.unidad_medida,
                    costoUnitario: Number(ing.costo_por_unidad || 0)
                });
            }

            let precioUnitario = redondear2(prod.precio);
            let costoUnitario = Number(prod.costo || 0);
            const modificadoresDetalle = [];
            const textoModificadores = [];

            for (const modOp of opcionesModificadores) {
                const recargo = redondear2(modOp.precio_adicional || 0);
                precioUnitario = redondear2(precioUnitario + recargo);
                textoModificadores.push(
                    recargo > 0 ? `${modOp.nombre} (+Bs ${recargo.toFixed(2)})` : modOp.nombre
                );

                let costoDelta = 0;
                if (modOp.insumo_id) {
                    const cantMod = Number(modOp.cantidad_insumo || 0);
                    const costoInsumoMod = Number(modOp.insumo_costo || 0);

                    if (modOp.insumo_reemplazado_id) {
                        // Reemplazo: quitar o sustituir el insumo base
                        const estabaEnReceta = mapaInsumosPorUnidad.has(modOp.insumo_reemplazado_id);
                        const cantReemplazada = estabaEnReceta
                            ? mapaInsumosPorUnidad.get(modOp.insumo_reemplazado_id).cantidad
                            : cantMod;
                        const costoReemplazado = estabaEnReceta
                            ? Number(modOp.insumo_reemplazado_costo || 0)
                            : 0;

                        if (estabaEnReceta) {
                            mapaInsumosPorUnidad.delete(modOp.insumo_reemplazado_id);
                        }

                        const cantEfectiva = cantMod > 0 ? cantMod : cantReemplazada;
                        const actual = mapaInsumosPorUnidad.get(modOp.insumo_id);
                        if (actual) {
                            actual.cantidad = Number((actual.cantidad + cantEfectiva).toFixed(4));
                        } else {
                            mapaInsumosPorUnidad.set(modOp.insumo_id, {
                                insumoId: modOp.insumo_id,
                                cantidad: cantEfectiva,
                                nombre: modOp.insumo_nombre,
                                unidad: modOp.insumo_unidad,
                                costoUnitario: costoInsumoMod
                            });
                        }
                        costoDelta = Number((cantEfectiva * costoInsumoMod - cantReemplazada * costoReemplazado).toFixed(4));
                    } else {
                        // Extra / Adición
                        const actual = mapaInsumosPorUnidad.get(modOp.insumo_id);
                        if (actual) {
                            actual.cantidad = Number((actual.cantidad + cantMod).toFixed(4));
                        } else {
                            mapaInsumosPorUnidad.set(modOp.insumo_id, {
                                insumoId: modOp.insumo_id,
                                cantidad: cantMod,
                                nombre: modOp.insumo_nombre,
                                unidad: modOp.insumo_unidad,
                                costoUnitario: costoInsumoMod
                            });
                        }
                        costoDelta = Number((cantMod * costoInsumoMod).toFixed(4));
                    }
                }

                modificadoresDetalle.push({
                    modificadorOpcionId: modOp.id,
                    nombre: modOp.nombre,
                    precioAdicional: recargo,
                    costoAdicional: costoDelta,
                    insumoId: modOp.insumo_id,
                    cantidadInsumo: modOp.cantidad_insumo,
                    insumoReemplazadoId: modOp.insumo_reemplazado_id
                });
            }

            let componentesDetalleCombo = [];
            // Si el producto es combo, descomponer recursivamente sus componentes en insumos y stock directo
            if (prod.tipo_inventario === 'combo') {
                let costoCalculadoCombo = 0;
                for (const comp of componentesCombo) {
                    const cantTotalComp = Number((comp.cantidad * cantidadTotal).toFixed(4));
                    componentesDetalleCombo.push({
                        componenteProductoId: comp.componente_producto_id,
                        cantidadUnitaria: comp.cantidad,
                        cantidadTotal: cantTotalComp,
                        costoUnitario: Number(comp.componente_costo || 0)
                    });
                    costoCalculadoCombo += comp.cantidad * Number(comp.componente_costo || 0);

                    if (comp.componente_tipo === 'directo') {
                        // Acumular consumo de stock directo por componente
                        if (!consumoAcumuladoDirecto[comp.componente_producto_id]) {
                            consumoAcumuladoDirecto[comp.componente_producto_id] = {
                                productoId: comp.componente_producto_id,
                                nombre: comp.componente_nombre,
                                costoUnitario: Number(comp.componente_costo || 0),
                                cantidadTotalRequerida: 0,
                                lotesEspecificos: {},
                                cantidadPeps: 0
                            };
                        }
                        consumoAcumuladoDirecto[comp.componente_producto_id].cantidadTotalRequerida = Number(
                            (consumoAcumuladoDirecto[comp.componente_producto_id].cantidadTotalRequerida + cantTotalComp).toFixed(4)
                        );
                        consumoAcumuladoDirecto[comp.componente_producto_id].cantidadPeps = Number(
                            ((consumoAcumuladoDirecto[comp.componente_producto_id].cantidadPeps || 0) + cantTotalComp).toFixed(4)
                        );
                    } else if (comp.componente_tipo === 'receta') {
                        // Descomponer en sus insumos
                        const recComp = await allQuery(
                            `SELECT r.insumo_id, r.cantidad_requerida, i.nombre, i.unidad_medida, i.costo_por_unidad
                             FROM recetas r
                             INNER JOIN insumos i ON r.insumo_id = i.id
                             WHERE r.producto_id = $1`,
                            [comp.componente_producto_id]
                        );
                        for (const ing of recComp) {
                            const cantInsumoTotal = Number((ing.cantidad_requerida * cantTotalComp).toFixed(4));
                            if (!consumoAcumuladoInsumos[ing.insumo_id]) {
                                consumoAcumuladoInsumos[ing.insumo_id] = {
                                    insumoId: ing.insumo_id,
                                    nombre: ing.nombre,
                                    unidad: ing.unidad_medida,
                                    costoUnitario: Number(ing.costo_por_unidad || 0),
                                    cantidadTotalRequerida: 0
                                };
                            }
                            consumoAcumuladoInsumos[ing.insumo_id].cantidadTotalRequerida = Number(
                                (consumoAcumuladoInsumos[ing.insumo_id].cantidadTotalRequerida + cantInsumoTotal).toFixed(4)
                            );
                        }
                    }
                }
                costoUnitario = redondear2(costoCalculadoCombo);
            }

            // Si el producto es receta, su costo unitario exacto es la suma de los insumos efectivos
            if (prod.tipo_inventario === 'receta') {
                let costoCalculado = 0;
                for (const ins of mapaInsumosPorUnidad.values()) {
                    costoCalculado += ins.cantidad * ins.costoUnitario;
                }
                costoUnitario = redondear2(costoCalculado);
            }

            // Acumular consumo total de insumos para este producto (multiplicado por cantidadTotal)
            for (const ins of mapaInsumosPorUnidad.values()) {
                const requeridoTotalItem = Number((ins.cantidad * cantidadTotal).toFixed(4));
                if (!consumoAcumuladoInsumos[ins.insumoId]) {
                    consumoAcumuladoInsumos[ins.insumoId] = {
                        insumoId: ins.insumoId,
                        nombre: ins.nombre,
                        unidad: ins.unidad,
                        costoUnitario: ins.costoUnitario,
                        cantidadTotalRequerida: 0
                    };
                }
                consumoAcumuladoInsumos[ins.insumoId].cantidadTotalRequerida = Number(
                    (consumoAcumuladoInsumos[ins.insumoId].cantidadTotalRequerida + requeridoTotalItem).toFixed(4)
                );
            }

            // Si es directo, acumular consumo y rastrear lote
            if (prod.tipo_inventario === 'directo') {
                if (!consumoAcumuladoDirecto[prod.id]) {
                    consumoAcumuladoDirecto[prod.id] = {
                        productoId: prod.id,
                        nombre: prod.nombre,
                        costoUnitario: Number(prod.costo || 0),
                        cantidadTotalRequerida: 0,
                        lotesEspecificos: {},
                        cantidadPeps: 0
                    };
                }
                consumoAcumuladoDirecto[prod.id].cantidadTotalRequerida = Number(
                    (consumoAcumuladoDirecto[prod.id].cantidadTotalRequerida + cantidadTotal).toFixed(4)
                );
                if (loteId) {
                    consumoAcumuladoDirecto[prod.id].lotesEspecificos[loteId] = Number(
                        ((consumoAcumuladoDirecto[prod.id].lotesEspecificos[loteId] || 0) + cantidadTotal).toFixed(4)
                    );
                } else {
                    consumoAcumuladoDirecto[prod.id].cantidadPeps = Number(
                        ((consumoAcumuladoDirecto[prod.id].cantidadPeps || 0) + cantidadTotal).toFixed(4)
                    );
                }
            }

            const subtotalLinea = redondear2(cantidadTotal * precioUnitario);
            subtotalBruto = redondear2(subtotalBruto + subtotalLinea);

            itemsProcesados.push({
                productoId: prod.id,
                nombre: prod.nombre,
                tipoInventario: prod.tipo_inventario,
                cantidad: cantidadTotal,
                precioUnitario,
                costoUnitario,
                subtotal: subtotalLinea,
                textoModificadores: textoModificadores.join(', '),
                modificadoresDetalle,
                componentesDetalleCombo,
                limiteMaximoActivo: Number(prod.limite_maximo_activo) === 1
            });
        }

        // 3. Validar stock total requerido antes de descontar nada
        for (const iId in consumoAcumuladoInsumos) {
            const req = consumoAcumuladoInsumos[iId];
            const insActual = await getQuery(`SELECT stock_actual, nombre, unidad_medida FROM insumos WHERE id = $1`, [req.insumoId]);
            if (!insActual || Number(insActual.stock_actual) < req.cantidadTotalRequerida) {
                const disponible = insActual ? insActual.stock_actual : 0;
                const unidad = insActual ? insActual.unidad_medida : req.unidad;
                throw new Error(
                    `Stock insuficiente de insumo "${req.nombre}": se requieren ${req.cantidadTotalRequerida} ${unidad} pero solo hay ${disponible} ${unidad} en inventario.`
                );
            }
        }

        for (const pId in consumoAcumuladoDirecto) {
            const reqDir = consumoAcumuladoDirecto[pId];
            const prodActual = await getQuery(`SELECT stock, nombre, unidad_medida FROM productos WHERE id = $1`, [reqDir.productoId]);
            if (!prodActual || Number(prodActual.stock) < reqDir.cantidadTotalRequerida) {
                const disponible = prodActual ? prodActual.stock : 0;
                const unidad = prodActual ? prodActual.unidad_medida : 'unidades';
                throw new Error(
                    `Stock insuficiente del producto "${reqDir.nombre}": se requieren ${reqDir.cantidadTotalRequerida} ${unidad} pero solo hay ${disponible} ${unidad} en stock.`
                );
            }

            // Validar stock de cada lote específico solicitado
            for (const lId in reqDir.lotesEspecificos) {
                const cantReqLote = reqDir.lotesEspecificos[lId];
                const loteActual = await getQuery(
                    `SELECT id, stock, fecha_vencimiento FROM producto_lotes WHERE id = $1 AND producto_id = $2 AND activo = 1`,
                    [lId, reqDir.productoId]
                );
                if (!loteActual || Number(loteActual.stock) < cantReqLote) {
                    const dispLote = loteActual ? loteActual.stock : 0;
                    throw new Error(
                        `Stock insuficiente en el lote #${lId} (vence ${loteActual?.fecha_vencimiento || 'N/A'}) del producto "${reqDir.nombre}": se requieren ${cantReqLote} unidades pero solo quedan ${dispLote} disponibles.`
                    );
                }
            }
        }

        // Validar límite restante de combos si corresponde
        for (const it of itemsProcesados) {
            if (it.tipoInventario === 'combo' && it.limiteMaximoActivo) {
                const pCombo = await getQuery(`SELECT limite_unidades_restante, nombre FROM productos WHERE id = $1`, [it.productoId]);
                const restante = Math.max(0, Math.floor(pCombo?.limite_unidades_restante ?? 0));
                if (restante < it.cantidad) {
                    throw new Error(`Límite de venta alcanzado para la promoción "${pCombo.nombre}". Quedan solo ${restante} combos disponibles.`);
                }
            }
        }

        // 4. Calcular descuentos y total a pagar
        const descuentoTotal = opcionesExtra?.descuentoTotal !== undefined
            ? redondear2(numeroNoNegativo(opcionesExtra.descuentoTotal, 'El descuento total'))
            : (opcionesExtra?.descuento !== undefined
                ? redondear2(numeroNoNegativo(opcionesExtra.descuento, 'El descuento'))
                : 0);
        if (descuentoTotal > subtotalBruto) {
            throw new Error(`El descuento (Bs ${descuentoTotal}) no puede superar el subtotal de la venta (Bs ${subtotalBruto}).`);
        }
        if (!esRolAdministrativo(operador.rol) && descuentoTotal > 0) {
            const maxPermitido = redondear2(subtotalBruto * 0.15);
            if (descuentoTotal > maxPermitido) {
                throw new Error(`Permiso denegado: como cajero no puedes aplicar más del 15% de descuento (Bs ${maxPermitido.toFixed(2)} máximo) sin autorización administrativa.`);
            }
        }
        const montoNeto = redondear2(subtotalBruto - descuentoTotal);

        // 5. Validar método de pago y montos según desglose
        let montoEfectivo = 0;
        let montoQr = 0;
        let referenciaQr = opcionesExtra?.referenciaQr && String(opcionesExtra.referenciaQr).trim() !== ''
            ? String(opcionesExtra.referenciaQr).trim()
            : null;
        let recibidoEfectivo = null;
        let cambioCalculado = 0;

        if (metodoPago === 'efectivo') {
            montoEfectivo = montoNeto;
            recibidoEfectivo = montoRecibido !== null && montoRecibido !== undefined && montoRecibido !== ''
                ? redondear2(numeroNoNegativo(montoRecibido, 'El monto recibido en efectivo'))
                : montoNeto;
            if (recibidoEfectivo < montoNeto) {
                throw new Error(`El efectivo recibido (Bs ${recibidoEfectivo.toFixed(2)}) es menor al total a cobrar (Bs ${montoNeto.toFixed(2)}).`);
            }
            cambioCalculado = redondear2(recibidoEfectivo - montoNeto);
            if (cambioEntregado !== null && cambioEntregado !== undefined && cambioEntregado !== '') {
                const cambioFront = redondear2(Number(cambioEntregado));
                if (Math.abs(cambioFront - cambioCalculado) > 0.05) {
                    console.warn(`[Venta] Diferencia en cálculo de cambio. Esperado: ${cambioCalculado}, Recibido front: ${cambioFront}`);
                }
            }
        } else if (metodoPago === 'qr') {
            montoQr = montoNeto;
            recibidoEfectivo = null;
            cambioCalculado = 0;
        } else if (metodoPago === 'pedidos_ya' || metodoPago === 'yango') {
            montoEfectivo = 0;
            montoQr = 0;
            recibidoEfectivo = null;
            cambioCalculado = 0;
            if (!canalVenta || canalVenta === 'local') {
                canalVenta = metodoPago;
            }
        } else if (metodoPago === 'mixto') {
            let desgloses = Array.isArray(opcionesExtra?.pagos) ? opcionesExtra.pagos : [];
            if (desgloses.length === 0 && (opcionesExtra?.montoEfectivo !== undefined || opcionesExtra?.montoQr !== undefined)) {
                desgloses = [
                    {
                        metodo: 'efectivo',
                        monto: opcionesExtra?.montoEfectivo !== undefined ? Number(opcionesExtra.montoEfectivo) : 0,
                        recibido: montoRecibido !== null && montoRecibido !== undefined ? Number(montoRecibido) : (opcionesExtra?.montoEfectivo || 0)
                    },
                    {
                        metodo: 'qr',
                        monto: opcionesExtra?.montoQr !== undefined ? Number(opcionesExtra.montoQr) : 0,
                        referencia: opcionesExtra?.referenciaQr || null
                    }
                ];
            }

            const pagoEf = desgloses.find((p) => p && p.metodo === 'efectivo');
            const pagoQr = desgloses.find((p) => p && p.metodo === 'qr');

            montoEfectivo = pagoEf ? redondear2(numeroNoNegativo(pagoEf.monto, 'La porción en efectivo')) : 0;
            montoQr = pagoQr ? redondear2(numeroNoNegativo(pagoQr.monto, 'La porción en QR')) : 0;
            if (pagoQr?.referencia) {
                referenciaQr = String(pagoQr.referencia).trim();
            }

            const sumaPartes = redondear2(montoEfectivo + montoQr);
            if (Math.abs(sumaPartes - montoNeto) > 0.0001) {
                throw new Error(`En pago mixto, la suma de Efectivo (Bs ${montoEfectivo.toFixed(2)}) y QR (Bs ${montoQr.toFixed(2)}) debe ser exactamente igual al monto neto a cobrar (Bs ${montoNeto.toFixed(2)}). Suma actual: Bs ${sumaPartes.toFixed(2)}`);
            }

            if (pagoEf && pagoEf.recibido !== undefined && pagoEf.recibido !== null && pagoEf.recibido !== '') {
                recibidoEfectivo = redondear2(numeroNoNegativo(pagoEf.recibido, 'El efectivo recibido en pago mixto'));
                if (recibidoEfectivo < montoEfectivo) {
                    throw new Error(`El efectivo recibido (Bs ${recibidoEfectivo.toFixed(2)}) es menor a la porción de efectivo acordada (Bs ${montoEfectivo.toFixed(2)}).`);
                }
                cambioCalculado = redondear2(recibidoEfectivo - montoEfectivo);
            } else {
                recibidoEfectivo = montoEfectivo;
                cambioCalculado = 0;
            }
        }

        // 6. Validaciones fiscales y snapshot congelado
        const configNegocio = await obtenerConfiguracionParaMovimiento();
        const regimenConfig = configNegocio?.regimen_tributario || 'simplificado_control_interno';

        const tipoComprobante = opcionesExtra?.tipoComprobante === 'factura' ? 'factura' : 'recibo';
        const conFactura = tipoComprobante === 'factura';

        validarRegimenYPermisosVenta({
            conFactura,
            regimen: regimenConfig,
            emiteFacturaConfig: configNegocio?.emite_factura,
            operador,
            caja
        });

        const clienteNitCi = opcionesExtra?.clienteNitCi && String(opcionesExtra.clienteNitCi).trim() !== ''
            ? String(opcionesExtra.clienteNitCi).trim()
            : null;
        const clienteRazonSocial = opcionesExtra?.clienteRazonSocial && String(opcionesExtra.clienteRazonSocial).trim() !== ''
            ? String(opcionesExtra.clienteRazonSocial).trim()
            : null;
        let nroFactura = opcionesExtra?.nroFactura && String(opcionesExtra.nroFactura).trim() !== ''
            ? String(opcionesExtra.nroFactura).trim()
            : null;

        if (conFactura && !nroFactura) {
            // Asignación correlativa automática si no se proporcionó número manual
            nroFactura = String(await consultarNumeroFactura());
        }

        const snapshotFiscal = calcularSnapshotFiscalVenta({
            montoTotal: montoNeto,
            conFactura,
            regimen: regimenConfig,
            ivaPorcentaje: configNegocio?.iva_porcentaje,
            itPorcentaje: configNegocio?.it_porcentaje,
            itBase: configNegocio?.it_base
        });

        // 7. Insertar cabecera de movimiento
        const metodoPagoCabecera = (metodoPago === 'pedidos_ya' || metodoPago === 'yango') ? 'qr' : metodoPago;
        const resMov = await runQuery(
            `INSERT INTO movimientos (
                caja_id, usuario_id, tipo, categoria_contable,
                subtotal_bruto, descuento_total, monto,
                metodo_pago, monto_efectivo, monto_qr, referencia_qr,
                monto_recibido, cambio,
                tipo_comprobante, nro_factura, cliente_nit_ci, cliente_razon_social,
                regimen_tributario, iva_porcentaje, it_porcentaje, iva_monto, it_monto,
                descripcion, estado,
                canal_venta, datos_entrega, referencia_externa
             )
             VALUES ($1, $2, 'ingreso', 'venta', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'completado', $22, $23, $24) RETURNING id`,
            [
                cajaId,
                operador.id,
                subtotalBruto,
                descuentoTotal,
                montoNeto,
                metodoPagoCabecera,
                montoEfectivo,
                montoQr,
                referenciaQr,
                recibidoEfectivo,
                cambioCalculado,
                snapshotFiscal.tipoComprobante,
                nroFactura,
                clienteNitCi,
                clienteRazonSocial,
                snapshotFiscal.regimenTributario,
                snapshotFiscal.ivaPorcentaje,
                snapshotFiscal.itPorcentaje,
                snapshotFiscal.ivaMonto,
                snapshotFiscal.itMonto,
                descripcion.trim(),
                canalVenta,
                datosEntrega,
                referenciaExterna
            ]
        );
        const movimientoId = resMov.lastID;

        // 8. Insertar fuente de verdad del dinero: movimientos_pagos
        if (metodoPago === 'efectivo') {
            await runQuery(
                `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES ($1, 'efectivo', $2, NULL)`,
                [movimientoId, montoEfectivo]
            );
        } else if (metodoPago === 'qr') {
            await runQuery(
                `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES ($1, 'qr', $2, $3)`,
                [movimientoId, montoQr, referenciaQr]
            );
        } else if (metodoPago === 'pedidos_ya' || metodoPago === 'yango') {
            await runQuery(
                `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES ($1, $2, $3, $4)`,
                [movimientoId, canalVenta, montoNeto, referenciaExterna]
            );
        } else if (metodoPago === 'mixto') {
            if (montoEfectivo > 0) {
                await runQuery(
                    `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES ($1, 'efectivo', $2, NULL)`,
                    [movimientoId, montoEfectivo]
                );
            }
            if (montoQr > 0) {
                await runQuery(
                    `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES ($1, 'qr', $2, $3)`,
                    [movimientoId, montoQr, referenciaQr]
                );
            }
            if (montoEfectivo === 0 && montoQr === 0) {
                await runQuery(
                    `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES ($1, 'efectivo', 0, NULL)`,
                    [movimientoId]
                );
            }
        }

        // 9. Insertar líneas de venta (detalle_movimientos), modificadores y componentes de combo
        for (const it of itemsProcesados) {
            const resDet = await runQuery(
                `INSERT INTO detalle_movimientos (movimiento_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [movimientoId, it.productoId, it.cantidad, it.precioUnitario, it.costoUnitario, it.subtotal]
            );
            const detalleMovimientoId = resDet.lastID;

            // Modificadores congelados para auditoría y anulación
            for (const mod of it.modificadoresDetalle) {
                await runQuery(
                    `INSERT INTO detalle_movimientos_modificadores (
                        detalle_movimiento_id, modificador_opcion_id, nombre, precio_adicional, costo_adicional,
                        insumo_id, cantidad_insumo, insumo_reemplazado_id
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        detalleMovimientoId,
                        mod.modificadorOpcionId,
                        mod.nombre,
                        mod.precioAdicional,
                        mod.costoAdicional,
                        mod.insumoId,
                        mod.cantidadInsumo,
                        mod.insumoReemplazadoId
                    ]
                );
            }

            // Componentes de combo congelados
            for (const comp of it.componentesDetalleCombo) {
                await runQuery(
                    `INSERT INTO detalle_movimientos_combos (
                        detalle_movimiento_id, componente_producto_id, cantidad_unitaria, cantidad_total, costo_unitario_congelado
                     ) VALUES ($1, $2, $3, $4, $5)`,
                    [
                        detalleMovimientoId,
                        comp.componenteProductoId,
                        comp.cantidadUnitaria,
                        comp.cantidadTotal,
                        comp.costoUnitario
                    ]
                );
            }

            // Si es combo con límite activo, decrementar el contador restante de combos
            if (it.tipoInventario === 'combo' && it.limiteMaximoActivo) {
                const rCombo = await runQuery(
                    `UPDATE productos
                     SET limite_unidades_restante = ${redondearStock('limite_unidades_restante - $1')}
                     WHERE id = $2 AND limite_unidades_restante >= $3`,
                    [it.cantidad, it.productoId, it.cantidad]
                );
                if (rCombo.changes === 0) {
                    throw new Error(`Error de concurrencia: Límite de venta alcanzado o insuficiente para la promoción "${it.nombre}".`);
                }
            }
        }

        // 10. Descontar inventario atómicamente y asentar en Kardex
        // Insumos
        for (const iId in consumoAcumuladoInsumos) {
            const req = consumoAcumuladoInsumos[iId];
            const r = await runQuery(
                `UPDATE insumos SET stock_actual = ${redondearStock('stock_actual - $1')} WHERE id = $2 AND stock_actual >= $3`,
                [req.cantidadTotalRequerida, req.insumoId, req.cantidadTotalRequerida]
            );
            if (r.changes === 0) {
                throw new Error(`Error de concurrencia: Stock insuficiente de ${req.nombre} durante la venta.`);
            }

            const insActualizado = await getQuery(`SELECT stock_actual, costo_por_unidad FROM insumos WHERE id = $1`, [req.insumoId]);
            const stockResult = Number(insActualizado?.stock_actual || 0);
            const cppResult = Number(insActualizado?.costo_por_unidad || req.costoUnitario);

            await runQuery(
                `INSERT INTO movimientos_insumos (
                    insumo_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                    costo_unitario, costo_promedio_resultante, monto_total_compra, motivo
                 ) VALUES ($1, $2, $3, 'consumo_venta', $4, $5, $6, $7, $8, $9)`,
                [
                    req.insumoId,
                    movimientoId,
                    operador.id,
                    req.cantidadTotalRequerida,
                    stockResult,
                    req.costoUnitario,
                    cppResult,
                    redondear2(req.cantidadTotalRequerida * req.costoUnitario),
                    `Consumo Venta Ticket #${movimientoId}`
                ]
            );
        }

        // Productos de venta directa
        for (const pId in consumoAcumuladoDirecto) {
            const reqDir = consumoAcumuladoDirecto[pId];
            const r = await runQuery(
                `UPDATE productos SET stock = ${redondearStock('stock - $1')} WHERE id = $2 AND stock >= $3`,
                [reqDir.cantidadTotalRequerida, reqDir.productoId, reqDir.cantidadTotalRequerida]
            );
            if (r.changes === 0) {
                throw new Error(`Error de concurrencia: Stock insuficiente de ${reqDir.nombre} durante la venta.`);
            }

            // Descontar stock de lotes específicos
            for (const lId in reqDir.lotesEspecificos) {
                const cantLote = reqDir.lotesEspecificos[lId];
                const rLote = await runQuery(
                    `UPDATE producto_lotes SET stock = ${redondearStock('stock - $1')} WHERE id = $2 AND producto_id = $3 AND stock >= $4`,
                    [cantLote, lId, reqDir.productoId, cantLote]
                );
                if (rLote.changes === 0) {
                    throw new Error(`Error de concurrencia: Stock insuficiente en el lote #${lId} del producto ${reqDir.nombre}.`);
                }
            }

            // Descontar stock por política PEPS automática para cantidades sin lote específico
            if (reqDir.cantidadPeps > 0) {
                const lotesPeps = await allQuery(
                    `SELECT id, stock FROM producto_lotes WHERE producto_id = $1 AND activo = 1 AND stock > 0 ORDER BY fecha_vencimiento ASC, id ASC`,
                    [reqDir.productoId]
                );
                let remPeps = reqDir.cantidadPeps;
                for (const lot of lotesPeps) {
                    if (remPeps <= 0) break;
                    const desc = Math.min(Number(lot.stock), remPeps);
                    const rLote = await runQuery(
                        `UPDATE producto_lotes SET stock = ${redondearStock('stock - $1')} WHERE id = $2 AND stock >= $3`,
                        [desc, lot.id, desc]
                    );
                    if (rLote.changes > 0) {
                        remPeps = Number((remPeps - desc).toFixed(4));
                    }
                }
                if (remPeps > 0) {
                    const usaLotes = lotesPeps.length > 0 || await getQuery(
                        'SELECT id FROM producto_lotes WHERE producto_id = $1 AND activo = 1 LIMIT 1',
                        [reqDir.productoId]
                    );
                    if (usaLotes) {
                        throw new Error('Stock insuficiente en lotes activos del producto para cubrir la política PEPS.');
                    }
                }
            }

            const prodActualizado = await getQuery(`SELECT stock, costo FROM productos WHERE id = $1`, [reqDir.productoId]);
            const stockResultDir = Number(prodActualizado?.stock || 0);
            const cppResultDir = Number(prodActualizado?.costo || reqDir.costoUnitario);

            await runQuery(
                `INSERT INTO movimientos_productos_directos (
                    producto_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                    costo_unitario, costo_promedio_resultante, monto_total, motivo
                 ) VALUES ($1, $2, $3, 'venta', $4, $5, $6, $7, $8, $9)`,
                [
                    reqDir.productoId,
                    movimientoId,
                    operador.id,
                    reqDir.cantidadTotalRequerida,
                    stockResultDir,
                    reqDir.costoUnitario,
                    cppResultDir,
                    redondear2(reqDir.cantidadTotalRequerida * reqDir.costoUnitario),
                    `Venta Ticket #${movimientoId}`
                ]
            );
        }

        return {
            movimientoId,
            subtotalBruto,
            descuentoTotal,
            montoTotal: montoNeto,
            metodoPago,
            montoEfectivo,
            montoQr,
            recibido: recibidoEfectivo,
            cambio: cambioCalculado,
            tipoComprobante,
            nroFactura,
            canalVenta,
            datosEntrega,
            referenciaExterna,
            items: itemsProcesados
        };
    });
}

async function registrarEgreso(cajaId, monto, descripcion, metodoPago = 'efectivo', usuarioId = null, opcionesFiscales = {}) {
    const montoValidado = redondear2(numeroPositivo(monto, 'El monto del egreso'));

    if (!descripcion || descripcion.trim() === '') {
        throw new Error('Debes indicar el motivo del egreso.');
    }

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que registra el egreso es obligatorio.');
    }

    if (!['efectivo', 'qr'].includes(metodoPago)) {
        throw new Error("Método de pago de egreso inválido. Debe ser 'efectivo' o 'qr'.");
    }

    return await enTransaccion(async () => {
        const ejecutor = await obtenerUsuarioPorId(usuarioId);
        if (!ejecutor) {
            throw new Error('El usuario que intenta registrar el egreso no existe o está inactivo.');
        }

        if (!esRolAdministrativo(ejecutor.rol) && metodoPago !== 'efectivo') {
            throw new Error('Permiso denegado: un cajero solo puede registrar egresos de efectivo físico del cajón.');
        }

        const caja = await getQuery(
            `SELECT c.id, c.usuario_id, c.estado, c.caja_fisica_id,
                    COALESCE(cf.nombre, 'Caja Principal') as caja_fisica_nombre,
                    COALESCE(cf.habilita_respaldo_fiscal, 1) as habilita_respaldo_fiscal
             FROM cajas c
             LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
             WHERE c.id = $1 FOR NO KEY UPDATE OF c`,
            [cajaId]
        );
        if (!caja) {
            throw new Error('La caja indicada no existe.');
        }
        if (caja.estado !== 'abierta') {
            throw new Error('No se puede registrar un egreso porque la caja no está abierta.');
        }
        if (Number(caja.usuario_id) !== Number(ejecutor.id) && !esRolAdministrativo(ejecutor.rol)) {
            throw new Error('Permiso denegado: solo el cajero titular de la caja abierta o un Administrador puede registrar egresos en este turno.');
        }

        const configNegocio = await obtenerConfiguracionParaMovimiento();
        const regimenSnapshot = configNegocio?.regimen_tributario === 'regimen_general'
            ? 'regimen_general'
            : 'simplificado_control_interno';

        const CATEGORIAS_EGRESO_VALIDAS = ['gasto_operativo', 'compra_insumo', 'pago_proveedor', 'retiro_dueno', 'otro'];
        const categoriaContable = CATEGORIAS_EGRESO_VALIDAS.includes(opcionesFiscales?.categoriaContable)
            ? opcionesFiscales.categoriaContable
            : 'gasto_operativo';

        const conFactura = opcionesFiscales?.tipoComprobante === 'factura' || Boolean(opcionesFiscales?.conFactura);
        if (conFactura) {
            if (Number(configNegocio?.usa_respaldo_compras_egresos ?? 1) !== 1) {
                throw new Error('Operación no permitida: El registro de respaldo fiscal en compras y egresos está deshabilitado en la configuración del negocio.');
            }
            if (Number(ejecutor.puede_registrar_respaldo_fiscal ?? 1) !== 1) {
                throw new Error(`Permiso denegado: El usuario "${ejecutor.nombre}" no tiene autorización para registrar facturas en egresos.`);
            }
            if (Number(caja.habilita_respaldo_fiscal ?? 1) !== 1) {
                throw new Error(`Operación no permitida: La estación "${caja.caja_fisica_nombre}" tiene deshabilitado el registro de respaldo fiscal.`);
            }
        }

        const tipoComprobante = conFactura
            ? 'factura'
            : (opcionesFiscales?.tipoComprobante === 'sin_respaldo' ? 'sin_respaldo' : 'recibo');
        const nroFactura = opcionesFiscales?.nroFactura && String(opcionesFiscales.nroFactura).trim() !== ''
            ? String(opcionesFiscales.nroFactura).trim()
            : null;
        const cufAutorizacion = conFactura && (opcionesFiscales?.cufAutorizacion || opcionesFiscales?.nroAutorizacionCuf)
            ? String(opcionesFiscales.cufAutorizacion || opcionesFiscales.nroAutorizacionCuf).trim()
            : '';
        const codigoControl = conFactura && opcionesFiscales?.codigoControl
            ? String(opcionesFiscales.codigoControl).trim()
            : '0';
        const proveedorNit = opcionesFiscales?.proveedorNit && String(opcionesFiscales.proveedorNit).trim() !== ''
            ? String(opcionesFiscales.proveedorNit).trim()
            : null;
        const proveedorNombre = opcionesFiscales?.proveedorNombre && String(opcionesFiscales.proveedorNombre).trim() !== ''
            ? String(opcionesFiscales.proveedorNombre).trim()
            : null;
        const referenciaQr = opcionesFiscales?.referenciaQr && String(opcionesFiscales.referenciaQr).trim() !== ''
            ? String(opcionesFiscales.referenciaQr).trim()
            : null;

        const montoEfectivo = metodoPago === 'efectivo' ? montoValidado : 0;
        const montoQr = metodoPago === 'qr' ? montoValidado : 0;

        const ivaPorcCfg = Number(configNegocio?.iva_porcentaje ?? 13);
        const ivaPorcSnapshot = (regimenSnapshot === 'regimen_general' && tipoComprobante === 'factura')
            ? ivaPorcCfg
            : 0;
        const ivaMontoSnapshot = ivaPorcSnapshot > 0
            ? redondear2(montoValidado * (ivaPorcSnapshot / 100))
            : 0;

        const res = await runQuery(
            `INSERT INTO movimientos (
                caja_id, usuario_id, tipo, categoria_contable,
                subtotal_bruto, descuento_total, monto,
                metodo_pago, monto_efectivo, monto_qr, referencia_qr,
                tipo_comprobante, nro_factura, cuf_autorizacion, codigo_control, cliente_nit_ci, cliente_razon_social,
                regimen_tributario, iva_porcentaje, it_porcentaje, iva_monto, it_monto,
                descripcion, estado
             )
             VALUES ($1, $2, 'egreso', $3, $4, 0, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 0, $18, 0, $19, 'completado') RETURNING id`,
            [
                cajaId,
                ejecutor.id,
                categoriaContable,
                montoValidado,
                montoValidado,
                metodoPago,
                montoEfectivo,
                montoQr,
                referenciaQr,
                tipoComprobante,
                nroFactura,
                cufAutorizacion,
                codigoControl,
                proveedorNit,
                proveedorNombre,
                regimenSnapshot,
                ivaPorcSnapshot,
                ivaMontoSnapshot,
                descripcion.trim()
            ]
        );
        const movId = res.lastID;
        await runQuery(
            `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES ($1, $2, $3, $4)`,
            [movId, metodoPago === 'qr' ? 'qr' : 'efectivo', montoValidado, referenciaQr]
        );
        return movId;
    });
}

// Inyección / Reposición de efectivo a la caja (ej. cambio o sencillo provisto por administrador o dueño)
async function registrarIngresoEfectivo(cajaId, monto, motivo, usuarioId = null) {
    const montoValidado = redondear2(numeroPositivo(monto, 'El monto a ingresar'));

    if (!motivo || String(motivo).trim() === '') {
        throw new Error('Debes indicar el motivo de la reposición de efectivo (ej. Aporte de sencillo para cambio).');
    }

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que registra el ingreso de efectivo es obligatorio.');
    }

    const descripcionFinal = `[REPOSICIÓN DE EFECTIVO] ${String(motivo).trim()}`;
    return await enTransaccion(async () => {
        const ejecutor = await obtenerUsuarioPorId(usuarioId);
        if (!ejecutor) {
            throw new Error('El usuario que intenta registrar el ingreso no existe o está inactivo.');
        }

        const caja = await getQuery(`SELECT id, usuario_id, estado FROM cajas WHERE id = $1 FOR NO KEY UPDATE`, [cajaId]);
        if (!caja) {
            throw new Error('La caja indicada no existe.');
        }
        if (caja.estado !== 'abierta') {
            throw new Error('No se puede ingresar efectivo porque la caja no está abierta.');
        }
        if (Number(caja.usuario_id) !== Number(ejecutor.id) && !esRolAdministrativo(ejecutor.rol)) {
            throw new Error('Permiso denegado: solo el cajero titular o un Administrador puede ingresar efectivo en este turno.');
        }

        const configNegocio = await obtenerConfiguracionParaMovimiento();
        const regimenSnapshot = configNegocio?.regimen_tributario === 'regimen_general'
            ? 'regimen_general'
            : 'simplificado_control_interno';

        const res = await runQuery(
            `INSERT INTO movimientos (
                caja_id, usuario_id, tipo, categoria_contable,
                subtotal_bruto, descuento_total, monto,
                metodo_pago, monto_efectivo, monto_qr,
                monto_recibido, cambio, tipo_comprobante,
                regimen_tributario, iva_porcentaje, it_porcentaje, iva_monto, it_monto,
                descripcion, estado
             )
             VALUES ($1, $2, 'ingreso', 'aporte_cambio', $3, 0, $4, 'efectivo', $5, 0, $6, 0, 'recibo', $7, 0, 0, 0, 0, $8, 'completado') RETURNING id`,
            [cajaId, ejecutor.id, montoValidado, montoValidado, montoValidado, montoValidado, regimenSnapshot, descripcionFinal]
        );
        const movId = res.lastID;
        await runQuery(
            `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES ($1, 'efectivo', $2, NULL)`,
            [movId, montoValidado]
        );
        return movId;
    });
}

// Anular movimiento con reversión atómica de stock e insumos
async function anularMovimientoConPermiso(adminId, movimientoId, motivoAnulacion) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo el administrador puede anular movimientos.');
    }

    if (!motivoAnulacion || String(motivoAnulacion).trim().length < 3) {
        throw new Error('Debes ingresar un motivo descriptivo y justificado para realizar la anulación.');
    }

    const motivoLimpio = String(motivoAnulacion).trim();

    return await enTransaccion(async () => {
        const mov = await getQuery(`SELECT * FROM movimientos WHERE id = $1 FOR NO KEY UPDATE`, [movimientoId]);
        if (!mov) throw new Error('Movimiento no encontrado.');
        if (mov.estado === 'anulado') throw new Error('Este movimiento ya fue anulado.');

        const caja = await getQuery(`SELECT id, estado FROM cajas WHERE id = $1 FOR NO KEY UPDATE`, [mov.caja_id]);
        if (!caja) {
            throw new Error('La caja asociada al movimiento no existe.');
        }
        if (caja.estado !== 'abierta') {
            throw new Error('No se puede anular un movimiento de una caja cerrada. Reabre la caja primero.');
        }

        const detalles = await allQuery(
            `SELECT d.*, p.tipo_inventario
             FROM detalle_movimientos d
             INNER JOIN productos p ON d.producto_id = p.id
             WHERE d.movimiento_id = $1`,
            [movimientoId]
        );

        for (const det of detalles) {
            if (det.tipo_inventario === 'directo') {
                await runQuery(`UPDATE productos SET stock = ${redondearStock('stock + $1')} WHERE id = $2`, [det.cantidad, det.producto_id]);

                // Restituir en lotes si el producto usa lotes
                await restituirLote(det.producto_id, det.cantidad);

                const prodAct = await getQuery(`SELECT stock, costo FROM productos WHERE id = $1`, [det.producto_id]);
                await runQuery(
                    `INSERT INTO movimientos_productos_directos (
                        producto_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                        costo_unitario, costo_promedio_resultante, monto_total, motivo
                     ) VALUES ($1, $2, $3, 'reingreso_anulacion', $4, $5, $6, $7, $8, $9)`,
                    [
                        det.producto_id,
                        movimientoId,
                        ejecutor.id,
                        det.cantidad,
                        Number(prodAct?.stock || 0),
                        det.costo_unitario,
                        Number(prodAct?.costo ?? det.costo_unitario),
                        redondear2(det.cantidad * det.costo_unitario),
                        `Anulación Ticket #${movimientoId}: ${motivoLimpio}`
                    ]
                );
            } else if (det.tipo_inventario === 'combo') {
                // Si tenía límite activo, restituir el contador restante
                await runQuery(
                    `UPDATE productos
                     SET limite_unidades_restante = ${redondearStock('limite_unidades_restante + $1')}
                     WHERE id = $2 AND limite_maximo_activo = 1`,
                    [det.cantidad, det.producto_id]
                );

                // Revertir stock de los componentes que eran directos leyendo detalle_movimientos_combos
                const componentesCombosVendidos = await allQuery(
                    `SELECT dmc.*, p.tipo_inventario
                     FROM detalle_movimientos_combos dmc
                     INNER JOIN productos p ON dmc.componente_producto_id = p.id
                     WHERE dmc.detalle_movimiento_id = $1`,
                    [det.id]
                );
                for (const comp of componentesCombosVendidos) {
                    if (comp.tipo_inventario === 'directo') {
                        await runQuery(
                            `UPDATE productos SET stock = ${redondearStock('stock + $1')} WHERE id = $2`,
                            [comp.cantidad_total, comp.componente_producto_id]
                        );
                        await restituirLote(comp.componente_producto_id, comp.cantidad_total);
                        const prodAct = await getQuery(`SELECT stock, costo FROM productos WHERE id = $1`, [comp.componente_producto_id]);
                        await runQuery(
                            `INSERT INTO movimientos_productos_directos (
                                producto_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                                costo_unitario, costo_promedio_resultante, monto_total, motivo
                             ) VALUES ($1, $2, $3, 'reingreso_anulacion', $4, $5, $6, $7, $8, $9)`,
                            [
                                comp.componente_producto_id,
                                movimientoId,
                                ejecutor.id,
                                comp.cantidad_total,
                                Number(prodAct?.stock || 0),
                                comp.costo_unitario_congelado,
                                Number(prodAct?.costo ?? comp.costo_unitario_congelado),
                                redondear2(comp.cantidad_total * comp.costo_unitario_congelado),
                                `Anulación Combo Ticket #${movimientoId}: ${motivoLimpio}`
                            ]
                        );
                    }
                }
            }
        }

        // Revertir EXACTAMENTE lo consumido en esa venta leyendo movimientos_insumos (cantidades y costos originales)
        let consumosInsumos = await allQuery(
            `SELECT id, insumo_id, cantidad, costo_unitario
             FROM movimientos_insumos
             WHERE movimiento_id = $1 AND tipo = 'consumo_venta'`,
            [movimientoId]
        );

        // Respaldo para ventas antiguas sin movimiento_id en movimientos_insumos
        if (consumosInsumos.length === 0) {
            const motivoRespaldo = `Venta Ticket #${movimientoId}`;
            consumosInsumos = await allQuery(
                `SELECT id, insumo_id, cantidad, costo_unitario
                 FROM movimientos_insumos
                 WHERE tipo = 'consumo_venta' AND movimiento_id IS NULL
                   AND (motivo LIKE $1 OR motivo LIKE $2)`,
                [`%${motivoRespaldo}`, `%${motivoRespaldo} %`]
            );
        }

        for (const cons of consumosInsumos) {
            await runQuery(
                `UPDATE insumos SET stock_actual = ${redondearStock('stock_actual + $1')} WHERE id = $2`,
                [cons.cantidad, cons.insumo_id]
            );
            const insAct = await getQuery(`SELECT stock_actual, costo_por_unidad FROM insumos WHERE id = $1`, [cons.insumo_id]);
            await runQuery(
                `INSERT INTO movimientos_insumos (
                    insumo_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                    costo_unitario, costo_promedio_resultante, monto_total_compra, motivo
                 ) VALUES ($1, $2, $3, 'reingreso_anulacion', $4, $5, $6, $7, $8, $9)`,
                [
                    cons.insumo_id,
                    movimientoId,
                    ejecutor.id,
                    cons.cantidad,
                    Number(insAct?.stock_actual || 0),
                    cons.costo_unitario,
                    Number(insAct?.costo_por_unidad ?? cons.costo_unitario),
                    redondear2(cons.cantidad * cons.costo_unitario),
                    `Anulación Ticket #${movimientoId}: ${motivoLimpio}`
                ]
            );
        }

        // Si no se encontraron registros de consumo en movimientos_insumos (caso extremo legado),
        // revertir según la receta actual y los modificadores registrados en la venta
        if (consumosInsumos.length === 0) {
            for (const det of detalles) {
                if (det.tipo_inventario === 'receta') {
                    const insumosBaseReceta = await allQuery(
                        `SELECT insumo_id, cantidad_requerida FROM recetas WHERE producto_id = $1`,
                        [det.producto_id]
                    );
                    const modsVendidos = await allQuery(
                        `SELECT insumo_id, cantidad_insumo, insumo_reemplazado_id
                         FROM detalle_movimientos_modificadores
                         WHERE detalle_movimiento_id = $1`,
                        [det.id]
                    );

                    const mapaInsumosAReintegrar = new Map();
                    for (const ib of insumosBaseReceta) {
                        mapaInsumosAReintegrar.set(ib.insumo_id, Number(ib.cantidad_requerida || 0));
                    }

                    for (const mv of modsVendidos) {
                        if (mv.insumo_id) {
                            if (mv.insumo_reemplazado_id) {
                                const cantReemplazada = mapaInsumosAReintegrar.has(mv.insumo_reemplazado_id)
                                    ? mapaInsumosAReintegrar.get(mv.insumo_reemplazado_id)
                                    : Number(mv.cantidad_insumo || 0);
                                mapaInsumosAReintegrar.delete(mv.insumo_reemplazado_id);
                                const cantEfectiva = Number(mv.cantidad_insumo || 0) > 0 ? Number(mv.cantidad_insumo) : cantReemplazada;
                                mapaInsumosAReintegrar.set(mv.insumo_id, cantEfectiva);
                            } else {
                                const prev = mapaInsumosAReintegrar.get(mv.insumo_id) || 0;
                                mapaInsumosAReintegrar.set(mv.insumo_id, Number((prev + Number(mv.cantidad_insumo || 0)).toFixed(4)));
                            }
                        }
                    }

                    for (const [insId, cantPorUnidad] of mapaInsumosAReintegrar.entries()) {
                        const totalReingreso = Number((cantPorUnidad * det.cantidad).toFixed(4));
                        await runQuery(`UPDATE insumos SET stock_actual = ${redondearStock('stock_actual + $1')} WHERE id = $2`, [totalReingreso, insId]);
                        const insAct = await getQuery(`SELECT stock_actual, costo_por_unidad FROM insumos WHERE id = $1`, [insId]);
                        await runQuery(
                            `INSERT INTO movimientos_insumos (
                                insumo_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                                costo_unitario, costo_promedio_resultante, monto_total_compra, motivo
                             ) VALUES ($1, $2, $3, 'reingreso_anulacion', $4, $5, $6, $7, $8, $9)`,
                            [
                                insId,
                                movimientoId,
                                ejecutor.id,
                                totalReingreso,
                                Number(insAct?.stock_actual || 0),
                                Number(insAct?.costo_por_unidad || 0),
                                Number(insAct?.costo_por_unidad || 0),
                                redondear2(totalReingreso * Number(insAct?.costo_por_unidad || 0)),
                                `Anulación Legada Ticket #${movimientoId}: ${motivoLimpio}`
                            ]
                        );
                    }
                }
            }
        }

        const nuevaDesc = `${mov.descripcion} [ANULADO por ${ejecutor.nombre}: ${motivoLimpio}]`;
        await runQuery(
            `UPDATE movimientos
             SET estado = 'anulado',
                 descripcion = $1,
                 anulado_por = $2,
                 fecha_anulacion = CURRENT_TIMESTAMP,
                 motivo_anulacion = $3
             WHERE id = $4`,
            [nuevaDesc, ejecutor.id, motivoLimpio, movimientoId]
        );
        return true;
    });
}

async function obtenerMovimientosCaja(cajaId) {
    return await allQuery(
        `SELECT m.*,
                ${fechaLocal('m.fecha_hora')} as fecha_hora,
                ${fechaLocal('m.fecha_anulacion')} as fecha_anulacion,
                u.nombre as usuario_nombre,
                ua.nombre as anulado_por_nombre
         FROM movimientos m
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         LEFT JOIN usuarios ua ON m.anulado_por = ua.id
         WHERE m.caja_id = $1
         ORDER BY m.id DESC`,
        [cajaId]
    );
}

/**
 * Obtiene el siguiente número correlativo para facturas de venta.
 * @returns {Promise<number>}
 */
async function consultarNumeroFactura() {
    // Conserva el prefijo numérico en comprobantes que incluyen otros caracteres.
    const numero = `SUBSTRING(LTRIM(nro_factura) FROM '^[+-]?[0-9]+')::numeric`;
    const fila = await getQuery(
        `SELECT COALESCE(MAX(${numero}), 0) + 1 AS siguiente_nro
         FROM movimientos
         WHERE tipo_comprobante = 'factura'
           AND ${numero} > 0`
    );
    return fila?.siguiente_nro || 1;
}

async function obtenerSiguienteNumeroFactura() {
    return Number(await consultarNumeroFactura());
}

module.exports = {
    registrarVenta: registrarVentaCompleta,
    registrarVentaCompleta,
    registrarEgreso,
    registrarIngresoEfectivo,
    anularMovimientoConPermiso,
    obtenerMovimientosCaja,
    obtenerSiguienteNumeroFactura
};
