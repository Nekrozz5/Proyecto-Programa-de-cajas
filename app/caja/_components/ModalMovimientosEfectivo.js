'use client';

import { useState, useEffect } from 'react';
import {
    registrarEgresoAction,
    registrarIngresoEfectivoAction
} from '../../../server/actions/ventas.actions';

export default function ModalMovimientosEfectivo({
    isOpen = true,
    isModal = true,
    tipoInicial = 'ingreso',
    onClose,
    cajaAbierta,
    usuarioActual,
    configuracionNegocio,
    onMovimientoExitoso,
    onError,
    onLimpiarAlertas
}) {
    const [pestaña, setPestaña] = useState(tipoInicial); // 'ingreso' | 'egreso'
    const [guardando, setGuardando] = useState(false);

    // Campos de Ingreso de Efectivo
    const [montoIngresoEfectivo, setMontoIngresoEfectivo] = useState('');
    const [motivoIngresoEfectivo, setMotivoIngresoEfectivo] = useState('');

    // Campos de Egreso
    const [montoEgreso, setMontoEgreso] = useState('');
    const [motivoEgreso, setMotivoEgreso] = useState('');
    const [metodoEgreso, setMetodoEgreso] = useState('efectivo');
    const [categoriaEgreso, setCategoriaEgreso] = useState('gasto_operativo');
    const [tipoComprobanteEgreso, setTipoComprobanteEgreso] = useState('recibo');
    const [nroFacturaEgreso, setNroFacturaEgreso] = useState('');
    const [nitProveedorEgreso, setNitProveedorEgreso] = useState('');
    const [nombreProveedorEgreso, setNombreProveedorEgreso] = useState('');

    useEffect(() => {
        if (tipoInicial) setPestaña(tipoInicial);
    }, [tipoInicial, isOpen]);

    if (!isOpen) return null;

    async function handleRegistrarIngreso(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        if (!cajaAbierta) {
            onError?.('No hay turno abierto para registrar ingreso de efectivo.');
            return;
        }

        const montoNum = Number(montoIngresoEfectivo);
        if (isNaN(montoNum) || montoNum <= 0) {
            onError?.('Ingresa un monto numérico mayor a 0 para el ingreso de efectivo.');
            return;
        }

        if (!motivoIngresoEfectivo.trim()) {
            onError?.('Debes ingresar un motivo o justificación para el aporte de sencillo.');
            return;
        }

        try {
            setGuardando(true);
            const res = await registrarIngresoEfectivoAction({
                cajaId: cajaAbierta.id,
                monto: montoNum,
                motivo: `${motivoIngresoEfectivo.trim()} (Entregado/Registrado por: ${usuarioActual?.nombre || 'Cajero'})`
            });

            if (!res.ok) throw new Error(res.error || 'Error al registrar ingreso de efectivo.');

            setMontoIngresoEfectivo('');
            setMotivoIngresoEfectivo('');
            onMovimientoExitoso?.(`Reposición de efectivo #${res.data?.movimientoId} ingresada exitosamente a la caja.`);
            onClose?.();
        } catch (err) {
            onError?.(err.message);
        } finally {
            setGuardando(false);
        }
    }

    async function handleRegistrarEgreso(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        if (!cajaAbierta) {
            onError?.('No hay turno abierto para registrar egreso.');
            return;
        }

        const montoNum = Number(montoEgreso);
        if (isNaN(montoNum) || montoNum <= 0) {
            onError?.('Ingresa un monto numérico mayor a 0 para el egreso.');
            return;
        }

        if (!motivoEgreso.trim()) {
            onError?.('Debes ingresar un motivo obligatorio para el egreso.');
            return;
        }

        try {
            setGuardando(true);
            const res = await registrarEgresoAction({
                cajaId: cajaAbierta.id,
                monto: montoNum,
                descripcion: `${motivoEgreso.trim()} (Por: ${usuarioActual?.nombre || 'Cajero'})`,
                metodoPago: usuarioActual?.rol === 'user' ? 'efectivo' : metodoEgreso,
                categoriaContable: categoriaEgreso,
                tipoComprobante: tipoComprobanteEgreso,
                conFactura: tipoComprobanteEgreso === 'factura',
                nroFactura: tipoComprobanteEgreso === 'factura' && nroFacturaEgreso.trim() !== '' ? nroFacturaEgreso.trim() : null,
                proveedorNit: tipoComprobanteEgreso === 'factura' && nitProveedorEgreso.trim() !== '' ? nitProveedorEgreso.trim() : null,
                proveedorNombre: nombreProveedorEgreso.trim() !== '' ? nombreProveedorEgreso.trim() : null
            });

            if (!res.ok) throw new Error(res.error || 'Error al registrar el egreso.');

            setMontoEgreso('');
            setMotivoEgreso('');
            setNroFacturaEgreso('');
            setNitProveedorEgreso('');
            setNombreProveedorEgreso('');
            setTipoComprobanteEgreso('recibo');

            onMovimientoExitoso?.(`Egreso #${res.data?.movimientoId} registrado por ${usuarioActual?.nombre || 'Cajero'}.`);
            onClose?.();
        } catch (err) {
            onError?.(err.message);
        } finally {
            setGuardando(false);
        }
    }

    const contenidoFormulario = (
        <div className="space-y-4">
            {/* Pestañas para alternar entre Ingreso y Egreso */}
            <div className="flex gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                    type="button"
                    onClick={() => { if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas(); setPestaña('ingreso'); }}
                    className={`flex-1 py-2 px-3 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        pestaña === 'ingreso'
                            ? 'bg-white shadow-xs text-sky-700 border border-slate-200/80'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <span>📥</span>
                    <span>Ingreso de Sencillo</span>
                </button>
                <button
                    type="button"
                    onClick={() => { if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas(); setPestaña('egreso'); }}
                    className={`flex-1 py-2 px-3 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        pestaña === 'egreso'
                            ? 'bg-white shadow-xs text-sky-700 border border-slate-200/80'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <span>💸</span>
                    <span>Salida / Egreso</span>
                </button>
            </div>

            {pestaña === 'ingreso' ? (
                <div className="space-y-4">
                    <p className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-950 leading-relaxed m-0">
                        Usa esta opción cuando el dueño o administrador entregue billetes o monedas adicionales a la caja para tener cambio disponible.
                        Este monto <strong>se suma al dinero esperado en el cajón</strong>, pero <strong>no cuenta como venta de productos</strong>.
                    </p>
                    <form onSubmit={handleRegistrarIngreso} className="space-y-3.5 text-slate-800">
                        <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                            <span>Monto en Efectivo que Entra al Cajón (Bs):</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0.1"
                                required
                                placeholder="Ej. 200.00"
                                value={montoIngresoEfectivo}
                                onChange={(e) => setMontoIngresoEfectivo(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border-2 border-emerald-400 bg-white text-base font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-300"
                            />
                        </label>
                        <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                            <span>Motivo Obligatorio (Justificación):</span>
                            <input
                                type="text"
                                required
                                placeholder="Ej. Aporte del director para sencillo, cambio de billetes grandes..."
                                value={motivoIngresoEfectivo}
                                onChange={(e) => setMotivoIngresoEfectivo(e.target.value)}
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
                                className="px-5 py-2 text-sm font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {guardando ? 'Guardando...' : 'Confirmar Entrada de Efectivo'}
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 leading-relaxed m-0">
                        Registra aquí cualquier salida de efectivo autorizada para gastos operativos del día (deja siempre el recibo o comprobante físico dentro del cajón).
                    </p>
                    <form onSubmit={handleRegistrarEgreso} className="space-y-3.5 text-slate-800">
                        <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                            <span>Monto que sale de Caja (Bs):</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0.1"
                                required
                                placeholder="0.00"
                                value={montoEgreso}
                                onChange={(e) => setMontoEgreso(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border-2 border-slate-400 bg-white text-base font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                            />
                        </label>

                        {usuarioActual?.rol === 'user' ? (
                            <div className="text-xs text-slate-700 bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg">
                                Modalidad: <strong>Efectivo Físico del Cajón</strong>
                            </div>
                        ) : (
                            <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                                <span>Método de Salida:</span>
                                <select
                                    value={metodoEgreso}
                                    onChange={(e) => setMetodoEgreso(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                >
                                    <option value="efectivo">Efectivo del Cajón</option>
                                    <option value="qr">Transferencia / QR (Solo Admin)</option>
                                </select>
                            </label>
                        )}

                        <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                            <span>Categoría Contable de la Salida:</span>
                            <select
                                value={categoriaEgreso}
                                onChange={(e) => setCategoriaEgreso(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                            >
                                <option value="gasto_operativo">🧹 Gasto Operativo Menor (Hielo, limpieza, transporte...)</option>
                                <option value="compra_insumo">🧱 Compra Urgente de Insumo / Mercadería</option>
                                <option value="pago_proveedor">🚚 Pago a Proveedor / Distribuidora</option>
                                <option value="retiro_dueno">👤 Retiro Personal del Dueño / Socio</option>
                                <option value="otro">📋 Otro Egreso Autorizado</option>
                            </select>
                        </label>

                        {(Number(configuracionNegocio?.usa_respaldo_compras_egresos ?? 1) === 1 &&
                            Number(usuarioActual?.puede_registrar_respaldo_fiscal ?? 1) === 1 &&
                            Number(cajaAbierta?.habilita_respaldo_fiscal ?? 1) === 1) && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                                <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                                    <span>🧾 Tipo de Respaldo Contable:</span>
                                    <select
                                        value={tipoComprobanteEgreso}
                                        onChange={(e) => setTipoComprobanteEgreso(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                    >
                                        <option value="recibo">Recibo / Nota de Venta Interna</option>
                                        <option value="factura">Factura Fiscal (Crédito Fiscal IVA)</option>
                                        <option value="sin_respaldo">Sin Comprobante Físico</option>
                                    </select>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Nombre del Proveedor / Comercio (Opcional)"
                                    value={nombreProveedorEgreso}
                                    onChange={(e) => setNombreProveedorEgreso(e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                />
                                {tipoComprobanteEgreso === 'factura' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        <input
                                            type="text"
                                            required
                                            placeholder="NIT del Proveedor"
                                            value={nitProveedorEgreso}
                                            onChange={(e) => setNitProveedorEgreso(e.target.value)}
                                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                        />
                                        <input
                                            type="text"
                                            required
                                            placeholder="N° de Factura"
                                            value={nroFacturaEgreso}
                                            onChange={(e) => setNroFacturaEgreso(e.target.value)}
                                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                            <span>Motivo Obligatorio:</span>
                            <input
                                type="text"
                                required
                                placeholder="Ej. Compra de hielo, botellón de agua, bolsas..."
                                value={motivoEgreso}
                                onChange={(e) => setMotivoEgreso(e.target.value)}
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
                                className="px-5 py-2 text-sm font-bold rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-black text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {guardando ? 'Guardando...' : 'Confirmar Salida de Efectivo'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-[540px] w-full max-h-[92vh] flex flex-col overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{pestaña === 'ingreso' ? '📥' : '💸'}</span>
                                <span>{pestaña === 'ingreso' ? 'Ingresar Efectivo / Sencillo' : 'Registrar Egreso de Caja'}</span>
                            </h3>
                            <div className="text-xs text-slate-500 mt-0.5">
                                Turno #{cajaAbierta?.id} • {cajaAbierta?.caja_fisica_nombre || 'Principal'}
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
                <span>{pestaña === 'ingreso' ? '📥' : '💸'}</span>
                <span>{pestaña === 'ingreso' ? 'Ingresar Efectivo / Sencillo' : 'Registrar Egreso de Caja'}</span>
            </h2>
            {contenidoFormulario}
        </section>
    );
}