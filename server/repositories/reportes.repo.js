/**
 * server/repositories/reportes.repo.js
 * Repositorio para la agregación de estadísticas financieras, análisis de tendencias horarias,
 * desglose de métodos de pago, exportación en CSV sanitizado y generación del libro contable Excel (.xlsx)
 * con 10 hojas de auditoría mediante ExcelJS.
 */

const ExcelJS = require('exceljs');
const {
    getQuery,
    allQuery,
    redondear2
} = require('./db');
const { obtenerConfiguracionNegocio } = require('./configuracion.repo');

const ZONA_REPORTES = 'America/La_Paz';
const horaBoliviaSql = (columna) => `(${columna} AT TIME ZONE '${ZONA_REPORTES}')`;
const fechaHoraLocal = (columna) => `TO_CHAR(${horaBoliviaSql(columna || 'CURRENT_TIMESTAMP')}, 'YYYY-MM-DD HH24:MI:SS')`;
const diaLocal = (columna) => `TO_CHAR(${horaBoliviaSql(columna)}, 'YYYY-MM-DD')`;
const fechaFacturaLocal = (columna) => `TO_CHAR(${horaBoliviaSql(columna)}, 'DD/MM/YYYY')`;
const redondeoSql = (expresion) => `ROUND((${expresion})::numeric, 2)::double precision`;

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
                        WHEN m.tipo_comprobante = 'factura' THEN ${redondeoSql('m.monto * ($1 / 100.0)')}
                        ELSE 0
                    END
                ), 0) as debito_fiscal_iva,
                COALESCE(SUM(
                    CASE
                        WHEN m.regimen_tributario IS NOT NULL THEN COALESCE(m.it_monto, 0)
                        WHEN m.tipo_comprobante = 'factura' THEN ${redondeoSql('m.monto * ($2 / 100.0)')}
                        ELSE 0
                    END
                ), 0) as impuesto_transacciones_it
         FROM movimientos m
         WHERE m.caja_id = $3 AND m.tipo = 'ingreso' AND m.estado = 'completado'
           AND COALESCE(m.categoria_contable, 'venta') = 'venta'
           AND EXISTS (SELECT 1 FROM detalle_movimientos d WHERE d.movimiento_id = m.id)`,
        [ivaPorc, itPorc, cajaId]
    );

    const kpiCostos = await getQuery(
        `SELECT COALESCE(SUM(d.cantidad * d.costo_unitario), 0) as costo_total_ventas
         FROM detalle_movimientos d
         INNER JOIN movimientos m ON d.movimiento_id = m.id
         WHERE m.caja_id = $1 AND m.estado = 'completado'`,
        [cajaId]
    );

    const kpiEgresos = await getQuery(
        `SELECT COALESCE(SUM(monto), 0) as total_egresos,
                COALESCE(SUM(CASE WHEN tipo_comprobante = 'factura' THEN monto ELSE 0 END), 0) as egresos_facturados,
                COALESCE(SUM(
                    CASE
                        WHEN regimen_tributario IS NOT NULL THEN COALESCE(iva_monto, 0)
                        WHEN tipo_comprobante = 'factura' THEN ${redondeoSql('monto * ($1 / 100.0)')}
                        ELSE 0
                    END
                ), 0) as credito_fiscal_iva_egresos
         FROM movimientos WHERE caja_id = $2 AND tipo = 'egreso' AND estado = 'completado'`,
        [ivaPorc, cajaId]
    );

    const kpiReposiciones = await getQuery(
        `SELECT COALESCE(SUM(monto), 0) as total_reposiciones
         FROM movimientos m
         WHERE m.caja_id = $1 AND m.tipo = 'ingreso' AND m.estado = 'completado'
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
         WHERE m.caja_id = $1
           AND m.tipo = 'ingreso'
           AND m.estado = 'completado'
           AND COALESCE(m.categoria_contable, 'venta') = 'venta'
         ORDER BY d.movimiento_id ASC, d.id ASC`,
        [cajaId]
    );

    const mapaProd = new Map();
    for (const p of productosActivos) {
        mapaProd.set(p.id, {
            id: Number(p.id),
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
                    id: Number(lin.producto_id),
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
        cantidadTickets: Number(kpiVentas.cantidad_tickets),
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

async function obtenerDesgloseMetodosPago(cajaId) {
    // Fuente de verdad del dinero: tabla movimientos_pagos vinculada a ventas comerciales completadas
    const pagosVentas = await allQuery(
        `SELECT mp.metodo_pago,
                COUNT(DISTINCT m.id) as transacciones,
                COALESCE(SUM(mp.monto), 0) as total
         FROM movimientos_pagos mp
         INNER JOIN movimientos m ON mp.movimiento_id = m.id
         WHERE m.caja_id = $1
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
    const hora = `TO_CHAR(${horaBoliviaSql('m.fecha_hora')}, 'HH24:00')`;
    const hoy = diaLocal('CURRENT_TIMESTAMP');
    const inicioSemana = `TO_CHAR(${horaBoliviaSql('CURRENT_TIMESTAMP')}::date - 7, 'YYYY-MM-DD')`;
    const ventasPorHora = await allQuery(
        `SELECT ${hora} as hora,
                COUNT(id) as cantidad_tickets,
                ${redondeoSql('SUM(monto)')} as total_vendido
         FROM movimientos m
         WHERE m.tipo = 'ingreso' AND m.estado = 'completado'
           AND COALESCE(m.categoria_contable, 'venta') = 'venta'
           AND EXISTS (SELECT 1 FROM detalle_movimientos d WHERE d.movimiento_id = m.id)
           AND ${diaLocal('m.fecha_hora')} = ${hoy}
         GROUP BY hora
         ORDER BY hora ASC`
    );

    const comparativaSemanal = await allQuery(
        `SELECT ${diaLocal('m.fecha_hora')} as fecha,
                COUNT(CASE WHEN m.tipo = 'ingreso' AND COALESCE(m.categoria_contable, 'venta') = 'venta' THEN m.id END) as cantidad_tickets,
                ${redondeoSql("SUM(CASE WHEN m.tipo = 'ingreso' AND COALESCE(m.categoria_contable, 'venta') = 'venta' THEN m.monto ELSE 0 END)")} as ingresos,
                ${redondeoSql("SUM(CASE WHEN m.tipo = 'egreso' THEN m.monto ELSE 0 END)")} as egresos
         FROM movimientos m
         WHERE m.estado = 'completado'
           AND ${diaLocal('m.fecha_hora')} >= ${inicioSemana}
         GROUP BY fecha
         ORDER BY fecha ASC`
    );

    const normalizarTickets = (fila) => ({ ...fila, cantidad_tickets: Number(fila.cantidad_tickets) });
    return {
        ventasPorHora: ventasPorHora.map(normalizarTickets),
        comparativaSemanal: comparativaSemanal.map(normalizarTickets)
    };
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
        condiciones.push(`${aliasMov}.caja_id = $${params.length + 1}`);
        params.push(Number(cajaId));
    }
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        condiciones.push(`${diaLocal(`${aliasMov}.fecha_hora`)} >= $${params.length + 1}`);
        params.push(String(filtros.desde).trim());
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        condiciones.push(`${diaLocal(`${aliasMov}.fecha_hora`)} <= $${params.length + 1}`);
        params.push(String(filtros.hasta).trim());
    }
    if (filtros?.usuarioId && Number.isFinite(Number(filtros.usuarioId)) && Number(filtros.usuarioId) > 0) {
        condiciones.push(`${aliasMov}.usuario_id = $${params.length + 1}`);
        params.push(Number(filtros.usuarioId));
    }
    if (filtros?.cajaFisicaId && Number.isFinite(Number(filtros.cajaFisicaId)) && Number(filtros.cajaFisicaId) > 0 && aliasCaja) {
        condiciones.push(`${aliasCaja}.caja_fisica_id = $${params.length + 1}`);
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
                ${fechaHoraLocal('m.fecha_hora')} as fecha_hora,
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
                COALESCE((SELECT ${redondeoSql('SUM(d.cantidad * d.costo_unitario)')} FROM detalle_movimientos d WHERE d.movimiento_id = m.id), 0) as costo_cmv,
                m.estado,
                COALESCE(ua.nombre, '') as anulado_por_nombre,
                COALESCE(${fechaHoraLocal('m.fecha_anulacion')}, '') as fecha_anulacion,
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
    const negocio = await obtenerConfiguracionNegocio();
    const ivaPorc = Number(negocio?.iva_porcentaje ?? 13);
    const itPorc = Number(negocio?.it_porcentaje ?? 3);
    const usuarioGenerador = filtros?.usuarioGenerador || 'Administrador / Sistema';

    const { whereSql: whereMov, params: paramsMov } = construirClausulaFiltroMovimientos(cajaId, filtros, 'm', 'c');

    const movimientos = await allQuery(
        `SELECT m.id,
                m.caja_id,
                cf.nombre as caja_nombre,
                ${fechaHoraLocal('m.fecha_hora')} as fecha_hora,
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
                COALESCE((SELECT ${redondeoSql('SUM(d.cantidad * d.costo_unitario)')} FROM detalle_movimientos d WHERE d.movimiento_id = m.id), 0) as costo_cmv,
                m.estado,
                COALESCE(ua.nombre, '') as anulado_por_nombre,
                COALESCE(${fechaHoraLocal('m.fecha_anulacion')}, '') as fecha_anulacion,
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
        condCajas.push(`c.id = $${paramsCajas.length + 1}`);
        paramsCajas.push(Number(cajaId));
    }
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        condCajas.push(`${diaLocal('c.fecha_apertura')} >= $${paramsCajas.length + 1}`);
        paramsCajas.push(String(filtros.desde).trim());
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        condCajas.push(`${diaLocal('c.fecha_apertura')} <= $${paramsCajas.length + 1}`);
        paramsCajas.push(String(filtros.hasta).trim());
    }
    if (filtros?.usuarioId && Number.isFinite(Number(filtros.usuarioId)) && Number(filtros.usuarioId) > 0) {
        condCajas.push(`c.usuario_id = $${paramsCajas.length + 1}`);
        paramsCajas.push(Number(filtros.usuarioId));
    }
    if (filtros?.cajaFisicaId && Number.isFinite(Number(filtros.cajaFisicaId)) && Number(filtros.cajaFisicaId) > 0) {
        condCajas.push(`c.caja_fisica_id = $${paramsCajas.length + 1}`);
        paramsCajas.push(Number(filtros.cajaFisicaId));
    }
    const whereCajas = condCajas.length > 0 ? `WHERE ${condCajas.join(' AND ')}` : '';

    const cajas = await allQuery(
        `SELECT c.id,
                cf.nombre as caja_nombre,
                COALESCE(u.nombre, '—') as cajero,
                ${fechaHoraLocal('c.fecha_apertura')} as fecha_apertura,
                ${fechaHoraLocal('c.fecha_cierre')} as fecha_cierre,
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

    const precioAdicional = `(CASE WHEN dmm.precio_adicional = TRUNC(dmm.precio_adicional)
                 THEN dmm.precio_adicional::text || '.0' ELSE dmm.precio_adicional::text END)`;
    const textoModificador = `dmm.nombre || (CASE WHEN dmm.precio_adicional > 0 THEN ' (+Bs ' || ${precioAdicional} || ')' ELSE '' END)`;
    const agruparModificadores = `STRING_AGG(${textoModificador}, ', ' ORDER BY dmm.id)`;
    const detallesVentasRaw = await allQuery(
        `SELECT d.id as detalle_id,
                m.id as movimiento_id,
                m.caja_id,
                ${fechaHoraLocal('m.fecha_hora')} as fecha_hora,
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
                    SELECT ${agruparModificadores}
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
            const subLinea = Number(lin.subtotal || 0);
            let ingresoNetoLinea;
            let descuentoProrrateado;

            if (descMov <= 0 || subBrutoMov <= 0) {
                ingresoNetoLinea = redondear2(subLinea);
                descuentoProrrateado = 0;
            } else if (i === lineasTicket.length - 1) {
                ingresoNetoLinea = redondear2(montoNetoMov - acumuladoNeto);
                descuentoProrrateado = redondear2(subLinea - ingresoNetoLinea);
            } else {
                descuentoProrrateado = redondear2(descMov * (subLinea / subBrutoMov));
                ingresoNetoLinea = redondear2(subLinea - descuentoProrrateado);
                acumuladoNeto = redondear2(acumuladoNeto + ingresoNetoLinea);
            }

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
    const condDirectos = [`mpd.tipo IN ('compra', 'merma')`];
    const paramsCompras = [];
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        const indice = paramsCompras.push(String(filtros.desde).trim());
        condInsumos.push(`${diaLocal('mi.fecha_hora')} >= $${indice}`);
        condDirectos.push(`${diaLocal('mpd.fecha_hora')} >= $${indice}`);
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        const indice = paramsCompras.push(String(filtros.hasta).trim());
        condInsumos.push(`${diaLocal('mi.fecha_hora')} <= $${indice}`);
        condDirectos.push(`${diaLocal('mpd.fecha_hora')} <= $${indice}`);
    }

    const comprasYMermasInsumos = await allQuery(
        `SELECT * FROM (
            SELECT 'INS-' || mi.id as id,
                   'Insumo / Materia Prima' as origen,
                   i.nombre as item_nombre,
                   i.unidad_medida,
                   mi.tipo,
                   ${fechaHoraLocal('mi.fecha_hora')} as fecha_hora,
                   mi.fecha_hora as fecha_orden,
                   mi.cantidad,
                   mi.costo_unitario,
                   ${redondeoSql('COALESCE(NULLIF(mi.monto_total_compra, 0), mi.cantidad * mi.costo_unitario)')} as monto_total,
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
                   ${fechaHoraLocal('mpd.fecha_hora')} as fecha_hora,
                   mpd.fecha_hora as fecha_orden,
                   mpd.cantidad,
                   mpd.costo_unitario,
                   ${redondeoSql('COALESCE(mpd.monto_total, mpd.cantidad * mpd.costo_unitario)')} as monto_total,
                   COALESCE(mpd.proveedor_nombre, '') as proveedor_nombre,
                   COALESCE(mpd.proveedor_nit, '') as proveedor_nit,
                   COALESCE(mpd.nro_factura_compra, '') as nro_factura_compra,
                   COALESCE(mpd.con_factura, 0) as con_factura,
                   mpd.motivo
            FROM movimientos_productos_directos mpd
            INNER JOIN productos p ON mpd.producto_id = p.id
            WHERE ${condDirectos.join(' AND ')}
        ) AS compras_y_mermas ORDER BY fecha_orden DESC`,
        paramsCompras
    );

    const condKardexPrd = [];
    const paramsKardexPrd = [];
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        condKardexPrd.push(`${diaLocal('mpd.fecha_hora')} >= $${paramsKardexPrd.length + 1}`);
        paramsKardexPrd.push(String(filtros.desde).trim());
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        condKardexPrd.push(`${diaLocal('mpd.fecha_hora')} <= $${paramsKardexPrd.length + 1}`);
        paramsKardexPrd.push(String(filtros.hasta).trim());
    }
    const whereKardexPrd = condKardexPrd.length > 0 ? `WHERE ${condKardexPrd.join(' AND ')}` : '';

    const kardexCronologicoProductos = await allQuery(
        `SELECT mpd.id,
                mpd.producto_id,
                p.nombre as producto_nombre,
                COALESCE(p.unidad_medida, 'unidades') as unidad_medida,
                mpd.movimiento_id,
                COALESCE(u.nombre, 'Sistema') as operador,
                mpd.tipo,
                ${fechaHoraLocal('mpd.fecha_hora')} as fecha_hora,
                mpd.cantidad,
                mpd.stock_resultante,
                mpd.costo_unitario,
                COALESCE(NULLIF(mpd.costo_promedio_resultante, 0), mpd.costo_unitario, p.costo, 0) as costo_promedio_resultante,
                COALESCE(mpd.monto_total, ${redondeoSql('mpd.cantidad * mpd.costo_unitario')}) as monto_total,
                COALESCE(mpd.proveedor_nombre, '') as proveedor_nombre,
                COALESCE(mpd.nro_factura_compra, '') as nro_factura_compra,
                mpd.motivo
         FROM movimientos_productos_directos mpd
         INNER JOIN productos p ON mpd.producto_id = p.id
         LEFT JOIN usuarios u ON mpd.usuario_id = u.id
         LEFT JOIN movimientos m ON mpd.movimiento_id = m.id
         ${whereKardexPrd}
         ORDER BY mpd.id ASC`,
        paramsKardexPrd
    );

    const condKardexIns = [];
    const paramsKardexIns = [];
    if (filtros?.desde && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.desde).trim())) {
        condKardexIns.push(`${diaLocal('mi.fecha_hora')} >= $${paramsKardexIns.length + 1}`);
        paramsKardexIns.push(String(filtros.desde).trim());
    }
    if (filtros?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())) {
        condKardexIns.push(`${diaLocal('mi.fecha_hora')} <= $${paramsKardexIns.length + 1}`);
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
                ${fechaHoraLocal('mi.fecha_hora')} as fecha_hora,
                mi.cantidad,
                mi.stock_resultante,
                mi.costo_unitario,
                COALESCE(NULLIF(mi.costo_promedio_resultante, 0), mi.costo_unitario, i.costo_por_unidad, 0) as costo_promedio_resultante,
                COALESCE(mi.monto_total_compra, ${redondeoSql('mi.cantidad * mi.costo_unitario')}) as monto_total,
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
                i.costo_por_unidad as costo_unitario,
                ${redondeoSql('i.stock_actual * i.costo_por_unidad')} as valor_total,
                i.stock_seguridad,
                i.tiempo_entrega_dias,
                COALESCE((SELECT ${fechaHoraLocal('MAX(fecha_hora)')} FROM movimientos_insumos WHERE insumo_id = i.id), ${fechaHoraLocal()}) as fecha_actualizacion
         FROM insumos i
         WHERE i.activo = 1
         ORDER BY i.nombre ASC`
    );

    const directosKardex = await allQuery(
        `SELECT p.id,
                p.nombre,
                'Producto Venta Directa' as clase,
                COALESCE(p.unidad_medida, 'unidades') as unidad_medida,
                p.stock as stock_actual,
                p.costo as costo_unitario,
                ${redondeoSql('COALESCE(p.stock, 0) * COALESCE(p.costo, 0)')} as valor_total,
                p.stock_minimo as stock_seguridad,
                1 as tiempo_entrega_dias,
                COALESCE((SELECT ${fechaHoraLocal('MAX(fecha_hora)')} FROM movimientos_productos_directos WHERE producto_id = p.id), ${fechaHoraLocal()}) as fecha_actualizacion
         FROM productos p
         WHERE p.activo = 1 AND p.tipo_inventario = 'directo'
         ORDER BY p.nombre ASC`
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = `Sistema POS - ${negocio?.nombre_negocio || 'Mi Negocio'}`;
    workbook.lastModifiedBy = usuarioGenerador;
    workbook.created = new Date();
    workbook.modified = new Date();

    const estiloCabecera = (fila, colorHex = 'FF1E293B') => {
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
    let sumEgresos = 0;
    let sumAportesCambio = 0;
    let sumIvaVentas = 0;
    let sumItVentas = 0;
    let sumCfIvaEgresos = 0;

    for (const m of movimientos) {
        const esCompletado = m.estado === 'completado';
        const esVenta = m.tipo === 'ingreso' && m.categoria_contable === 'venta';
        const esVentaCompletada = esCompletado && esVenta;
        const montoNum = Number(m.monto || 0);
        const subtotalNum = Number(m.subtotal_bruto || m.monto || 0);
        const descNum = Number(m.descuento_total || 0);
        const efNum = Number(m.monto_efectivo || 0);
        const qrNum = Number(m.monto_qr || 0);
        const costoNum = esVentaCompletada ? redondear2(m.costo_cmv) : 0;
        const utilidadNum = esVentaCompletada ? redondear2(montoNum - costoNum) : 0;

        const tieneSnapshot = m.regimen_tributario !== null && m.regimen_tributario !== undefined;
        let ivaNum = 0;
        let itNum = 0;
        if (esCompletado) {
            if (tieneSnapshot) {
                ivaNum = redondear2(m.iva_monto || 0);
                itNum = redondear2(m.it_monto || 0);
            } else if (m.tipo_comprobante === 'factura') {
                ivaNum = redondear2(montoNum * (ivaPorc / 100));
                itNum = esVenta ? redondear2(montoNum * (itPorc / 100)) : 0;
            }
        }

        if (esVentaCompletada) {
            sumSubtotalVentas = redondear2(sumSubtotalVentas + subtotalNum);
            sumDescuentoVentas = redondear2(sumDescuentoVentas + descNum);
            sumMontoVentas = redondear2(sumMontoVentas + montoNum);
            sumEfectivoVentas = redondear2(sumEfectivoVentas + efNum);
            sumQrVentas = redondear2(sumQrVentas + qrNum);
            sumCostoVentas = redondear2(sumCostoVentas + costoNum);
            sumUtilidadVentas = redondear2(sumUtilidadVentas + utilidadNum);
            sumIvaVentas = redondear2(sumIvaVentas + ivaNum);
            sumItVentas = redondear2(sumItVentas + itNum);
        } else if (esCompletado && m.tipo === 'egreso') {
            sumEgresos = redondear2(sumEgresos + montoNum);
            if (m.tipo_comprobante === 'factura') {
                sumCfIvaEgresos = redondear2(sumCfIvaEgresos + ivaNum);
            }
        } else if (esCompletado && m.tipo === 'ingreso' && m.categoria_contable === 'aporte_cambio') {
            sumAportesCambio = redondear2(sumAportesCambio + montoNum);
        }

        hojaMov.addRow({
            id: Number(m.id),
            caja_id: Number(m.caja_id),
            caja_nombre: m.caja_nombre || 'Caja Principal',
            fecha_hora: m.fecha_hora,
            operador: m.operador,
            tipo: m.tipo,
            categoria_contable: m.categoria_contable,
            metodo_pago: m.metodo_pago,
            tipo_comprobante: m.tipo_comprobante,
            nro_factura: m.nro_factura || '—',
            cliente_nit_ci: m.cliente_nit_ci || '—',
            cliente_razon_social: m.cliente_razon_social || '—',
            subtotal_bruto: subtotalNum,
            descuento_total: descNum,
            monto: montoNum,
            monto_efectivo: efNum,
            monto_qr: qrNum,
            referencia_qr: m.referencia_qr || '—',
            monto_recibido: Number(m.monto_recibido || 0),
            cambio: Number(m.cambio || 0),
            costo_cmv: costoNum,
            utilidad_bruta: utilidadNum,
            iva_monto: ivaNum,
            it_monto: itNum,
            regimen_tributario: m.regimen_tributario || 'simplificado_control_interno',
            estado: m.estado,
            anulado_por_nombre: m.anulado_por_nombre || '—',
            fecha_anulacion: m.fecha_anulacion || '—',
            motivo_anulacion: m.motivo_anulacion || '—',
            descripcion: m.descripcion || ''
        });
    }

    if (movimientos.length > 0) {
        const filaTotMov = hojaMov.addRow({
            id: 'TOTAL VENTAS',
            caja_nombre: `${movimientos.filter((m) => m.estado === 'completado' && m.tipo === 'ingreso' && m.categoria_contable === 'venta').length} ventas completadas`,
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
    // HOJA 2: ARQUEOS Y TURNOS DE CAJA
    // =========================================================================
    const hojaCajas = workbook.addWorksheet('Arqueos de Caja');
    hojaCajas.columns = [
        { header: 'N° Turno', key: 'id', width: 11 },
        { header: 'Estación', key: 'caja_nombre', width: 20 },
        { header: 'Cajero', key: 'cajero', width: 16 },
        { header: 'Apertura', key: 'fecha_apertura', width: 20 },
        { header: 'Cierre', key: 'fecha_cierre', width: 20 },
        { header: 'Estado', key: 'estado', width: 12 },
        { header: 'Monto Inicial (Bs)', key: 'monto_inicial', width: 18 },
        { header: 'Ef. Esperado (Bs)', key: 'efectivo_esperado', width: 18 },
        { header: 'Ef. Real Contado (Bs)', key: 'efectivo_real', width: 20 },
        { header: 'Diferencia Ef. (Bs)', key: 'diferencia_efectivo', width: 19 },
        { header: 'QR Esperado (Bs)', key: 'qr_esperado', width: 18 },
        { header: 'QR Real Banco (Bs)', key: 'qr_real', width: 18 },
        { header: 'Diferencia QR (Bs)', key: 'diferencia_qr', width: 18 },
        { header: 'Reaperturas', key: 'veces_reabierta', width: 13 },
        { header: 'Observaciones de Cierre', key: 'observaciones_cierre', width: 34 }
    ];
    estiloCabecera(hojaCajas.getRow(1), 'FF0369A1');

    for (const c of cajas) {
        hojaCajas.addRow({
            id: Number(c.id),
            caja_nombre: c.caja_nombre || 'Caja Principal',
            cajero: c.cajero,
            fecha_apertura: c.fecha_apertura,
            fecha_cierre: c.fecha_cierre || 'En curso (Abierta)',
            estado: c.estado,
            monto_inicial: Number(c.monto_inicial || 0),
            efectivo_esperado: c.efectivo_esperado !== null ? Number(c.efectivo_esperado) : 0,
            efectivo_real: c.efectivo_real !== null ? Number(c.efectivo_real) : 0,
            diferencia_efectivo: c.diferencia_efectivo !== null ? Number(c.diferencia_efectivo) : 0,
            qr_esperado: c.qr_esperado !== null ? Number(c.qr_esperado) : 0,
            qr_real: c.qr_real !== null ? Number(c.qr_real) : 0,
            diferencia_qr: c.diferencia_qr !== null ? Number(c.diferencia_qr) : 0,
            veces_reabierta: Number(c.veces_reabierta || 0),
            observaciones_cierre: c.observaciones_cierre || '—'
        });
    }
    ['G', 'H', 'I', 'J', 'K', 'L', 'M'].forEach((col) => {
        hojaCajas.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 3: DETALLE DE VENTAS (CMV - NIC 2 CPP Y PRORRATEO EXACTO)
    // =========================================================================
    const hojaDet = workbook.addWorksheet('Detalle Ventas (CMV)');
    hojaDet.columns = [
        { header: 'ID Detalle', key: 'detalle_id', width: 12 },
        { header: 'ID Movimiento', key: 'movimiento_id', width: 14 },
        { header: 'N° Turno', key: 'caja_id', width: 11 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Operador', key: 'operador', width: 16 },
        { header: 'Producto', key: 'producto_nombre', width: 28 },
        { header: 'Categoría', key: 'producto_categoria', width: 18 },
        { header: 'Tipo Inventario', key: 'tipo_inventario', width: 15 },
        { header: 'Modificadores Aplicados', key: 'modificadores_aplicados', width: 28 },
        { header: 'Cantidad', key: 'cantidad', width: 12 },
        { header: 'Precio Unit. (Bs)', key: 'precio_unitario', width: 16 },
        { header: 'Subtotal Bruto (Bs)', key: 'subtotal', width: 18 },
        { header: 'Descuento Prorr. (Bs)', key: 'descuento_prorrateado', width: 20 },
        { header: 'Ingreso Neto (Bs)', key: 'ingreso_neto', width: 17 },
        { header: 'Costo Unit. (Bs)', key: 'costo_unitario', width: 16 },
        { header: 'Costo Total CMV (Bs)', key: 'costo_total', width: 20 },
        { header: 'Utilidad Bruta (Bs)', key: 'utilidad_bruta', width: 18 },
        { header: 'Método Pago', key: 'metodo_pago', width: 14 },
        { header: 'Estado Ticket', key: 'estado', width: 13 }
    ];
    estiloCabecera(hojaDet.getRow(1), 'FF047857');

    for (const d of detallesVentas) {
        hojaDet.addRow({
            detalle_id: Number(d.detalle_id),
            movimiento_id: Number(d.movimiento_id),
            caja_id: Number(d.caja_id),
            fecha_hora: d.fecha_hora,
            operador: d.operador,
            producto_nombre: d.producto_nombre,
            producto_categoria: d.producto_categoria || 'Sin categoría',
            tipo_inventario: d.tipo_inventario,
            modificadores_aplicados: d.modificadores_aplicados || '—',
            cantidad: Number(d.cantidad || 0),
            precio_unitario: Number(d.precio_unitario || 0),
            subtotal: Number(d.subtotal || 0),
            descuento_prorrateado: Number(d.descuento_prorrateado || 0),
            ingreso_neto: Number(d.ingreso_neto || 0),
            costo_unitario: Number(d.costo_unitario || 0),
            costo_total: Number(d.costo_total || 0),
            utilidad_bruta: Number(d.utilidad_bruta || 0),
            metodo_pago: d.metodo_pago,
            estado: d.estado
        });
    }
    if (detallesVentas.length > 0) {
        const filaTotDet = hojaDet.addRow({
            detalle_id: 'TOTAL VENTAS',
            producto_nombre: `${detallesVentas.filter((d) => d.estado === 'completado').length} líneas completadas`,
            subtotal: sumSubtotalVentas,
            descuento_prorrateado: sumDescuentoVentas,
            ingreso_neto: sumMontoVentas,
            costo_total: sumCostoVentas,
            utilidad_bruta: sumUtilidadVentas
        });
        estiloTotales(filaTotDet);
    }
    hojaDet.getColumn('J').numFmt = '#,##0.00##';
    ['K', 'L', 'M', 'N', 'O', 'P', 'Q'].forEach((col) => {
        hojaDet.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 4: RENTABILIDAD POR PRODUCTO (NETA DE DESCUENTOS Y CMV)
    // =========================================================================
    const hojaRent = workbook.addWorksheet('Rentabilidad por Producto');
    hojaRent.columns = [
        { header: 'ID', key: 'producto_id', width: 10 },
        { header: 'Producto', key: 'producto_nombre', width: 28 },
        { header: 'Categoría', key: 'categoria', width: 20 },
        { header: 'Tipo Inventario', key: 'tipo_inventario', width: 16 },
        { header: 'Unidades Vendidas', key: 'unidades_vendidas', width: 18 },
        { header: 'Subtotal Bruto (Bs)', key: 'subtotal_bruto', width: 19 },
        { header: 'Descuento Prorrateado (Bs)', key: 'descuento_prorrateado', width: 25 },
        { header: 'Ingreso Neto (Bs)', key: 'ingreso_neto', width: 18 },
        { header: 'Costo CMV Total (Bs)', key: 'costo_cmv', width: 20 },
        { header: 'Ganancia Bruta (Bs)', key: 'ganancia_bruta', width: 19 },
        { header: 'Margen Bruto (%)', key: 'margen_porcentaje', width: 17 }
    ];
    estiloCabecera(hojaRent.getRow(1), 'FF7C3AED');

    for (const r of rentabilidadPorProducto) {
        const margen = r.ingreso_neto > 0 ? Number(((r.ganancia_bruta / r.ingreso_neto) * 100).toFixed(2)) : 0;
        hojaRent.addRow({
            producto_id: Number(r.producto_id),
            producto_nombre: r.producto_nombre,
            categoria: r.categoria,
            tipo_inventario: r.tipo_inventario,
            unidades_vendidas: r.unidades_vendidas,
            subtotal_bruto: r.subtotal_bruto,
            descuento_prorrateado: r.descuento_prorrateado,
            ingreso_neto: r.ingreso_neto,
            costo_cmv: r.costo_cmv,
            ganancia_bruta: r.ganancia_bruta,
            margen_porcentaje: margen
        });
    }
    if (rentabilidadPorProducto.length > 0) {
        const margenGlobal = sumMontoVentas > 0 ? Number(((sumUtilidadVentas / sumMontoVentas) * 100).toFixed(2)) : 0;
        const filaTotRent = hojaRent.addRow({
            producto_id: 'TOTAL',
            producto_nombre: `${rentabilidadPorProducto.length} producto(s) comercializado(s)`,
            subtotal_bruto: sumSubtotalVentas,
            descuento_prorrateado: sumDescuentoVentas,
            ingreso_neto: sumMontoVentas,
            costo_cmv: sumCostoVentas,
            ganancia_bruta: sumUtilidadVentas,
            margen_porcentaje: margenGlobal
        });
        estiloTotales(filaTotRent);
    }
    hojaRent.getColumn('E').numFmt = '#,##0.00##';
    ['F', 'G', 'H', 'I', 'J'].forEach((col) => {
        hojaRent.getColumn(col).numFmt = '#,##0.00';
    });
    hojaRent.getColumn('K').numFmt = '0.00"%"';

    // =========================================================================
    // HOJA 5: COMPRAS Y MERMAS DE INVENTARIO
    // =========================================================================
    const hojaComp = workbook.addWorksheet('Compras y Mermas');
    hojaComp.columns = [
        { header: 'Código', key: 'id', width: 14 },
        { header: 'Origen Almacén', key: 'origen', width: 22 },
        { header: 'Artículo / Insumo', key: 'item_nombre', width: 28 },
        { header: 'Unidad', key: 'unidad_medida', width: 12 },
        { header: 'Operación', key: 'tipo', width: 13 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Cantidad', key: 'cantidad', width: 13 },
        { header: 'Costo Unit. (Bs)', key: 'costo_unitario', width: 16 },
        { header: 'Monto Total (Bs)', key: 'monto_total', width: 16 },
        { header: 'Crédito Fiscal IVA (Bs)', key: 'cf_iva', width: 21 },
        { header: 'Proveedor / Distribuidora', key: 'proveedor_nombre', width: 26 },
        { header: 'NIT Proveedor', key: 'proveedor_nit', width: 16 },
        { header: 'N° Factura Compra', key: 'nro_factura_compra', width: 19 },
        { header: 'Con Factura', key: 'con_factura_txt', width: 14 },
        { header: 'Motivo / Detalle', key: 'motivo', width: 32 }
    ];
    estiloCabecera(hojaComp.getRow(1), 'FFB45309');

    let sumMontoCompras = 0;
    let sumMontoMermas = 0;
    let sumCfIvaCompras = 0;
    for (const c of comprasYMermasInsumos) {
        const mTotal = Number(c.monto_total || 0);
        const conFac = Number(c.con_factura || 0) === 1;
        const cfIva = conFac && c.tipo === 'compra' ? redondear2(mTotal * (ivaPorc / 100)) : 0;
        if (c.tipo === 'compra') {
            sumMontoCompras = redondear2(sumMontoCompras + mTotal);
            sumCfIvaCompras = redondear2(sumCfIvaCompras + cfIva);
        } else if (c.tipo === 'merma') {
            sumMontoMermas = redondear2(sumMontoMermas + mTotal);
        }

        hojaComp.addRow({
            id: c.id,
            origen: c.origen,
            item_nombre: c.item_nombre,
            unidad_medida: c.unidad_medida,
            tipo: c.tipo,
            fecha_hora: c.fecha_hora,
            cantidad: Number(c.cantidad || 0),
            costo_unitario: Number(c.costo_unitario || 0),
            monto_total: mTotal,
            cf_iva: cfIva,
            proveedor_nombre: c.proveedor_nombre || '—',
            proveedor_nit: c.proveedor_nit || '—',
            nro_factura_compra: c.nro_factura_compra || '—',
            con_factura_txt: conFac ? 'SÍ (Facturado)' : 'NO (Recibo)',
            motivo: c.motivo || '—'
        });
    }
    if (comprasYMermasInsumos.length > 0) {
        const filaTotComp = hojaComp.addRow({
            id: 'TOTAL COMPRAS',
            item_nombre: `${comprasYMermasInsumos.filter((c) => c.tipo === 'compra').length} compra(s) registrada(s)`,
            monto_total: sumMontoCompras,
            cf_iva: sumCfIvaCompras
        });
        estiloTotales(filaTotComp);
    }
    hojaComp.getColumn('G').numFmt = '#,##0.00##';
    ['H', 'I', 'J'].forEach((col) => {
        hojaComp.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 6: INVENTARIO KARDEX CONSOLIDADO (VALORIZADO NIC 2 CPP)
    // =========================================================================
    const hojaInv = workbook.addWorksheet('Inventario Kardex');
    hojaInv.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Artículo / Insumo', key: 'nombre', width: 28 },
        { header: 'Clasificación', key: 'clase', width: 24 },
        { header: 'Unidad Medida', key: 'unidad_medida', width: 15 },
        { header: 'Stock Actual', key: 'stock_actual', width: 15 },
        { header: 'Costo CPP Unit. (Bs)', key: 'costo_unitario', width: 20 },
        { header: 'Valorización Total (Bs)', key: 'valor_total', width: 22 },
        { header: 'Stock Seguridad / Mín.', key: 'stock_seguridad', width: 22 },
        { header: 'Tiempo Entrega (Días)', key: 'tiempo_entrega_dias', width: 21 },
        { header: 'Estado Alerta', key: 'alerta', width: 16 }
    ];
    estiloCabecera(hojaInv.getRow(1), 'FF1E293B');

    const listaKardexConsolidada = [...insumosKardex, ...directosKardex];
    let valorTotalInventario = 0;
    for (const item of listaKardexConsolidada) {
        const st = Number(item.stock_actual || 0);
        const seg = Number(item.stock_seguridad || 0);
        const val = Number(item.valor_total || 0);
        valorTotalInventario = redondear2(valorTotalInventario + val);
        let alerta = 'NORMAL';
        if (st <= 0) alerta = 'AGOTADO';
        else if (st <= seg) alerta = 'CRÍTICO';

        hojaInv.addRow({
            id: Number(item.id),
            nombre: item.nombre,
            clase: item.clase,
            unidad_medida: item.unidad_medida,
            stock_actual: st,
            costo_unitario: Number(item.costo_unitario || 0),
            valor_total: val,
            stock_seguridad: seg,
            tiempo_entrega_dias: Number(item.tiempo_entrega_dias || 1),
            alerta
        });
    }
    if (listaKardexConsolidada.length > 0) {
        const filaTotInv = hojaInv.addRow({
            id: 'TOTAL VALORIZADO',
            nombre: `${listaKardexConsolidada.length} ítem(s) en almacén`,
            valor_total: valorTotalInventario
        });
        estiloTotales(filaTotInv);
    }
    ['E', 'H'].forEach((col) => {
        hojaInv.getColumn(col).numFmt = '#,##0.00##';
    });
    ['F', 'G'].forEach((col) => {
        hojaInv.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 7: KARDEX PRODUCTOS DIRECTOS (MOVIMIENTOS CRONOLÓGICOS)
    // =========================================================================
    const hojaKp = workbook.addWorksheet('Kardex Productos');
    hojaKp.columns = [
        { header: 'ID Reg.', key: 'id', width: 10 },
        { header: 'ID Producto', key: 'producto_id', width: 12 },
        { header: 'Producto', key: 'producto_nombre', width: 28 },
        { header: 'Unidad', key: 'unidad_medida', width: 12 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Operador', key: 'operador', width: 16 },
        { header: 'Tipo Movimiento', key: 'tipo', width: 18 },
        { header: 'Cantidad', key: 'cantidad', width: 14 },
        { header: 'Stock Resultante', key: 'stock_resultante', width: 17 },
        { header: 'Costo Operación (Bs)', key: 'costo_unitario', width: 20 },
        { header: 'CPP Resultante (Bs)', key: 'costo_promedio_resultante', width: 20 },
        { header: 'Monto Total (Bs)', key: 'monto_total', width: 16 },
        { header: 'Proveedor', key: 'proveedor_nombre', width: 24 },
        { header: 'N° Factura', key: 'nro_factura_compra', width: 16 },
        { header: 'Motivo / Justificación', key: 'motivo', width: 32 }
    ];
    estiloCabecera(hojaKp.getRow(1), 'FF0F766E');

    for (const kp of kardexCronologicoProductos) {
        hojaKp.addRow({
            id: Number(kp.id),
            producto_id: Number(kp.producto_id),
            producto_nombre: kp.producto_nombre,
            unidad_medida: kp.unidad_medida,
            fecha_hora: kp.fecha_hora,
            operador: kp.operador,
            tipo: kp.tipo,
            cantidad: Number(kp.cantidad || 0),
            stock_resultante: Number(kp.stock_resultante || 0),
            costo_unitario: Number(kp.costo_unitario || 0),
            costo_promedio_resultante: Number(kp.costo_promedio_resultante || 0),
            monto_total: Number(kp.monto_total || 0),
            proveedor_nombre: kp.proveedor_nombre || '—',
            nro_factura_compra: kp.nro_factura_compra || '—',
            motivo: kp.motivo || '—'
        });
    }
    ['H', 'I'].forEach((col) => {
        hojaKp.getColumn(col).numFmt = '#,##0.00##';
    });
    ['J', 'K', 'L'].forEach((col) => {
        hojaKp.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 8: KARDEX INSUMOS (MOVIMIENTOS CRONOLÓGICOS MATERIA PRIMA)
    // =========================================================================
    const hojaKi = workbook.addWorksheet('Kardex Insumos');
    hojaKi.columns = [
        { header: 'ID Reg.', key: 'id', width: 10 },
        { header: 'ID Insumo', key: 'insumo_id', width: 12 },
        { header: 'Insumo', key: 'insumo_nombre', width: 28 },
        { header: 'Unidad', key: 'unidad_medida', width: 12 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Operador', key: 'operador', width: 16 },
        { header: 'Tipo Movimiento', key: 'tipo', width: 18 },
        { header: 'Cantidad', key: 'cantidad', width: 14 },
        { header: 'Stock Resultante', key: 'stock_resultante', width: 17 },
        { header: 'Costo Operación (Bs)', key: 'costo_unitario', width: 20 },
        { header: 'CPP Resultante (Bs)', key: 'costo_promedio_resultante', width: 20 },
        { header: 'Monto Total (Bs)', key: 'monto_total', width: 16 },
        { header: 'Proveedor', key: 'proveedor_nombre', width: 24 },
        { header: 'N° Factura', key: 'nro_factura_compra', width: 16 },
        { header: 'Motivo / Justificación', key: 'motivo', width: 32 }
    ];
    estiloCabecera(hojaKi.getRow(1), 'FF4338CA');

    for (const ki of kardexCronologicoInsumos) {
        hojaKi.addRow({
            id: Number(ki.id),
            insumo_id: Number(ki.insumo_id),
            insumo_nombre: ki.insumo_nombre,
            unidad_medida: ki.unidad_medida,
            fecha_hora: ki.fecha_hora,
            operador: ki.operador,
            tipo: ki.tipo,
            cantidad: Number(ki.cantidad || 0),
            stock_resultante: Number(ki.stock_resultante || 0),
            costo_unitario: Number(ki.costo_unitario || 0),
            costo_promedio_resultante: Number(ki.costo_promedio_resultante || 0),
            monto_total: Number(ki.monto_total || 0),
            proveedor_nombre: ki.proveedor_nombre || '—',
            nro_factura_compra: ki.nro_factura_compra || '—',
            motivo: ki.motivo || '—'
        });
    }
    ['H', 'I'].forEach((col) => {
        hojaKi.getColumn(col).numFmt = '#,##0.00##';
    });
    ['J', 'K', 'L'].forEach((col) => {
        hojaKi.getColumn(col).numFmt = '#,##0.00';
    });

    // =========================================================================
    // HOJA 9: HISTORIAL DE ANULACIONES AUDITADAS
    // =========================================================================
    const hojaAnul = workbook.addWorksheet('Historial Anulaciones');
    hojaAnul.columns = [
        { header: 'ID Movimiento', key: 'id', width: 14 },
        { header: 'N° Turno', key: 'caja_id', width: 11 },
        { header: 'Estación', key: 'caja_nombre', width: 20 },
        { header: 'Fecha de Venta', key: 'fecha_hora', width: 20 },
        { header: 'Cajero Original', key: 'operador', width: 16 },
        { header: 'Categoría', key: 'categoria_contable', width: 18 },
        { header: 'Método Pago', key: 'metodo_pago', width: 14 },
        { header: 'Monto Revertido (Bs)', key: 'monto', width: 21 },
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
            id: Number(ma.id),
            caja_id: Number(ma.caja_id),
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
    hojaRes.addRow({ concepto: 'Fecha de Generación (Hora Local Bolivia)', valor: new Date().toLocaleString('es-BO', { timeZone: ZONA_REPORTES }) });
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

/**
 * Consulta unificada de compras y egresos facturados para el Registro de Compras y Ventas (RCV)
 * según el estándar de 22 columnas requerido por el SIAT (Bolivia).
 * Une mediante UNION ALL:
 *  1. Compras facturadas de insumos (movimientos_insumos)
 *  2. Compras facturadas de productos directos (movimientos_productos_directos)
 *  3. Egresos de caja facturados (movimientos)
 *
 * @param {Object} filtros - { desde, hasta, cajaId }
 * @returns {Promise<Array<Object>>} Registros con las 22 columnas base del SIAT + metadatos
 */
async function obtenerComprasFacturadasRCV({ desde, hasta, cajaId } = {}) {
    const condIns = [
        `mi.tipo = 'compra'`,
        `COALESCE(mi.con_factura, 0) = 1`,
        `(mi.movimiento_id IS NULL OR m.estado = 'completado')`
    ];

    const condPrd = [
        `mpd.tipo = 'compra'`,
        `COALESCE(mpd.con_factura, 0) = 1`,
        `(mpd.movimiento_id IS NULL OR m.estado = 'completado')`
    ];

    const condEgr = [
        `m.tipo = 'egreso'`,
        `m.tipo_comprobante = 'factura'`,
        `m.estado = 'completado'`,
        `NOT EXISTS (SELECT 1 FROM movimientos_insumos mi WHERE mi.movimiento_id = m.id AND COALESCE(mi.con_factura, 0) = 1)`,
        `NOT EXISTS (SELECT 1 FROM movimientos_productos_directos mpd WHERE mpd.movimiento_id = m.id AND COALESCE(mpd.con_factura, 0) = 1)`
    ];
    const params = [];

    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(String(desde).trim())) {
        const indice = params.push(String(desde).trim());
        condIns.push(`${diaLocal('mi.fecha_hora')} >= $${indice}`);
        condPrd.push(`${diaLocal('mpd.fecha_hora')} >= $${indice}`);
        condEgr.push(`${diaLocal('m.fecha_hora')} >= $${indice}`);
    }

    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(hasta).trim())) {
        const indice = params.push(String(hasta).trim());
        condIns.push(`${diaLocal('mi.fecha_hora')} <= $${indice}`);
        condPrd.push(`${diaLocal('mpd.fecha_hora')} <= $${indice}`);
        condEgr.push(`${diaLocal('m.fecha_hora')} <= $${indice}`);
    }

    if (cajaId !== undefined && cajaId !== null && String(cajaId).trim() !== '') {
        const filtroCaja = `m.caja_id = $${params.push(Number(cajaId))}`;
        condIns.push(filtroCaja);
        condPrd.push(filtroCaja);
        condEgr.push(filtroCaja);
    }

    const sql = `
        SELECT * FROM (
            SELECT 'INS-' || mi.id AS id,
                   'insumo' AS origen,
                   m.caja_id AS caja_id,
                   mi.movimiento_id AS movimiento_id,
                   ${fechaHoraLocal('mi.fecha_hora')} AS fecha_hora,
                   ${fechaFacturaLocal('mi.fecha_hora')} AS fecha_factura,
                   COALESCE(NULLIF(TRIM(mi.proveedor_nit), ''), '0') AS nit_proveedor,
                   COALESCE(NULLIF(TRIM(mi.proveedor_nombre), ''), 'SIN NOMBRE') AS razon_social_proveedor,
                   COALESCE(NULLIF(TRIM(mi.nro_factura_compra), ''), '0') AS nro_factura,
                   '0' AS nro_dui_dim,
                   COALESCE(NULLIF(TRIM(mi.nro_autorizacion_cuf), ''), '0') AS nro_autorizacion_cuf,
                   ${redondeoSql('COALESCE(NULLIF(mi.monto_total_compra, 0), mi.cantidad * mi.costo_unitario)')} AS importe_total_compra,
                   0.0 AS importe_ice,
                   0.0 AS importe_iehd,
                   0.0 AS importe_ipj,
                   0.0 AS tasas,
                   0.0 AS otro_no_sujeto_credito_fiscal,
                   0.0 AS importes_exentos,
                   0.0 AS importe_gravado_tasa_cero,
                   ${redondeoSql('COALESCE(NULLIF(mi.monto_total_compra, 0), mi.cantidad * mi.costo_unitario)')} AS subtotal,
                   0.0 AS descuentos,
                   0.0 AS importe_gift_card,
                   ${redondeoSql('COALESCE(NULLIF(mi.monto_total_compra, 0), mi.cantidad * mi.costo_unitario)')} AS importe_base_credito_fiscal,
                   ${redondeoSql(`${redondeoSql('COALESCE(NULLIF(mi.monto_total_compra, 0), mi.cantidad * mi.costo_unitario)')} * 0.13`)} AS credito_fiscal,
                   COALESCE(mi.tipo_compra, 1) AS tipo_compra,
                   COALESCE(NULLIF(TRIM(mi.codigo_control), ''), '0') AS codigo_control
            FROM movimientos_insumos mi
            LEFT JOIN movimientos m ON mi.movimiento_id = m.id
            WHERE ${condIns.join(' AND ')}

            UNION ALL

            SELECT 'PRD-' || mpd.id AS id,
                   'producto_directo' AS origen,
                   m.caja_id AS caja_id,
                   mpd.movimiento_id AS movimiento_id,
                   ${fechaHoraLocal('mpd.fecha_hora')} AS fecha_hora,
                   ${fechaFacturaLocal('mpd.fecha_hora')} AS fecha_factura,
                   COALESCE(NULLIF(TRIM(mpd.proveedor_nit), ''), '0') AS nit_proveedor,
                   COALESCE(NULLIF(TRIM(mpd.proveedor_nombre), ''), 'SIN NOMBRE') AS razon_social_proveedor,
                   COALESCE(NULLIF(TRIM(mpd.nro_factura_compra), ''), '0') AS nro_factura,
                   '0' AS nro_dui_dim,
                   COALESCE(NULLIF(TRIM(mpd.nro_autorizacion_cuf), ''), '0') AS nro_autorizacion_cuf,
                   ${redondeoSql('COALESCE(NULLIF(mpd.monto_total, 0), mpd.cantidad * mpd.costo_unitario)')} AS importe_total_compra,
                   0.0 AS importe_ice,
                   0.0 AS importe_iehd,
                   0.0 AS importe_ipj,
                   0.0 AS tasas,
                   0.0 AS otro_no_sujeto_credito_fiscal,
                   0.0 AS importes_exentos,
                   0.0 AS importe_gravado_tasa_cero,
                   ${redondeoSql('COALESCE(NULLIF(mpd.monto_total, 0), mpd.cantidad * mpd.costo_unitario)')} AS subtotal,
                   0.0 AS descuentos,
                   0.0 AS importe_gift_card,
                   ${redondeoSql('COALESCE(NULLIF(mpd.monto_total, 0), mpd.cantidad * mpd.costo_unitario)')} AS importe_base_credito_fiscal,
                   ${redondeoSql(`${redondeoSql('COALESCE(NULLIF(mpd.monto_total, 0), mpd.cantidad * mpd.costo_unitario)')} * 0.13`)} AS credito_fiscal,
                   COALESCE(mpd.tipo_compra, 1) AS tipo_compra,
                   COALESCE(NULLIF(TRIM(mpd.codigo_control), ''), '0') AS codigo_control
            FROM movimientos_productos_directos mpd
            LEFT JOIN movimientos m ON mpd.movimiento_id = m.id
            WHERE ${condPrd.join(' AND ')}

            UNION ALL

            SELECT 'EGR-' || m.id AS id,
                   'egreso' AS origen,
                   m.caja_id AS caja_id,
                   m.id AS movimiento_id,
                   ${fechaHoraLocal('m.fecha_hora')} AS fecha_hora,
                   ${fechaFacturaLocal('m.fecha_hora')} AS fecha_factura,
                   COALESCE(NULLIF(TRIM(m.cliente_nit_ci), ''), '0') AS nit_proveedor,
                   COALESCE(NULLIF(TRIM(m.cliente_razon_social), ''), 'SIN NOMBRE') AS razon_social_proveedor,
                   COALESCE(NULLIF(TRIM(m.nro_factura), ''), '0') AS nro_factura,
                   '0' AS nro_dui_dim,
                   COALESCE(NULLIF(TRIM(m.cuf_autorizacion), ''), '0') AS nro_autorizacion_cuf,
                   ${redondeoSql('m.monto')} AS importe_total_compra,
                   0.0 AS importe_ice,
                   0.0 AS importe_iehd,
                   0.0 AS importe_ipj,
                   0.0 AS tasas,
                   0.0 AS otro_no_sujeto_credito_fiscal,
                   0.0 AS importes_exentos,
                   0.0 AS importe_gravado_tasa_cero,
                   ${redondeoSql('m.monto')} AS subtotal,
                   0.0 AS descuentos,
                   0.0 AS importe_gift_card,
                   ${redondeoSql('m.monto')} AS importe_base_credito_fiscal,
                   ${redondeoSql('COALESCE(NULLIF(m.iva_monto, 0), m.monto * 0.13)')} AS credito_fiscal,
                   COALESCE(m.tipo_compra, 1) AS tipo_compra,
                   COALESCE(NULLIF(TRIM(m.codigo_control), ''), '0') AS codigo_control
            FROM movimientos m
            WHERE ${condEgr.join(' AND ')}
        ) AS compras_facturadas
        ORDER BY fecha_hora ASC, id ASC
    `;

    const filas = await allQuery(sql, params);

    return filas.map((fila, index) => ({
        nro: index + 1,
        fecha_factura: fila.fecha_factura,
        nit_proveedor: String(fila.nit_proveedor),
        razon_social_proveedor: fila.razon_social_proveedor,
        nro_factura: String(fila.nro_factura),
        nro_dui_dim: String(fila.nro_dui_dim),
        nro_autorizacion_cuf: String(fila.nro_autorizacion_cuf),
        importe_total_compra: redondear2(fila.importe_total_compra),
        importe_ice: redondear2(fila.importe_ice),
        importe_iehd: redondear2(fila.importe_iehd),
        importe_ipj: redondear2(fila.importe_ipj),
        tasas: redondear2(fila.tasas),
        otro_no_sujeto_credito_fiscal: redondear2(fila.otro_no_sujeto_credito_fiscal),
        importes_exentos: redondear2(fila.importes_exentos),
        importe_gravado_tasa_cero: redondear2(fila.importe_gravado_tasa_cero),
        subtotal: redondear2(fila.subtotal),
        descuentos: redondear2(fila.descuentos),
        importe_gift_card: redondear2(fila.importe_gift_card),
        importe_base_credito_fiscal: redondear2(fila.importe_base_credito_fiscal),
        credito_fiscal: redondear2(fila.credito_fiscal),
        tipo_compra: Number(fila.tipo_compra),
        codigo_control: String(fila.codigo_control),
        // Metadatos auxiliares de trazabilidad
        id: fila.id,
        origen: fila.origen,
        caja_id: fila.caja_id === null ? null : Number(fila.caja_id),
        movimiento_id: fila.movimiento_id === null ? null : Number(fila.movimiento_id),
        fecha_hora: fila.fecha_hora
    }));
}

/**
 * Genera el archivo del Registro de Compras y Ventas (RCV) - Compras en formato plano (.txt)
 * delimitado por pipes (|) conforme a la especificación técnica oficial del SIAT (Bolivia).
 * Consta de 22 columnas separadas por 21 caracteres pipe '|', sin cabecera.
 *
 * @param {Object} params - { desde, hasta, cajaId, usuarioGenerador }
 * @returns {Promise<string>} Contenido del archivo TXT en UTF-8
 */
async function generarRCVComprasTXT({ desde, hasta, cajaId, usuarioGenerador } = {}) {
    const compras = await obtenerComprasFacturadasRCV({ desde, hasta, cajaId });

    const sanitizarPipe = (val) => String(val ?? '').replace(/[\r\n|]/g, ' ').trim();
    const sanitizarCodigoPipe = (val) => String(val ?? '').replace(/[\r\n|\s]/g, '').trim();

    const lineas = compras.map((c, index) => {
        const correlativo = index + 1;

        let fecha = c.fecha_factura;
        if (!fecha || !/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
            if (c.fecha_hora) {
                const d = new Date(c.fecha_hora);
                if (!isNaN(d.getTime())) {
                    const pad = (n) => String(n).padStart(2, '0');
                    fecha = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
                }
            }
        }
        if (!fecha) fecha = '01/01/2000';

        const nitProveedor = sanitizarCodigoPipe(c.nit_proveedor) || '0';
        const razonSocial = sanitizarPipe(c.razon_social_proveedor) || 'SIN NOMBRE';
        const nroFactura = sanitizarCodigoPipe(c.nro_factura) || '0';
        const nroDuiDim = sanitizarCodigoPipe(c.nro_dui_dim) || '0';
        const nroAutorizacionCuf = sanitizarCodigoPipe(c.nro_autorizacion_cuf) || '0';

        const importeTotal = redondear2(c.importe_total_compra).toFixed(2);
        const ice = redondear2(c.importe_ice).toFixed(2);
        const iehd = redondear2(c.importe_iehd).toFixed(2);
        const ipj = redondear2(c.importe_ipj).toFixed(2);
        const tasas = redondear2(c.tasas).toFixed(2);
        const noSujeto = redondear2(c.otro_no_sujeto_credito_fiscal).toFixed(2);
        const exentas = redondear2(c.importes_exentos).toFixed(2);
        const tasaCero = redondear2(c.importe_gravado_tasa_cero).toFixed(2);
        const subtotal = redondear2(c.subtotal).toFixed(2);
        const descuentos = redondear2(c.descuentos).toFixed(2);
        const giftCard = redondear2(c.importe_gift_card).toFixed(2);
        const baseCreditoFiscal = redondear2(c.importe_base_credito_fiscal).toFixed(2);
        const creditoFiscal = redondear2(c.credito_fiscal).toFixed(2);
        const tipoCompra = Number(c.tipo_compra) || 1;
        const codigoControl = sanitizarCodigoPipe(c.codigo_control) || '0';

        const columnas = [
            correlativo,
            fecha,
            nitProveedor,
            razonSocial,
            nroFactura,
            nroDuiDim,
            nroAutorizacionCuf,
            importeTotal,
            ice,
            iehd,
            ipj,
            tasas,
            noSujeto,
            exentas,
            tasaCero,
            subtotal,
            descuentos,
            giftCard,
            baseCreditoFiscal,
            creditoFiscal,
            tipoCompra,
            codigoControl
        ];

        return columnas.join('|');
    });

    return lineas.join('\r\n');
}

/**
 * Genera el archivo oficial RCV Compras en formato Excel (.xlsx) estructurado
 * con las 22 columnas normativas del SIAT y tipos numéricos exactos para importación / auditoría.
 *
 * @param {Object} params - { desde, hasta, cajaId, usuarioGenerador }
 * @returns {Promise<Buffer>} Buffer binario del archivo Excel
 */
async function generarRCVComprasExcel({ desde, hasta, cajaId, usuarioGenerador } = {}) {
    const negocio = await obtenerConfiguracionNegocio();
    const compras = await obtenerComprasFacturadasRCV({ desde, hasta, cajaId });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = `Sistema POS - ${negocio?.nombre_negocio || 'Mi Negocio'}`;
    workbook.lastModifiedBy = usuarioGenerador || 'Administrador / Sistema';
    workbook.created = new Date();
    workbook.modified = new Date();

    const hoja = workbook.addWorksheet('RCV Compras');
    hoja.columns = [
        { header: 'Nº', key: 'nro', width: 8 },
        { header: 'Fecha de la Factura', key: 'fecha_factura', width: 16 },
        { header: 'NIT Proveedor', key: 'nit_proveedor', width: 18 },
        { header: 'Razón Social Proveedor', key: 'razon_social_proveedor', width: 32 },
        { header: 'N° Factura', key: 'nro_factura', width: 16 },
        { header: 'N° DUI/DIM', key: 'nro_dui_dim', width: 14 },
        { header: 'N° Autorización / CUF', key: 'nro_autorizacion_cuf', width: 36 },
        { header: 'Importe Total Compra', key: 'importe_total_compra', width: 22 },
        { header: 'Importe ICE', key: 'importe_ice', width: 16 },
        { header: 'Importe IEHD', key: 'importe_iehd', width: 16 },
        { header: 'Importe IPJ', key: 'importe_ipj', width: 16 },
        { header: 'Tasas', key: 'tasas', width: 14 },
        { header: 'Otro No Sujeto a Crédito Fiscal', key: 'otro_no_sujeto_credito_fiscal', width: 26 },
        { header: 'Importes Exentos', key: 'importes_exentos', width: 18 },
        { header: 'Importe Compras Gravadas a Tasa Cero', key: 'importe_gravado_tasa_cero', width: 30 },
        { header: 'Subtotal', key: 'subtotal', width: 18 },
        { header: 'Descuentos / Bonificaciones / Rebajas Sujetas al IVA', key: 'descuentos', width: 28 },
        { header: 'Importe Gift Card', key: 'importe_gift_card', width: 18 },
        { header: 'Importe Base Crédito Fiscal', key: 'importe_base_credito_fiscal', width: 24 },
        { header: 'Crédito Fiscal', key: 'credito_fiscal', width: 18 },
        { header: 'Tipo Compra', key: 'tipo_compra', width: 14 },
        { header: 'Código de Control', key: 'codigo_control', width: 20 }
    ];

    const filaCabecera = hoja.getRow(1);
    filaCabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    filaCabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    filaCabecera.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    filaCabecera.height = 28;

    for (const c of compras) {
        hoja.addRow({
            nro: Number(c.nro),
            fecha_factura: c.fecha_factura,
            nit_proveedor: String(c.nit_proveedor),
            razon_social_proveedor: c.razon_social_proveedor,
            nro_factura: String(c.nro_factura),
            nro_dui_dim: String(c.nro_dui_dim),
            nro_autorizacion_cuf: String(c.nro_autorizacion_cuf),
            importe_total_compra: redondear2(c.importe_total_compra),
            importe_ice: redondear2(c.importe_ice),
            importe_iehd: redondear2(c.importe_iehd),
            importe_ipj: redondear2(c.importe_ipj),
            tasas: redondear2(c.tasas),
            otro_no_sujeto_credito_fiscal: redondear2(c.otro_no_sujeto_credito_fiscal),
            importes_exentos: redondear2(c.importes_exentos),
            importe_gravado_tasa_cero: redondear2(c.importe_gravado_tasa_cero),
            subtotal: redondear2(c.subtotal),
            descuentos: redondear2(c.descuentos),
            importe_gift_card: redondear2(c.importe_gift_card),
            importe_base_credito_fiscal: redondear2(c.importe_base_credito_fiscal),
            credito_fiscal: redondear2(c.credito_fiscal),
            tipo_compra: Number(c.tipo_compra),
            codigo_control: String(c.codigo_control)
        });
    }

    hoja.getColumn('A').alignment = { vertical: 'middle', horizontal: 'center' };
    hoja.getColumn('B').alignment = { vertical: 'middle', horizontal: 'center' };
    hoja.getColumn('C').alignment = { vertical: 'middle', horizontal: 'center' };
    hoja.getColumn('E').alignment = { vertical: 'middle', horizontal: 'center' };
    hoja.getColumn('F').alignment = { vertical: 'middle', horizontal: 'center' };
    hoja.getColumn('G').alignment = { vertical: 'middle', horizontal: 'left' };
    hoja.getColumn('U').alignment = { vertical: 'middle', horizontal: 'center' };
    hoja.getColumn('V').alignment = { vertical: 'middle', horizontal: 'center' };

    hoja.getColumn('A').numFmt = '0';
    hoja.getColumn('U').numFmt = '0';

    ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'].forEach((col) => {
        const colInst = hoja.getColumn(col);
        colInst.numFmt = '#,##0.00';
        colInst.alignment = { vertical: 'middle', horizontal: 'right' };
    });

    return await workbook.xlsx.writeBuffer();
}

module.exports = {
    obtenerEstadisticasCaja,
    obtenerDesgloseMetodosPago,
    obtenerTendenciasVentas,
    sanitizarTextoCSV,
    construirClausulaFiltroMovimientos,
    generarReporteCSV,
    generarReporteExcel,
    obtenerComprasFacturadasRCV,
    generarRCVComprasTXT,
    generarRCVComprasExcel
};
