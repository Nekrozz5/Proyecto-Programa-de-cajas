'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Genera y descarga un reporte PDF profesional de la caja auditada usando jsPDF + AutoTable.
 */
export function exportarReportePDF({ nombreNegocio, cajaAuditada, estadisticas, movimientos, desglosePagos }) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const tituloNegocio = nombreNegocio || 'Sistema POS';
    const cajaId = cajaAuditada?.id || '—';
    const fechaGen = new Date().toLocaleString('es-BO');

    // Encabezado principal
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(`${tituloNegocio} — Reporte de Caja #${cajaId}`, 14, 18);

    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Generado: ${fechaGen}`, 14, 24);
    if (cajaAuditada) {
        doc.text(
            `Cajero: ${cajaAuditada.usuario_nombre || '—'} | Estado: ${String(cajaAuditada.estado || '').toUpperCase()} | Apertura: ${cajaAuditada.fecha_apertura || '—'}`,
            14,
            29
        );
    }

    // Resumen Financiero
    const est = estadisticas || {};
    autoTable(doc, {
        startY: 35,
        head: [['Indicador Financiero', 'Valor (Bs)']],
        body: [
            ['Ventas Totales', `Bs ${Number(est.ventasTotales || 0).toFixed(2)}`],
            ['Tickets Emitidos / Promedio', `${est.cantidadTickets || 0} tickets (Prom: Bs ${Number(est.ticketPromedio || 0).toFixed(2)})`],
            ['Costo Total de Ventas', `Bs ${Number(est.costoTotalVentas || 0).toFixed(2)}`],
            ['Ganancia Bruta', `Bs ${Number(est.gananciaBruta || 0).toFixed(2)}`],
            ['Total Egresos', `Bs ${Number(est.totalEgresos || 0).toFixed(2)}`],
            ['Flujo Neto Operativo', `Bs ${Number(est.flujoNetoOperativo || 0).toFixed(2)}`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 9 }
    });

    // Desglose por método de pago
    const pagos = desglosePagos || [];
    if (pagos.length > 0) {
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 8,
            head: [['Método de Pago', 'Transacciones', 'Monto Total', 'Participación']],
            body: pagos.map((p) => [
                String(p.metodoPago || '').toUpperCase(),
                String(p.transacciones || 0),
                `Bs ${Number(p.montoTotal || 0).toFixed(2)}`,
                `${Number(p.porcentaje || 0)}%`
            ]),
            theme: 'striped',
            headStyles: { fillColor: [2, 132, 199] },
            styles: { fontSize: 9 }
        });
    }

    // Tabla de Movimientos
    const listaMov = movimientos || [];
    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [['ID', 'Fecha/Hora', 'Tipo', 'Pago', 'Monto', 'Estado', 'Descripción']],
        body: listaMov.length > 0
            ? listaMov.map((m) => [
                `#${m.id}`,
                m.fecha_hora || '',
                String(m.tipo || '').toUpperCase(),
                String(m.metodo_pago || '').toUpperCase(),
                `Bs ${Number(m.monto || 0).toFixed(2)}`,
                m.estado || '',
                m.descripcion || ''
            ])
            : [['—', 'Sin movimientos registrados en esta caja', '', '', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 6: { cellWidth: 52 } }
    });

    doc.save(`reporte_caja_${cajaId}.pdf`);
}
