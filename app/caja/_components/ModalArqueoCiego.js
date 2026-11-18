'use client';

import { useState } from 'react';
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
        <form onSubmit={handleCerrarCaja} className="space-y-4 text-slate-800">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
                Cuenta todos los billetes y monedas físicas del cajón e ingresa el monto total exacto.
                Una vez cerrada la caja, solo el Administrador podrá volver a abrirla y revisar el cuadre.
            </div>

            <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                <span>Efectivo Físico Real Contado en Cajón (Bs):</span>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Ingresa el monto físico contado..."
                    value={efectivoReal}
                    onChange={(e) => setEfectivoReal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border-2 border-slate-300 bg-white text-base font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
            </label>

            <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                <span>Total QR Conciliado en Extracto Bancario (Bs, Opcional):</span>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Opcional: monto QR verificado en cuenta..."
                    value={qrRealCierre}
                    onChange={(e) => setQrRealCierre(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                />
            </label>

            <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                <span>Observaciones de Cierre (Opcional):</span>
                <input
                    type="text"
                    placeholder="Ej. Billete deteriorado, corte de luz, nota al administrador..."
                    value={observacionesCierre}
                    onChange={(e) => setObservacionesCierre(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                />
            </label>

            <div className="flex gap-2.5 pt-2 border-t border-slate-200 justify-end items-center">
                {isModal && onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                    >
                        Cancelar
                    </button>
                )}
                <button
                    type="submit"
                    disabled={guardando}
                    className="px-5 py-2 text-sm font-bold rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {guardando ? 'Cerrando caja...' : 'Declarar Efectivo y Cerrar Caja'}
                </button>
            </div>
        </form>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-[520px] w-full max-h-[92vh] flex flex-col overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                                <span>🔒</span>
                                <span>Cerrar Turno #{cajaAbierta?.id} (Arqueo Ciego)</span>
                            </h3>
                            <div className="text-xs text-slate-500 mt-0.5">
                                Estación: {cajaAbierta?.caja_fisica_nombre || 'Principal'}
                            </div>
                        </div>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md p-1.5 transition-colors cursor-pointer text-lg leading-none"
                                aria-label="Cerrar modal"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <div className="p-5 overflow-y-auto">
                        {contenidoFormulario}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 max-w-[540px]">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-1.5">
                <span>🔒</span>
                <span>Cerrar Turno (Arqueo Ciego)</span>
            </h2>
            {contenidoFormulario}
        </section>
    );
}