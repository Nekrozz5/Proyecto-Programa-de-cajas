'use client';

import { useState } from 'react';
import { cardStyle, btnPrimario, inputStyle } from './adminStyles';
import { exportarReportePDF } from '../exportarPDF';

export default function TabExportacion({
    datos,
    adminAutenticado,
    turnoAuditadoId,
    setTurnoAuditadoId,
    cargarTodo
}) {
    // Filtros de Exportación
    const [filtroExportDesde, setFiltroExportDesde] = useState('');
    const [filtroExportHasta, setFiltroExportHasta] = useState('');
    const [filtroExportUsuarioId, setFiltroExportUsuarioId] = useState('');
    const [filtroExportCajaFisicaId, setFiltroExportCajaFisicaId] = useState('');

    const configActual = datos?.configuracionNegocio || {};
    const est = datos?.estadisticas;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1100px' }}>
            {/* Encabezado de la Sección */}
            <section style={cardStyle}>
                <h2 style={{ marginTop: 0, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📥 Centro de Exportación de Reportes
                </h2>
                <p style={{ color: '#475569', fontSize: '0.92rem', margin: 0 }}>
                    Exporta y audita los datos operativos y financieros del negocio en los 3 formatos oficiales: <strong>Excel (.xlsx)</strong>, <strong>PDF de Auditoría de Turno</strong> y <strong>CSV Contable</strong>. Puedes aplicar filtros por rango de fechas, operador y estación física de caja.
                </p>
            </section>

            {/* Filtros de Exportación */}
            <section style={{ ...cardStyle, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        📅 Filtros de Exportación (Excel y CSV)
                    </h3>
                    {(filtroExportDesde || filtroExportHasta || filtroExportUsuarioId || filtroExportCajaFisicaId) && (
                        <button
                            type="button"
                            onClick={() => {
                                setFiltroExportDesde('');
                                setFiltroExportHasta('');
                                setFiltroExportUsuarioId('');
                                setFiltroExportCajaFisicaId('');
                            }}
                            style={{ padding: '0.3rem 0.65rem', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                        >
                            ✕ Limpiar Filtros
                        </button>
                    )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            Fecha Desde:
                        </label>
                        <input
                            type="date"
                            title="Fecha desde"
                            value={filtroExportDesde}
                            onChange={(e) => setFiltroExportDesde(e.target.value)}
                            style={{ ...inputStyle, padding: '0.45rem', fontSize: '0.88rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            Fecha Hasta:
                        </label>
                        <input
                            type="date"
                            title="Fecha hasta"
                            value={filtroExportHasta}
                            onChange={(e) => setFiltroExportHasta(e.target.value)}
                            style={{ ...inputStyle, padding: '0.45rem', fontSize: '0.88rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            Operador / Cajero:
                        </label>
                        <select
                            title="Filtrar por operador"
                            value={filtroExportUsuarioId}
                            onChange={(e) => setFiltroExportUsuarioId(e.target.value)}
                            style={{ ...inputStyle, padding: '0.45rem', fontSize: '0.88rem' }}
                        >
                            <option value="">Todos los operadores</option>
                            {(datos?.usuarios || []).map((u) => (
                                <option key={u.id} value={u.id}>{u.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            Estación Física de Caja:
                        </label>
                        <select
                            title="Filtrar por estación física"
                            value={filtroExportCajaFisicaId}
                            onChange={(e) => setFiltroExportCajaFisicaId(e.target.value)}
                            style={{ ...inputStyle, padding: '0.45rem', fontSize: '0.88rem' }}
                        >
                            <option value="">Todas las estaciones</option>
                            {(datos?.cajasFisicas || []).map((cf) => (
                                <option key={cf.id} value={cf.id}>{cf.nombre}</option>
                            ))}
                        </select>
                    </div>
                </div>
                {(filtroExportDesde || filtroExportHasta || filtroExportUsuarioId || filtroExportCajaFisicaId) && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#0369a1', background: '#e0f2fe', padding: '0.4rem 0.65rem', borderRadius: '4px' }}>
                        ℹ️ Filtro activo: {[
                            filtroExportDesde ? `Desde: ${filtroExportDesde}` : '',
                            filtroExportHasta ? `Hasta: ${filtroExportHasta}` : '',
                            filtroExportUsuarioId ? `Operador: ${(datos?.usuarios || []).find(u => Number(u.id) === Number(filtroExportUsuarioId))?.nombre || filtroExportUsuarioId}` : '',
                            filtroExportCajaFisicaId ? `Estación: ${(datos?.cajasFisicas || []).find(cf => Number(cf.id) === Number(filtroExportCajaFisicaId))?.nombre || filtroExportCajaFisicaId}` : ''
                        ].filter(Boolean).join(' | ')}
                    </div>
                )}
            </section>

            {/* Las 3 Opciones de Formato */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1.25rem' }}>
                {/* Formato 1: Excel Contable (.xlsx) */}
                <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '4px solid #16a34a' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, color: '#166534', fontSize: '1.15rem' }}>
                                📊 Excel Contable (.xlsx)
                            </h3>
                            <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                10 Hojas Contables
                            </span>
                        </div>
                        <p style={{ color: '#475569', fontSize: '0.86rem', lineHeight: '1.4' }}>
                            Libro contable y de auditoría integral con 10 hojas estructuradas:
                        </p>
                        <ul style={{ color: '#64748b', fontSize: '0.8rem', paddingLeft: '1.2rem', margin: '0.5rem 0 1rem 0', lineHeight: '1.45' }}>
                            <li>Movimientos y arqueos de caja auditados.</li>
                            <li>Detalle Ventas (CMV) con prorrateo exacto de descuentos.</li>
                            <li>Rentabilidad neta por producto y compras/mermas.</li>
                            <li>Kardex cronológico de productos directos e insumos.</li>
                            <li>Historial de anulaciones y resumen contable.</li>
                        </ul>
                    </div>
                    <a
                        href={`/api/reportes?formato=xlsx${filtroExportDesde ? `&desde=${filtroExportDesde}` : ''}${filtroExportHasta ? `&hasta=${filtroExportHasta}` : ''}${filtroExportUsuarioId ? `&usuarioId=${filtroExportUsuarioId}` : ''}${filtroExportCajaFisicaId ? `&cajaFisicaId=${filtroExportCajaFisicaId}` : ''}`}
                        style={{ ...btnPrimario, background: '#16a34a', textAlign: 'center', fontSize: '0.92rem', padding: '0.75rem 1rem', display: 'block', borderRadius: '6px' }}
                    >
                        📊 Descargar Excel Contable (.xlsx)
                    </a>
                </section>

                {/* Formato 2: PDF de Auditoría de Turno */}
                <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '4px solid #dc2626' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1.15rem' }}>
                                📄 PDF de Auditoría de Turno
                            </h3>
                            <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                Turno #{datos?.cajaAuditada?.id || '—'}
                            </span>
                        </div>
                        <p style={{ color: '#475569', fontSize: '0.86rem', lineHeight: '1.4' }}>
                            Reporte imprimible de cierre y auditoría de turno con liquidación tributaria:
                        </p>
                        <ul style={{ color: '#64748b', fontSize: '0.8rem', paddingLeft: '1.2rem', margin: '0.5rem 0 0.75rem 0', lineHeight: '1.45' }}>
                            <li>Resumen ejecutivo y liquidación fiscal (IVA / IT).</li>
                            <li>Conciliación separada de efectivo vs. QR y arqueo ciego.</li>
                            <li>Ventas netas de descuentos y rentabilidad por producto.</li>
                            <li>Bitácora de movimientos y ventas anuladas.</li>
                        </ul>
                        <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                Turno Seleccionado para Auditoría:
                            </label>
                            <select
                                value={datos?.cajaAuditada?.id || ''}
                                onChange={async (e) => {
                                    const nuevoId = e.target.value;
                                    if (nuevoId) {
                                        setTurnoAuditadoId?.(nuevoId);
                                        await cargarTodo?.(nuevoId);
                                    }
                                }}
                                style={{ ...inputStyle, padding: '0.35rem', fontSize: '0.8rem' }}
                            >
                                {(datos?.historialCajas || []).map((c) => (
                                    <option key={c.id} value={c.id}>
                                        Turno #{c.id} — {c.cajero_nombre} ({c.caja_fisica_nombre || 'Caja Principal'}) [{c.estado}]
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            exportarReportePDF({
                                nombreNegocio: configActual.nombre_negocio,
                                configuracionNegocio: configActual,
                                usuarioGenerador: adminAutenticado?.nombre,
                                cajaAuditada: datos?.cajaAuditada,
                                estadisticas: est,
                                movimientos: datos?.movimientos,
                                desglosePagos: datos?.desglosePagos
                            })
                        }
                        style={{ ...btnPrimario, background: '#dc2626', textAlign: 'center', fontSize: '0.92rem', padding: '0.75rem 1rem', width: '100%', cursor: 'pointer', borderRadius: '6px' }}
                    >
                        📄 Descargar PDF (Turno #{datos?.cajaAuditada?.id || '—'})
                    </button>
                </section>

                {/* Formato 3: CSV Contable */}
                <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '4px solid #0284c7' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, color: '#0369a1', fontSize: '1.15rem' }}>
                                📥 CSV Contable
                            </h3>
                            <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                Texto Plano UTF-8
                            </span>
                        </div>
                        <p style={{ color: '#475569', fontSize: '0.86rem', lineHeight: '1.4' }}>
                            Exportación de movimientos en formato plano delimitado por comas:
                        </p>
                        <ul style={{ color: '#64748b', fontSize: '0.8rem', paddingLeft: '1.2rem', margin: '0.5rem 0 1rem 0', lineHeight: '1.45' }}>
                            <li>Compatible con cualquier hoja de cálculo o sistema contable.</li>
                            <li>Ideal para importar a bases de datos o pipelines externos.</li>
                            <li>Incluye desglose por tipo, monto, método de pago y cajero.</li>
                            <li>Aplica los filtros de fecha, operador y estación física.</li>
                        </ul>
                    </div>
                    <a
                        href={`/api/reportes?formato=csv${filtroExportDesde ? `&desde=${filtroExportDesde}` : ''}${filtroExportHasta ? `&hasta=${filtroExportHasta}` : ''}${filtroExportUsuarioId ? `&usuarioId=${filtroExportUsuarioId}` : ''}${filtroExportCajaFisicaId ? `&cajaFisicaId=${filtroExportCajaFisicaId}` : ''}`}
                        style={{ ...btnPrimario, textAlign: 'center', fontSize: '0.92rem', padding: '0.75rem 1rem', display: 'block', borderRadius: '6px' }}
                    >
                        📥 Descargar CSV Contable
                    </a>
                </section>
            </div>
        </div>
    );
}
