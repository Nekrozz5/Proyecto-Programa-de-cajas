'use client';

import { useState } from 'react';
import { cerrarTurnoAction } from '../../../server/actions/turnos.actions';
import { useCaja } from '../_context/CajaContext';
import { Lock, Banknote, QrCode, Smartphone, X } from 'lucide-react';

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

    let movimientos = [];
    try {
        const cajaCtx = useCaja();
        if (cajaCtx?.movimientos) movimientos = cajaCtx.movimientos;
    } catch (_) {}

    const totalAppsDesdeCaja = Number(cajaAbierta?.ventas_apps_total ?? 0) > 0
        ? Number(cajaAbierta.ventas_apps_total)
        : (Number(cajaAbierta?.ventas_pedidos_ya || 0) + Number(cajaAbierta?.ventas_yango || 0));

    const totalAppsDesdeMovimientos = (movimientos || [])
        .filter((m) => m.tipo === 'ingreso' && m.estado !== 'anulado' && (
            m.canal_venta === 'pedidos_ya' ||
            m.metodo_pago === 'pedidos_ya' ||
            m.canal_venta === 'yango' ||
            m.metodo_pago === 'yango'
        ))
        .reduce((acc, m) => acc + Number(m.monto || 0), 0);

    const totalVentasApps = totalAppsDesdeCaja > 0 ? totalAppsDesdeCaja : totalAppsDesdeMovimientos;

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
                <span className="flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    <span>Efectivo Físico Real Contado en Cajón (Bs):</span>
                </span>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Ingresa el monto físico contado..."
                    value={efectivoReal}
                    onChange={(e) => setEfectivoReal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border-2 border-slate-300 bg-white text-base font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
                />
            </label>

            <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                <span className="flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-sky-600" />
                    <span>Total QR Conciliado en Extracto Bancario (Bs, Opcional):</span>
                </span>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Opcional: monto QR verificado en cuenta..."
                    value={qrRealCierre}
                    onChange={(e) => setQrRealCierre(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-400"
                />
            </label>

            {/* Tarjeta informativa diferenciada de ventas por plataformas externas */}
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2.5">
                <Smartphone className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div className="text-xs text-purple-900 flex-1">
                    <div className="flex justify-between items-center flex-wrap gap-1">
                        <span className="font-bold text-purple-950">Ventas por Apps (PedidosYa / Yango):</span>
                        <span className="font-extrabold text-sm text-purple-900">Bs {totalVentasApps.toFixed(2)}</span>
                    </div>
                    <div className="text-[11px] text-purple-700 mt-0.5">
                        Cobro liquidado externamente (no afecta arqueo en efectivo).
                    </div>
                </div>
            </div>

            <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                <span>Observaciones de Cierre (Opcional):</span>
                <input
                    type="text"
                    placeholder="Ej. Billete deteriorado, corte de luz, nota al administrador..."
                    value={observacionesCierre}
                    onChange={(e) => setObservacionesCierre(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-400"
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
                    className="px-5 py-2 text-sm font-bold rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    <Lock className="w-4 h-4" />
                    <span>{guardando ? 'Cerrando caja...' : 'Declarar Efectivo y Cerrar Caja'}</span>
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
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Lock className="w-5 h-5 text-slate-700" />
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
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md p-1.5 transition-colors cursor-pointer"
                                aria-label="Cerrar modal"
                            >
                                <X className="w-5 h-5" />
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
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-slate-700" />
                <span>Cerrar Turno (Arqueo Ciego)</span>
            </h2>
            {contenidoFormulario}
        </section>
    );
}
