'use client';

import { useState } from 'react';
import GraficosFinancieros from '../GraficosFinancieros';
import { cardStyle, kpiCard, thTd } from './adminStyles';
import { anularVentaAction } from '../../../server/actions/ventas.actions';

export default function TabResumen({
    datos,
    tendencias,
    cargarTodo,
    setMensaje,
    setError,
    limpiarAlertas
}) {
    const [movimientoAAnularId, setMovimientoAAnularId] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('');
    const [anulando, setAnulando] = useState(false);

    const est = datos?.estadisticas;
    const cajaAuditada = datos?.cajaAuditada;
    const movimientos = datos?.movimientos || [];

    async function confirmarAnularMovimiento(movimientoId) {
        if (!motivoAnulacion || motivoAnulacion.trim().length < 3) {
            setError?.('Debes ingresar un motivo descriptivo y justificado para realizar la anulación.');
            return;
        }

        limpiarAlertas?.();
        try {
            setAnulando(true);
            const res = await anularVentaAction({
                movimientoId,
                motivo: motivoAnulacion.trim()
            });

            if (!res.ok) {
                throw new Error(res.error || 'Error al anular movimiento.');
            }

            setMensaje?.(`Movimiento #${movimientoId} anulado y stock reintegrado exitosamente.`);
            setMovimientoAAnularId(null);
            setMotivoAnulacion('');
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message || 'Error al procesar la anulación.');
        } finally {
            setAnulando(false);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* KPI CARDS FINANCIEROS */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
                <div style={kpiCard}>
                    <small>Ventas (Turno #{cajaAuditada?.id || '—'})</small>
                    <strong>Bs {(est?.ventasTotales || 0).toFixed(2)}</strong>
                    <span>Ticket Promedio: Bs {(est?.ticketPromedio || 0).toFixed(2)}</span>
                </div>
                <div style={kpiCard}>
                    <small>Costo de Ventas (CPP / Directo)</small>
                    <strong>Bs {(est?.costoTotalVentas || 0).toFixed(2)}</strong>
                    <span>Congelado por ticket vendido</span>
                </div>
                <div style={kpiCard}>
                    <small>Ganancia Bruta</small>
                    <strong style={{ color: '#166534' }}>Bs {(est?.gananciaBruta || 0).toFixed(2)}</strong>
                    <span>Ventas - Costo de Ventas</span>
                </div>
                <div style={kpiCard}>
                    <small>Flujo Neto Operativo</small>
                    <strong style={{ color: '#0070f3' }}>Bs {(est?.flujoNetoOperativo || 0).toFixed(2)}</strong>
                    <span>Ganancia Bruta - Egresos (Bs {(est?.totalEgresos || 0).toFixed(2)})</span>
                </div>
            </section>

            {/* GRÁFICOS FINANCIEROS Y TENDENCIAS */}
            <GraficosFinancieros
                estadisticas={est}
                tendencias={tendencias}
                desglosePagos={datos?.desglosePagos}
                cajaId={cajaAuditada?.id}
            />

            {/* TABLA DE AUDITORÍA Y ANULACIÓN DE MOVIMIENTOS */}
            <section style={cardStyle}>
                <h2 style={{ marginTop: 0 }}>
                    📊 Movimientos del Turno #{cajaAuditada?.id || '—'} ({cajaAuditada?.caja_fisica_nombre || 'Caja Principal'}) — Auditoría y Anulación
                </h2>
                {!movimientos.length ? (
                    <p style={{ color: '#666' }}>No hay movimientos registrados en esta caja.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                    <th style={thTd}>ID</th>
                                    <th style={thTd}>Fecha/Hora</th>
                                    <th style={thTd}>Operador</th>
                                    <th style={thTd}>Tipo / Pago</th>
                                    <th style={thTd}>Monto</th>
                                    <th style={thTd}>Cambio Entregado</th>
                                    <th style={thTd}>Estado</th>
                                    <th style={thTd}>Descripción</th>
                                    <th style={thTd}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {movimientos.map((m) => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: m.estado === 'anulado' ? 0.55 : 1 }}>
                                        <td style={thTd}>#{m.id}</td>
                                        <td style={thTd}>{m.fecha_hora}</td>
                                        <td style={thTd}><strong>{m.usuario_nombre || '—'}</strong></td>
                                        <td style={thTd}>{m.tipo.toUpperCase()} ({m.metodo_pago.toUpperCase()})</td>
                                        <td style={thTd}>Bs {Number(m.monto).toFixed(2)}</td>
                                        <td style={thTd}>Bs {Number(m.cambio || 0).toFixed(2)}</td>
                                        <td style={thTd}>{m.estado}</td>
                                        <td style={thTd}>{m.descripcion}</td>
                                        <td style={thTd}>
                                            {m.estado === 'completado' && (
                                                movimientoAAnularId === m.id ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '170px' }}>
                                                        <input
                                                            type="text"
                                                            placeholder="Motivo de anulación..."
                                                            value={motivoAnulacion}
                                                            onChange={(e) => setMotivoAnulacion(e.target.value)}
                                                            disabled={anulando}
                                                            style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #94a3b8', fontSize: '0.78rem' }}
                                                        />
                                                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                                                            <button
                                                                type="button"
                                                                disabled={anulando || !motivoAnulacion || motivoAnulacion.trim().length < 3}
                                                                onClick={() => confirmarAnularMovimiento(m.id)}
                                                                style={{
                                                                    padding: '0.25rem 0.5rem',
                                                                    background: (anulando || !motivoAnulacion || motivoAnulacion.trim().length < 3) ? '#94a3b8' : '#dc2626',
                                                                    color: '#fff',
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    cursor: (anulando || !motivoAnulacion || motivoAnulacion.trim().length < 3) ? 'not-allowed' : 'pointer',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 'bold'
                                                                }}
                                                            >
                                                                {anulando ? 'Anulando...' : 'Confirmar'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={anulando}
                                                                onClick={() => { setMovimientoAAnularId(null); setMotivoAnulacion(''); }}
                                                                style={{ padding: '0.25rem 0.5rem', background: '#64748b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setMovimientoAAnularId(m.id);
                                                            setMotivoAnulacion('');
                                                        }}
                                                        style={{ padding: '0.3rem 0.65rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'bold' }}
                                                    >
                                                        Anular
                                                    </button>
                                                )
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
