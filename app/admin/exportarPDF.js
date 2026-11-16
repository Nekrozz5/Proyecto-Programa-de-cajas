'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Genera y descarga un reporte PDF contable y de arqueo de la caja auditada usando jsPDF + AutoTable.
 */
export function exportarReportePDF({
    nombreNegocio,
    configuracionNegocio,
    usuarioGenerador,
    cajaAuditada,
    estadisticas,
    movimientos,
    desglosePagos
}) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const tituloNegocio = nombreNegocio || configuracionNegocio?.nombre_negocio || 'Sistema POS';
    const nitNegocio = configuracionNegocio?.nit_negocio ? ` | NIT: ${configuracionNegocio.nit_negocio}` : '';
    const regimen = configuracionNegocio?.regimen_tributario === 'regimen_general'
        ? `Régimen General (IVA ${configuracionNegocio?.iva_porcentaje ?? 13}% / IT ${configuracionNegocio?.it_porcentaje ?? 3}%)`
        : 'Control Interno / Régimen Simplificado';
    const cajaId = cajaAuditada?.id || '—';
    const fechaGen = new Date().toLocaleString('es-BO');

    // Encabezado institucional
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    const nombreEstacion = cajaAuditada?.caja_fisica_nombre || 'Caja Principal';
    doc.text(`${tituloNegocio}${nitNegocio} — Reporte Contable Turno #${cajaId}`, 14, 16);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
        `Régimen: ${regimen} | Generado: ${fechaGen}${usuarioGenerador ? ` | Por: ${usuarioGenerador}` : ''}`,
        14,
        22
    );
    if (cajaAuditada) {
        doc.text(
            `Estación: ${nombreEstacion} | Cajero: ${cajaAuditada.usuario_nombre || '—'} | Estado: ${String(cajaAuditada.estado || '').toUpperCase()} | Apertura: ${cajaAuditada.fecha_apertura || '—'} | Cierre: ${cajaAuditada.fecha_cierre || 'En curso'}`,
            14,
            27
        );
    }

    const est = estadisticas || {};
    const filasFinancieras = [
        ['Ventas Brutas', `Bs ${Number(est.subtotalBrutoVentas ?? est.ventasTotales ?? 0).toFixed(2)}`],
        ...(Number(est.descuentosTotales || 0) > 0
            ? [['(-) Descuentos Otorgados', `-Bs ${Number(est.descuentosTotales || 0).toFixed(2)}`]]
            : []),
        ['(=) Ventas Netas Cobradas', `Bs ${Number(est.ventasTotales || 0).toFixed(2)} (${est.cantidadTickets || 0} tickets | Prom: Bs ${Number(est.ticketPromedio || 0).toFixed(2)})`],
        ['(-) Costo de Mercadería Vendida (CMV - CPP)', `Bs ${Number(est.costoTotalVentas || 0).toFixed(2)}`],
        ['(=) Utilidad / Ganancia Bruta', `Bs ${Number(est.gananciaBruta || 0).toFixed(2)}`],
        ['(-) Total Egresos / Gastos Operativos', `Bs ${Number(est.totalEgresos || 0).toFixed(2)}`],
        ['(=) Flujo Neto Operativo', `Bs ${Number(est.flujoNetoOperativo || 0).toFixed(2)}`]
    ];

    if (Number(est.totalReposiciones || 0) > 0) {
        filasFinancieras.push([
            '(i) Aportes de Sencillo / Cambio (No son ventas)',
            `Bs ${Number(est.totalReposiciones || 0).toFixed(2)}`
        ]);
    }

    if (configuracionNegocio?.regimen_tributario === 'regimen_general') {
        filasFinancieras.push(
            ['Ventas con Factura vs. Recibo Interno', `Facturadas: Bs ${Number(est.ventasFacturadas || 0).toFixed(2)} | Recibo: Bs ${Number(est.ventasRecibo || 0).toFixed(2)}`],
            [`Débito Fiscal IVA (${est.ivaPorcentaje ?? 13}%) / IT (${est.itPorcentaje ?? 3}%)`, `IVA: Bs ${Number(est.debitoFiscalIva || 0).toFixed(2)} | IT: Bs ${Number(est.impuestoTransaccionesIt || 0).toFixed(2)}`]
        );
    }

    // 1. Estado de Resultados del Turno
    autoTable(doc, {
        startY: 32,
        head: [['1. Estado de Resultados y Resumen Financiero', 'Importe / Detalle']],
        body: filasFinancieras,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 8.5, cellPadding: 2 }
    });

    // 2. Conciliación de Arqueo de Caja (Efectivo Físico y QR)
    if (cajaAuditada) {
        const dif = cajaAuditada.diferencia_efectivo !== null && cajaAuditada.diferencia_efectivo !== undefined
            ? Number(cajaAuditada.diferencia_efectivo)
            : null;
        const estadoDif = dif === null
            ? 'En curso (Turno abierto)'
            : dif === 0
                ? 'CUADRE EXACTO (Bs 0.00)'
                : dif < 0
                    ? `FALTANTE EN CAJA: Bs ${dif.toFixed(2)}`
                    : `SOBRANTE EN CAJA: +Bs ${dif.toFixed(2)}`;

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 5,
            head: [['2. Conciliación de Arqueo de Caja (Efectivo Físico vs. QR)', 'Valor (Bs)']],
            body: [
                ['Fondo Inicial de Apertura', `Bs ${Number(cajaAuditada.monto_inicial || 0).toFixed(2)}`],
                ['Efectivo Físico Esperado en Cajón', cajaAuditada.efectivo_esperado !== null ? `Bs ${Number(cajaAuditada.efectivo_esperado).toFixed(2)}` : 'En curso'],
                ['Efectivo Real Contado (Arqueo Ciego)', cajaAuditada.efectivo_real !== null ? `Bs ${Number(cajaAuditada.efectivo_real).toFixed(2)}` : 'En curso'],
                ['Resultado / Diferencia de Efectivo', estadoDif],
                ['Total Cobros QR Esperado en Banco', `Bs ${Number(cajaAuditada.qr_esperado || 0).toFixed(2)}${cajaAuditada.qr_real !== null && cajaAuditada.qr_real !== undefined ? ` (Conciliado: Bs ${Number(cajaAuditada.qr_real).toFixed(2)})` : ''}`],
                ...(Number(cajaAuditada.veces_reabierta || 0) > 0
                    ? [['Reaperturas Auditadas', `${cajaAuditada.veces_reabierta} vez/veces — ${cajaAuditada.historial_reaperturas || ''}`]]
                    : [])
            ],
            theme: 'grid',
            headStyles: { fillColor: [21, 128, 61] },
            styles: { fontSize: 8.5, cellPadding: 2 }
        });
    }

    // 3. Desglose por método de pago (solo ventas comerciales)
    const pagos = desglosePagos || [];
    if (pagos.length > 0) {
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 5,
            head: [['3. Desglose de Ventas por Canal de Cobro', 'Transacciones', 'Monto Cobrado (Bs)', 'Participación']],
            body: pagos.map((p) => [
                String(p.metodoPago || '').toUpperCase(),
                String(p.transacciones || 0),
                `Bs ${Number(p.montoTotal || 0).toFixed(2)}`,
                `${Number(p.porcentaje || 0)}%`
            ]),
            theme: 'striped',
            headStyles: { fillColor: [2, 132, 199] },
            styles: { fontSize: 8.5, cellPadding: 2 }
        });
    }

    // 4. Tabla de Movimientos Auditados
    const listaMov = movimientos || [];
    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [['ID', 'Fecha/Hora', 'Operador', 'Categoría', 'Pago / Desglose', 'Comprobante', 'Monto', 'Estado', 'Descripción']],
        body: listaMov.length > 0
            ? listaMov.map((m) => {
                const pagoTxt = m.metodo_pago === 'mixto'
                    ? `MIXTO (Ef: ${Number(m.monto_efectivo || 0).toFixed(2)} | QR: ${Number(m.monto_qr || 0).toFixed(2)})`
                    : `${String(m.metodo_pago || '').toUpperCase()}${m.referencia_qr ? ` (#${m.referencia_qr})` : ''}`;
                const compTxt = m.tipo_comprobante === 'factura'
                    ? `FACT ${m.nro_factura ? `#${m.nro_factura}` : ''}${m.cliente_nit_ci ? ` (NIT:${m.cliente_nit_ci})` : ''}`
                    : (m.tipo_comprobante === 'sin_respaldo' ? 'S/R' : 'RECIBO');

                return [
                    `#${m.id}`,
                    m.fecha_hora || '',
                    m.usuario_nombre || '—',
                    m.categoria_contable || m.tipo || '',
                    pagoTxt,
                    compTxt,
                    `Bs ${Number(m.monto || 0).toFixed(2)}`,
                    m.estado || '',
                    m.descripcion || ''
                ];
            })
            : [['—', 'Sin movimientos registrados en esta caja', '', '', '', '', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 7.5, cellPadding: 1.8 },
        columnStyles: { 8: { cellWidth: 40 } }
    });

    doc.save(`reporte_turno_${cajaId}.pdf`);
    return doc;
}
