'use client';

import { useState } from 'react';
import {
    modalOverlay,
    modalCard,
    cardStyle,
    inputStyle,
    btnPrimario,
    btnSecundario
} from './cajaStyles';
import { cerrarTurnoAction } from '../../../server/actions/turnos.actions';

export default function ModalArqueoCiego({
    isOpen = true,
    isModal = true,
    onClose,
    cajaAbierta,
    usuarioActual,
    onCierreExitoso,
    onError,
    onLimpiarAlertas
}) {
    const [efectivoReal, setEfectivoReal] = useState('');
    const [qrRealCierre, setQrRealCierre] = useState('');
    const [observacionesCierre, setObservacionesCierre] = useState('');
    const [guardando, setGuardando] = useState(false);

    if (!isOpen) return null;

    async function handleCerrarCaja(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        if (!cajaAbierta) {
            onError?.('No hay ningún turno abierto para cerrar.');
            return;
        }

        const montoDeclarado = Number(efectivoReal);
        if (isNaN(montoDeclarado) || montoDeclarado < 0) {
            onError?.('Ingresa un monto de efectivo físico válido mayor o igual a 0.');
            return;
        }

        const qrDeclarado = qrRealCierre !== '' ? Number(qrRealCierre) : null;
        if (qrDeclarado !== null && (isNaN(qrDeclarado) || qrDeclarado < 0)) {
            onError?.('El monto QR verificado debe ser un número válido mayor o igual a 0.');
            return;
        }

        try {
            setGuardando(true);
            const res = await cerrarTurnoAction({
                cajaId: cajaAbierta.id,
                efectivoReal: montoDeclarado,
                qrReal: qrDeclarado,
                observacionesCierre: observacionesCierre.trim()
            });

            if (!res.ok) throw new Error(res.error || 'Error al cerrar el turno de caja.');

            setEfectivoReal('');
            setQrRealCierre('');
            setObservacionesCierre('');

            onCierreExitoso?.({
                cajaId: res.data?.arqueo?.cajaId || cajaAbierta.id,
                efectivoDeclarado: montoDeclarado,
                cerradoPor: usuarioActual?.nombre || 'Operador'
            });

            onClose?.();
        } catch (err) {
            onError?.(err.message);
        } finally {
            setGuardando(false);
        }
    }

    const contenidoFormulario = (
        <form onSubmit={handleCerrarCaja} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p style={{ fontSize: '0.92rem', color: '#555', margin: '0 0 0.5rem' }}>
                Cuenta todos los billetes y monedas físicas del cajón e ingresa el monto total exacto.
                Una vez cerrada la caja, solo el Administrador podrá volver a abrirla y revisar el cuadre.
            </p>
            <label>
                Efectivo Físico Real Contado en Cajón (Bs):
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Ingresa el monto físico contado..."
                    value={efectivoReal}
                    onChange={(e) => setEfectivoReal(e.target.value)}
                    style={inputStyle}
                />
            </label>
            <label>
                Total QR Conciliado en Extracto Bancario (Bs, Opcional):
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Opcional: monto QR verificado en cuenta..."
                    value={qrRealCierre}
                    onChange={(e) => setQrRealCierre(e.target.value)}
                    style={inputStyle}
                />
            </label>
            <label>
                Observaciones de Cierre (Opcional):
                <input
                    type="text"
                    placeholder="Ej. Billete deteriorado, corte de luz, nota al administrador..."
                    value={observacionesCierre}
                    onChange={(e) => setObservacionesCierre(e.target.value)}
                    style={inputStyle}
                />
            </label>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                {isModal && onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ ...btnSecundario, padding: '0.65rem 1rem' }}
                    >
                        Cancelar
                    </button>
                )}
                <button
                    type="submit"
                    disabled={guardando}
                    style={{
                        ...btnPrimario,
                        background: '#dc2626',
                        padding: '0.65rem 1.2rem',
                        opacity: guardando ? 0.6 : 1,
                        cursor: guardando ? 'not-allowed' : 'pointer'
                    }}
                >
                    {guardando ? 'Cerrando caja...' : 'Declarar Efectivo y Cerrar Caja'}
                </button>
            </div>
        </form>
    );

    if (isModal) {
        return (
            <div style={modalOverlay}>
                <div style={{ ...modalCard, maxWidth: '520px' }}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>
                                🔒 Cerrar Turno #{cajaAbierta?.id} (Arqueo Ciego)
                            </h3>
                            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.2rem' }}>
                                Estación: {cajaAbierta?.caja_fisica_nombre || 'Principal'}
                            </div>
                        </div>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '1.2rem',
                                    cursor: 'pointer',
                                    color: '#64748b',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '4px'
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <div style={{ padding: '1.25rem' }}>
                        {contenidoFormulario}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <section style={{ ...cardStyle, maxWidth: '540px' }}>
            <h2 style={{ marginTop: 0 }}>🔒 Cerrar Turno (Arqueo Ciego)</h2>
            {contenidoFormulario}
        </section>
    );
}
