'use client';

import { useState } from 'react';
import { cardStyle, inputStyle, btnMini, btnSecundario } from './cajaStyles';
import { anularVentaAction } from '../../../server/actions/ventas.actions';

export default function HistorialTurno({
    cajaAbierta,
    movimientos = [],
    usuarioActual,
    onActualizar,
    onMovimientoAnulado,
    onError,
    onLimpiarAlertas
}) {
    const [movimientoAAnularId, setMovimientoAAnularId] = useState(null);
    const [motivoAnulacionCaja, setMotivoAnulacionCaja] = useState('');
    const [anulando, setAnulando] = useState(false);

    async function confirmarAnularMovimiento(movimientoId) {
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        if (!motivoAnulacionCaja || motivoAnulacionCaja.trim().length < 3) {
            onError?.('Debes ingresar un motivo justificado (mínimo 3 caracteres) para anular el movimiento.');
            return;
        }

        try {
            setAnulando(true);
            const res = await anularVentaAction({
                movimientoId,
                motivo: motivoAnulacionCaja.trim()
            });

            if (!res.ok) throw new Error(res.error || 'Error al anular movimiento.');

            setMovimientoAAnularId(null);
            setMotivoAnulacionCaja('');
            onMovimientoAnulado?.(`Movimiento #${movimientoId} anulado y stock reintegrado al inventario.`);
        } catch (err) {
            onError?.(err.message);
        } finally {
            setAnulando(false);
        }
    }

    return (
        <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                    <h2 style={{ margin: 0 }}>📋 Historial de Movimientos del Turno #{cajaAbierta?.id}</h2>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.86rem', color: '#64748b' }}>
                        Estación: <strong>{cajaAbierta?.caja_fisica_nombre || `Estación #${cajaAbierta?.caja_fisica_id || 1}`}</strong> | Operaciones registradas en este turno.
                    </p>
                </div>
                <button type="button" onClick={onActualizar} style={btnSecundario}>
                    🔄 Actualizar
                </button>
            </div>

            {movimientos.length === 0 ? (
                <p style={{ color: '#64748b' }}>Aún no hay movimientos registrados en este turno.</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                                <th style={{ padding: '0.6rem' }}>ID</th>
                                <th style={{ padding: '0.6rem' }}>Hora</th>
                                <th style={{ padding: '0.6rem' }}>Tipo</th>
                                <th style={{ padding: '0.6rem' }}>Método</th>
                                <th style={{ padding: '0.6rem' }}>Comprobante</th>
                                <th style={{ padding: '0.6rem' }}>Detalle / Motivo</th>
                                <th style={{ padding: '0.6rem', textAlign: 'right' }}>Descuento</th>
                                <th style={{ padding: '0.6rem', textAlign: 'right' }}>Monto Neto</th>
                                <th style={{ padding: '0.6rem' }}>Operador</th>
                                <th style={{ padding: '0.6rem' }}>Estado</th>
                                {usuarioActual?.rol !== 'user' && <th style={{ padding: '0.6rem' }}>Acción Admin</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {movimientos.map((m) => {
                                const esAnulado = m.estado === 'anulado';
                                return (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #e2e8f0', opacity: esAnulado ? 0.55 : 1, background: esAnulado ? '#fef2f2' : '#fff' }}>
                                        <td style={{ padding: '0.6rem', fontWeight: 'bold' }}>#{m.id}</td>
                                        <td style={{ padding: '0.6rem', whiteSpace: 'nowrap' }}>{m.fecha_hora_local || m.fecha_hora}</td>
                                        <td style={{ padding: '0.6rem', textTransform: 'uppercase', fontWeight: 600, color: m.tipo === 'venta' ? '#15803d' : m.tipo === 'egreso' ? '#b91c1c' : '#0369a1' }}>
                                            {m.tipo}
                                        </td>
                                        <td style={{ padding: '0.6rem', textTransform: 'uppercase' }}>
                                            {m.metodo_pago}
                                            {m.metodo_pago === 'mixto' && (
                                                <div style={{ fontSize: '0.74rem', color: '#475569' }}>
                                                    Ef: Bs {Number(m.monto_efectivo || 0).toFixed(2)} | QR: Bs {Number(m.monto_qr || 0).toFixed(2)}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.6rem', fontSize: '0.8rem' }}>
                                            {m.tipo_comprobante === 'factura' ? (
                                                <span style={{ color: '#1d4ed8', fontWeight: 600 }}>
                                                    🧾 Fact. #{m.nro_factura || '-'} ({m.cliente_nit || m.proveedor_nit || 'S/N'})
                                                </span>
                                            ) : (
                                                <span style={{ color: '#64748b' }}>{m.tipo_comprobante || 'recibo'}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.6rem' }}>
                                            <div>{m.motivo}</div>
                                            {esAnulado && m.motivo_anulacion && (
                                                <div style={{ fontSize: '0.76rem', color: '#b91c1c', marginTop: '0.15rem' }}>
                                                    <strong>Anulado:</strong> {m.motivo_anulacion}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.6rem', textAlign: 'right', color: Number(m.descuento_total || 0) > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {Number(m.descuento_total || 0) > 0 ? `-Bs ${Number(m.descuento_total).toFixed(2)}` : '-'}
                                        </td>
                                        <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 'bold', textDecoration: esAnulado ? 'line-through' : 'none' }}>
                                            Bs {Number(m.monto || 0).toFixed(2)}
                                        </td>
                                        <td style={{ padding: '0.6rem' }}>{m.usuario_nombre || m.operador || '-'}</td>
                                        <td style={{ padding: '0.6rem' }}>
                                            <span style={{
                                                padding: '0.15rem 0.5rem',
                                                borderRadius: '999px',
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold',
                                                background: esAnulado ? '#fee2e2' : '#dcfce7',
                                                color: esAnulado ? '#991b1b' : '#166534'
                                            }}>
                                                {m.estado.toUpperCase()}
                                            </span>
                                        </td>
                                        {usuarioActual?.rol !== 'user' && (
                                            <td style={{ padding: '0.6rem' }}>
                                                {!esAnulado && (
                                                    movimientoAAnularId === m.id ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '190px' }}>
                                                            <input
                                                                type="text"
                                                                placeholder="Motivo de anulación..."
                                                                value={motivoAnulacionCaja}
                                                                onChange={(e) => setMotivoAnulacionCaja(e.target.value)}
                                                                style={{ ...inputStyle, marginTop: 0, padding: '0.3rem 0.45rem', fontSize: '0.8rem' }}
                                                            />
                                                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                                                                <button
                                                                    type="button"
                                                                    disabled={anulando}
                                                                    onClick={() => confirmarAnularMovimiento(m.id)}
                                                                    style={{ ...btnMini, background: '#dc2626', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                                                                >
                                                                    {anulando ? '...' : 'Confirmar'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setMovimientoAAnularId(null); setMotivoAnulacionCaja(''); }}
                                                                    style={{ ...btnMini, cursor: 'pointer' }}
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setMovimientoAAnularId(m.id); setMotivoAnulacionCaja(''); }}
                                                            style={{ ...btnMini, color: '#b91c1c', borderColor: '#fca5a5', background: '#fef2f2', cursor: 'pointer', fontWeight: 600 }}
                                                        >
                                                            🚫 Anular
                                                        </button>
                                                    )
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
