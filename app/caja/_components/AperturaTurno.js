'use client';

import { useState } from 'react';
import { cardStyle, inputStyle, btnPrimario } from './cajaStyles';
import { abrirTurnoAction } from '../../../server/actions/turnos.actions';

export default function AperturaTurno({
    usuarioActual,
    cajasFisicas = [],
    onTurnoAbierto,
    onError,
    onLimpiarAlertas
}) {
    const [montoInicial, setMontoInicial] = useState('100');
    const [cajaFisicaSeleccionada, setCajaFisicaSeleccionada] = useState('');
    const [abriendo, setAbriendo] = useState(false);

    const puedeAbrirCaja = Boolean(usuarioActual);

    async function handleAbrirCaja(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        const montoNum = Number(montoInicial);
        if (isNaN(montoNum) || montoNum < 0) {
            onError?.('Ingresa un monto inicial en efectivo válido mayor o igual a 0.');
            return;
        }

        try {
            setAbriendo(true);
            const res = await abrirTurnoAction({
                montoInicial: montoNum,
                cajaFisicaId: cajaFisicaSeleccionada ? Number(cajaFisicaSeleccionada) : null
            });

            if (!res.ok) throw new Error(res.error || 'Error al abrir turno de caja.');

            setCajaFisicaSeleccionada('');
            onTurnoAbierto?.(
                res.data?.cajaId,
                `Turno #${res.data?.cajaId} abierto exitosamente por ${usuarioActual?.nombre || 'Cajero'}.`
            );
        } catch (err) {
            onError?.(err.message);
        } finally {
            setAbriendo(false);
        }
    }

    return (
        <section style={{ ...cardStyle, maxWidth: '520px', margin: '2rem auto' }}>
            <h2 style={{ marginTop: 0 }}>Estado: Sin Turno Abierto</h2>
            {!puedeAbrirCaja ? (
                <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', padding: '1rem', borderRadius: '8px' }}>
                    <strong>🔒 Reapertura Restringida al Administrador</strong>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.92rem' }}>
                        El turno de caja ya fue cerrado. Un cajero (<code>user</code>) no puede volver a abrir la caja después de cerrada.
                        Solicita al <strong>Administrador</strong> que la habilite.
                    </p>
                </div>
            ) : (
                <form onSubmit={handleAbrirCaja} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ margin: 0, color: '#555', fontSize: '0.9rem' }}>
                        Abriendo turno con: <strong>{usuarioActual?.nombre} ({usuarioActual?.rol})</strong>.
                    </p>
                    {cajasFisicas.filter((cf) => Number(cf.activa) === 1).length > 1 ? (
                        <label>
                            Estación de Caja Física:
                            <select
                                value={cajaFisicaSeleccionada}
                                onChange={(e) => setCajaFisicaSeleccionada(e.target.value)}
                                style={inputStyle}
                            >
                                <option value="">-- Seleccionar Estación --</option>
                                {cajasFisicas.filter((cf) => Number(cf.activa) === 1).map((cf) => (
                                    <option key={cf.id} value={cf.id} disabled={!!cf.turno_abierto_id}>
                                        {cf.nombre} {cf.turno_abierto_id ? `(Ocupada: Turno #${cf.turno_abierto_id})` : '(Disponible)'}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : (
                        <div style={{ fontSize: '0.88rem', color: '#0369a1', background: '#e0f2fe', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
                            Estación asignada: <strong>{cajasFisicas[0]?.nombre || 'Caja 1 - Principal'}</strong>
                        </div>
                    )}
                    <label>
                        Fondo Inicial en Efectivo (Bs):
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={montoInicial}
                            onChange={(e) => setMontoInicial(e.target.value)}
                            required
                            style={inputStyle}
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={abriendo}
                        style={{
                            ...btnPrimario,
                            opacity: abriendo ? 0.6 : 1,
                            cursor: abriendo ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {abriendo ? 'Abriendo turno...' : 'Abrir Turno de Caja'}
                    </button>
                </form>
            )}
        </section>
    );
}
