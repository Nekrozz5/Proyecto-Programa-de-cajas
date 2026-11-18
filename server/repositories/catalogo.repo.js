/**
 * server/repositories/catalogo.repo.js
 * Repositorio para la gestión del catálogo de productos, categorías, recetas (BOM),
 * grupos de modificadores y combos/promociones.
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
    const precioValidado = redondear2(numeroNoNegativo(precio, 'El precio del producto'));

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
                ? String(arguments[0].unidadMedida).trim().toLowerCase()
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

            if (fechaVenc && stockInicial > 0) {
                await runQuery(
                    `INSERT INTO producto_lotes (producto_id, fecha_vencimiento, stock, costo_unitario, activo)
                     VALUES (?, ?, ?, ?, 1)`,
                    [productoId, fechaVenc, stockInicial, costoInicial]
                );
            }

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
    const precioValidado = redondear2(numeroNoNegativo(precio, 'El precio del producto'));
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
            [nombre.trim(), precioValidado, costoValidado, categoria ? String(categoria).trim() : '', unidadMedida ? String(unidadMedida).trim().toLowerCase() : 'unidades', tipoInventario, stockValidado, stockMinimoValidado, fechaVencimiento || null]
        );
        const prodId = res.lastID;

        if (tipoInventario === 'directo') {
            const fechaVencLimpia = fechaVencimiento && String(fechaVencimiento).trim() !== ''
                ? String(fechaVencimiento).trim()
                : null;
            if (fechaVencLimpia && stockValidado > 0) {
                await runQuery(
                    `INSERT INTO producto_lotes (producto_id, fecha_vencimiento, stock, costo_unitario, activo)
                     VALUES (?, ?, ?, ?, 1)`,
                    [prodId, fechaVencLimpia, stockValidado, costoValidado]
                );
            }

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
    const [productos, gruposModificadores, enlaces, todosInsumos, recetasTodas, componentesCombos, lotesActivos] = await Promise.all([
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
        allQuery(`
            SELECT r.producto_id, r.insumo_id, r.cantidad_requerida,
                   i.nombre as insumo_nombre, i.unidad_medida as insumo_unidad, i.costo_por_unidad as insumo_costo
            FROM recetas r
            LEFT JOIN insumos i ON r.insumo_id = i.id
        `),
        allQuery(`
            SELECT cc.combo_producto_id, cc.componente_producto_id, cc.cantidad,
                   p.nombre as componente_nombre, p.tipo_inventario as componente_tipo,
                   p.stock as componente_stock, p.costo as componente_costo
            FROM combo_componentes cc
            INNER JOIN productos p ON cc.componente_producto_id = p.id
            WHERE p.activo = 1
        `),
        allQuery(`
            SELECT id, producto_id, fecha_vencimiento, stock, costo_unitario
            FROM producto_lotes
            WHERE activo = 1 AND stock > 0
            ORDER BY fecha_vencimiento ASC, id ASC
        `)
    ]);

    const mapaGrupos = new Map(gruposModificadores.map((g) => [g.id, g]));
    const gruposPorProducto = {};
    for (const e of enlaces) {
        if (!gruposPorProducto[e.producto_id]) gruposPorProducto[e.producto_id] = [];
        gruposPorProducto[e.producto_id].push(e.grupo_id);
    }

    const lotesPorProducto = {};
    for (const l of lotesActivos) {
        if (!lotesPorProducto[l.producto_id]) lotesPorProducto[l.producto_id] = [];
        lotesPorProducto[l.producto_id].push({
            id: l.id,
            producto_id: l.producto_id,
            fecha_vencimiento: l.fecha_vencimiento,
            stock: Number(l.stock || 0),
            costo_unitario: Number(l.costo_unitario || 0)
        });
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
            receta: recetasPorProducto[p.id] || [],
            unidades_disponibles: unidadesDisponibles,
            insumo_limitante: insumoLimitante,
            esta_vigente: estaVigente,
            motivo_no_vigente: motivoNoVigente,
            componentes_combo: componentesPorCombo[p.id] || [],
            grupos_modificadores_ids: idsGrupos,
            grupos_modificadores: gruposAsignados,
            lotes: p.tipo_inventario === 'directo' ? (lotesPorProducto[p.id] || []) : []
        };
    });
}

/**
 * Actualiza los datos de un producto (nombre, precio, categoría, stock mínimo, recetas y combos).
 */
async function actualizarProducto(productoId, datos = {}, usuarioId = null) {
    const prodId = Number(productoId);
    if (!Number.isFinite(prodId) || prodId <= 0) {
        throw new Error('ID de producto inválido.');
    }

    return await enTransaccion(async () => {
        const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [prodId]);
        if (!prod) {
            throw new Error('Producto no encontrado o inactivo.');
        }

        const nombreFinal = datos.nombre !== undefined ? String(datos.nombre).trim() : prod.nombre;
        if (!nombreFinal) {
            throw new Error('El nombre del producto no puede estar vacío.');
        }

        const precioFinal = datos.precio !== undefined
            ? redondear2(numeroNoNegativo(datos.precio, 'El precio del producto'))
            : prod.precio;

        // Normalizar categorías si se proporcionan
        let catFinal = prod.categoria;
        if (datos.categorias !== undefined || datos.categoria !== undefined) {
            let listaCategorias = [];
            if (Array.isArray(datos.categorias) && datos.categorias.length > 0) {
                listaCategorias = datos.categorias;
            } else if (Array.isArray(datos.categoria)) {
                listaCategorias = datos.categoria;
            } else if (typeof datos.categoria === 'string' && datos.categoria.trim() !== '') {
                listaCategorias = datos.categoria.split(',').map((c) => c.trim()).filter(Boolean);
            }

            listaCategorias = listaCategorias
                .map((c) => String(c).trim())
                .filter((c) => c !== '' && c.toLowerCase() !== 'todas');

            const catsUnicas = [];
            const seenCats = new Set();
            for (const c of listaCategorias) {
                if (!seenCats.has(c.toLowerCase())) {
                    seenCats.add(c.toLowerCase());
                    catsUnicas.push(c);
                }
            }
            catFinal = catsUnicas.join(', ');

            for (const c of catsUnicas) {
                await runQuery(`INSERT OR IGNORE INTO categorias (nombre, activo) VALUES (?, 1)`, [c]);
            }
        }

        const stockMinimoInput = datos.stock_minimo !== undefined ? datos.stock_minimo : datos.stockMinimo;
        const stockMinimoFinal = stockMinimoInput !== undefined
            ? Number(numeroNoNegativo(stockMinimoInput, 'El stock mínimo').toFixed(4))
            : Number(prod.stock_minimo || 0);

        const fechaVencimientoFinal = datos.fecha_vencimiento !== undefined
            ? datos.fecha_vencimiento
            : (datos.fechaVencimiento !== undefined ? datos.fechaVencimiento : prod.fecha_vencimiento);

        await runQuery(
            `UPDATE productos
             SET nombre = ?, precio = ?, categoria = ?, stock_minimo = ?, fecha_vencimiento = ?
             WHERE id = ?`,
            [nombreFinal, precioFinal, catFinal, stockMinimoFinal, fechaVencimientoFinal ? String(fechaVencimientoFinal).trim() : null, prodId]
        );

        // Si es receta y se envían insumosReceta, reemplazar atómicamente y recalcular costos
        if (prod.tipo_inventario === 'receta') {
            const insumosReceta = Array.isArray(datos.insumosReceta)
                ? datos.insumosReceta
                : (Array.isArray(datos.receta) ? datos.receta : (Array.isArray(datos.insumos) ? datos.insumos : null));

            if (insumosReceta !== null) {
                if (insumosReceta.length === 0) {
                    throw new Error('Debes agregar al menos un insumo para la receta o ensamblaje.');
                }
                if (insumosReceta.length > 30) {
                    throw new Error('Límite excedido: No se pueden agregar más de 30 insumos en una sola receta.');
                }

                await runQuery(`DELETE FROM recetas WHERE producto_id = ?`, [prodId]);
                const insumosUnicos = new Set();

                for (const ing of insumosReceta) {
                    if (!ing) continue;
                    const insumoId = Number(ing.insumoId || ing.insumo_id);
                    if (!insumoId) continue;
                    if (insumosUnicos.has(insumoId)) {
                        throw new Error(`El insumo ID ${insumoId} está duplicado en la receta.`);
                    }
                    insumosUnicos.add(insumoId);

                    const insumo = await getQuery(`SELECT id, nombre, unidad_medida FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
                    if (!insumo) {
                        throw new Error(`El insumo con ID ${insumoId} no existe o está inactivo.`);
                    }

                    const cantVal = numeroPositivo(ing.cantidad ?? ing.cantidad_requerida, `La cantidad del insumo ${insumo.nombre}`);
                    const unidadOrigen = ing.unidadReceta || ing.unidad_medida || ing.insumo_unidad;
                    const cantidadConvertidaAlmacen = unidadOrigen
                        ? convertirCantidadMedida(cantVal, unidadOrigen, insumo.unidad_medida)
                        : cantVal;

                    await runQuery(
                        `INSERT INTO recetas (producto_id, insumo_id, cantidad_requerida) VALUES (?, ?, ?)`,
                        [prodId, insumoId, cantidadConvertidaAlmacen]
                    );
                }

                await recalcularCostoProductoPorReceta(prodId);
                await recalcularCostoCombosQueContienenProducto(prodId);
            }
        }

        // Si es combo y se envían componentes, actualizar combo_componentes y recalcular costo
        if (prod.tipo_inventario === 'combo') {
            const componentes = Array.isArray(datos.componentesCombo)
                ? datos.componentesCombo
                : (Array.isArray(datos.componentes) ? datos.componentes : (Array.isArray(datos.componentes_combo) ? datos.componentes_combo : null));

            if (componentes !== null) {
                const componentesLimpios = componentes.filter((c) => c && (c.productoId || c.componente_producto_id) && Number(c.cantidad) > 0);
                if (componentesLimpios.length === 0) {
                    throw new Error('Debes agregar al menos un producto componente con cantidad mayor a 0 para el combo.');
                }
                if (componentesLimpios.length > 20) {
                    throw new Error('Límite excedido: No se pueden agregar más de 20 componentes en un solo combo.');
                }

                await runQuery(`DELETE FROM combo_componentes WHERE combo_producto_id = ?`, [prodId]);
                const componentesUnicos = new Set();

                for (const comp of componentesLimpios) {
                    const compProdId = Number(comp.productoId || comp.componente_producto_id);
                    if (compProdId === prodId) {
                        throw new Error('Un combo no puede contenerse a sí mismo.');
                    }
                    if (componentesUnicos.has(compProdId)) {
                        throw new Error(`El producto ID ${compProdId} está duplicado en los componentes del combo.`);
                    }
                    componentesUnicos.add(compProdId);

                    const productoComp = await getQuery(`SELECT id, nombre, tipo_inventario FROM productos WHERE id = ? AND activo = 1`, [compProdId]);
                    if (!productoComp) {
                        throw new Error(`El producto componente con ID ${compProdId} no existe o está inactivo.`);
                    }
                    if (productoComp.tipo_inventario === 'combo') {
                        throw new Error(`El producto "${productoComp.nombre}" es un combo. No se permiten combos anidados.`);
                    }

                    const cantVal = numeroPositivo(comp.cantidad, `La cantidad del componente ${productoComp.nombre}`);
                    await runQuery(
                        `INSERT INTO combo_componentes (combo_producto_id, componente_producto_id, cantidad) VALUES (?, ?, ?)`,
                        [prodId, compProdId, cantVal]
                    );
                }

                await recalcularCostoCombo(prodId);
            }

            if (datos.limiteMaximoActivo !== undefined || datos.limite_maximo_activo !== undefined) {
                const limiteActivo = (datos.limiteMaximoActivo ?? datos.limite_maximo_activo) ? 1 : 0;
                let limiteTotal = prod.limite_unidades_total;
                let limiteRestante = prod.limite_unidades_restante;
                if (limiteActivo) {
                    const lInput = datos.limiteUnidadesTotal ?? datos.limite_unidades_total;
                    if (lInput !== undefined) {
                        limiteTotal = Math.floor(numeroPositivo(lInput, 'La cantidad máxima de venta del combo'));
                        limiteRestante = limiteTotal;
                    }
                } else {
                    limiteTotal = null;
                    limiteRestante = null;
                }
                await runQuery(
                    `UPDATE productos SET limite_maximo_activo = ?, limite_unidades_total = ?, limite_unidades_restante = ? WHERE id = ?`,
                    [limiteActivo, limiteTotal, limiteRestante, prodId]
                );
            }

            if (datos.fechaInicioVigencia !== undefined || datos.fecha_inicio_vigencia !== undefined ||
                datos.fechaFinVigencia !== undefined || datos.fecha_fin_vigencia !== undefined) {
                const fIni = (datos.fechaInicioVigencia ?? datos.fecha_inicio_vigencia) || null;
                const fFin = (datos.fechaFinVigencia ?? datos.fecha_fin_vigencia) || null;
                if (fIni && fFin && new Date(fIni) > new Date(fFin)) {
                    throw new Error('La fecha y hora de inicio de vigencia no puede ser posterior a la fecha y hora final.');
                }
                await runQuery(
                    `UPDATE productos SET fecha_inicio_vigencia = ?, fecha_fin_vigencia = ? WHERE id = ?`,
                    [fIni ? String(fIni).trim() : null, fFin ? String(fFin).trim() : null, prodId]
                );
            }
        }

        // Si otros combos contienen a este producto (directo o receta), recalcular sus costos
        await recalcularCostoCombosQueContienenProducto(prodId);

        return await getQuery(`SELECT * FROM productos WHERE id = ?`, [prodId]);
    });
}

/**
 * Da de baja lógica a un producto o receta del catálogo (activo = 0).
 * Protege la integridad de ventas históricas y valida que no forme parte de combos activos.
 */
async function eliminarProducto(productoId, adminId) {
    const prodId = Number(productoId);
    if (!prodId || isNaN(prodId)) throw new Error('ID de producto inválido.');

    return await enTransaccion(async () => {
        const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [prodId]);
        if (!prod) throw new Error('El artículo no existe o ya fue eliminado del catálogo.');

        // Verificar si forma parte de algún combo activo
        const combosQueLoUsan = await allQuery(
            `SELECT p.nombre 
             FROM combo_componentes cc
             JOIN productos p ON cc.combo_producto_id = p.id
             WHERE cc.componente_producto_id = ? AND p.activo = 1`,
            [prodId]
        );
        if (combosQueLoUsan.length > 0) {
            const nombres = combosQueLoUsan.map((c) => `"${c.nombre}"`).join(', ');
            throw new Error(`No se puede eliminar el artículo porque forma parte del combo activo: ${nombres}.`);
        }

        // Baja lógica: preservar trazabilidad contable y de movimientos
        await runQuery(`UPDATE productos SET activo = 0 WHERE id = ?`, [prodId]);

        return { id: prodId, nombre: prod.nombre, eliminado: true };
    });
}

module.exports = {
    FACTORES_CONVERSION_METRICA,
    convertirCantidadMedida,
    recalcularCostoCombo,
    recalcularCostoCombosQueContienenProducto,
    recalcularCostoProductoPorReceta,
    asignarIngredienteReceta,
    calcularDisponibilidadProducto,
    obtenerCategorias,
    crearCategoria,
    crearProductoConInsumos,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    obtenerGruposModificadores,
    crearGrupoModificadores,
    actualizarGrupoModificadores,
    eliminarGrupoModificadores,
    asignarModificadoresAProducto,
    obtenerProductos
};
