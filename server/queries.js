/**
 * server/queries.js
 * Fachada y barrel principal del backend del sistema POS.
 * Re-exporta los repositorios modulares (auth, configuracion, cajas)
 * y contiene la lógica de negocio de catálogo, inventario, ventas y reportes.
 */

const ExcelJS = require('exceljs');
const repositories = require('./repositories');
const {
    db,
    runQuery,
    getQuery,
    allQuery,
    enTransaccion,
    redondear2,
    numeroPositivo,
    numeroNoNegativo,
    esRolAdministrativo,
    obtenerUsuarioPorId,
    obtenerConfiguracionNegocio
} = repositories;

const {
    calcularCostoPromedioPonderado,
    prorratearDescuentoTicket
} = require('./domain/costos');

const {
    normalizarRegimen,
    validarRegimenYPermisosVenta,
    validarRegimenYPermisosEgreso,
    calcularSnapshotFiscalVenta,
    calcularSnapshotFiscalEgreso
} = require('./domain/fiscal');

// ==========================================
// 2. INSUMOS (MATERIA PRIMA) Y RECETAS (ESCANDALLO / BOM)
// ==========================================
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
    await recalcularCostoCombosQueContienenProducto(productoId);
    return costoActualizado;
}

// Recalcula el costo de un combo sumando el costo de sus componentes
async function recalcularCostoCombo(comboId) {
    const calculo = await getQuery(
        `SELECT COALESCE(SUM(cc.cantidad * p.costo), 0) as nuevo_costo
         FROM combo_componentes cc
         INNER JOIN productos p ON cc.componente_producto_id = p.id
         WHERE cc.combo_producto_id = ?`,
        [comboId]
    );
    const costoActualizado = Number((calculo.nuevo_costo || 0).toFixed(4));
    await runQuery(`UPDATE productos SET costo = ? WHERE id = ?`, [costoActualizado, comboId]);
    return costoActualizado;
}

async function recalcularCostoCombosQueContienenProducto(productoId) {
    const combosAfectados = await allQuery(
        `SELECT DISTINCT combo_producto_id FROM combo_componentes WHERE componente_producto_id = ?`,
        [productoId]
    );
    for (const c of combosAfectados) {
        await recalcularCostoCombo(c.combo_producto_id);
    }
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

// Tabla de factores de conversión métrica para recetas y almacén
const FACTORES_CONVERSION_METRICA = {
    // Masa (base: gramos)
    kilos: { familia: 'masa', factorBase: 1000 },
    kg: { familia: 'masa', factorBase: 1000 },
    gramos: { familia: 'masa', factorBase: 1 },
    g: { familia: 'masa', factorBase: 1 },
    miligramos: { familia: 'masa', factorBase: 0.001 },
    mg: { familia: 'masa', factorBase: 0.001 },
    // Volumen (base: mililitros)
    litros: { familia: 'volumen', factorBase: 1000 },
    l: { familia: 'volumen', factorBase: 1000 },
    mililitros: { familia: 'volumen', factorBase: 1 },
    ml: { familia: 'volumen', factorBase: 1 },
    // Longitud (base: centímetros)
    metros: { familia: 'longitud', factorBase: 100 },
    m: { familia: 'longitud', factorBase: 100 },
    centimetros: { familia: 'longitud', factorBase: 1 },
    cm: { familia: 'longitud', factorBase: 1 },
    // Conteo directo
    unidades: { familia: 'conteo', factorBase: 1 }
};

function convertirCantidadMedida(cantidad, unidadOrigen, unidadDestino) {
    const num = Number(cantidad);
    if (!unidadOrigen || !unidadDestino) return num;
    const uOrig = String(unidadOrigen).trim().toLowerCase();
    const uDest = String(unidadDestino).trim().toLowerCase();
    if (uOrig === uDest) return num;

    const infoOrig = FACTORES_CONVERSION_METRICA[uOrig];
    const infoDest = FACTORES_CONVERSION_METRICA[uDest];

    if (!infoOrig || !infoDest || infoOrig.familia !== infoDest.familia) {
        throw new Error(`No se puede convertir de "${unidadOrigen}" a "${unidadDestino}" porque pertenecen a sistemas de medida distintos.`);
    }

    const cantidadEnBase = num * infoOrig.factorBase;
    const cantidadConvertida = cantidadEnBase / infoDest.factorBase;
    return Number(cantidadConvertida.toFixed(6));
}

// Asignar un insumo a la receta de un producto (con conversión automática a la unidad del almacén, ej. 300 gramos -> 0.3 kilos)
async function asignarIngredienteReceta(productoId, insumoId, cantidadRequerida, unidadReceta = null) {
    const cantValidada = numeroPositivo(cantidadRequerida, 'La cantidad en la receta');

    const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [productoId]);
    if (!prod) throw new Error('Producto no encontrado o inactivo.');

    if (prod.tipo_inventario === 'directo' && Number(prod.stock) > 0) {
        throw new Error(
            `No se puede convertir el producto "${prod.nombre}" a modalidad de receta porque es de inventario directo y aún tiene ${prod.stock} ${prod.unidad_medida || 'unidades'} en stock. Primero debe quedar con stock en 0 o debes crear un producto nuevo para manejarlo por receta.`
        );
    }

    const insumo = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
    if (!insumo) throw new Error('Insumo no encontrado.');

    const cantidadConvertidaAlmacen = unidadReceta
        ? convertirCantidadMedida(cantValidada, unidadReceta, insumo.unidad_medida)
        : cantValidada;

    await runQuery(
        `INSERT INTO recetas (producto_id, insumo_id, cantidad_requerida)
         VALUES (?, ?, ?)
         ON CONFLICT(producto_id, insumo_id) DO UPDATE SET cantidad_requerida = excluded.cantidad_requerida`,
        [productoId, insumoId, cantidadConvertidaAlmacen]
    );

    // Cambiar automáticamente el producto a modalidad 'receta'
    await runQuery(`UPDATE productos SET tipo_inventario = 'receta', stock = NULL WHERE id = ?`, [productoId]);

    // Actualizar el costo del producto según su nueva receta
    const nuevoCosto = await recalcularCostoProductoPorReceta(productoId);
    return {
        productoId,
        insumoId,
        cantidadRequerida: cantidadConvertidaAlmacen,
        unidadAlmacen: insumo.unidad_medida,
        nuevoCostoProducto: nuevoCosto
    };
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
// 3. PRODUCTOS DEL CATÁLOGO Y CATEGORÍAS
// ==========================================
async function obtenerCategorias() {
    return await allQuery(`SELECT id, nombre FROM categorias WHERE activo = 1 ORDER BY nombre ASC`);
}

async function crearCategoria(nombre) {
    if (!nombre || String(nombre).trim() === '') {
        throw new Error('El nombre de la categoría es obligatorio.');
    }
    const nombreLimpio = String(nombre).trim();
    if (nombreLimpio.toLowerCase() === 'todas') {
        throw new Error('"Todas" es una vista general del sistema y no puede usarse como nombre de categoría.');
    }
    await runQuery(`INSERT OR IGNORE INTO categorias (nombre, activo) VALUES (?, 1)`, [nombreLimpio]);
    const cat = await getQuery(`SELECT id, nombre FROM categorias WHERE LOWER(nombre) = LOWER(?) AND activo = 1`, [nombreLimpio]);
    return cat || { id: null, nombre: nombreLimpio };
}

async function crearProductoConInsumos({
    nombre,
    precio,
    categoria = '',
    categorias = [],
    tipoComposicion = 'unitario',
    insumoUnitarioId = null,
    insumosReceta = []
}) {
    if (!nombre || String(nombre).trim() === '') {
        throw new Error('El nombre del producto es obligatorio.');
    }
    const precioValidado = redondear2(numeroPositivo(precio, 'El precio del producto'));

    // Normalizar categorías múltiples: puede venir como array o string separado por comas
    let listaCategorias = [];
    if (Array.isArray(categorias) && categorias.length > 0) {
        listaCategorias = categorias;
    } else if (Array.isArray(categoria)) {
        listaCategorias = categoria;
    } else if (typeof categoria === 'string' && categoria.trim() !== '') {
        listaCategorias = categoria.split(',').map((c) => c.trim()).filter(Boolean);
    }

    // Filtrar vacíos y la palabra reservada 'todas'
    listaCategorias = listaCategorias
        .map((c) => String(c).trim())
        .filter((c) => c !== '' && c.toLowerCase() !== 'todas');

    // Desduplicar manteniendo el primer case encontrado
    const catsUnicas = [];
    const seenCats = new Set();
    for (const c of listaCategorias) {
        if (!seenCats.has(c.toLowerCase())) {
            seenCats.add(c.toLowerCase());
            catsUnicas.push(c);
        }
    }

    const catFinal = catsUnicas.join(', ');

    return await enTransaccion(async () => {
        // Asegurar que cada categoría seleccionada exista en la tabla categorias
        for (const c of catsUnicas) {
            await runQuery(`INSERT OR IGNORE INTO categorias (nombre, activo) VALUES (?, 1)`, [c]);
        }

        if (tipoComposicion === 'unitario') {
            if (!insumoUnitarioId) {
                throw new Error('Debes seleccionar el insumo del inventario para la venta unitaria.');
            }
            const insumo = await getQuery(`SELECT id, nombre, costo_por_unidad, unidad_medida FROM insumos WHERE id = ? AND activo = 1`, [insumoUnitarioId]);
            if (!insumo) {
                throw new Error('El insumo seleccionado para el producto unitario no existe o está inactivo.');
            }
            const costoInicial = Number(insumo.costo_por_unidad || 0);

            const resProd = await runQuery(
                `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
                 VALUES (?, ?, ?, ?, 'unidades', 'receta', NULL, 0, NULL)`,
                [nombre.trim(), precioValidado, costoInicial, catFinal]
            );
            const productoId = resProd.lastID;

            // Relación 1 a 1: 1 unidad del insumo
            await runQuery(
                `INSERT INTO recetas (producto_id, insumo_id, cantidad_requerida) VALUES (?, ?, 1)`,
                [productoId, insumo.id]
            );

            await recalcularCostoProductoPorReceta(productoId);
            return { id: productoId, nombre: nombre.trim(), precio: precioValidado, costo: costoInicial, categoria: catFinal };

        } else if (tipoComposicion === 'receta') {
            if (!Array.isArray(insumosReceta) || insumosReceta.length === 0) {
                throw new Error('Debes agregar al menos un insumo para la receta o ensamblaje.');
            }
            if (insumosReceta.length > 30) {
                throw new Error('Límite excedido: No se pueden agregar más de 30 insumos en una sola receta.');
            }

            const resProd = await runQuery(
                `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
                 VALUES (?, ?, 0, ?, 'unidades', 'receta', NULL, 0, NULL)`,
                [nombre.trim(), precioValidado, catFinal]
            );
            const productoId = resProd.lastID;

            const insumosUnicos = new Set();
            for (const ing of insumosReceta) {
                if (!ing || !ing.insumoId) continue;
                const insumoId = Number(ing.insumoId);
                if (insumosUnicos.has(insumoId)) {
                    throw new Error(`El insumo ID ${insumoId} está duplicado en la receta.`);
                }
                insumosUnicos.add(insumoId);

                const insumo = await getQuery(`SELECT id, nombre, unidad_medida FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
                if (!insumo) throw new Error(`El insumo con ID ${insumoId} no existe.`);

                const cantVal = numeroPositivo(ing.cantidad, `La cantidad del insumo ${insumo.nombre}`);
                const cantidadConvertidaAlmacen = ing.unidadReceta
                    ? convertirCantidadMedida(cantVal, ing.unidadReceta, insumo.unidad_medida)
                    : cantVal;

                await runQuery(
                    `INSERT INTO recetas (producto_id, insumo_id, cantidad_requerida) VALUES (?, ?, ?)`,
                    [productoId, insumoId, cantidadConvertidaAlmacen]
                );
            }

            const costoFinal = await recalcularCostoProductoPorReceta(productoId);
            return { id: productoId, nombre: nombre.trim(), precio: precioValidado, costo: costoFinal, categoria: catFinal };

        } else if (tipoComposicion === 'combo') {
            const componentes = Array.isArray(arguments[0].componentesCombo) ? arguments[0].componentesCombo : [];
            const componentesLimpios = componentes.filter((c) => c && c.productoId && Number(c.cantidad) > 0);
            if (componentesLimpios.length === 0) {
                throw new Error('Debes agregar al menos un producto componente con cantidad mayor a 0 para el combo.');
            }
            if (componentesLimpios.length > 20) {
                throw new Error('Límite excedido: No se pueden agregar más de 20 componentes en un solo combo.');
            }

            const limiteActivo = arguments[0].limiteMaximoActivo ? 1 : 0;
            let limiteTotal = null;
            let limiteRestante = null;
            if (limiteActivo) {
                limiteTotal = Math.floor(numeroPositivo(arguments[0].limiteUnidadesTotal, 'La cantidad máxima de venta del combo'));
                limiteRestante = limiteTotal;
            }

            const fechaInicio = arguments[0].fechaInicioVigencia && String(arguments[0].fechaInicioVigencia).trim() !== ''
                ? String(arguments[0].fechaInicioVigencia).trim()
                : null;
            const fechaFin = arguments[0].fechaFinVigencia && String(arguments[0].fechaFinVigencia).trim() !== ''
                ? String(arguments[0].fechaFinVigencia).trim()
                : null;

            if (fechaInicio && fechaFin && new Date(fechaInicio) > new Date(fechaFin)) {
                throw new Error('La fecha y hora de inicio de vigencia no puede ser posterior a la fecha y hora final.');
            }

            const resProd = await runQuery(
                `INSERT INTO productos (
                    nombre, precio, costo, categoria, unidad_medida, tipo_inventario,
                    stock, stock_minimo, fecha_vencimiento,
                    limite_maximo_activo, limite_unidades_total, limite_unidades_restante,
                    fecha_inicio_vigencia, fecha_fin_vigencia
                ) VALUES (?, ?, 0, ?, 'unidades', 'combo', NULL, 0, NULL, ?, ?, ?, ?, ?)`,
                [
                    nombre.trim(),
                    precioValidado,
                    catFinal,
                    limiteActivo,
                    limiteTotal,
                    limiteRestante,
                    fechaInicio,
                    fechaFin
                ]
            );
            const comboId = resProd.lastID;

            const componentesUnicos = new Set();
            for (const comp of componentesLimpios) {
                const compProdId = Number(comp.productoId);
                if (compProdId === comboId) {
                    throw new Error('Un combo no puede contenerse a sí mismo.');
                }
                if (componentesUnicos.has(compProdId)) {
                    throw new Error(`El producto ID ${compProdId} está duplicado en los componentes del combo.`);
                }
                componentesUnicos.add(compProdId);

                const productoComp = await getQuery(`SELECT id, nombre, tipo_inventario, costo FROM productos WHERE id = ? AND activo = 1`, [compProdId]);
                if (!productoComp) {
                    throw new Error(`El producto componente con ID ${compProdId} no existe o está inactivo.`);
                }
                if (productoComp.tipo_inventario === 'combo') {
                    throw new Error(`El producto "${productoComp.nombre}" es un combo. No se permiten combos anidados.`);
                }

                const cantVal = numeroPositivo(comp.cantidad, `La cantidad del componente ${productoComp.nombre}`);
                await runQuery(
                    `INSERT INTO combo_componentes (combo_producto_id, componente_producto_id, cantidad)
                     VALUES (?, ?, ?)`,
                    [comboId, compProdId, cantVal]
                );
            }

            const costoFinal = await recalcularCostoCombo(comboId);
            return {
                id: comboId,
                nombre: nombre.trim(),
                precio: precioValidado,
                costo: costoFinal,
                categoria: catFinal,
                tipo_inventario: 'combo'
            };

        } else if (tipoComposicion === 'directo') {
            const stockInicial = arguments[0].stockInicial !== undefined && arguments[0].stockInicial !== null && arguments[0].stockInicial !== ''
                ? Number(numeroNoNegativo(arguments[0].stockInicial, 'El stock inicial del producto').toFixed(4))
                : 0;
            const costoInicial = arguments[0].costoInicial !== undefined && arguments[0].costoInicial !== null && arguments[0].costoInicial !== ''
                ? Number(numeroNoNegativo(arguments[0].costoInicial, 'El costo unitario inicial').toFixed(4))
                : 0;
            const stockMinimo = arguments[0].stockMinimo !== undefined && arguments[0].stockMinimo !== null && arguments[0].stockMinimo !== ''
                ? Number(numeroNoNegativo(arguments[0].stockMinimo, 'El stock mínimo').toFixed(4))
                : 0;
            const unidadMedida = arguments[0].unidadMedida && String(arguments[0].unidadMedida).trim() !== ''
                ? String(arguments[0].unidadMedida).trim()
                : 'unidades';
            const fechaVenc = arguments[0].fechaVencimiento && String(arguments[0].fechaVencimiento).trim() !== ''
                ? String(arguments[0].fechaVencimiento).trim()
                : null;
            const usuarioId = arguments[0].usuarioId ? Number(arguments[0].usuarioId) : null;

            const resProd = await runQuery(
                `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
                 VALUES (?, ?, ?, ?, ?, 'directo', ?, ?, ?)`,
                [nombre.trim(), precioValidado, costoInicial, catFinal, unidadMedida, stockInicial, stockMinimo, fechaVenc]
            );
            const productoId = resProd.lastID;

            await runQuery(
                `INSERT INTO movimientos_productos_directos (
                    producto_id, usuario_id, tipo, cantidad, stock_resultante, costo_unitario, costo_promedio_resultante, monto_total, motivo
                 ) VALUES (?, ?, 'inventario_inicial', ?, ?, ?, ?, ?, 'Inventario inicial de creación')`,
                [productoId, usuarioId, stockInicial, stockInicial, costoInicial, costoInicial, redondear2(stockInicial * costoInicial)]
            );

            return {
                id: productoId,
                nombre: nombre.trim(),
                precio: precioValidado,
                costo: costoInicial,
                categoria: catFinal,
                tipo_inventario: 'directo',
                stock: stockInicial
            };

        } else {
            // Venta libre / servicio sin insumo
            const resProd = await runQuery(
                `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
                 VALUES (?, ?, 0, ?, 'unidades', 'libre', NULL, 0, NULL)`,
                [nombre.trim(), precioValidado, catFinal]
            );
            return { id: resProd.lastID, nombre: nombre.trim(), precio: precioValidado, costo: 0, categoria: catFinal };
        }
    });
}

async function crearProducto(nombre, precio, costo = 0, categoria = '', stock = null, unidadMedida = 'unidades', stockMinimo = 0, fechaVencimiento = null, usuarioId = null) {
    if (!nombre || String(nombre).trim() === '') {
        throw new Error('El nombre del producto es obligatorio.');
    }
    const precioValidado = redondear2(numeroPositivo(precio, 'El precio del producto'));
    const costoValidado = redondear2(numeroNoNegativo(costo ?? 0, 'El costo del producto'));
    const stockValidado = (stock !== null && stock !== undefined && stock !== '')
        ? redondear2(numeroNoNegativo(stock, 'El stock inicial del producto'))
        : null;
    const stockMinimoValidado = redondear2(numeroNoNegativo(stockMinimo ?? 0, 'El stock mínimo de alerta'));
    const tipoInventario = stockValidado !== null ? 'directo' : 'libre';

    return await enTransaccion(async () => {
        const res = await runQuery(
            `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nombre.trim(), precioValidado, costoValidado, categoria ? String(categoria).trim() : '', unidadMedida || 'unidades', tipoInventario, stockValidado, stockMinimoValidado, fechaVencimiento || null]
        );
        const prodId = res.lastID;

        if (tipoInventario === 'directo') {
            await runQuery(
                `INSERT INTO movimientos_productos_directos (
                    producto_id, usuario_id, tipo, cantidad, stock_resultante, costo_unitario, costo_promedio_resultante, monto_total, motivo
                 ) VALUES (?, ?, 'inventario_inicial', ?, ?, ?, ?, ?, 'Inventario inicial de creación')`,
                [prodId, usuarioId, stockValidado, stockValidado, costoValidado, costoValidado, redondear2(stockValidado * costoValidado)]
            );
        }

        return prodId;
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

// ==========================================
// 3.5 GESTIÓN DE MODIFICADORES, REEMPLAZOS Y COMPLEMENTOS
// ==========================================
async function obtenerGruposModificadores(soloActivos = true) {
    const filtro = soloActivos ? 'WHERE g.activo = 1' : '';
    const grupos = await allQuery(`
        SELECT g.*
        FROM grupos_modificadores g
        ${filtro}
        ORDER BY g.id ASC
    `);

    if (grupos.length === 0) return [];

    const opciones = await allQuery(`
        SELECT o.*,
               i.nombre as insumo_nombre, i.unidad_medida as insumo_unidad, i.costo_por_unidad as insumo_costo, i.stock_actual as insumo_stock,
               ir.nombre as insumo_reemplazado_nombre, ir.unidad_medida as insumo_reemplazado_unidad
        FROM modificadores_opciones o
        LEFT JOIN insumos i ON o.insumo_id = i.id
        LEFT JOIN insumos ir ON o.insumo_reemplazado_id = ir.id
        WHERE o.activo = 1
        ORDER BY o.es_default DESC, o.id ASC
    `);

    const mapaOpciones = {};
    for (const op of opciones) {
        if (!mapaOpciones[op.grupo_id]) mapaOpciones[op.grupo_id] = [];
        mapaOpciones[op.grupo_id].push({
            id: op.id,
            grupo_id: op.grupo_id,
            nombre: op.nombre,
            insumo_id: op.insumo_id,
            cantidad_insumo: Number(op.cantidad_insumo || 0),
            precio_adicional: Number(op.precio_adicional || 0),
            insumo_reemplazado_id: op.insumo_reemplazado_id,
            es_default: Number(op.es_default) === 1,
            insumo_nombre: op.insumo_nombre || null,
            insumo_unidad: op.insumo_unidad || null,
            insumo_costo: Number(op.insumo_costo || 0),
            insumo_stock: op.insumo_stock !== null ? Number(op.insumo_stock) : null,
            insumo_reemplazado_nombre: op.insumo_reemplazado_nombre || null,
            insumo_reemplazado_unidad: op.insumo_reemplazado_unidad || null
        });
    }

    return grupos.map((g) => ({
        id: g.id,
        nombre: g.nombre,
        tipo_seleccion: g.tipo_seleccion,
        es_obligatorio: Number(g.es_obligatorio) === 1,
        activo: Number(g.activo) === 1,
        opciones: mapaOpciones[g.id] || []
    }));
}

async function crearGrupoModificadores(datos, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede crear grupos de complementos.');
    }

    const nombreLimpio = String(datos.nombre || '').trim();
    if (!nombreLimpio || nombreLimpio.length < 2) {
        throw new Error('Debes ingresar un nombre válido para el grupo de complementos (mínimo 2 caracteres).');
    }

    const tipoSeleccion = datos.tipoSeleccion === 'multiple' ? 'multiple' : 'unica';
    const esObligatorio = datos.esObligatorio ? 1 : 0;
    const opciones = Array.isArray(datos.opciones) ? datos.opciones : [];

    return await enTransaccion(async () => {
        const res = await runQuery(
            `INSERT INTO grupos_modificadores (nombre, tipo_seleccion, es_obligatorio, activo)
             VALUES (?, ?, ?, 1)`,
            [nombreLimpio, tipoSeleccion, esObligatorio]
        );
        const grupoId = res.lastID;

        for (const op of opciones) {
            if (!op || !String(op.nombre || '').trim()) continue;
            const opNombre = String(op.nombre).trim();
            const precioAdicional = redondear2(numeroNoNegativo(op.precioAdicional ?? 0, 'El precio adicional'));
            const cantidadInsumo = redondear2(numeroNoNegativo(op.cantidadInsumo ?? 0, 'La cantidad de insumo'));
            const insumoId = op.insumoId ? Number(op.insumoId) : null;
            const insumoReemplazadoId = op.insumoReemplazadoId ? Number(op.insumoReemplazadoId) : null;
            const esDefault = op.esDefault ? 1 : 0;

            await runQuery(
                `INSERT INTO modificadores_opciones (grupo_id, nombre, insumo_id, cantidad_insumo, precio_adicional, insumo_reemplazado_id, es_default, activo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                [grupoId, opNombre, insumoId, cantidadInsumo, precioAdicional, insumoReemplazadoId, esDefault]
            );
        }

        return grupoId;
    });
}

async function actualizarGrupoModificadores(grupoId, datos, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede modificar grupos de complementos.');
    }

    const idNum = Number(grupoId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
        throw new Error('ID de grupo de modificador inválido.');
    }

    const nombreLimpio = String(datos.nombre || '').trim();
    if (!nombreLimpio || nombreLimpio.length < 2) {
        throw new Error('Debes ingresar un nombre válido para el grupo (mínimo 2 caracteres).');
    }

    const tipoSeleccion = datos.tipoSeleccion === 'multiple' ? 'multiple' : 'unica';
    const esObligatorio = datos.esObligatorio ? 1 : 0;
    const opciones = Array.isArray(datos.opciones) ? datos.opciones : [];

    return await enTransaccion(async () => {
        await runQuery(
            `UPDATE grupos_modificadores
             SET nombre = ?, tipo_seleccion = ?, es_obligatorio = ?
             WHERE id = ?`,
            [nombreLimpio, tipoSeleccion, esObligatorio, idNum]
        );

        // Desactivar opciones anteriores del grupo
        await runQuery(`UPDATE modificadores_opciones SET activo = 0 WHERE grupo_id = ?`, [idNum]);

        for (const op of opciones) {
            if (!op || !String(op.nombre || '').trim()) continue;
            const opNombre = String(op.nombre).trim();
            const precioAdicional = redondear2(numeroNoNegativo(op.precioAdicional ?? 0, 'El precio adicional'));
            const cantidadInsumo = redondear2(numeroNoNegativo(op.cantidadInsumo ?? 0, 'La cantidad de insumo'));
            const insumoId = op.insumoId ? Number(op.insumoId) : null;
            const insumoReemplazadoId = op.insumoReemplazadoId ? Number(op.insumoReemplazadoId) : null;
            const esDefault = op.esDefault ? 1 : 0;

            if (op.id) {
                await runQuery(
                    `UPDATE modificadores_opciones
                     SET nombre = ?, insumo_id = ?, cantidad_insumo = ?, precio_adicional = ?,
                         insumo_reemplazado_id = ?, es_default = ?, activo = 1
                     WHERE id = ? AND grupo_id = ?`,
                    [opNombre, insumoId, cantidadInsumo, precioAdicional, insumoReemplazadoId, esDefault, op.id, idNum]
                );
            } else {
                await runQuery(
                    `INSERT INTO modificadores_opciones (grupo_id, nombre, insumo_id, cantidad_insumo, precio_adicional, insumo_reemplazado_id, es_default, activo)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                    [idNum, opNombre, insumoId, cantidadInsumo, precioAdicional, insumoReemplazadoId, esDefault]
                );
            }
        }

        return true;
    });
}

async function eliminarGrupoModificadores(grupoId, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede eliminar grupos de complementos.');
    }
    const idNum = Number(grupoId);
    return await enTransaccion(async () => {
        await runQuery(`UPDATE grupos_modificadores SET activo = 0 WHERE id = ?`, [idNum]);
        await runQuery(`UPDATE modificadores_opciones SET activo = 0 WHERE grupo_id = ?`, [idNum]);
        await runQuery(`DELETE FROM producto_grupos_modificadores WHERE grupo_id = ?`, [idNum]);
        return true;
    });
}

async function asignarModificadoresAProducto(productoId, grupoIds, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede asignar modificadores.');
    }
    const prodId = Number(productoId);
    if (!Number.isFinite(prodId) || prodId <= 0) {
        throw new Error('ID de producto inválido.');
    }
    const idsValidados = Array.isArray(grupoIds)
        ? grupoIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
        : [];

    return await enTransaccion(async () => {
        await runQuery(`DELETE FROM producto_grupos_modificadores WHERE producto_id = ?`, [prodId]);
        for (const gId of idsValidados) {
            await runQuery(
                `INSERT OR IGNORE INTO producto_grupos_modificadores (producto_id, grupo_id) VALUES (?, ?)`,
                [prodId, gId]
            );
        }
        return true;
    });
}

async function obtenerProductos() {
    const [productos, gruposModificadores, enlaces, todosInsumos, recetasTodas, componentesCombos] = await Promise.all([
        allQuery(`
            SELECT p.*,
                   COUNT(r.id) as num_ingredientes,
                   MIN(i.stock_actual / NULLIF(r.cantidad_requerida, 0)) as min_disponible,
                   i.nombre as limitante_nombre,
                   i.stock_actual as limitante_stock,
                   i.unidad_medida as limitante_unidad
            FROM productos p
            LEFT JOIN recetas r ON p.id = r.producto_id
            LEFT JOIN insumos i ON r.insumo_id = i.id
            WHERE p.activo = 1
            GROUP BY p.id
            ORDER BY p.categoria, p.nombre
        `),
        obtenerGruposModificadores(true),
        allQuery(`SELECT producto_id, grupo_id FROM producto_grupos_modificadores`),
        allQuery(`SELECT id, nombre, unidad_medida, stock_actual, costo_por_unidad FROM insumos WHERE activo = 1`),
        allQuery(`SELECT producto_id, insumo_id, cantidad_requerida FROM recetas`),
        allQuery(`
            SELECT cc.combo_producto_id, cc.componente_producto_id, cc.cantidad,
                   p.nombre as componente_nombre, p.tipo_inventario as componente_tipo,
                   p.stock as componente_stock, p.costo as componente_costo
            FROM combo_componentes cc
            INNER JOIN productos p ON cc.componente_producto_id = p.id
            WHERE p.activo = 1
        `)
    ]);

    const mapaGrupos = new Map(gruposModificadores.map((g) => [g.id, g]));
    const gruposPorProducto = {};
    for (const e of enlaces) {
        if (!gruposPorProducto[e.producto_id]) gruposPorProducto[e.producto_id] = [];
        gruposPorProducto[e.producto_id].push(e.grupo_id);
    }

    const mapaInsumos = new Map(todosInsumos.map((i) => [i.id, i]));
    const recetasPorProducto = {};
    for (const r of recetasTodas) {
        if (!recetasPorProducto[r.producto_id]) recetasPorProducto[r.producto_id] = [];
        recetasPorProducto[r.producto_id].push(r);
    }

    const componentesPorCombo = {};
    for (const cc of componentesCombos) {
        if (!componentesPorCombo[cc.combo_producto_id]) componentesPorCombo[cc.combo_producto_id] = [];
        componentesPorCombo[cc.combo_producto_id].push(cc);
    }

    // Mapa base de productos indexados por ID
    const mapaProductosBase = new Map(productos.map((p) => [p.id, p]));

    const ahora = new Date();

    return productos.map((p) => {
        let unidadesDisponibles = null;
        let insumoLimitante = null;
        let estaVigente = true;
        let motivoNoVigente = null;

        if (p.tipo_inventario === 'libre') {
            unidadesDisponibles = Infinity;
        } else if (p.tipo_inventario === 'directo') {
            unidadesDisponibles = Math.floor(p.stock || 0);
        } else if (p.tipo_inventario === 'receta') {
            if (p.num_ingredientes === 0) {
                unidadesDisponibles = 0;
            } else {
                unidadesDisponibles = p.min_disponible !== null ? Math.max(0, Math.floor(p.min_disponible)) : 0;
                insumoLimitante = p.limitante_nombre
                    ? `${p.limitante_nombre} (${p.limitante_stock} ${p.limitante_unidad} disponibles)`
                    : null;
            }
        } else if (p.tipo_inventario === 'combo') {
            // Validar vigencia temporal si tiene fechas configuradas
            if (p.fecha_inicio_vigencia) {
                const fInicio = new Date(p.fecha_inicio_vigencia);
                if (!isNaN(fInicio.getTime()) && ahora < fInicio) {
                    estaVigente = false;
                    motivoNoVigente = `Promoción inicia el ${fInicio.toLocaleString()}`;
                }
            }
            if (p.fecha_fin_vigencia) {
                const fFin = new Date(p.fecha_fin_vigencia);
                if (!isNaN(fFin.getTime()) && ahora > fFin) {
                    estaVigente = false;
                    motivoNoVigente = `Promoción finalizó el ${fFin.toLocaleString()}`;
                }
            }

            const componentes = componentesPorCombo[p.id] || [];
            if (componentes.length === 0) {
                unidadesDisponibles = 0;
                insumoLimitante = 'Sin componentes definidos';
            } else {
                // Sumar consumo total de insumos y stock directo requeridos por 1 unidad de combo
                const insumosRequeridosCombo = {};
                const productosDirectosRequeridosCombo = {};

                for (const comp of componentes) {
                    const prodComp = mapaProductosBase.get(comp.componente_producto_id);
                    const cantComp = Number(comp.cantidad || 0);
                    if (!prodComp) continue;

                    if (prodComp.tipo_inventario === 'directo') {
                        productosDirectosRequeridosCombo[prodComp.id] = {
                            productoId: prodComp.id,
                            nombre: prodComp.nombre,
                            stock: Number(prodComp.stock || 0),
                            requerido: Number(((productosDirectosRequeridosCombo[prodComp.id]?.requerido || 0) + cantComp).toFixed(4))
                        };
                    } else if (prodComp.tipo_inventario === 'receta') {
                        const recs = recetasPorProducto[prodComp.id] || [];
                        for (const r of recs) {
                            const insumo = mapaInsumos.get(r.insumo_id);
                            if (!insumo) continue;
                            const cantTotalInsumo = Number((cantComp * r.cantidad_requerida).toFixed(4));
                            if (!insumosRequeridosCombo[r.insumo_id]) {
                                insumosRequeridosCombo[r.insumo_id] = {
                                    insumoId: r.insumo_id,
                                    nombre: insumo.nombre,
                                    unidad: insumo.unidad_medida,
                                    stock: Number(insumo.stock_actual || 0),
                                    requerido: 0
                                };
                            }
                            insumosRequeridosCombo[r.insumo_id].requerido = Number(
                                (insumosRequeridosCombo[r.insumo_id].requerido + cantTotalInsumo).toFixed(4)
                            );
                        }
                    }
                }

                let maxPorInventario = Infinity;
                let limitanteDetectado = null;

                // Evaluar limitantes directos
                for (const pId in productosDirectosRequeridosCombo) {
                    const info = productosDirectosRequeridosCombo[pId];
                    if (info.requerido > 0) {
                        const posible = Math.max(0, Math.floor(info.stock / info.requerido));
                        if (posible < maxPorInventario) {
                            maxPorInventario = posible;
                            limitanteDetectado = `${info.nombre} (${info.stock} disponibles)`;
                        }
                    }
                }

                // Evaluar limitantes de insumos
                for (const iId in insumosRequeridosCombo) {
                    const info = insumosRequeridosCombo[iId];
                    if (info.requerido > 0) {
                        const posible = Math.max(0, Math.floor(info.stock / info.requerido));
                        if (posible < maxPorInventario) {
                            maxPorInventario = posible;
                            limitanteDetectado = `${info.nombre} (${info.stock} ${info.unidad} disponibles)`;
                        }
                    }
                }

                if (maxPorInventario === Infinity) maxPorInventario = 0;

                // Aplicar restricción de límite máximo si está activo
                if (Number(p.limite_maximo_activo) === 1) {
                    const restante = Math.max(0, Math.floor(p.limite_unidades_restante ?? 0));
                    unidadesDisponibles = Math.min(maxPorInventario, restante);
                    if (restante <= 0) {
                        insumoLimitante = 'Límite de venta alcanzado (0 combos restantes)';
                    } else if (restante < maxPorInventario) {
                        insumoLimitante = `Límite configurado (${restante} restantes)`;
                    } else {
                        insumoLimitante = limitanteDetectado;
                    }
                } else {
                    unidadesDisponibles = maxPorInventario;
                    insumoLimitante = limitanteDetectado;
                }
            }
        }

        const idsGrupos = gruposPorProducto[p.id] || [];
        const gruposAsignados = idsGrupos
            .map((id) => mapaGrupos.get(id))
            .filter(Boolean);

        const {
            num_ingredientes,
            min_disponible,
            limitante_nombre,
            limitante_stock,
            limitante_unidad,
            ...productoLimpio
        } = p;

        return {
            ...productoLimpio,
            unidades_disponibles: unidadesDisponibles,
            insumo_limitante: insumoLimitante,
            esta_vigente: estaVigente,
            motivo_no_vigente: motivoNoVigente,
            componentes_combo: componentesPorCombo[p.id] || [],
            grupos_modificadores_ids: idsGrupos,
            grupos_modificadores: gruposAsignados
        };
    });
}



async function registrarVentaCompleta(cajaId, items, metodoPago, montoRecibido = null, descripcion = 'Venta en mostrador', usuarioId = null, cambioEntregado = null, opcionesExtra = {}) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('La venta debe incluir al menos un producto.');
    }

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que registra la venta es obligatorio.');
    }

    if (!['efectivo', 'qr', 'mixto'].includes(metodoPago)) {
        throw new Error("Método de pago inválido. Debe ser 'efectivo', 'qr' o 'mixto'.");
    }

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

        const claveAgrupacion = `${prodId}__${modsNormalizados.join('_')}`;
        if (!mapaItemsAgrupados.has(claveAgrupacion)) {
            mapaItemsAgrupados.set(claveAgrupacion, {
                productoId: prodId,
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
             WHERE c.id = ?`,
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
            const { productoId: prodId, modificadoresIds, cantidadTotal } = itemAgrupado;
            const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [prodId]);
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
                     WHERE cc.combo_producto_id = ? AND p.activo = 1`,
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
                     WHERE r.producto_id = ?`,
                    [prod.id]
                );
            }

            // Validar y cargar modificadores
            let opcionesModificadores = [];
            if (modificadoresIds.length > 0) {
                const placeholders = modificadoresIds.map(() => '?').join(',');
                opcionesModificadores = await allQuery(
                    `SELECT o.*, g.nombre as grupo_nombre, g.tipo_seleccion, g.es_obligatorio,
                            i.nombre as insumo_nombre, i.stock_actual as insumo_stock, i.costo_por_unidad as insumo_costo, i.unidad_medida as insumo_unidad,
                            ir.costo_por_unidad as insumo_reemplazado_costo, ir.nombre as insumo_reemplazado_nombre
                     FROM modificadores_opciones o
                     INNER JOIN grupos_modificadores g ON o.grupo_id = g.id
                     LEFT JOIN insumos i ON o.insumo_id = i.id
                     LEFT JOIN insumos ir ON o.insumo_reemplazado_id = ir.id
                     WHERE o.id IN (${placeholders}) AND o.activo = 1 AND g.activo = 1`,
                    modificadoresIds
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
                        const cantReemplazada = mapaInsumosPorUnidad.has(modOp.insumo_reemplazado_id)
                            ? mapaInsumosPorUnidad.get(modOp.insumo_reemplazado_id).cantidad
                            : cantMod;
                        const costoReemplazado = Number(modOp.insumo_reemplazado_costo || 0);

                        mapaInsumosPorUnidad.delete(modOp.insumo_reemplazado_id);
                        const cantEfectiva = cantMod > 0 ? cantMod : cantReemplazada;
                        mapaInsumosPorUnidad.set(modOp.insumo_id, {
                            insumoId: modOp.insumo_id,
                            cantidad: cantEfectiva,
                            nombre: modOp.insumo_nombre,
                            unidad: modOp.insumo_unidad,
                            costoUnitario: costoInsumoMod
                        });
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
                                cantidadTotalRequerida: 0
                            };
                        }
                        consumoAcumuladoDirecto[comp.componente_producto_id].cantidadTotalRequerida = Number(
                            (consumoAcumuladoDirecto[comp.componente_producto_id].cantidadTotalRequerida + cantTotalComp).toFixed(4)
                        );
                    } else if (comp.componente_tipo === 'receta') {
                        // Descomponer en sus insumos
                        const recComp = await allQuery(
                            `SELECT r.insumo_id, r.cantidad_requerida, i.nombre, i.unidad_medida, i.costo_por_unidad
                             FROM recetas r
                             INNER JOIN insumos i ON r.insumo_id = i.id
                             WHERE r.producto_id = ?`,
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

            const subtotal = redondear2(precioUnitario * cantidadTotal);
            subtotalBruto = redondear2(subtotalBruto + subtotal);

            itemsProcesados.push({
                productoId: prod.id,
                nombre: prod.nombre,
                cantidad: cantidadTotal,
                precioUnitario,
                costoUnitario,
                subtotal,
                tipoInventario: prod.tipo_inventario,
                modificadores: modificadoresDetalle,
                modificadoresTexto: textoModificadores,
                componentesCombo: componentesDetalleCombo,
                limiteMaximoActivo: Number(prod.limite_maximo_activo) === 1
            });
        }

        // Aplicar descuento opcional si fue enviado
        const descuentoTotal = redondear2(numeroNoNegativo(opcionesExtra?.descuento ?? 0, 'El descuento de la venta'));
        if (descuentoTotal > 0 && descuentoTotal >= subtotalBruto) {
            throw new Error(`El descuento (Bs ${descuentoTotal.toFixed(2)}) no puede ser igual ni mayor al subtotal de la venta (Bs ${subtotalBruto.toFixed(2)}).`);
        }
        const montoTotal = redondear2(subtotalBruto - descuentoTotal);

        // 3. Validar montos por método de pago (efectivo, qr o mixto), monto recibido y cambio entregado
        let cambio = 0;
        let recibidoFinal = montoTotal;
        let montoEfectivo = 0;
        let montoQr = 0;
        const referenciaQr = opcionesExtra?.referenciaQr && String(opcionesExtra.referenciaQr).trim() !== ''
            ? String(opcionesExtra.referenciaQr).trim()
            : null;

        if (metodoPago === 'efectivo') {
            montoEfectivo = montoTotal;
            montoQr = 0;
            const tieneMontoRecibido = montoRecibido !== null && montoRecibido !== undefined && montoRecibido !== '';
            const tieneCambioEntregado = cambioEntregado !== null && cambioEntregado !== undefined && cambioEntregado !== '';

            if (tieneMontoRecibido) {
                recibidoFinal = redondear2(numeroNoNegativo(montoRecibido, 'El monto recibido'));
                if (recibidoFinal < montoTotal) {
                    throw new Error(`El monto recibido (${recibidoFinal}) es menor al total a cobrar (${montoTotal}).`);
                }
            } else {
                recibidoFinal = montoTotal;
            }

            if (tieneCambioEntregado) {
                cambio = redondear2(numeroNoNegativo(cambioEntregado, 'El monto de cambio entregado'));
                if (Math.abs((recibidoFinal - cambio) - montoTotal) > 0.01) {
                    throw new Error(
                        `El cambio entregado (${cambio}) no cuadra con el monto recibido (${recibidoFinal}) y el total a cobrar (${montoTotal}).`
                    );
                }
            } else {
                cambio = redondear2(recibidoFinal - montoTotal);
            }
        } else if (metodoPago === 'qr') {
            montoEfectivo = 0;
            montoQr = montoTotal;
            recibidoFinal = montoTotal;
            cambio = 0;
        } else if (metodoPago === 'mixto') {
            montoEfectivo = redondear2(numeroPositivo(opcionesExtra?.montoEfectivo, 'El monto en efectivo del pago mixto'));
            montoQr = redondear2(numeroPositivo(opcionesExtra?.montoQr, 'El monto por QR del pago mixto'));

            if (Math.abs((montoEfectivo + montoQr) - montoTotal) > 0.01) {
                throw new Error(
                    `En un pago mixto, la suma de Efectivo (Bs ${montoEfectivo.toFixed(2)}) + QR (Bs ${montoQr.toFixed(2)}) debe cuadrar exactamente con el total a cobrar (Bs ${montoTotal.toFixed(2)}).`
                );
            }

            const tieneMontoRecibido = montoRecibido !== null && montoRecibido !== undefined && montoRecibido !== '';
            if (tieneMontoRecibido) {
                const billeteEfectivo = redondear2(numeroNoNegativo(montoRecibido, 'El efectivo entregado por el cliente'));
                if (billeteEfectivo < montoEfectivo) {
                    throw new Error(
                        `El billete/efectivo recibido (Bs ${billeteEfectivo.toFixed(2)}) es menor a la porción en efectivo del pago mixto (Bs ${montoEfectivo.toFixed(2)}).`
                    );
                }
                cambio = redondear2(billeteEfectivo - montoEfectivo);
                recibidoFinal = redondear2(billeteEfectivo + montoQr);
            } else {
                cambio = 0;
                recibidoFinal = montoTotal;
            }
        }

        // Datos de facturación, validación de permisos en backend y snapshot tributario congelado al momento de la venta
        const configNegocio = await obtenerConfiguracionNegocio();
        const regimenSnapshot = configNegocio?.regimen_tributario === 'regimen_general'
            ? 'regimen_general'
            : 'simplificado_control_interno';

        const conFactura = opcionesExtra?.tipoComprobante === 'factura' || Boolean(opcionesExtra?.conFactura);
        if (conFactura) {
            if (regimenSnapshot === 'simplificado_control_interno') {
                throw new Error(
                    'Operación no permitida: El negocio opera en Régimen Simplificado / Control Interno y no puede emitir ni registrar ventas con factura fiscal.'
                );
            }
            if (Number(configNegocio?.emite_factura ?? 1) !== 1) {
                throw new Error(
                    'Operación no permitida: La emisión/registro de facturas en ventas está deshabilitada en la configuración contable del negocio.'
                );
            }
            if (Number(operador.puede_registrar_respaldo_fiscal ?? 1) !== 1) {
                throw new Error(
                    `Permiso denegado: El usuario "${operador.nombre}" no tiene autorización para registrar ventas con factura fiscal.`
                );
            }
            if (Number(caja.habilita_respaldo_fiscal ?? 1) !== 1) {
                throw new Error(
                    `Operación no permitida: La estación "${caja.caja_fisica_nombre}" tiene deshabilitado el registro de respaldo fiscal.`
                );
            }
        }

        const tipoComprobante = conFactura ? 'factura' : 'recibo';
        const ivaPorcCfg = Number(configNegocio?.iva_porcentaje ?? 13);
        const itPorcCfg = Number(configNegocio?.it_porcentaje ?? 3);
        const itBaseCfg = configNegocio?.it_base === 'solo_facturadas' ? 'solo_facturadas' : 'todas_las_ventas';

        let ivaPorcSnapshot = 0;
        let itPorcSnapshot = 0;
        let ivaMontoSnapshot = 0;
        let itMontoSnapshot = 0;

        if (regimenSnapshot === 'regimen_general') {
            if (tipoComprobante === 'factura') {
                ivaPorcSnapshot = ivaPorcCfg;
                ivaMontoSnapshot = redondear2(montoTotal * (ivaPorcCfg / 100));
            }
            if (itBaseCfg === 'todas_las_ventas' || tipoComprobante === 'factura') {
                itPorcSnapshot = itPorcCfg;
                itMontoSnapshot = redondear2(montoTotal * (itPorcCfg / 100));
            }
        }

        const nroFactura = conFactura && opcionesExtra?.nroFactura && String(opcionesExtra.nroFactura).trim() !== ''
            ? String(opcionesExtra.nroFactura).trim()
            : null;
        const cufAutorizacion = conFactura && opcionesExtra?.cufAutorizacion && String(opcionesExtra.cufAutorizacion).trim() !== ''
            ? String(opcionesExtra.cufAutorizacion).trim()
            : null;
        const clienteNitCi = conFactura && opcionesExtra?.clienteNitCi && String(opcionesExtra.clienteNitCi).trim() !== ''
            ? String(opcionesExtra.clienteNitCi).trim()
            : null;
        const clienteRazonSocial = conFactura && opcionesExtra?.clienteRazonSocial && String(opcionesExtra.clienteRazonSocial).trim() !== ''
            ? String(opcionesExtra.clienteRazonSocial).trim()
            : null;

        const movRes = await runQuery(
            `INSERT INTO movimientos (
                caja_id, usuario_id, tipo, categoria_contable,
                subtotal_bruto, descuento_total, monto,
                metodo_pago, monto_efectivo, monto_qr, referencia_qr,
                monto_recibido, cambio,
                tipo_comprobante, nro_factura, cuf_autorizacion, cliente_nit_ci, cliente_razon_social,
                regimen_tributario, iva_porcentaje, it_porcentaje, iva_monto, it_monto,
                descripcion, estado
             )
             VALUES (?, ?, 'ingreso', 'venta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completado')`,
            [
                cajaId,
                operador.id,
                subtotalBruto,
                descuentoTotal,
                montoTotal,
                metodoPago,
                montoEfectivo,
                montoQr,
                referenciaQr,
                recibidoFinal,
                cambio,
                tipoComprobante,
                nroFactura,
                cufAutorizacion,
                clienteNitCi,
                clienteRazonSocial,
                regimenSnapshot,
                ivaPorcSnapshot,
                itPorcSnapshot,
                ivaMontoSnapshot,
                itMontoSnapshot,
                descripcion
            ]
        );
        const movimientoId = movRes.lastID;

        // Registrar desglose en tabla movimientos_pagos (fuente de verdad del dinero)
        if (montoEfectivo > 0) {
            await runQuery(
                `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES (?, 'efectivo', ?, NULL)`,
                [movimientoId, montoEfectivo]
            );
        }
        if (montoQr > 0) {
            await runQuery(
                `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES (?, 'qr', ?, ?)`,
                [movimientoId, montoQr, referenciaQr]
            );
        }

        // 4. Descuento atómico de stock directo en productos y registro de detalle con modificadores y combos
        for (const det of itemsProcesados) {
            const rDet = await runQuery(
                `INSERT INTO detalle_movimientos (movimiento_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [movimientoId, det.productoId, det.cantidad, det.precioUnitario, det.costoUnitario, det.subtotal]
            );
            const detalleMovimientoId = rDet.lastID;

            for (const mod of det.modificadores) {
                await runQuery(
                    `INSERT INTO detalle_movimientos_modificadores (
                        detalle_movimiento_id, modificador_opcion_id, nombre, precio_adicional, costo_adicional, insumo_id, cantidad_insumo, insumo_reemplazado_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

            // Si es combo, registrar auditoría histórica y descontar su límite si está activo
            if (det.tipoInventario === 'combo') {
                for (const comp of det.componentesCombo) {
                    await runQuery(
                        `INSERT INTO detalle_movimientos_combos (
                            detalle_movimiento_id, componente_producto_id, cantidad_unitaria, cantidad_total, costo_unitario_congelado
                        ) VALUES (?, ?, ?, ?, ?)`,
                        [
                            detalleMovimientoId,
                            comp.componenteProductoId,
                            comp.cantidadUnitaria,
                            comp.cantidadTotal,
                            comp.costoUnitario
                        ]
                    );
                }

                if (det.limiteMaximoActivo) {
                    const rLim = await runQuery(
                        `UPDATE productos
                         SET limite_unidades_restante = ROUND(limite_unidades_restante - ?, 4)
                         WHERE id = ? AND limite_unidades_restante >= ?`,
                        [det.cantidad, det.productoId, det.cantidad]
                    );
                    if (rLim.changes === 0) {
                        throw new Error(`Se ha agotado el límite de venta disponible para la promoción "${det.nombre}".`);
                    }
                }
            }

            if (det.tipoInventario === 'directo') {
                const r = await runQuery(
                    `UPDATE productos SET stock = ROUND(stock - ?, 4) WHERE id = ? AND stock >= ?`,
                    [det.cantidad, det.productoId, det.cantidad]
                );
                if (r.changes === 0) {
                    throw new Error(`Stock insuficiente para ${det.nombre}`);
                }
                const prodAct = await getQuery(`SELECT stock, costo FROM productos WHERE id = ?`, [det.productoId]);
                await runQuery(
                    `INSERT INTO movimientos_productos_directos (
                        producto_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                        costo_unitario, costo_promedio_resultante, monto_total, motivo
                     ) VALUES (?, ?, ?, 'venta', ?, ?, ?, ?, ?, ?)`,
                    [
                        det.productoId,
                        movimientoId,
                        operador.id,
                        det.cantidad,
                        Number(prodAct?.stock || 0),
                        det.costoUnitario,
                        Number(prodAct?.costo ?? det.costoUnitario),
                        redondear2(det.cantidad * det.costoUnitario),
                        `Venta Ticket #${movimientoId}`
                    ]
                );
            }
        }

        // 4.1 Descuento atómico de stock directo consumido por componentes de combos
        for (const pId in consumoAcumuladoDirecto) {
            const info = consumoAcumuladoDirecto[pId];
            const r = await runQuery(
                `UPDATE productos SET stock = ROUND(stock - ?, 4) WHERE id = ? AND stock >= ?`,
                [info.cantidadTotalRequerida, info.productoId, info.cantidadTotalRequerida]
            );
            if (r.changes === 0) {
                throw new Error(
                    `Stock insuficiente del componente "${info.nombre}" para armar el combo (se requieren ${info.cantidadTotalRequerida} unidades).`
                );
            }
            const prodAct = await getQuery(`SELECT stock, costo FROM productos WHERE id = ?`, [info.productoId]);
            const costoComp = Number(info.costoUnitario || 0);
            await runQuery(
                `INSERT INTO movimientos_productos_directos (
                    producto_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                    costo_unitario, costo_promedio_resultante, monto_total, motivo
                 ) VALUES (?, ?, ?, 'venta', ?, ?, ?, ?, ?, ?)`,
                [
                    info.productoId,
                    movimientoId,
                    operador.id,
                    info.cantidadTotalRequerida,
                    Number(prodAct?.stock || 0),
                    costoComp,
                    Number(prodAct?.costo ?? costoComp),
                    redondear2(info.cantidadTotalRequerida * costoComp),
                    `Venta Combo Ticket #${movimientoId}`
                ]
            );
        }

        // 5. Descuento atómico de stock_actual en insumos (recetas y modificadores) y registro con movimiento_id y saldo resultante
        for (const insumoId in consumoAcumuladoInsumos) {
            const info = consumoAcumuladoInsumos[insumoId];
            const r = await runQuery(
                `UPDATE insumos SET stock_actual = ROUND(stock_actual - ?, 4) WHERE id = ? AND stock_actual >= ?`,
                [info.cantidadTotalRequerida, info.insumoId, info.cantidadTotalRequerida]
            );
            if (r.changes === 0) {
                throw new Error(
                    `Insumo insuficiente (${info.nombre}): el pedido requiere ${info.cantidadTotalRequerida} ${info.unidad}.`
                );
            }
            const insAct = await getQuery(`SELECT stock_actual, costo_por_unidad FROM insumos WHERE id = ?`, [info.insumoId]);
            const stockResIns = Number(insAct?.stock_actual || 0);
            const cppResIns = Number(insAct?.costo_por_unidad ?? info.costoUnitario);

            await runQuery(
                `INSERT INTO movimientos_insumos (
                    insumo_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                    costo_unitario, costo_promedio_resultante, monto_total_compra, motivo
                 )
                 VALUES (?, ?, ?, 'consumo_venta', ?, ?, ?, ?, ?, ?)`,
                [
                    info.insumoId,
                    movimientoId,
                    operador.id,
                    info.cantidadTotalRequerida,
                    stockResIns,
                    info.costoUnitario,
                    cppResIns,
                    redondear2(info.cantidadTotalRequerida * info.costoUnitario),
                    `Venta Ticket #${movimientoId}`
                ]
            );
        }

        return {
            movimientoId,
            subtotalBruto,
            descuentoTotal,
            montoTotal,
            metodoPago,
            montoEfectivo,
            montoQr,
            referenciaQr,
            montoRecibido: recibidoFinal,
            cambio,
            tipoComprobante,
            nroFactura,
            clienteNitCi,
            clienteRazonSocial,
            regimenTributario: regimenSnapshot,
            ivaPorcentaje: ivaPorcSnapshot,
            itPorcentaje: itPorcSnapshot,
            ivaMonto: ivaMontoSnapshot,
            itMonto: itMontoSnapshot,
            items: itemsProcesados.map((it) => ({
                productoId: it.productoId,
                nombre: it.nombre,
                cantidad: it.cantidad,
                precioUnitario: it.precioUnitario,
                subtotal: it.subtotal,
                modificadoresTexto: it.modificadoresTexto
            }))
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
             WHERE c.id = ?`,
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

        const configNegocio = await obtenerConfiguracionNegocio();
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
                tipo_comprobante, nro_factura, cliente_nit_ci, cliente_razon_social,
                regimen_tributario, iva_porcentaje, it_porcentaje, iva_monto, it_monto,
                descripcion, estado
             )
             VALUES (?, ?, 'egreso', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'completado')`,
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
            `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES (?, ?, ?, ?)`,
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

        const caja = await getQuery(`SELECT id, usuario_id, estado FROM cajas WHERE id = ?`, [cajaId]);
        if (!caja) {
            throw new Error('La caja indicada no existe.');
        }
        if (caja.estado !== 'abierta') {
            throw new Error('No se puede ingresar efectivo porque la caja no está abierta.');
        }
        if (Number(caja.usuario_id) !== Number(ejecutor.id) && !esRolAdministrativo(ejecutor.rol)) {
            throw new Error('Permiso denegado: solo el cajero titular o un Administrador puede ingresar efectivo en este turno.');
        }

        const configNegocio = await obtenerConfiguracionNegocio();
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
             VALUES (?, ?, 'ingreso', 'aporte_cambio', ?, 0, ?, 'efectivo', ?, 0, ?, 0, 'recibo', ?, 0, 0, 0, 0, ?, 'completado')`,
            [cajaId, ejecutor.id, montoValidado, montoValidado, montoValidado, montoValidado, regimenSnapshot, descripcionFinal]
        );
        const movId = res.lastID;
        await runQuery(
            `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES (?, 'efectivo', ?, NULL)`,
            [movId, montoValidado]
        );
        return movId;
    });
}

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
        const mov = await getQuery(`SELECT * FROM movimientos WHERE id = ?`, [movimientoId]);
        if (!mov) throw new Error('Movimiento no encontrado.');
        if (mov.estado === 'anulado') throw new Error('Este movimiento ya fue anulado.');

        const caja = await getQuery(`SELECT id, estado FROM cajas WHERE id = ?`, [mov.caja_id]);
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
             WHERE d.movimiento_id = ?`,
            [movimientoId]
        );

        for (const det of detalles) {
            if (det.tipo_inventario === 'directo') {
                await runQuery(`UPDATE productos SET stock = ROUND(stock + ?, 4) WHERE id = ?`, [det.cantidad, det.producto_id]);
                const prodAct = await getQuery(`SELECT stock, costo FROM productos WHERE id = ?`, [det.producto_id]);
                await runQuery(
                    `INSERT INTO movimientos_productos_directos (
                        producto_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                        costo_unitario, costo_promedio_resultante, monto_total, motivo
                     ) VALUES (?, ?, ?, 'reingreso_anulacion', ?, ?, ?, ?, ?, ?)`,
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
                     SET limite_unidades_restante = ROUND(limite_unidades_restante + ?, 4)
                     WHERE id = ? AND limite_maximo_activo = 1`,
                    [det.cantidad, det.producto_id]
                );

                // Revertir stock de los componentes que eran directos leyendo detalle_movimientos_combos
                const componentesCombosVendidos = await allQuery(
                    `SELECT dmc.*, p.tipo_inventario
                     FROM detalle_movimientos_combos dmc
                     INNER JOIN productos p ON dmc.componente_producto_id = p.id
                     WHERE dmc.detalle_movimiento_id = ?`,
                    [det.id]
                );
                for (const comp of componentesCombosVendidos) {
                    if (comp.tipo_inventario === 'directo') {
                        await runQuery(
                            `UPDATE productos SET stock = ROUND(stock + ?, 4) WHERE id = ?`,
                            [comp.cantidad_total, comp.componente_producto_id]
                        );
                        const prodAct = await getQuery(`SELECT stock, costo FROM productos WHERE id = ?`, [comp.componente_producto_id]);
                        await runQuery(
                            `INSERT INTO movimientos_productos_directos (
                                producto_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                                costo_unitario, costo_promedio_resultante, monto_total, motivo
                             ) VALUES (?, ?, ?, 'reingreso_anulacion', ?, ?, ?, ?, ?, ?)`,
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
             WHERE movimiento_id = ? AND tipo = 'consumo_venta'`,
            [movimientoId]
        );

        // Respaldo para ventas antiguas sin movimiento_id en movimientos_insumos
        if (consumosInsumos.length === 0) {
            const motivoRespaldo = `Venta Ticket #${movimientoId}`;
            consumosInsumos = await allQuery(
                `SELECT id, insumo_id, cantidad, costo_unitario
                 FROM movimientos_insumos
                 WHERE movimiento_id IS NULL AND tipo = 'consumo_venta' AND motivo = ?`,
                [motivoRespaldo]
            );
            if (consumosInsumos.length > 0) {
                console.warn(
                    `[AVISO AUDITORÍA] Anulación Ticket #${movimientoId}: se utilizó el respaldo por motivo ("${motivoRespaldo}") para revertir ${consumosInsumos.length} movimiento(s) de insumos antiguos sin movimiento_id.`
                );
            }
        }

        for (const cons of consumosInsumos) {
            const cantidadDevolver = Number(Number(cons.cantidad).toFixed(4));
            const costoOriginal = Number(cons.costo_unitario ?? 0);
            await runQuery(
                `UPDATE insumos SET stock_actual = ROUND(stock_actual + ?, 4) WHERE id = ?`,
                [cantidadDevolver, cons.insumo_id]
            );
            const insAct = await getQuery(`SELECT stock_actual, costo_por_unidad FROM insumos WHERE id = ?`, [cons.insumo_id]);
            const stockResIns = Number(insAct?.stock_actual || 0);
            const cppResIns = Number(insAct?.costo_por_unidad ?? costoOriginal);

            await runQuery(
                `INSERT INTO movimientos_insumos (
                    insumo_id, movimiento_id, usuario_id, tipo, cantidad, stock_resultante,
                    costo_unitario, costo_promedio_resultante, monto_total_compra, motivo
                 )
                 VALUES (?, ?, ?, 'reingreso_anulacion', ?, ?, ?, ?, ?, ?)`,
                [
                    cons.insumo_id,
                    movimientoId,
                    ejecutor.id,
                    cantidadDevolver,
                    stockResIns,
                    costoOriginal,
                    cppResIns,
                    redondear2(cantidadDevolver * costoOriginal),
                    `Anulación Ticket #${movimientoId}`
                ]
            );
        }

        const nuevaDesc = `${mov.descripcion} [ANULADO: ${motivoLimpio}]`;
        await runQuery(
            `UPDATE movimientos
             SET estado = 'anulado',
                 descripcion = ?,
                 anulado_por = ?,
                 fecha_anulacion = CURRENT_TIMESTAMP,
                 motivo_anulacion = ?
             WHERE id = ?`,
            [nuevaDesc, ejecutor.id, motivoLimpio, movimientoId]
        );
        return true;
    });
}

async function obtenerMovimientosCaja(cajaId) {
    return await allQuery(
        `SELECT m.*,
                datetime(m.fecha_hora, 'localtime') as fecha_hora,
                datetime(m.fecha_anulacion, 'localtime') as fecha_anulacion,
                u.nombre as usuario_nombre,
                ua.nombre as anulado_por_nombre
         FROM movimientos m
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         LEFT JOIN usuarios ua ON m.anulado_por = ua.id
         WHERE m.caja_id = ?
         ORDER BY m.id DESC`,
        [cajaId]
    );
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

// ==========================================
// 6. ESTADÍSTICAS Y CONTABILIDAD (PANEL ADMIN)
// ==========================================
async function obtenerEstadisticasCaja(cajaId) {
    const config = await obtenerConfiguracionNegocio();
    const ivaPorc = Number(config?.iva_porcentaje ?? 13);
    const itPorc = Number(config?.it_porcentaje ?? 3);
    const itBase = config?.it_base === 'solo_facturadas' ? 'solo_facturadas' : 'todas_las_ventas';

    // Solo contamos ventas comerciales de productos para no distorsionar ingresos con reposiciones de efectivo.
    // Los importes de IVA e IT respetan el snapshot congelado en cada movimiento al momento de la venta.
    const kpiVentas = await getQuery(
        `SELECT COUNT(m.id) as cantidad_tickets,
                COALESCE(SUM(m.subtotal_bruto), 0) as subtotal_bruto_ventas,
                COALESCE(SUM(m.descuento_total), 0) as descuentos_totales,
                COALESCE(SUM(m.monto), 0) as ventas_totales,
                COALESCE(SUM(CASE WHEN m.tipo_comprobante = 'factura' THEN m.monto ELSE 0 END), 0) as ventas_facturadas,
                COALESCE(SUM(CASE WHEN COALESCE(m.tipo_comprobante, 'recibo') != 'factura' THEN m.monto ELSE 0 END), 0) as ventas_recibo,
                COALESCE(SUM(
                    CASE
                        WHEN m.regimen_tributario IS NOT NULL THEN COALESCE(m.iva_monto, 0)
                        WHEN m.tipo_comprobante = 'factura' THEN ROUND(m.monto * (? / 100.0), 2)
                        ELSE 0
                    END
                ), 0) as debito_fiscal_iva,
                COALESCE(SUM(
                    CASE
                        WHEN m.regimen_tributario IS NOT NULL THEN COALESCE(m.it_monto, 0)
                        WHEN m.tipo_comprobante = 'factura' THEN ROUND(m.monto * (? / 100.0), 2)
                        ELSE 0
                    END
                ), 0) as impuesto_transacciones_it
         FROM movimientos m
         WHERE m.caja_id = ? AND m.tipo = 'ingreso' AND m.estado = 'completado'
           AND COALESCE(m.categoria_contable, 'venta') = 'venta'
           AND EXISTS (SELECT 1 FROM detalle_movimientos d WHERE d.movimiento_id = m.id)`,
        [ivaPorc, itPorc, cajaId]
    );

    const kpiCostos = await getQuery(
        `SELECT COALESCE(SUM(d.cantidad * d.costo_unitario), 0) as costo_total_ventas
         FROM detalle_movimientos d
         INNER JOIN movimientos m ON d.movimiento_id = m.id
         WHERE m.caja_id = ? AND m.estado = 'completado'`,
        [cajaId]
    );

    const kpiEgresos = await getQuery(
        `SELECT COALESCE(SUM(monto), 0) as total_egresos,
                COALESCE(SUM(CASE WHEN tipo_comprobante = 'factura' THEN monto ELSE 0 END), 0) as egresos_facturados,
                COALESCE(SUM(
                    CASE
                        WHEN regimen_tributario IS NOT NULL THEN COALESCE(iva_monto, 0)
                        WHEN tipo_comprobante = 'factura' THEN ROUND(monto * (? / 100.0), 2)
                        ELSE 0
                    END
                ), 0) as credito_fiscal_iva_egresos
         FROM movimientos WHERE caja_id = ? AND tipo = 'egreso' AND estado = 'completado'`,
        [ivaPorc, cajaId]
    );

    const kpiReposiciones = await getQuery(
        `SELECT COALESCE(SUM(monto), 0) as total_reposiciones
         FROM movimientos m
         WHERE m.caja_id = ? AND m.tipo = 'ingreso' AND m.estado = 'completado'
           AND (m.categoria_contable = 'aporte_cambio' OR NOT EXISTS (SELECT 1 FROM detalle_movimientos d WHERE d.movimiento_id = m.id))`,
        [cajaId]
    );

    // Las líneas del turno se cargan por movimiento para prorratear descuentos proporcionalmente
    // y ajustar el centavo residual en la última línea del ticket, de modo que:
    // SUM(ingresos_generados) === Ventas Totales y SUM(ganancia_generada) === Ganancia Bruta.
    const productosActivos = await allQuery(
        `SELECT id, nombre, categoria FROM productos WHERE activo = 1 ORDER BY id ASC`
    );
    const lineasTurno = await allQuery(
        `SELECT d.id as detalle_id,
                d.movimiento_id,
                d.producto_id,
                d.cantidad,
                d.subtotal,
                d.costo_unitario,
                COALESCE(m.subtotal_bruto, m.monto) as subtotal_bruto_mov,
                COALESCE(m.descuento_total, 0) as descuento_total_mov,
                m.monto as monto_neto_mov
         FROM detalle_movimientos d
         INNER JOIN movimientos m ON d.movimiento_id = m.id
         WHERE m.caja_id = ?
           AND m.tipo = 'ingreso'
           AND m.estado = 'completado'
           AND COALESCE(m.categoria_contable, 'venta') = 'venta'
         ORDER BY d.movimiento_id ASC, d.id ASC`,
        [cajaId]
    );

    const mapaProd = new Map();
    for (const p of productosActivos) {
        mapaProd.set(p.id, {
            id: p.id,
            nombre: p.nombre,
            categoria: p.categoria,
            unidades_vendidas: 0,
            ingresos_generados: 0,
            ganancia_generada: 0
        });
    }

    const lineasPorMov = new Map();
    for (const l of lineasTurno) {
        if (!lineasPorMov.has(l.movimiento_id)) lineasPorMov.set(l.movimiento_id, []);
        lineasPorMov.get(l.movimiento_id).push(l);
    }

    for (const [, grupo] of lineasPorMov.entries()) {
        const subBrutoMov = Number(grupo[0].subtotal_bruto_mov || 0);
        const descMov = Number(grupo[0].descuento_total_mov || 0);
        const montoNetoMov = redondear2(grupo[0].monto_neto_mov);
        let acumuladoNeto = 0;

        for (let i = 0; i < grupo.length; i++) {
            const lin = grupo[i];
            const subLinea = Number(lin.subtotal || 0);
            let ingresoNetoLinea;
            if (descMov <= 0 || subBrutoMov <= 0) {
                ingresoNetoLinea = redondear2(subLinea);
            } else if (i === grupo.length - 1) {
                ingresoNetoLinea = redondear2(montoNetoMov - acumuladoNeto);
            } else {
                const descLinea = redondear2(descMov * (subLinea / subBrutoMov));
                ingresoNetoLinea = redondear2(subLinea - descLinea);
                acumuladoNeto = redondear2(acumuladoNeto + ingresoNetoLinea);
            }

            const costoLinea = Number(lin.cantidad || 0) * Number(lin.costo_unitario || 0);
            const gananciaLinea = redondear2(ingresoNetoLinea - costoLinea);

            let reg = mapaProd.get(lin.producto_id);
            if (!reg) {
                reg = {
                    id: lin.producto_id,
                    nombre: `Producto #${lin.producto_id}`,
                    categoria: '',
                    unidades_vendidas: 0,
                    ingresos_generados: 0,
                    ganancia_generada: 0
                };
                mapaProd.set(lin.producto_id, reg);
            }
            reg.unidades_vendidas = Number((reg.unidades_vendidas + Number(lin.cantidad || 0)).toFixed(4));
            reg.ingresos_generados = redondear2(reg.ingresos_generados + ingresoNetoLinea);
            reg.ganancia_generada = redondear2(reg.ganancia_generada + gananciaLinea);
        }
    }

    const rendimientoProductos = Array.from(mapaProd.values()).sort((a, b) => b.unidades_vendidas - a.unidades_vendidas);

    const ventasTotales = redondear2(kpiVentas.ventas_totales);
    const subtotalBrutoVentas = redondear2(kpiVentas.subtotal_bruto_ventas || ventasTotales);
    const descuentosTotales = redondear2(kpiVentas.descuentos_totales || 0);
    const ventasFacturadas = redondear2(kpiVentas.ventas_facturadas || 0);
    const ventasRecibo = redondear2(kpiVentas.ventas_recibo || 0);
    const costoTotalVentas = redondear2(kpiCostos.costo_total_ventas);
    const totalEgresos = redondear2(kpiEgresos.total_egresos);
    const egresosFacturados = redondear2(kpiEgresos.egresos_facturados || 0);
    const totalReposiciones = redondear2(kpiReposiciones.total_reposiciones);

    const ticketPromedio = kpiVentas.cantidad_tickets > 0
        ? ventasTotales / kpiVentas.cantidad_tickets
        : 0;

    const gananciaBruta = redondear2(ventasTotales - costoTotalVentas);
    const flujoNetoOperativo = redondear2(gananciaBruta - totalEgresos);

    const debitoFiscalIva = redondear2(kpiVentas.debito_fiscal_iva);
    const impuestoTransaccionesIt = redondear2(kpiVentas.impuesto_transacciones_it);
    const creditoFiscalIvaEgresos = redondear2(kpiEgresos.credito_fiscal_iva_egresos);

    return {
        subtotalBrutoVentas,
        descuentosTotales,
        ventasTotales,
        ventasFacturadas,
        ventasRecibo,
        cantidadTickets: kpiVentas.cantidad_tickets,
        ticketPromedio: redondear2(ticketPromedio),
        costoTotalVentas,
        gananciaBruta,
        totalEgresos,
        egresosFacturados,
        totalReposiciones,
        flujoNetoOperativo,
        debitoFiscalIva,
        impuestoTransaccionesIt,
        creditoFiscalIvaEgresos,
        ivaPorcentaje: ivaPorc,
        itPorcentaje: itPorc,
        itBase,
        regimenTributario: config?.regimen_tributario || 'simplificado_control_interno',
        productosMasVendidos: rendimientoProductos.filter(p => p.unidades_vendidas > 0),
        productosSinRotacion: rendimientoProductos.filter(p => p.unidades_vendidas === 0)
    };
}

// ==========================================
// 7. TENDENCIAS HORARIAS, MÉTODOS DE PAGO Y EXPORTACIONES CONTABLES (CSV / EXCEL)
// ==========================================
async function obtenerDesgloseMetodosPago(cajaId) {
    // Fuente de verdad del dinero: tabla movimientos_pagos vinculada a ventas comerciales completadas
    const pagosVentas = await allQuery(
        `SELECT mp.metodo_pago,
                COUNT(DISTINCT m.id) as transacciones,
                COALESCE(SUM(mp.monto), 0) as total
         FROM movimientos_pagos mp
         INNER JOIN movimientos m ON mp.movimiento_id = m.id
         WHERE m.caja_id = ?
           AND m.tipo = 'ingreso'
           AND m.estado = 'completado'
           AND COALESCE(m.categoria_contable, 'venta') = 'venta'
           AND EXISTS (SELECT 1 FROM detalle_movimientos d WHERE d.movimiento_id = m.id)
         GROUP BY mp.metodo_pago`,
        [cajaId]
    );

    const orden = { efectivo: 1, qr: 2 };
    const filasActivas = pagosVentas
        .filter((f) => Number(f.total || 0) > 0)
        .sort((a, b) => (orden[a.metodo_pago] || 99) - (orden[b.metodo_pago] || 99));
    const sumaTotal = filasActivas.reduce((acc, f) => acc + Number(f.total || 0), 0);

    return filasActivas.map((f) => ({
        metodoPago: f.metodo_pago,
        transacciones: Number(f.transacciones || 0),
        montoTotal: redondear2(f.total),
        porcentaje: sumaTotal > 0 ? Number(((Number(f.total) / sumaTotal) * 100).toFixed(1)) : 0
    }));
}

async function obtenerTendenciasVentas() {
    const ventasPorHora = await allQuery(
        `SELECT strftime('%H:00', fecha_hora, 'localtime') as hora,
                COUNT(id) as cantidad_tickets,
                ROUND(SUM(monto), 2) as total_vendido
         FROM movimientos m
         WHERE m.tipo = 'ingreso' AND m.estado = 'completado'
           AND COALESCE(m.categoria_contable, 'venta') = 'venta'
           AND EXISTS (SELECT 1 FROM detalle_movimientos d WHERE d.movimiento_id = m.id)
           AND date(m.fecha_hora, 'localtime') = date('now', 'localtime')
         GROUP BY hora
         ORDER BY hora ASC`
    );

    const comparativaSemanal = await allQuery(
        `SELECT date(m.fecha_hora, 'localtime') as fecha,
                COUNT(CASE WHEN m.tipo = 'ingreso' AND COALESCE(m.categoria_contable, 'venta') = 'venta' THEN m.id END) as cantidad_tickets,
                ROUND(SUM(CASE WHEN m.tipo = 'ingreso' AND COALESCE(m.categoria_contable, 'venta') = 'venta' THEN m.monto ELSE 0 END), 2) as ingresos,
                ROUND(SUM(CASE WHEN m.tipo = 'egreso' THEN m.monto ELSE 0 END), 2) as egresos
         FROM movimientos m
         WHERE m.estado = 'completado'
           AND date(m.fecha_hora, 'localtime') >= date('now', 'localtime', '-7 days')
         GROUP BY fecha
         ORDER BY fecha ASC`
    );

    return { ventasPorHora, comparativaSemanal };
}

function sanitizarTextoCSV(valor) {
    const str = String(valor ?? '');
    // Evitar inyección de fórmulas en Excel si empieza con =, +, - o @
    const protegido = /^[=+\-@]/.test(str.trimStart()) ? `'${str}` : str;
    return `"${protegido.replace(/"/g, '""')}"`;
}

function construirClausulaFiltroMovimientos(cajaId = null, filtros = {}, aliasMov = 'm', aliasCaja = 'c') {
    const condiciones = [];
    const params = [];

    if (cajaId) {
        condiciones.push(`${aliasMov}.caja_id = ?`);
        params.push(Number(cajaId));
    }
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        condiciones.push(`date(${aliasMov}.fecha_hora, 'localtime') >= ?`);
        params.push(String(filtros.desde).trim());
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        condiciones.push(`date(${aliasMov}.fecha_hora, 'localtime') <= ?`);
        params.push(String(filtros.hasta).trim());
    }
    if (filtros?.usuarioId && Number.isFinite(Number(filtros.usuarioId)) && Number(filtros.usuarioId) > 0) {
        condiciones.push(`${aliasMov}.usuario_id = ?`);
        params.push(Number(filtros.usuarioId));
    }
    if (filtros?.cajaFisicaId && Number.isFinite(Number(filtros.cajaFisicaId)) && Number(filtros.cajaFisicaId) > 0 && aliasCaja) {
        condiciones.push(`${aliasCaja}.caja_fisica_id = ?`);
        params.push(Number(filtros.cajaFisicaId));
    }

    return {
        whereSql: condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '',
        params
    };
}

async function generarReporteCSV(cajaId = null, filtros = {}) {
    const negocio = await obtenerConfiguracionNegocio();
    const ivaPorc = Number(negocio?.iva_porcentaje ?? 13);
    const itPorc = Number(negocio?.it_porcentaje ?? 3);
    const { whereSql, params } = construirClausulaFiltroMovimientos(cajaId, filtros, 'm', 'c');

    const filas = await allQuery(
        `SELECT m.id,
                m.caja_id,
                cf.nombre as caja_nombre,
                datetime(m.fecha_hora, 'localtime') as fecha_hora,
                COALESCE(u.nombre, '—') as operador,
                m.tipo,
                COALESCE(m.categoria_contable, CASE WHEN m.tipo = 'egreso' THEN 'gasto_operativo' ELSE 'venta' END) as categoria_contable,
                m.metodo_pago,
                COALESCE(m.tipo_comprobante, 'recibo') as tipo_comprobante,
                COALESCE(m.nro_factura, '') as nro_factura,
                COALESCE(m.cliente_nit_ci, '') as cliente_nit_ci,
                COALESCE(m.cliente_razon_social, '') as cliente_razon_social,
                COALESCE(m.subtotal_bruto, m.monto) as subtotal_bruto,
                COALESCE(m.descuento_total, 0) as descuento_total,
                m.monto,
                COALESCE((SELECT SUM(mp.monto) FROM movimientos_pagos mp WHERE mp.movimiento_id = m.id AND mp.metodo_pago = 'efectivo'), m.monto_efectivo, CASE WHEN m.metodo_pago = 'efectivo' THEN m.monto ELSE 0 END) as monto_efectivo,
                COALESCE((SELECT SUM(mp.monto) FROM movimientos_pagos mp WHERE mp.movimiento_id = m.id AND mp.metodo_pago = 'qr'), m.monto_qr, CASE WHEN m.metodo_pago = 'qr' THEN m.monto ELSE 0 END) as monto_qr,
                COALESCE(m.referencia_qr, '') as referencia_qr,
                COALESCE(m.monto_recibido, 0) as monto_recibido,
                COALESCE(m.cambio, 0) as cambio,
                m.regimen_tributario,
                m.iva_monto,
                m.it_monto,
                COALESCE((SELECT ROUND(SUM(d.cantidad * d.costo_unitario), 2) FROM detalle_movimientos d WHERE d.movimiento_id = m.id), 0) as costo_cmv,
                m.estado,
                COALESCE(ua.nombre, '') as anulado_por_nombre,
                COALESCE(datetime(m.fecha_anulacion, 'localtime'), '') as fecha_anulacion,
                COALESCE(m.motivo_anulacion, '') as motivo_anulacion,
                m.descripcion
         FROM movimientos m
         LEFT JOIN cajas c ON m.caja_id = c.id
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         LEFT JOIN usuarios ua ON m.anulado_por = ua.id
         ${whereSql}
         ORDER BY m.id DESC`,
        params
    );

    const cabeceras = [
        'ID_Movimiento', 'Nro_Turno', 'Caja_Estacion', 'Fecha_Hora', 'Operador',
        'Tipo', 'Categoria_Contable', 'Metodo_Pago', 'Tipo_Comprobante', 'Nro_Factura',
        'NIT_CI', 'Razon_Social', 'Subtotal_Bs', 'Descuento_Bs', 'Monto_Bs',
        'Monto_Efectivo_Bs', 'Monto_QR_Bs', 'Referencia_QR',
        'Recibido_Bs', 'Cambio_Bs', 'Costo_CMV_Bs', 'Utilidad_Bruta_Bs',
        'IVA_Bs', 'IT_Bs', 'Regimen_Tributario',
        'Estado', 'Anulado_Por', 'Fecha_Anulacion', 'Motivo_Anulacion', 'Descripcion'
    ].join(';');

    const lineas = filas.map((r) => {
        const esCompletado = r.estado === 'completado';
        const esVenta = r.tipo === 'ingreso' && r.categoria_contable === 'venta';
        const esVentaCompletada = esCompletado && esVenta;
        const montoNum = Number(r.monto || 0);
        const costoCmv = esVentaCompletada ? redondear2(r.costo_cmv) : 0;
        const utilidadBruta = esVentaCompletada ? redondear2(montoNum - costoCmv) : 0;
        const tieneSnapshot = r.regimen_tributario !== null && r.regimen_tributario !== undefined;
        const ivaNum = esCompletado
            ? (tieneSnapshot
                ? redondear2(r.iva_monto || 0)
                : (r.tipo_comprobante === 'factura' ? redondear2(montoNum * (ivaPorc / 100)) : 0))
            : 0;
        const itNum = esVentaCompletada
            ? (tieneSnapshot
                ? redondear2(r.it_monto || 0)
                : (r.tipo_comprobante === 'factura' ? redondear2(montoNum * (itPorc / 100)) : 0))
            : 0;

        return [
            r.id,
            r.caja_id,
            sanitizarTextoCSV(r.caja_nombre || 'Caja Principal'),
            r.fecha_hora || '',
            sanitizarTextoCSV(r.operador || '—'),
            r.tipo,
            r.categoria_contable,
            r.metodo_pago,
            r.tipo_comprobante,
            sanitizarTextoCSV(r.nro_factura),
            sanitizarTextoCSV(r.cliente_nit_ci),
            sanitizarTextoCSV(r.cliente_razon_social),
            Number(r.subtotal_bruto || 0).toFixed(2),
            Number(r.descuento_total || 0).toFixed(2),
            montoNum.toFixed(2),
            Number(r.monto_efectivo || 0).toFixed(2),
            Number(r.monto_qr || 0).toFixed(2),
            sanitizarTextoCSV(r.referencia_qr),
            Number(r.monto_recibido || 0).toFixed(2),
            Number(r.cambio || 0).toFixed(2),
            costoCmv.toFixed(2),
            utilidadBruta.toFixed(2),
            ivaNum.toFixed(2),
            itNum.toFixed(2),
            r.regimen_tributario || negocio?.regimen_tributario || 'simplificado_control_interno',
            r.estado,
            sanitizarTextoCSV(r.anulado_por_nombre),
            r.fecha_anulacion,
            sanitizarTextoCSV(r.motivo_anulacion),
            sanitizarTextoCSV(r.descripcion || '')
        ].join(';');
    });

    const usuarioGenerador = filtros?.usuarioGenerador || 'Administrador / Sistema';
    const periodoTexto = [
        cajaId ? `Turno #${cajaId}` : 'Todos los turnos',
        filtros?.desde || filtros?.hasta ? `Fechas: ${filtros?.desde || 'inicio'} a ${filtros?.hasta || 'hoy'}` : 'Histórico completo'
    ].join(' | ');
    const metaCsv = [
        `# Reporte Contable POS - ${sanitizarTextoCSV(negocio?.nombre_negocio || 'Mi Negocio')} (NIT: ${sanitizarTextoCSV(negocio?.nit_negocio || 'S/N')})`,
        `# Regimen: ${negocio?.regimen_tributario || 'simplificado_control_interno'} | Periodo: ${periodoTexto}`,
        `# Usuario Generador: ${sanitizarTextoCSV(usuarioGenerador)} | Moneda: Bs (Bolivianos)`
    ];

    // BOM UTF-8 (\uFEFF) para que Microsoft Excel en español abra tildes y símbolos directamente
    return '\uFEFF' + [...metaCsv, cabeceras, ...lineas].join('\n');
}

async function generarReporteExcel(cajaId = null, filtros = {}) {
    const ExcelJS = require('exceljs');
    const negocio = await obtenerConfiguracionNegocio();
    const ivaPorc = Number(negocio?.iva_porcentaje ?? 13);
    const itPorc = Number(negocio?.it_porcentaje ?? 3);
    const usuarioGenerador = filtros?.usuarioGenerador || 'Administrador / Sistema';

    const { whereSql: whereMov, params: paramsMov } = construirClausulaFiltroMovimientos(cajaId, filtros, 'm', 'c');

    const movimientos = await allQuery(
        `SELECT m.id,
                m.caja_id,
                cf.nombre as caja_nombre,
                datetime(m.fecha_hora, 'localtime') as fecha_hora,
                COALESCE(u.nombre, '—') as operador,
                m.tipo,
                COALESCE(m.categoria_contable, CASE WHEN m.tipo = 'egreso' THEN 'gasto_operativo' ELSE 'venta' END) as categoria_contable,
                m.metodo_pago,
                COALESCE(m.tipo_comprobante, 'recibo') as tipo_comprobante,
                COALESCE(m.nro_factura, '') as nro_factura,
                COALESCE(m.cliente_nit_ci, '') as cliente_nit_ci,
                COALESCE(m.cliente_razon_social, '') as cliente_razon_social,
                COALESCE(m.subtotal_bruto, m.monto) as subtotal_bruto,
                COALESCE(m.descuento_total, 0) as descuento_total,
                m.monto,
                COALESCE((SELECT SUM(mp.monto) FROM movimientos_pagos mp WHERE mp.movimiento_id = m.id AND mp.metodo_pago = 'efectivo'), m.monto_efectivo, CASE WHEN m.metodo_pago = 'efectivo' THEN m.monto ELSE 0 END) as monto_efectivo,
                COALESCE((SELECT SUM(mp.monto) FROM movimientos_pagos mp WHERE mp.movimiento_id = m.id AND mp.metodo_pago = 'qr'), m.monto_qr, CASE WHEN m.metodo_pago = 'qr' THEN m.monto ELSE 0 END) as monto_qr,
                COALESCE(m.referencia_qr, '') as referencia_qr,
                COALESCE(m.monto_recibido, 0) as monto_recibido,
                COALESCE(m.cambio, 0) as cambio,
                m.regimen_tributario,
                COALESCE(m.iva_porcentaje, 0) as iva_porcentaje,
                COALESCE(m.it_porcentaje, 0) as it_porcentaje,
                m.iva_monto,
                m.it_monto,
                COALESCE((SELECT ROUND(SUM(d.cantidad * d.costo_unitario), 2) FROM detalle_movimientos d WHERE d.movimiento_id = m.id), 0) as costo_cmv,
                m.estado,
                COALESCE(ua.nombre, '') as anulado_por_nombre,
                COALESCE(datetime(m.fecha_anulacion, 'localtime'), '') as fecha_anulacion,
                COALESCE(m.motivo_anulacion, '') as motivo_anulacion,
                m.descripcion
         FROM movimientos m
         LEFT JOIN cajas c ON m.caja_id = c.id
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         LEFT JOIN usuarios ua ON m.anulado_por = ua.id
         ${whereMov}
         ORDER BY m.id DESC`,
        paramsMov
    );

    const condCajas = [];
    const paramsCajas = [];
    if (cajaId) {
        condCajas.push(`c.id = ?`);
        paramsCajas.push(Number(cajaId));
    }
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        condCajas.push(`date(c.fecha_apertura, 'localtime') >= ?`);
        paramsCajas.push(String(filtros.desde).trim());
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        condCajas.push(`date(c.fecha_apertura, 'localtime') <= ?`);
        paramsCajas.push(String(filtros.hasta).trim());
    }
    if (filtros?.usuarioId && Number.isFinite(Number(filtros.usuarioId)) && Number(filtros.usuarioId) > 0) {
        condCajas.push(`c.usuario_id = ?`);
        paramsCajas.push(Number(filtros.usuarioId));
    }
    if (filtros?.cajaFisicaId && Number.isFinite(Number(filtros.cajaFisicaId)) && Number(filtros.cajaFisicaId) > 0) {
        condCajas.push(`c.caja_fisica_id = ?`);
        paramsCajas.push(Number(filtros.cajaFisicaId));
    }
    const whereCajas = condCajas.length > 0 ? `WHERE ${condCajas.join(' AND ')}` : '';

    const cajas = await allQuery(
        `SELECT c.id,
                cf.nombre as caja_nombre,
                COALESCE(u.nombre, '—') as cajero,
                datetime(c.fecha_apertura, 'localtime') as fecha_apertura,
                datetime(c.fecha_cierre, 'localtime') as fecha_cierre,
                c.estado,
                c.monto_inicial,
                c.efectivo_esperado,
                c.efectivo_real,
                c.diferencia_efectivo,
                c.qr_esperado,
                c.qr_real,
                c.diferencia_qr,
                COALESCE(c.observaciones_cierre, '') as observaciones_cierre,
                c.veces_reabierta,
                COALESCE(c.historial_reaperturas, '') as historial_reaperturas
         FROM cajas c
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         ${whereCajas}
         ORDER BY c.id DESC`,
        paramsCajas
    );

    const detallesVentasRaw = await allQuery(
        `SELECT d.id as detalle_id,
                m.id as movimiento_id,
                m.caja_id,
                datetime(m.fecha_hora, 'localtime') as fecha_hora,
                COALESCE(u.nombre, '—') as operador,
                d.producto_id,
                p.nombre as producto_nombre,
                p.categoria as producto_categoria,
                p.tipo_inventario,
                d.cantidad,
                d.precio_unitario,
                d.costo_unitario,
                d.subtotal,
                COALESCE(m.subtotal_bruto, m.monto) as subtotal_bruto_mov,
                COALESCE(m.descuento_total, 0) as descuento_total_mov,
                m.monto as monto_neto_mov,
                m.metodo_pago,
                m.estado,
                COALESCE((
                    SELECT GROUP_CONCAT(dmm.nombre || (CASE WHEN dmm.precio_adicional > 0 THEN ' (+Bs ' || dmm.precio_adicional || ')' ELSE '' END), ', ')
                    FROM detalle_movimientos_modificadores dmm
                    WHERE dmm.detalle_movimiento_id = d.id
                ), '') as modificadores_aplicados
         FROM detalle_movimientos d
         INNER JOIN movimientos m ON d.movimiento_id = m.id
         LEFT JOIN cajas c ON m.caja_id = c.id
         INNER JOIN productos p ON d.producto_id = p.id
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         ${whereMov}
         ORDER BY m.id ASC, d.id ASC`,
        paramsMov
    );

    // Prorrateo exacto de descuentos por ticket (con ajuste de centavo residual en la última línea)
    // para garantizar que SUM(ingreso_neto) === Ventas Netas y SUM(utilidad_bruta) === Ganancia Bruta
    const gruposPorTicket = new Map();
    for (const det of detallesVentasRaw) {
        if (!gruposPorTicket.has(det.movimiento_id)) gruposPorTicket.set(det.movimiento_id, []);
        gruposPorTicket.get(det.movimiento_id).push(det);
    }

    const detallesVentasProcesados = [];
    const mapaRentabilidadProd = new Map();

    for (const [, lineasTicket] of gruposPorTicket.entries()) {
        const subBrutoMov = Number(lineasTicket[0].subtotal_bruto_mov || 0);
        const descMov = Number(lineasTicket[0].descuento_total_mov || 0);
        const montoNetoMov = redondear2(lineasTicket[0].monto_neto_mov);
        let acumuladoNeto = 0;

        for (let i = 0; i < lineasTicket.length; i++) {
            const lin = lineasTicket[i];
            const subLinea = redondear2(lin.subtotal || 0);
            let ingresoNetoLinea;
            if (descMov <= 0 || subBrutoMov <= 0) {
                ingresoNetoLinea = subLinea;
            } else if (i === lineasTicket.length - 1) {
                ingresoNetoLinea = redondear2(montoNetoMov - acumuladoNeto);
            } else {
                const descLin = redondear2(descMov * (subLinea / subBrutoMov));
                ingresoNetoLinea = redondear2(subLinea - descLin);
                acumuladoNeto = redondear2(acumuladoNeto + ingresoNetoLinea);
            }

            const descuentoProrrateado = redondear2(subLinea - ingresoNetoLinea);
            const costoTotalLinea = redondear2(Number(lin.cantidad || 0) * Number(lin.costo_unitario || 0));
            const utilidadBrutaNeta = redondear2(ingresoNetoLinea - costoTotalLinea);

            detallesVentasProcesados.push({
                ...lin,
                subtotal: subLinea,
                descuento_prorrateado: descuentoProrrateado,
                ingreso_neto: ingresoNetoLinea,
                costo_total: costoTotalLinea,
                utilidad_bruta: utilidadBrutaNeta
            });

            if (lin.estado === 'completado') {
                if (!mapaRentabilidadProd.has(lin.producto_id)) {
                    mapaRentabilidadProd.set(lin.producto_id, {
                        producto_id: lin.producto_id,
                        producto_nombre: lin.producto_nombre,
                        categoria: lin.producto_categoria || 'Sin categoría',
                        tipo_inventario: lin.tipo_inventario,
                        unidades_vendidas: 0,
                        subtotal_bruto: 0,
                        descuento_prorrateado: 0,
                        ingreso_neto: 0,
                        costo_cmv: 0,
                        ganancia_bruta: 0
                    });
                }
                const accP = mapaRentabilidadProd.get(lin.producto_id);
                accP.unidades_vendidas = Number((accP.unidades_vendidas + Number(lin.cantidad || 0)).toFixed(4));
                accP.subtotal_bruto = redondear2(accP.subtotal_bruto + subLinea);
                accP.descuento_prorrateado = redondear2(accP.descuento_prorrateado + descuentoProrrateado);
                accP.ingreso_neto = redondear2(accP.ingreso_neto + ingresoNetoLinea);
                accP.costo_cmv = redondear2(accP.costo_cmv + costoTotalLinea);
                accP.ganancia_bruta = redondear2(accP.ganancia_bruta + utilidadBrutaNeta);
            }
        }
    }

    const detallesVentas = detallesVentasProcesados.sort((a, b) => b.detalle_id - a.detalle_id);
    const rentabilidadPorProducto = Array.from(mapaRentabilidadProd.values()).sort((a, b) => b.ingreso_neto - a.ingreso_neto);

    const condInsumos = [`mi.tipo IN ('compra', 'merma')`];
    const paramsIns = [];
    const condDirectos = [`mpd.tipo IN ('compra', 'merma')`];
    const paramsDir = [];
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        condInsumos.push(`date(mi.fecha_hora, 'localtime') >= ?`);
        paramsIns.push(String(filtros.desde).trim());
        condDirectos.push(`date(mpd.fecha_hora, 'localtime') >= ?`);
        paramsDir.push(String(filtros.desde).trim());
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        condInsumos.push(`date(mi.fecha_hora, 'localtime') <= ?`);
        paramsIns.push(String(filtros.hasta).trim());
        condDirectos.push(`date(mpd.fecha_hora, 'localtime') <= ?`);
        paramsDir.push(String(filtros.hasta).trim());
    }

    const comprasYMermasInsumos = await allQuery(
        `SELECT * FROM (
            SELECT 'INS-' || mi.id as id,
                   'Insumo / Materia Prima' as origen,
                   i.nombre as item_nombre,
                   i.unidad_medida,
                   mi.tipo,
                   datetime(mi.fecha_hora, 'localtime') as fecha_hora,
                   mi.fecha_hora as fecha_orden,
                   mi.cantidad,
                   mi.costo_unitario,
                   ROUND(COALESCE(NULLIF(mi.monto_total_compra, 0), mi.cantidad * mi.costo_unitario), 2) as monto_total,
                   COALESCE(mi.proveedor_nombre, '') as proveedor_nombre,
                   COALESCE(mi.proveedor_nit, '') as proveedor_nit,
                   COALESCE(mi.nro_factura_compra, '') as nro_factura_compra,
                   COALESCE(mi.con_factura, 0) as con_factura,
                   mi.motivo
            FROM movimientos_insumos mi
            INNER JOIN insumos i ON mi.insumo_id = i.id
            WHERE ${condInsumos.join(' AND ')}
            UNION ALL
            SELECT 'PRD-' || mpd.id as id,
                   'Producto Directo' as origen,
                   p.nombre as item_nombre,
                   COALESCE(p.unidad_medida, 'unidades') as unidad_medida,
                   mpd.tipo,
                   datetime(mpd.fecha_hora, 'localtime') as fecha_hora,
                   mpd.fecha_hora as fecha_orden,
                   mpd.cantidad,
                   mpd.costo_unitario,
                   ROUND(COALESCE(mpd.monto_total, mpd.cantidad * mpd.costo_unitario), 2) as monto_total,
                   COALESCE(mpd.proveedor_nombre, '') as proveedor_nombre,
                   COALESCE(mpd.proveedor_nit, '') as proveedor_nit,
                   COALESCE(mpd.nro_factura_compra, '') as nro_factura_compra,
                   COALESCE(mpd.con_factura, 0) as con_factura,
                   mpd.motivo
            FROM movimientos_productos_directos mpd
            INNER JOIN productos p ON mpd.producto_id = p.id
            WHERE ${condDirectos.join(' AND ')}
         )
         ORDER BY fecha_orden DESC`,
        [...paramsIns, ...paramsDir]
    );

    const condKardexCrono = [];
    const paramsKardexCrono = [];
    if (cajaId) {
        condKardexCrono.push(`(mpd.movimiento_id IS NULL OR m.caja_id = ?)`);
        paramsKardexCrono.push(Number(cajaId));
    }
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        condKardexCrono.push(`date(mpd.fecha_hora, 'localtime') >= ?`);
        paramsKardexCrono.push(String(filtros.desde).trim());
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        condKardexCrono.push(`date(mpd.fecha_hora, 'localtime') <= ?`);
        paramsKardexCrono.push(String(filtros.hasta).trim());
    }
    const whereKardexCrono = condKardexCrono.length > 0 ? `WHERE ${condKardexCrono.join(' AND ')}` : '';

    const kardexCronologicoProductos = await allQuery(
        `SELECT mpd.id,
                mpd.producto_id,
                p.nombre as producto_nombre,
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
         LEFT JOIN movimientos m ON mpd.movimiento_id = m.id
         ${whereKardexCrono}
         ORDER BY mpd.id ASC`,
        paramsKardexCrono
    );

    const condKardexIns = [];
    const paramsKardexIns = [];
    if (cajaId) {
        condKardexIns.push(`(mi.movimiento_id IS NULL OR m.caja_id = ?)`);
        paramsKardexIns.push(Number(cajaId));
    }
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        condKardexIns.push(`date(mi.fecha_hora, 'localtime') >= ?`);
        paramsKardexIns.push(String(filtros.desde).trim());
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        condKardexIns.push(`date(mi.fecha_hora, 'localtime') <= ?`);
        paramsKardexIns.push(String(filtros.hasta).trim());
    }
    const whereKardexIns = condKardexIns.length > 0 ? `WHERE ${condKardexIns.join(' AND ')}` : '';

    const kardexCronologicoInsumos = await allQuery(
        `SELECT mi.id,
                mi.insumo_id,
                i.nombre as insumo_nombre,
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
         LEFT JOIN movimientos m ON mi.movimiento_id = m.id
         ${whereKardexIns}
         ORDER BY mi.id ASC`,
        paramsKardexIns
    );

    const insumosKardex = await allQuery(
        `SELECT i.id,
                i.nombre,
                'Insumo / Receta' as clase,
                i.unidad_medida,
                i.stock_actual,
                i.costo_por_unidad,
                ROUND(i.stock_actual * i.costo_por_unidad, 2) as valor_inventario,
                COALESCE((SELECT SUM(cantidad) FROM movimientos_insumos mi WHERE mi.insumo_id = i.id AND mi.tipo IN ('inventario_inicial', 'compra')), 0) as total_compras,
                COALESCE((
                    SELECT MAX(0, SUM(CASE WHEN mi.tipo = 'consumo_venta' THEN mi.cantidad WHEN mi.tipo = 'reingreso_anulacion' THEN -mi.cantidad ELSE 0 END))
                    FROM movimientos_insumos mi WHERE mi.insumo_id = i.id
                ), 0) as total_consumo_ventas,
                COALESCE((SELECT SUM(cantidad) FROM movimientos_insumos mi WHERE mi.insumo_id = i.id AND mi.tipo = 'merma'), 0) as total_mermas
         FROM insumos i
         WHERE i.activo = 1
         ORDER BY i.nombre ASC`
    );

    const productosDirectosKardex = await allQuery(
        `SELECT p.id,
                p.nombre,
                'Producto Directo' as clase,
                p.unidad_medida,
                COALESCE(p.stock, 0) as stock_actual,
                COALESCE(p.costo, 0) as costo_por_unidad,
                ROUND(COALESCE(p.stock, 0) * COALESCE(p.costo, 0), 2) as valor_inventario,
                COALESCE((SELECT SUM(cantidad) FROM movimientos_productos_directos mpd WHERE mpd.producto_id = p.id AND mpd.tipo IN ('inventario_inicial', 'compra')), 0) as total_compras,
                COALESCE((
                    SELECT MAX(0, SUM(CASE WHEN mpd.tipo = 'venta' THEN mpd.cantidad WHEN mpd.tipo = 'reingreso_anulacion' THEN -mpd.cantidad ELSE 0 END))
                    FROM movimientos_productos_directos mpd WHERE mpd.producto_id = p.id
                ), 0) as total_consumo_ventas,
                COALESCE((SELECT SUM(cantidad) FROM movimientos_productos_directos mpd WHERE mpd.producto_id = p.id AND mpd.tipo = 'merma'), 0) as total_mermas
         FROM productos p
         WHERE p.activo = 1 AND p.tipo_inventario = 'directo'
         ORDER BY p.nombre ASC`
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema POS & Control Contable Híbrido';
    workbook.created = new Date();

    const estiloCabecera = (fila, colorHex = 'FF0F172A') => {
        fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorHex } };
        fila.alignment = { vertical: 'middle', horizontal: 'center' };
    };

    const estiloTotales = (fila) => {
        fila.font = { bold: true, color: { argb: 'FF0F172A' } };
        fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    };

    // =========================================================================
    // HOJA 1: MOVIMIENTOS Y LIBRO DE VENTAS / EGRESOS
    // =========================================================================
    const hojaMov = workbook.addWorksheet('Movimientos');
    hojaMov.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'N° Turno', key: 'caja_id', width: 11 },
        { header: 'Estación / Caja', key: 'caja_nombre', width: 20 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Operador', key: 'operador', width: 16 },
        { header: 'Tipo', key: 'tipo', width: 11 },
        { header: 'Categoría Contable', key: 'categoria_contable', width: 18 },
        { header: 'Método Pago', key: 'metodo_pago', width: 14 },
        { header: 'Comprobante', key: 'tipo_comprobante', width: 13 },
        { header: 'N° Factura', key: 'nro_factura', width: 14 },
        { header: 'NIT / CI', key: 'cliente_nit_ci', width: 15 },
        { header: 'Razón Social / Proveedor', key: 'cliente_razon_social', width: 24 },
        { header: 'Subtotal (Bs)', key: 'subtotal_bruto', width: 14 },
        { header: 'Descuento (Bs)', key: 'descuento_total', width: 14 },
        { header: 'Monto Total (Bs)', key: 'monto', width: 16 },
        { header: 'Efectivo (Bs)', key: 'monto_efectivo', width: 14 },
        { header: 'QR (Bs)', key: 'monto_qr', width: 14 },
        { header: 'Referencia QR', key: 'referencia_qr', width: 16 },
        { header: 'Recibido (Bs)', key: 'monto_recibido', width: 14 },
        { header: 'Cambio (Bs)', key: 'cambio', width: 13 },
        { header: 'Costo CMV (Bs)', key: 'costo_cmv', width: 15 },
        { header: 'Utilidad Bruta (Bs)', key: 'utilidad_bruta', width: 17 },
        { header: 'IVA (Bs)', key: 'iva_monto', width: 13 },
        { header: 'IT (Bs)', key: 'it_monto', width: 13 },
        { header: 'Régimen Snapshot', key: 'regimen_tributario', width: 18 },
        { header: 'Estado', key: 'estado', width: 13 },
        { header: 'Anulado Por', key: 'anulado_por_nombre', width: 15 },
        { header: 'Fecha Anulación', key: 'fecha_anulacion', width: 19 },
        { header: 'Motivo Anulación', key: 'motivo_anulacion', width: 24 },
        { header: 'Descripción', key: 'descripcion', width: 34 }
    ];
    estiloCabecera(hojaMov.getRow(1));

    let sumSubtotalVentas = 0;
    let sumDescuentoVentas = 0;
    let sumMontoVentas = 0;
    let sumEfectivoVentas = 0;
    let sumQrVentas = 0;
    let sumCostoVentas = 0;
    let sumUtilidadVentas = 0;
    let sumIvaVentas = 0;
    let sumItVentas = 0;
    let sumEgresos = 0;
    let sumCfIvaEgresos = 0;
    let sumAportesCambio = 0;

    for (const m of movimientos) {
        const esCompletado = m.estado === 'completado';
        const esVenta = m.tipo === 'ingreso' && m.categoria_contable === 'venta';
        const montoNum = Number(m.monto || 0);
        const subtotalNum = Number(m.subtotal_bruto || montoNum);
        const descNum = Number(m.descuento_total || 0);
        const efNum = Number(m.monto_efectivo || 0);
        const qrNum = Number(m.monto_qr || 0);
        const cmvNum = (esCompletado && esVenta) ? redondear2(m.costo_cmv) : 0;
        const utilNum = (esCompletado && esVenta) ? redondear2(montoNum - cmvNum) : 0;
        const tieneSnapshot = m.regimen_tributario !== null && m.regimen_tributario !== undefined;
        const ivaNum = esCompletado
            ? (tieneSnapshot
                ? redondear2(m.iva_monto || 0)
                : (m.tipo_comprobante === 'factura' ? redondear2(montoNum * (ivaPorc / 100)) : 0))
            : 0;
        const itNum = (esCompletado && esVenta)
            ? (tieneSnapshot
                ? redondear2(m.it_monto || 0)
                : (m.tipo_comprobante === 'factura' ? redondear2(montoNum * (itPorc / 100)) : 0))
            : 0;

        if (esCompletado) {
            if (esVenta) {
                sumSubtotalVentas = redondear2(sumSubtotalVentas + subtotalNum);
                sumDescuentoVentas = redondear2(sumDescuentoVentas + descNum);
                sumMontoVentas = redondear2(sumMontoVentas + montoNum);
                sumEfectivoVentas = redondear2(sumEfectivoVentas + efNum);
                sumQrVentas = redondear2(sumQrVentas + qrNum);
                sumCostoVentas = redondear2(sumCostoVentas + cmvNum);
                sumUtilidadVentas = redondear2(sumUtilidadVentas + utilNum);
                sumIvaVentas = redondear2(sumIvaVentas + ivaNum);
                sumItVentas = redondear2(sumItVentas + itNum);
            } else if (m.categoria_contable === 'aporte_cambio') {
                sumAportesCambio = redondear2(sumAportesCambio + montoNum);
            } else if (m.tipo === 'egreso') {
                sumEgresos = redondear2(sumEgresos + montoNum);
                sumCfIvaEgresos = redondear2(sumCfIvaEgresos + ivaNum);
            }
        }

        hojaMov.addRow({
            ...m,
            subtotal_bruto: subtotalNum,
            descuento_total: descNum,
            monto: montoNum,
            monto_efectivo: efNum,
            monto_qr: qrNum,
            monto_recibido: Number(m.monto_recibido || 0),
            cambio: Number(m.cambio || 0),
            costo_cmv: cmvNum,
            utilidad_bruta: utilNum,
            iva_monto: ivaNum,
            it_monto: itNum,
            regimen_tributario: m.regimen_tributario || negocio?.regimen_tributario || 'simplificado_control_interno'
        });
    }

    if (movimientos.length > 0) {
        const filaTotMov = hojaMov.addRow({
            id: 'TOTAL',
            descripcion: `Ventas Completadas: Bs ${sumMontoVentas.toFixed(2)} | Aportes Cambio: Bs ${sumAportesCambio.toFixed(2)} | Egresos: Bs ${sumEgresos.toFixed(2)}`,
            subtotal_bruto: sumSubtotalVentas,
            descuento_total: sumDescuentoVentas,
            monto: sumMontoVentas,
            monto_efectivo: sumEfectivoVentas,
            monto_qr: sumQrVentas,
            costo_cmv: sumCostoVentas,
            utilidad_bruta: sumUtilidadVentas,
            iva_monto: sumIvaVentas,
            it_monto: sumItVentas
        });
        estiloTotales(filaTotMov);
    }

    ['M', 'N', 'O', 'P', 'Q', 'S', 'T', 'U', 'V', 'W', 'X'].forEach((col) => {
        hojaMov.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 2: ARQUEOS DE CAJA
    // =========================================================================
    const hojaCajas = workbook.addWorksheet('Arqueos de Caja');
    hojaCajas.columns = [
        { header: 'N° Turno', key: 'id', width: 12 },
        { header: 'Estación / Caja', key: 'caja_nombre', width: 20 },
        { header: 'Cajero', key: 'cajero', width: 18 },
        { header: 'Apertura', key: 'fecha_apertura', width: 20 },
        { header: 'Cierre', key: 'fecha_cierre', width: 20 },
        { header: 'Estado', key: 'estado', width: 12 },
        { header: 'Monto Inicial (Bs)', key: 'monto_inicial', width: 18 },
        { header: 'Efectivo Esperado (Bs)', key: 'efectivo_esperado', width: 22 },
        { header: 'Efectivo Real (Bs)', key: 'efectivo_real', width: 18 },
        { header: 'Diferencia Efectivo (Bs)', key: 'diferencia_efectivo', width: 22 },
        { header: 'QR Esperado (Bs)', key: 'qr_esperado', width: 17 },
        { header: 'QR Real Conciliado (Bs)', key: 'qr_real', width: 22 },
        { header: 'Diferencia QR (Bs)', key: 'diferencia_qr', width: 18 },
        { header: 'Observaciones Cierre', key: 'observaciones_cierre', width: 26 },
        { header: 'Reaperturas', key: 'veces_reabierta', width: 13 },
        { header: 'Historial Reaperturas', key: 'historial_reaperturas', width: 32 }
    ];
    estiloCabecera(hojaCajas.getRow(1));

    for (const c of cajas) {
        hojaCajas.addRow({
            ...c,
            fecha_cierre: c.fecha_cierre || 'En curso',
            monto_inicial: Number(c.monto_inicial || 0),
            efectivo_esperado: c.efectivo_esperado !== null ? Number(c.efectivo_esperado) : null,
            efectivo_real: c.efectivo_real !== null ? Number(c.efectivo_real) : null,
            diferencia_efectivo: c.diferencia_efectivo !== null ? Number(c.diferencia_efectivo) : null,
            qr_esperado: Number(c.qr_esperado || 0),
            qr_real: c.qr_real !== null && c.qr_real !== undefined ? Number(c.qr_real) : null,
            diferencia_qr: c.diferencia_qr !== null && c.diferencia_qr !== undefined ? Number(c.diferencia_qr) : null,
            observaciones_cierre: c.observaciones_cierre || '',
            veces_reabierta: Number(c.veces_reabierta || 0)
        });
    }
    ['G', 'H', 'I', 'J', 'K', 'L', 'M'].forEach((col) => {
        hojaCajas.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 3: DETALLE DE VENTAS Y COSTO DE MERCADERÍA VENDIDA (CMV)
    // =========================================================================
    const hojaDet = workbook.addWorksheet('Detalle Ventas (CMV)');
    hojaDet.columns = [
        { header: 'ID Línea', key: 'detalle_id', width: 11 },
        { header: 'Ticket #', key: 'movimiento_id', width: 11 },
        { header: 'N° Turno', key: 'caja_id', width: 11 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Operador', key: 'operador', width: 16 },
        { header: 'Producto / Servicio', key: 'producto_nombre', width: 28 },
        { header: 'Categoría', key: 'producto_categoria', width: 22 },
        { header: 'Modalidad Stock', key: 'tipo_inventario', width: 15 },
        { header: 'Modificadores / Extras', key: 'modificadores_aplicados', width: 26 },
        { header: 'Cantidad', key: 'cantidad', width: 12 },
        { header: 'Precio Unit. (Bs)', key: 'precio_unitario', width: 16 },
        { header: 'Costo Unit. CPP (Bs)', key: 'costo_unitario', width: 18 },
        { header: 'Subtotal Bruto (Bs)', key: 'subtotal', width: 18 },
        { header: 'Descuento Prorr. (Bs)', key: 'descuento_prorrateado', width: 19 },
        { header: 'Ingreso Neto (Bs)', key: 'ingreso_neto', width: 18 },
        { header: 'Costo Total CMV (Bs)', key: 'costo_total', width: 19 },
        { header: 'Utilidad Bruta (Bs)', key: 'utilidad_bruta', width: 18 },
        { header: 'Estado Ticket', key: 'estado', width: 14 }
    ];
    estiloCabecera(hojaDet.getRow(1), 'FF0369A1');

    let totCantDet = 0;
    let totSubDet = 0;
    let totDescDet = 0;
    let totNetoDet = 0;
    let totCmvDet = 0;
    let totUtilDet = 0;

    for (const d of detallesVentas) {
        if (d.estado === 'completado') {
            totCantDet = redondear2(totCantDet + Number(d.cantidad || 0));
            totSubDet = redondear2(totSubDet + Number(d.subtotal || 0));
            totDescDet = redondear2(totDescDet + Number(d.descuento_prorrateado || 0));
            totNetoDet = redondear2(totNetoDet + Number(d.ingreso_neto || 0));
            totCmvDet = redondear2(totCmvDet + Number(d.costo_total || 0));
            totUtilDet = redondear2(totUtilDet + Number(d.utilidad_bruta || 0));
        }
        hojaDet.addRow({
            ...d,
            cantidad: Number(d.cantidad || 0),
            precio_unitario: Number(d.precio_unitario || 0),
            costo_unitario: Number(d.costo_unitario || 0),
            subtotal: Number(d.subtotal || 0),
            descuento_prorrateado: Number(d.descuento_prorrateado || 0),
            ingreso_neto: Number(d.ingreso_neto || 0),
            costo_total: Number(d.costo_total || 0),
            utilidad_bruta: Number(d.utilidad_bruta || 0)
        });
    }

    if (detallesVentas.length > 0) {
        const filaTotDet = hojaDet.addRow({
            detalle_id: 'TOTAL',
            producto_nombre: 'TOTAL ÍTEMS COMPLETADOS',
            cantidad: totCantDet,
            subtotal: totSubDet,
            descuento_prorrateado: totDescDet,
            ingreso_neto: totNetoDet,
            costo_total: totCmvDet,
            utilidad_bruta: totUtilDet
        });
        estiloTotales(filaTotDet);
    }
    ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].forEach((col) => {
        hojaDet.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 4: RENTABILIDAD POR PRODUCTO (DESCUENTOS PRORRATEADOS)
    // =========================================================================
    const hojaRent = workbook.addWorksheet('Rentabilidad por Producto');
    hojaRent.columns = [
        { header: 'ID Producto', key: 'producto_id', width: 13 },
        { header: 'Producto / Servicio', key: 'producto_nombre', width: 30 },
        { header: 'Categoría', key: 'categoria', width: 22 },
        { header: 'Modalidad', key: 'tipo_inventario', width: 15 },
        { header: 'Unidades Vendidas', key: 'unidades_vendidas', width: 18 },
        { header: 'Subtotal Bruto (Bs)', key: 'subtotal_bruto', width: 18 },
        { header: 'Descuento Prorr. (Bs)', key: 'descuento_prorrateado', width: 20 },
        { header: 'Ingreso Neto (Bs)', key: 'ingreso_neto', width: 18 },
        { header: 'Costo Total CMV (Bs)', key: 'costo_cmv', width: 20 },
        { header: 'Ganancia Bruta (Bs)', key: 'ganancia_bruta', width: 19 },
        { header: 'Margen Neto (%)', key: 'margen_porcentaje', width: 16 }
    ];
    estiloCabecera(hojaRent.getRow(1), 'FF0F766E');

    for (const rp of rentabilidadPorProducto) {
        const margen = rp.ingreso_neto > 0 ? redondear2((rp.ganancia_bruta / rp.ingreso_neto) * 100) : 0;
        hojaRent.addRow({
            ...rp,
            margen_porcentaje: margen
        });
    }
    if (rentabilidadPorProducto.length > 0) {
        const margenTotal = totNetoDet > 0 ? redondear2((totUtilDet / totNetoDet) * 100) : 0;
        const filaTotRent = hojaRent.addRow({
            producto_id: 'TOTAL',
            producto_nombre: 'TOTAL RENTABILIDAD PRODUCTOS VENDIDOS',
            unidades_vendidas: totCantDet,
            subtotal_bruto: totSubDet,
            descuento_prorrateado: totDescDet,
            ingreso_neto: totNetoDet,
            costo_cmv: totCmvDet,
            ganancia_bruta: totUtilDet,
            margen_porcentaje: margenTotal
        });
        estiloTotales(filaTotRent);
    }
    ['E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((col) => {
        hojaRent.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 5: COMPRAS A PROVEEDORES Y MERMAS DE INVENTARIO (INSUMOS + DIRECTOS)
    // =========================================================================
    const hojaCompras = workbook.addWorksheet('Compras y Mermas');
    hojaCompras.columns = [
        { header: 'ID', key: 'id', width: 11 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Origen', key: 'origen', width: 22 },
        { header: 'Tipo Movimiento', key: 'tipo', width: 16 },
        { header: 'Insumo / Producto', key: 'item_nombre', width: 26 },
        { header: 'Unidad', key: 'unidad_medida', width: 12 },
        { header: 'Cantidad', key: 'cantidad', width: 13 },
        { header: 'Costo Unit. (Bs)', key: 'costo_unitario', width: 16 },
        { header: 'Monto Total (Bs)', key: 'monto_total', width: 16 },
        { header: 'Proveedor / Distribuidora', key: 'proveedor_nombre', width: 24 },
        { header: 'NIT Proveedor', key: 'proveedor_nit', width: 16 },
        { header: 'N° Factura', key: 'nro_factura_compra', width: 15 },
        { header: '¿Con Factura?', key: 'con_factura_txt', width: 14 },
        { header: 'Crédito Fiscal IVA (Bs)', key: 'credito_fiscal', width: 20 },
        { header: 'Motivo / Detalle', key: 'motivo', width: 32 }
    ];
    estiloCabecera(hojaCompras.getRow(1), 'FF15803D');

    let sumMontoCompras = 0;
    let sumMontoMermas = 0;
    let sumCfIvaCompras = 0;

    for (const cm of comprasYMermasInsumos) {
        const montoTotal = Number(cm.monto_total || 0);
        const tieneFac = Number(cm.con_factura) === 1;
        const cfIva = (cm.tipo === 'compra' && tieneFac) ? redondear2(montoTotal * (ivaPorc / 100)) : 0;
        if (cm.tipo === 'compra') {
            sumMontoCompras = redondear2(sumMontoCompras + montoTotal);
            sumCfIvaCompras = redondear2(sumCfIvaCompras + cfIva);
        } else if (cm.tipo === 'merma') {
            sumMontoMermas = redondear2(sumMontoMermas + montoTotal);
        }
        hojaCompras.addRow({
            ...cm,
            cantidad: Number(cm.cantidad || 0),
            costo_unitario: Number(cm.costo_unitario || 0),
            monto_total: montoTotal,
            con_factura_txt: tieneFac ? 'SÍ (FACTURA)' : 'NO (RECIBO/INTERNO)',
            credito_fiscal: cfIva
        });
    }
    if (comprasYMermasInsumos.length > 0) {
        const filaTotComp = hojaCompras.addRow({
            id: 'TOTAL',
            item_nombre: `Compras: Bs ${sumMontoCompras.toFixed(2)} | Mermas: Bs ${sumMontoMermas.toFixed(2)}`,
            monto_total: redondear2(sumMontoCompras + sumMontoMermas),
            credito_fiscal: sumCfIvaCompras
        });
        estiloTotales(filaTotComp);
    }
    ['G', 'H', 'I', 'N'].forEach((col) => {
        hojaCompras.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 6: INVENTARIO VALORADO Y RESUMEN KARDEX (NIC 2 - CPP)
    // =========================================================================
    const hojaKardex = workbook.addWorksheet('Inventario Kardex');
    hojaKardex.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Clase', key: 'clase', width: 18 },
        { header: 'Nombre Ítem', key: 'nombre', width: 28 },
        { header: 'Unidad', key: 'unidad_medida', width: 12 },
        { header: 'Total Entradas (Compras)', key: 'total_compras', width: 22 },
        { header: 'Total Salidas (Ventas)', key: 'total_consumo_ventas', width: 20 },
        { header: 'Total Mermas', key: 'total_mermas', width: 15 },
        { header: 'Stock Actual Físico', key: 'stock_actual', width: 18 },
        { header: 'Costo Unitario CPP (Bs)', key: 'costo_por_unidad', width: 21 },
        { header: 'Valor Total Inventario (Bs)', key: 'valor_inventario', width: 24 }
    ];
    estiloCabecera(hojaKardex.getRow(1), 'FF4338CA');

    let valorTotalInventario = 0;
    for (const item of [...insumosKardex, ...productosDirectosKardex]) {
        const val = Number(item.valor_inventario || 0);
        valorTotalInventario = redondear2(valorTotalInventario + val);
        hojaKardex.addRow({
            ...item,
            total_compras: Number(item.total_compras || 0),
            total_consumo_ventas: Number(item.total_consumo_ventas || 0),
            total_mermas: Number(item.total_mermas || 0),
            stock_actual: Number(item.stock_actual || 0),
            costo_por_unidad: Number(item.costo_por_unidad || 0),
            valor_inventario: val
        });
    }
    const filaTotKardex = hojaKardex.addRow({
        id: 'TOTAL',
        nombre: 'VALORIZACIÓN TOTAL DEL INVENTARIO ACTUAL (NIC 2)',
        valor_inventario: valorTotalInventario
    });
    estiloTotales(filaTotKardex);
    ['E', 'F', 'G', 'H', 'I', 'J'].forEach((col) => {
        hojaKardex.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 7: KARDEX PRODUCTOS (HISTORIAL CRONOLÓGICO CON SALDOS Y VALORIZACIÓN)
    // =========================================================================
    const hojaKardexProd = workbook.addWorksheet('Kardex Productos');
    hojaKardexProd.columns = [
        { header: 'ID Kardex', key: 'id', width: 11 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Producto Directo', key: 'producto_nombre', width: 28 },
        { header: 'Unidad', key: 'unidad_medida', width: 11 },
        { header: 'Tipo Movimiento', key: 'tipo', width: 18 },
        { header: 'Ticket #', key: 'movimiento_id', width: 11 },
        { header: 'Operador', key: 'operador', width: 15 },
        { header: 'Entrada (+)', key: 'entrada', width: 14 },
        { header: 'Salida (-)', key: 'salida', width: 14 },
        { header: 'Saldo Físico', key: 'stock_resultante', width: 14 },
        { header: 'Costo Unit. Mov (Bs)', key: 'costo_unitario', width: 19 },
        { header: 'Importe Mov (Bs)', key: 'monto_total', width: 17 },
        { header: 'CPP Resultante (Bs)', key: 'costo_promedio_resultante', width: 19 },
        { header: 'Valor Saldo (Bs)', key: 'valor_saldo', width: 18 },
        { header: 'Motivo / Respaldo', key: 'motivo', width: 34 }
    ];
    estiloCabecera(hojaKardexProd.getRow(1), 'FF6D28D9');

    let totEntradasKardex = 0;
    let totSalidasKardex = 0;
    for (const kp of kardexCronologicoProductos) {
        const cant = Number(kp.cantidad || 0);
        const esEntrada = ['inventario_inicial', 'compra', 'reingreso_anulacion'].includes(kp.tipo)
            || (kp.tipo === 'ajuste' && cant >= 0);
        const entrada = esEntrada ? Math.abs(cant) : 0;
        const salida = !esEntrada ? Math.abs(cant) : 0;
        const saldo = Number(kp.stock_resultante || 0);
        const cppRes = Number(kp.costo_promedio_resultante || kp.costo_unitario || 0);
        const valorSaldo = redondear2(saldo * cppRes);

        totEntradasKardex = redondear2(totEntradasKardex + entrada);
        totSalidasKardex = redondear2(totSalidasKardex + salida);

        hojaKardexProd.addRow({
            id: kp.id,
            fecha_hora: kp.fecha_hora,
            producto_nombre: kp.producto_nombre,
            unidad_medida: kp.unidad_medida,
            tipo: kp.tipo,
            movimiento_id: kp.movimiento_id || '—',
            operador: kp.operador,
            entrada,
            salida,
            stock_resultante: saldo,
            costo_unitario: Number(kp.costo_unitario || 0),
            monto_total: Number(kp.monto_total || 0),
            costo_promedio_resultante: cppRes,
            valor_saldo: valorSaldo,
            motivo: kp.motivo || ''
        });
    }
    if (kardexCronologicoProductos.length > 0) {
        const filaTotKp = hojaKardexProd.addRow({
            id: 'TOTAL',
            producto_nombre: 'MOVIMIENTOS DEL PERIODO',
            entrada: totEntradasKardex,
            salida: totSalidasKardex
        });
        estiloTotales(filaTotKp);
    }
    ['H', 'I', 'J', 'K', 'L', 'M', 'N'].forEach((col) => {
        hojaKardexProd.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 8: KARDEX INSUMOS (HISTORIAL CRONOLÓGICO CON SALDOS Y VALORIZACIÓN)
    // =========================================================================
    const hojaKardexIns = workbook.addWorksheet('Kardex Insumos');
    hojaKardexIns.columns = [
        { header: 'ID Kardex', key: 'id', width: 11 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Insumo / Material', key: 'insumo_nombre', width: 28 },
        { header: 'Unidad', key: 'unidad_medida', width: 11 },
        { header: 'Tipo Movimiento', key: 'tipo', width: 18 },
        { header: 'Ticket #', key: 'movimiento_id', width: 11 },
        { header: 'Operador', key: 'operador', width: 15 },
        { header: 'Entrada (+)', key: 'entrada', width: 14 },
        { header: 'Salida (-)', key: 'salida', width: 14 },
        { header: 'Saldo Físico', key: 'stock_resultante', width: 14 },
        { header: 'Costo Unit. Mov (Bs)', key: 'costo_unitario', width: 19 },
        { header: 'Importe Mov (Bs)', key: 'monto_total', width: 17 },
        { header: 'CPP Resultante (Bs)', key: 'costo_promedio_resultante', width: 19 },
        { header: 'Valor Saldo (Bs)', key: 'valor_saldo', width: 18 },
        { header: 'Motivo / Respaldo', key: 'motivo', width: 34 }
    ];
    estiloCabecera(hojaKardexIns.getRow(1), 'FF4F46E5');

    let totEntradasKardexIns = 0;
    let totSalidasKardexIns = 0;
    for (const ki of kardexCronologicoInsumos) {
        const cant = Number(ki.cantidad || 0);
        const esEntrada = ['inventario_inicial', 'compra', 'reingreso_anulacion'].includes(ki.tipo)
            || (ki.tipo === 'ajuste' && cant >= 0);
        const entrada = esEntrada ? Math.abs(cant) : 0;
        const salida = !esEntrada ? Math.abs(cant) : 0;
        const saldo = Number(ki.stock_resultante || 0);
        const cppRes = Number(ki.costo_promedio_resultante || ki.costo_unitario || 0);
        const valorSaldo = redondear2(saldo * cppRes);

        totEntradasKardexIns = redondear2(totEntradasKardexIns + entrada);
        totSalidasKardexIns = redondear2(totSalidasKardexIns + salida);

        hojaKardexIns.addRow({
            id: ki.id,
            fecha_hora: ki.fecha_hora,
            insumo_nombre: ki.insumo_nombre,
            unidad_medida: ki.unidad_medida,
            tipo: ki.tipo,
            movimiento_id: ki.movimiento_id || '—',
            operador: ki.operador,
            entrada,
            salida,
            stock_resultante: saldo,
            costo_unitario: Number(ki.costo_unitario || 0),
            monto_total: Number(ki.monto_total || 0),
            costo_promedio_resultante: cppRes,
            valor_saldo: valorSaldo,
            motivo: ki.motivo || ''
        });
    }
    if (kardexCronologicoInsumos.length > 0) {
        const filaTotKi = hojaKardexIns.addRow({
            id: 'TOTAL',
            insumo_nombre: 'MOVIMIENTOS DE INSUMOS DEL PERIODO',
            entrada: totEntradasKardexIns,
            salida: totSalidasKardexIns
        });
        estiloTotales(filaTotKi);
    }
    ['H', 'I', 'J', 'K', 'L', 'M', 'N'].forEach((col) => {
        hojaKardexIns.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 9: HISTORIAL DE ANULACIONES AUDITADAS
    // =========================================================================
    const hojaAnul = workbook.addWorksheet('Historial Anulaciones');
    hojaAnul.columns = [
        { header: 'ID Mov.', key: 'id', width: 11 },
        { header: 'N° Turno', key: 'caja_id', width: 11 },
        { header: 'Estación / Caja', key: 'caja_nombre', width: 20 },
        { header: 'Fecha Original', key: 'fecha_hora', width: 20 },
        { header: 'Operador Original', key: 'operador', width: 17 },
        { header: 'Categoría', key: 'categoria_contable', width: 16 },
        { header: 'Método Pago', key: 'metodo_pago', width: 14 },
        { header: 'Monto Revertido (Bs)', key: 'monto', width: 20 },
        { header: 'Efectivo Revertido (Bs)', key: 'monto_efectivo', width: 21 },
        { header: 'QR Revertido (Bs)', key: 'monto_qr', width: 18 },
        { header: 'Anulado Por', key: 'anulado_por_nombre', width: 17 },
        { header: 'Fecha Anulación', key: 'fecha_anulacion', width: 20 },
        { header: 'Motivo de Anulación', key: 'motivo_anulacion', width: 32 }
    ];
    estiloCabecera(hojaAnul.getRow(1), 'FFDC2626');

    const movimientosAnulados = movimientos.filter((m) => m.estado === 'anulado');
    let sumMontoAnulado = 0;
    let sumEfAnulado = 0;
    let sumQrAnulado = 0;
    for (const ma of movimientosAnulados) {
        const mNum = Number(ma.monto || 0);
        const efNum = Number(ma.monto_efectivo || 0);
        const qrNum = Number(ma.monto_qr || 0);
        sumMontoAnulado = redondear2(sumMontoAnulado + mNum);
        sumEfAnulado = redondear2(sumEfAnulado + efNum);
        sumQrAnulado = redondear2(sumQrAnulado + qrNum);
        hojaAnul.addRow({
            id: ma.id,
            caja_id: ma.caja_id,
            caja_nombre: ma.caja_nombre || 'Caja Principal',
            fecha_hora: ma.fecha_hora,
            operador: ma.operador,
            categoria_contable: ma.categoria_contable,
            metodo_pago: ma.metodo_pago,
            monto: mNum,
            monto_efectivo: efNum,
            monto_qr: qrNum,
            anulado_por_nombre: ma.anulado_por_nombre || 'Administrador',
            fecha_anulacion: ma.fecha_anulacion || '—',
            motivo_anulacion: ma.motivo_anulacion || '—'
        });
    }
    if (movimientosAnulados.length > 0) {
        const filaTotAnul = hojaAnul.addRow({
            id: 'TOTAL',
            caja_nombre: `${movimientosAnulados.length} anulación(es)`,
            monto: sumMontoAnulado,
            monto_efectivo: sumEfAnulado,
            monto_qr: sumQrAnulado
        });
        estiloTotales(filaTotAnul);
    }
    ['H', 'I', 'J'].forEach((col) => {
        hojaAnul.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 10: RESUMEN CONTABLE, ESTADO DE RESULTADOS Y RESUMEN DE IMPUESTOS
    // =========================================================================
    const hojaRes = workbook.addWorksheet('Resumen Contable');
    hojaRes.columns = [
        { header: 'Concepto / Indicador Contable', key: 'concepto', width: 48 },
        { header: 'Importe (Bs) / Detalle', key: 'valor', width: 30 }
    ];
    estiloCabecera(hojaRes.getRow(1), 'FF0F172A');

    const regimenTexto = negocio?.regimen_tributario === 'regimen_general'
        ? `Régimen General (IVA ${ivaPorc}% / IT ${itPorc}%)`
        : 'Control Interno / Régimen Simplificado (Sin IVA)';
    const periodoTexto = cajaId
        ? `Turno de Caja #${cajaId}`
        : (filtros?.desde || filtros?.hasta ? `Desde ${filtros.desde || 'Inicio'} hasta ${filtros.hasta || 'Hoy'}` : 'Histórico Completo');

    hojaRes.addRow({ concepto: 'Nombre del Establecimiento', valor: negocio?.nombre_negocio || 'Mi Negocio' });
    hojaRes.addRow({ concepto: 'NIT del Establecimiento', valor: negocio?.nit_negocio || 'No registrado' });
    hojaRes.addRow({ concepto: 'Régimen Configurado', valor: regimenTexto });
    hojaRes.addRow({ concepto: 'Periodo / Alcance del Reporte', valor: periodoTexto });
    hojaRes.addRow({ concepto: 'Generado por Usuario', valor: usuarioGenerador });
    hojaRes.addRow({ concepto: 'Fecha de Generación (Hora Local Bolivia)', valor: new Date().toLocaleString('es-BO') });
    hojaRes.addRow({ concepto: '--- ESTADO DE RESULTADOS OPERATIVO ---', valor: '' });
    hojaRes.addRow({ concepto: '(+) Ventas Brutas de Productos/Servicios', valor: sumSubtotalVentas });
    hojaRes.addRow({ concepto: '(-) Descuentos Otorgados en Ventas', valor: sumDescuentoVentas });
    hojaRes.addRow({ concepto: '(=) Ventas Netas Cobradas', valor: sumMontoVentas });
    hojaRes.addRow({ concepto: '    • Cobrado en Efectivo Físico (movimientos_pagos)', valor: sumEfectivoVentas });
    hojaRes.addRow({ concepto: '    • Cobrado por QR / Banco (movimientos_pagos)', valor: sumQrVentas });
    hojaRes.addRow({ concepto: '(-) Costo de Mercadería Vendida (CMV - NIC 2 CPP)', valor: sumCostoVentas });
    hojaRes.addRow({ concepto: '(=) UTILIDAD / GANANCIA BRUTA EN VENTAS', valor: sumUtilidadVentas });
    hojaRes.addRow({ concepto: '(-) Gastos y Egresos Operativos de Caja', valor: sumEgresos });
    hojaRes.addRow({ concepto: '(=) FLUJO NETO OPERATIVO DEL PERIODO', valor: redondear2(sumUtilidadVentas - sumEgresos) });
    hojaRes.addRow({ concepto: '(i) Aportes de Cambio / Sencillo (No son ingreso de venta)', valor: sumAportesCambio });
    hojaRes.addRow({ concepto: '(i) Compras de Inventario del Periodo (Insumos + Directos)', valor: sumMontoCompras });
    hojaRes.addRow({ concepto: '(i) Mermas de Inventario del Periodo (Insumos + Directos)', valor: sumMontoMermas });
    hojaRes.addRow({ concepto: '(i) Valor Actual del Inventario en Almacén (NIC 2)', valor: valorTotalInventario });

    if (negocio?.regimen_tributario === 'regimen_general' || sumIvaVentas > 0 || sumItVentas > 0 || sumCfIvaCompras > 0 || sumCfIvaEgresos > 0) {
        const creditoFiscalTotal = redondear2(sumCfIvaCompras + sumCfIvaEgresos);
        hojaRes.addRow({ concepto: '--- RESUMEN DE IMPUESTOS (SNAPSHOT FISCAL CONGELADO) ---', valor: '' });
        hojaRes.addRow({ concepto: `Débito Fiscal IVA en Ventas Facturadas`, valor: sumIvaVentas });
        hojaRes.addRow({ concepto: `Impuesto a las Transacciones IT (base: ${negocio?.it_base || 'todas_las_ventas'} - a confirmar con el contador)`, valor: sumItVentas });
        hojaRes.addRow({ concepto: `Crédito Fiscal IVA en Compras Facturadas de Inventario`, valor: sumCfIvaCompras });
        hojaRes.addRow({ concepto: `Crédito Fiscal IVA en Egresos Operativos Facturados`, valor: sumCfIvaEgresos });
        hojaRes.addRow({ concepto: `(=) Posición Neta IVA Estimada (Débito - Crédito Fiscal)`, valor: redondear2(sumIvaVentas - creditoFiscalTotal) });
    }

    return await workbook.xlsx.writeBuffer();
}


module.exports = {
    ...repositories,
    calcularCostoPromedioPonderado,
    prorratearDescuentoTicket,
    normalizarRegimen,
    validarRegimenYPermisosVenta,
    validarRegimenYPermisosEgreso,
    calcularSnapshotFiscalVenta,
    calcularSnapshotFiscalEgreso,
    crearInsumo,
    obtenerInsumos,
    registrarCompraInsumo,
    registrarMermaInsumo,
    asignarIngredienteReceta,
    calcularDisponibilidadProducto,
    obtenerCategorias,
    crearCategoria,
    crearProductoConInsumos,
    crearProducto,
    registrarCompraProductoDirecto,
    registrarMermaProductoDirecto,
    verificarIntegridadKardexDirecto,
    verificarIntegridadKardexInsumos,
    obtenerKardexDetallado,
    obtenerProductos,
    registrarVentaCompleta,
    registrarEgreso,
    registrarIngresoEfectivo,
    anularMovimientoConPermiso,
    obtenerMovimientosCaja,
    obtenerPrediccionComprasInsumos,
    obtenerEstadisticasCaja,
    obtenerDesgloseMetodosPago,
    obtenerTendenciasVentas,
    generarReporteCSV,
    generarReporteExcel,
    sanitizarTextoCSV,
    obtenerGruposModificadores,
    crearGrupoModificadores,
    actualizarGrupoModificadores,
    eliminarGrupoModificadores,
    asignarModificadoresAProducto
};
