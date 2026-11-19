/**
 * server/repositories/analiticas.repo.js
 * Repositorio de analíticas de alto valor y métricas de inteligencia comercial:
 * - Matriz de rendimiento de productos (Ingeniería de Menú / Clasificación BCG ejecutiva).
 * - Semáforo de reposición de inventario con sugerencia de compra y costos estimados.
 * - Radar de vencimientos para lotes e insumos perecederos con alertas de urgencia.
 */

const {
    allQuery,
    redondear2
} = require('./db');

/**
 * Normaliza y calcula los días restantes para una fecha de vencimiento dada (YYYY-MM-DD).
 * @param {string} fechaStr 
 * @returns {number|null} Diferencia en días enteros (negativo si está vencido, 0 si vence hoy).
 */
function calcularDiasHastaVencimiento(fechaStr) {
    if (!fechaStr) return null;
    const str = String(fechaStr).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;

    const anio = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10) - 1;
    const dia = parseInt(match[3], 10);

    const fechaVenc = new Date(anio, mes, dia);
    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

    const diffMs = fechaVenc.getTime() - hoy.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * a) Matriz de Rendimiento de Productos
 * Analiza el desempeño de los productos vendidos en los últimos N días.
 * Agrupa por producto: unidades vendidas, ingresos totales, costo total (CMV) y margen unitario promedio (Bs).
 * Calcula promedios generales de volumen y margen.
 * Clasifica cada ítem en:
 * - 'lideres': Volumen >= Promedio y Margen >= Promedio
 * - 'volumen_bajo_margen': Volumen >= Promedio y Margen < Promedio
 * - 'alto_margen_impulsar': Volumen < Promedio y Margen >= Promedio
 * - 'bajo_rendimiento': Volumen < Promedio y Margen < Promedio
 * 
 * @param {number} [dias=30] Ventana temporal en días
 */
async function obtenerMatrizRendimiento(dias = 30) {
    const diasValidados = Math.max(1, parseInt(dias, 10) || 30);
    const intervaloModificador = `-${diasValidados} days`;

    const sqlMatriz = `
        SELECT 
            p.id as producto_id,
            p.nombre as producto_nombre,
            p.categoria,
            p.tipo_inventario,
            ROUND(SUM(d.cantidad), 2) as unidades_vendidas,
            ROUND(SUM(
                CASE 
                    WHEN COALESCE(m.subtotal_bruto, 0) > 0 AND COALESCE(m.descuento_total, 0) > 0 
                    THEN d.subtotal * (1.0 - (m.descuento_total * 1.0 / m.subtotal_bruto))
                    ELSE d.subtotal 
                END
            ), 2) as ingresos_totales,
            ROUND(SUM(d.cantidad * d.costo_unitario), 2) as costo_total
        FROM detalle_movimientos d
        INNER JOIN movimientos m ON d.movimiento_id = m.id
        INNER JOIN productos p ON d.producto_id = p.id
        WHERE m.tipo = 'ingreso'
          AND m.estado = 'completado'
          AND COALESCE(m.categoria_contable, 'venta') = 'venta'
          AND datetime(m.fecha_hora, 'localtime') >= datetime('now', 'localtime', ?)
        GROUP BY p.id, p.nombre, p.categoria, p.tipo_inventario
        ORDER BY unidades_vendidas DESC, ingresos_totales DESC
    `;

    const rows = await allQuery(sqlMatriz, [intervaloModificador]);

    const productos = rows.map((r) => {
        const unidades = Number(r.unidades_vendidas || 0);
        const ingresos = redondear2(Number(r.ingresos_totales || 0));
        const costo = redondear2(Number(r.costo_total || 0));
        const margen = redondear2(ingresos - costo);
        const margenUnitario = unidades > 0 ? redondear2(margen / unidades) : 0;

        return {
            producto_id: r.producto_id,
            producto_nombre: r.producto_nombre,
            categoria: r.categoria || 'General',
            tipo_inventario: r.tipo_inventario,
            unidades_vendidas: unidades,
            ingresos_totales: ingresos,
            costo_total: costo,
            margen_total: margen,
            margen_unitario_promedio: margenUnitario,
            estado: 'bajo_rendimiento',
            clasificacion: 'bajo_rendimiento'
        };
    });

    const totalProductos = productos.length;
    const totalVolumen = productos.reduce((acc, p) => acc + p.unidades_vendidas, 0);
    const promedioVolumen = totalProductos > 0 ? redondear2(totalVolumen / totalProductos) : 0;

    const totalMargenUnitario = productos.reduce((acc, p) => acc + p.margen_unitario_promedio, 0);
    const promedioMargen = totalProductos > 0 ? redondear2(totalMargenUnitario / totalProductos) : 0;

    for (const p of productos) {
        const esAltoVolumen = p.unidades_vendidas >= promedioVolumen;
        const esAltoMargen = p.margen_unitario_promedio >= promedioMargen;

        let estado;
        if (esAltoVolumen && esAltoMargen) {
            estado = 'lideres';
        } else if (esAltoVolumen && !esAltoMargen) {
            estado = 'volumen_bajo_margen';
        } else if (!esAltoVolumen && esAltoMargen) {
            estado = 'alto_margen_impulsar';
        } else {
            estado = 'bajo_rendimiento';
        }

        p.estado = estado;
        p.clasificacion = estado;
    }

    return {
        dias: diasValidados,
        promedios: {
            volumen: promedioVolumen,
            margen: promedioMargen
        },
        promedioVolumen,
        promedioMargen,
        totalProductos,
        totalUnidadesVendidas: redondear2(totalVolumen),
        totalIngresos: redondear2(productos.reduce((acc, p) => acc + p.ingresos_totales, 0)),
        totalCMV: redondear2(productos.reduce((acc, p) => acc + p.costo_total, 0)),
        productos,
        cuadrantes: {
            lideres: productos.filter((p) => p.estado === 'lideres'),
            volumen_bajo_margen: productos.filter((p) => p.estado === 'volumen_bajo_margen'),
            alto_margen_impulsar: productos.filter((p) => p.estado === 'alto_margen_impulsar'),
            bajo_rendimiento: productos.filter((p) => p.estado === 'bajo_rendimiento')
        }
    };
}

/**
 * b) Semáforo de Reposición de Inventario
 * - Detecta productos directos con stock <= stock_minimo (activo = 1)
 * - Detecta insumos con stock_actual <= stock_seguridad (activo = 1)
 * - Calcula sugerencia_compra = MAX(0, stock_minimo * 1.5 - stock_actual)
 * - Calcula costo_estimado_inversion = sugerencia_compra * costo_unitario
 */
async function obtenerSemaforoReposicion() {
    const sqlProductos = `
        SELECT 
            id,
            nombre,
            categoria,
            unidad_medida,
            tipo_inventario,
            COALESCE(stock, 0) as stock,
            COALESCE(stock_minimo, 0) as stock_minimo,
            COALESCE(costo, 0) as costo,
            COALESCE(precio, 0) as precio
        FROM productos
        WHERE tipo_inventario = 'directo'
          AND activo = 1
          AND COALESCE(stock, 0) <= COALESCE(stock_minimo, 0)
        ORDER BY (COALESCE(stock, 0) - COALESCE(stock_minimo, 0)) ASC, nombre ASC
    `;

    const sqlInsumos = `
        SELECT 
            id,
            nombre,
            unidad_medida,
            COALESCE(stock_actual, 0) as stock_actual,
            COALESCE(stock_seguridad, 0) as stock_seguridad,
            COALESCE(costo_por_unidad, 0) as costo_por_unidad,
            tiempo_entrega_dias
        FROM insumos
        WHERE activo = 1
          AND COALESCE(stock_actual, 0) <= COALESCE(stock_seguridad, 0)
        ORDER BY (COALESCE(stock_actual, 0) - COALESCE(stock_seguridad, 0)) ASC, nombre ASC
    `;

    const [rowsProductos, rowsInsumos] = await Promise.all([
        allQuery(sqlProductos),
        allQuery(sqlInsumos)
    ]);

    const productos = rowsProductos.map((p) => {
        const stockActual = Number(p.stock || 0);
        const stockMinimo = Number(p.stock_minimo || 0);
        const costoUnitario = Number(p.costo || 0);
        const sugerenciaCompra = redondear2(Math.max(0, (stockMinimo * 1.5) - stockActual));
        const costoEstimadoInversion = redondear2(sugerenciaCompra * costoUnitario);

        return {
            id: p.id,
            producto_id: p.id,
            nombre: p.nombre,
            tipo: 'producto',
            tipo_inventario: p.tipo_inventario,
            categoria: p.categoria || 'General',
            unidad_medida: p.unidad_medida || 'unidades',
            stock_actual: stockActual,
            stock_minimo: stockMinimo,
            costo_unitario: costoUnitario,
            sugerencia_compra: sugerenciaCompra,
            costo_estimado_inversion: costoEstimadoInversion,
            estado_stock: stockActual <= 0 ? 'agotado' : 'bajo_minimo'
        };
    });

    const insumos = rowsInsumos.map((i) => {
        const stockActual = Number(i.stock_actual || 0);
        const stockSeguridad = Number(i.stock_seguridad || 0);
        const costoUnitario = Number(i.costo_por_unidad || 0);
        const sugerenciaCompra = redondear2(Math.max(0, (stockSeguridad * 1.5) - stockActual));
        const costoEstimadoInversion = redondear2(sugerenciaCompra * costoUnitario);

        return {
            id: i.id,
            insumo_id: i.id,
            nombre: i.nombre,
            tipo: 'insumo',
            tipo_inventario: 'insumo',
            categoria: 'Insumos',
            unidad_medida: i.unidad_medida || 'unidad',
            stock_actual: stockActual,
            stock_minimo: stockSeguridad,
            stock_seguridad: stockSeguridad,
            costo_unitario: costoUnitario,
            sugerencia_compra: sugerenciaCompra,
            costo_estimado_inversion: costoEstimadoInversion,
            tiempo_entrega_dias: i.tiempo_entrega_dias || 1,
            estado_stock: stockActual <= 0 ? 'agotado' : 'bajo_minimo'
        };
    });

    const items = [...productos, ...insumos];
    items.sort((a, b) => (a.stock_actual - a.stock_minimo) - (b.stock_actual - b.stock_minimo));

    const costoTotalInversion = redondear2(items.reduce((acc, it) => acc + it.costo_estimado_inversion, 0));

    return {
        productos,
        insumos,
        items,
        totalItems: items.length,
        costoEstimadoInversionTotal: costoTotalInversion,
        costoTotalInversion
    };
}

/**
 * c) Radar de Vencimientos
 * Consulta:
 * - Lotes en producto_lotes con stock > 0 ordenados por fecha_vencimiento ASC.
 * - Insumos con fecha_vencimiento no nula y stock_actual > 0.
 * Clasifica la urgencia en:
 * - 'vencido' (< 0 días)
 * - 'critico_7d' (0 a 7 días)
 * - 'alerta_15d' (8 a 15 días)
 * - 'atencion_30d' (16 a 30 días)
 * - 'vigente_mas_30d' (> 30 días)
 */
async function obtenerRadarVencimientos() {
    const sqlLotes = `
        SELECT 
            pl.id as lote_id,
            pl.producto_id,
            p.nombre as item_nombre,
            p.categoria,
            p.unidad_medida,
            pl.fecha_vencimiento,
            pl.stock as stock_actual,
            pl.costo_unitario
        FROM producto_lotes pl
        INNER JOIN productos p ON pl.producto_id = p.id
        WHERE pl.stock > 0
          AND pl.activo = 1
          AND p.activo = 1
          AND pl.fecha_vencimiento IS NOT NULL
          AND TRIM(pl.fecha_vencimiento) != ''
        ORDER BY pl.fecha_vencimiento ASC, pl.id ASC
    `;

    const sqlInsumos = `
        SELECT 
            i.id as insumo_id,
            i.nombre as item_nombre,
            'Insumos' as categoria,
            i.unidad_medida,
            i.fecha_vencimiento,
            i.stock_actual,
            i.costo_por_unidad as costo_unitario
        FROM insumos i
        WHERE i.stock_actual > 0
          AND i.activo = 1
          AND i.fecha_vencimiento IS NOT NULL
          AND TRIM(i.fecha_vencimiento) != ''
        ORDER BY i.fecha_vencimiento ASC, i.id ASC
    `;

    const [rowsLotes, rowsInsumos] = await Promise.all([
        allQuery(sqlLotes),
        allQuery(sqlInsumos)
    ]);

    const items = [];

    for (const l of rowsLotes) {
        const diasRestantes = calcularDiasHastaVencimiento(l.fecha_vencimiento);
        let urgencia;
        if (diasRestantes === null) {
            urgencia = 'atencion_30d';
        } else if (diasRestantes < 0) {
            urgencia = 'vencido';
        } else if (diasRestantes <= 7) {
            urgencia = 'critico_7d';
        } else if (diasRestantes <= 15) {
            urgencia = 'alerta_15d';
        } else if (diasRestantes <= 30) {
            urgencia = 'atencion_30d';
        } else {
            urgencia = 'vigente_mas_30d';
        }

        const stock = Number(l.stock_actual || 0);
        const costo = Number(l.costo_unitario || 0);

        items.push({
            id: l.lote_id,
            lote_id: l.lote_id,
            producto_id: l.producto_id,
            nombre: l.item_nombre,
            tipo: 'producto',
            origen: 'producto_lotes',
            categoria: l.categoria || 'General',
            unidad_medida: l.unidad_medida || 'unidades',
            fecha_vencimiento: l.fecha_vencimiento,
            stock_actual: stock,
            costo_unitario: costo,
            valor_en_riesgo: redondear2(stock * costo),
            dias_restantes: diasRestantes,
            urgencia,
            clasificacion_urgencia: urgencia
        });
    }

    for (const i of rowsInsumos) {
        const diasRestantes = calcularDiasHastaVencimiento(i.fecha_vencimiento);
        let urgencia;
        if (diasRestantes === null) {
            urgencia = 'atencion_30d';
        } else if (diasRestantes < 0) {
            urgencia = 'vencido';
        } else if (diasRestantes <= 7) {
            urgencia = 'critico_7d';
        } else if (diasRestantes <= 15) {
            urgencia = 'alerta_15d';
        } else if (diasRestantes <= 30) {
            urgencia = 'atencion_30d';
        } else {
            urgencia = 'vigente_mas_30d';
        }

        const stock = Number(i.stock_actual || 0);
        const costo = Number(i.costo_unitario || 0);

        items.push({
            id: i.insumo_id,
            insumo_id: i.insumo_id,
            nombre: i.item_nombre,
            tipo: 'insumo',
            origen: 'insumos',
            categoria: 'Insumos',
            unidad_medida: i.unidad_medida || 'unidad',
            fecha_vencimiento: i.fecha_vencimiento,
            stock_actual: stock,
            costo_unitario: costo,
            valor_en_riesgo: redondear2(stock * costo),
            dias_restantes: diasRestantes,
            urgencia,
            clasificacion_urgencia: urgencia
        });
    }

    items.sort((a, b) => {
        const da = a.dias_restantes !== null ? a.dias_restantes : 99999;
        const db = b.dias_restantes !== null ? b.dias_restantes : 99999;
        return da - db;
    });

    const alertas = items.filter((it) => 
        ['vencido', 'critico_7d', 'alerta_15d', 'atencion_30d'].includes(it.urgencia)
    );

    const grupos = {
        vencido: items.filter((it) => it.urgencia === 'vencido'),
        critico_7d: items.filter((it) => it.urgencia === 'critico_7d'),
        alerta_15d: items.filter((it) => it.urgencia === 'alerta_15d'),
        atencion_30d: items.filter((it) => it.urgencia === 'atencion_30d')
    };

    return {
        items,
        alertas,
        grupos,
        totalItems: items.length,
        totalAlertas: alertas.length,
        resumen: {
            vencidos: grupos.vencido.length,
            critico_7d: grupos.critico_7d.length,
            alerta_15d: grupos.alerta_15d.length,
            atencion_30d: grupos.atencion_30d.length,
            totalEnRiesgo: alertas.length
        }
    };
}

/**
 * Agregador unificado de métricas de inteligencia comercial.
 * @param {Object} [opciones]
 * @param {number} [opciones.dias=30]
 */
async function obtenerMetricasInteligencia(opciones = {}) {
    const dias = opciones?.dias !== undefined ? Number(opciones.dias) : 30;
    const [matrizRendimiento, semaforoReposicion, radarVencimientos] = await Promise.all([
        obtenerMatrizRendimiento(dias),
        obtenerSemaforoReposicion(),
        obtenerRadarVencimientos()
    ]);

    return {
        matrizRendimiento,
        semaforoReposicion,
        radarVencimientos
    };
}

module.exports = {
    obtenerMatrizRendimiento,
    obtenerSemaforoReposicion,
    obtenerRadarVencimientos,
    obtenerMetricasInteligencia
};
