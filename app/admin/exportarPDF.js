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
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    const nombreEstacion = cajaAuditada?.caja_fisica_nombre || 'Caja Principal';
    doc.text(`${tituloNegocio}${nitNegocio} — Reporte Contable Turno #${cajaId}`, 14, 15);

    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
        `Régimen: ${regimen} | Generado: ${fechaGen} | Por: ${usuarioGenerador || 'Administrador'}`,
        14,
        21
    );
    if (cajaAuditada) {
        doc.text(
            `Estación: ${nombreEstacion} | Cajero: ${cajaAuditada.usuario_nombre || '—'} | Estado: ${String(cajaAuditada.estado || '').toUpperCase()} | Apertura: ${cajaAuditada.fecha_apertura || '—'} | Cierre: ${cajaAuditada.fecha_cierre || 'En curso'}`,
            14,
            26
        );
    }

    const est = estadisticas || {};
    const filasFinancieras = [
        ['(+) Ventas Brutas', `Bs ${Number(est.subtotalBrutoVentas ?? est.ventasTotales ?? 0).toFixed(2)}`],
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

    if (configuracionNegocio?.regimen_tributario === 'regimen_general' || Number(est.debitoFiscalIva || 0) > 0 || Number(est.impuestoTransaccionesIt || 0) > 0) {
        filasFinancieras.push(
            ['Ventas con Factura vs. Recibo Interno', `Facturadas: Bs ${Number(est.ventasFacturadas || 0).toFixed(2)} | Recibo: Bs ${Number(est.ventasRecibo || 0).toFixed(2)}`],
            [`Débito Fiscal IVA / Impuesto Transacciones IT (base: ${est.itBase || 'todas_las_ventas'})`, `IVA: Bs ${Number(est.debitoFiscalIva || 0).toFixed(2)} | IT: Bs ${Number(est.impuestoTransaccionesIt || 0).toFixed(2)}`],
            ['Crédito Fiscal IVA en Egresos Facturados del Turno', `Bs ${Number(est.creditoFiscalIvaEgresos || 0).toFixed(2)} (sobre Bs ${Number(est.egresosFacturados || 0).toFixed(2)})`]
        );
    }

    // 1. Estado de Resultados del Turno y Resumen de Impuestos
    autoTable(doc, {
        startY: 31,
        head: [['1. Estado de Resultados y Resumen Tributario', 'Importe / Detalle']],
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

        const qrRealTxt = cajaAuditada.qr_real !== null && cajaAuditada.qr_real !== undefined
            ? ` | Conciliado: Bs ${Number(cajaAuditada.qr_real).toFixed(2)} (Dif: Bs ${Number(cajaAuditada.diferencia_qr || 0).toFixed(2)})`
            : '';

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 5,
            head: [['2. Conciliación de Arqueo de Caja (Efectivo Físico vs. QR)', 'Valor (Bs)']],
            body: [
                ['Fondo Inicial de Apertura', `Bs ${Number(cajaAuditada.monto_inicial || 0).toFixed(2)}`],
                ['Efectivo Físico Esperado en Cajón', cajaAuditada.efectivo_esperado !== null ? `Bs ${Number(cajaAuditada.efectivo_esperado).toFixed(2)}` : 'En curso'],
                ['Efectivo Real Contado (Arqueo Ciego)', cajaAuditada.efectivo_real !== null ? `Bs ${Number(cajaAuditada.efectivo_real).toFixed(2)}` : 'En curso'],
                ['Resultado / Diferencia de Efectivo', estadoDif],
                ['Total Cobros QR Esperado en Banco', `Bs ${Number(cajaAuditada.qr_esperado || 0).toFixed(2)}${qrRealTxt}`],
                ...(cajaAuditada.observaciones_cierre
                    ? [['Observaciones de Cierre', String(cajaAuditada.observaciones_cierre)]]
                    : []),
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

    // 4. Rentabilidad por Producto (con descuentos prorrateados)
    const prodsVendidos = est.productosMasVendidos || [];
    if (prodsVendidos.length > 0) {
        let totUni = 0;
        let totIng = 0;
        let totGan = 0;
        const filasRent = prodsVendidos.map((p) => {
            const u = Number(p.unidades_vendidas || 0);
            const ing = Number(p.ingresos_generados || 0);
            const gan = Number(p.ganancia_generada || 0);
            totUni += u;
            totIng += ing;
            totGan += gan;
            const margen = ing > 0 ? ((gan / ing) * 100).toFixed(1) : '0.0';
            return [
                p.nombre || `Producto #${p.id}`,
                p.categoria || 'Sin categoría',
                String(u),
                `Bs ${ing.toFixed(2)}`,
                `Bs ${gan.toFixed(2)}`,
                `${margen}%`
            ];
        });
        filasRent.push([
            'TOTAL RENTABILIDAD PRODUCTOS',
            '',
            String(Number(totUni.toFixed(2))),
            `Bs ${totIng.toFixed(2)}`,
            `Bs ${totGan.toFixed(2)}`,
            totIng > 0 ? `${((totGan / totIng) * 100).toFixed(1)}%` : '0.0%'
        ]);

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 5,
            head: [['4. Rentabilidad por Producto (Neto de Descuentos)', 'Categoría', 'Unidades', 'Ingreso Neto', 'Ganancia Bruta', 'Margen']],
            body: filasRent,
            theme: 'striped',
            headStyles: { fillColor: [15, 118, 110] },
            styles: { fontSize: 8, cellPadding: 1.8 }
        });
    }

    // 5. Tabla de Movimientos Auditados
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
        columnStyles: { 8: { cellWidth: 38 } }
    });

    // 6. Historial de Anulaciones del Turno
    const anulados = listaMov.filter((m) => m.estado === 'anulado');
    if (anulados.length > 0) {
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 5,
            head: [['6. Historial de Anulaciones', 'Fecha Original', 'Operador', 'Anulado Por', 'Fecha Anulación', 'Monto Revertido', 'Motivo']],
            body: anulados.map((a) => [
                `#${a.id}`,
                a.fecha_hora || '',
                a.usuario_nombre || '—',
                a.anulado_por_nombre || 'Admin',
                a.fecha_anulacion || '—',
                `Bs ${Number(a.monto || 0).toFixed(2)}`,
                a.motivo_anulacion || '—'
            ]),
            theme: 'grid',
            headStyles: { fillColor: [220, 38, 38] },
            styles: { fontSize: 7.5, cellPadding: 1.8 }
        });
    }

    doc.save(`reporte_turno_${cajaId}.pdf`);
    return doc;
}
