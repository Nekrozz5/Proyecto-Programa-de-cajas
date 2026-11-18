'use client';

import { useState, useEffect } from 'react';
import { registrarVentaAction } from '../../../server/actions/ventas.actions';

export default function ModalCobro({
    isOpen,
    onClose,
    cajaAbierta,
    usuarioActual,
    configuracionNegocio,
    carrito = [],
    subtotalBrutoCarrito = 0,
    descuentoVenta = '',
    setDescuentoVenta,
    descuentoAplicadoNum = 0,
    descuentoInvalido = false,
    totalCarrito = 0,
    onVentaExitosa,
    onError,
    onLimpiarAlertas
}) {
    const [metodoPago, setMetodoPago] = useState('efectivo');
    const [montoMixtoEfectivo, setMontoMixtoEfectivo] = useState('');
    const [montoMixtoQr, setMontoMixtoQr] = useState('');
    const [referenciaQr, setReferenciaQr] = useState('');
    const [montoRecibido, setMontoRecibido] = useState('');
    const [cambioManual, setCambioManual] = useState('');
    const [descripcionVenta, setDescripcionVenta] = useState('Venta en mostrador');
    const [conFacturaVenta, setConFacturaVenta] = useState(false);
    const [nroFacturaVenta, setNroFacturaVenta] = useState('');
    const [nitClienteVenta, setNitClienteVenta] = useState('');
    const [razonSocialVenta, setRazonSocialVenta] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [errorLocal, setErrorLocal] = useState(null);
    const [sesionExpirada, setSesionExpirada] = useState(false);
    const [pinReconexion, setPinReconexion] = useState('');
    const [reautenticando, setReautenticando] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setErrorLocal(null);
            setSesionExpirada(false);
            setPinReconexion('');
        }
    }, [isOpen]);

    // Cálculos para Efectivo, QR y Pagos Mixtos
    const montoEfectivoRequerido = metodoPago === 'mixto'
        ? (montoMixtoEfectivo !== '' ? Number(montoMixtoEfectivo) : 0)
        : totalCarrito;
    const montoQrRequerido = metodoPago === 'mixto'
        ? (montoMixtoQr !== '' ? Number(montoMixtoQr) : 0)
        : totalCarrito;

    const mixtoDescuadrado = metodoPago === 'mixto' && (
        montoEfectivoRequerido <= 0 ||
        montoQrRequerido <= 0 ||
        Math.abs((montoEfectivoRequerido + montoQrRequerido) - totalCarrito) > 0.01
    );

    const montoRecibidoNum = montoRecibido !== '' ? Number(montoRecibido) : 0;
    const faltaDineroRecibido = (metodoPago === 'efectivo' || metodoPago === 'mixto')
        && montoRecibido !== ''
        && montoRecibidoNum < montoEfectivoRequerido;
    const cambioCalculadoAuto =
        (metodoPago === 'efectivo' || metodoPago === 'mixto') && montoRecibido !== '' && montoRecibidoNum >= montoEfectivoRequerido
            ? Number((montoRecibidoNum - montoEfectivoRequerido).toFixed(2))
            : 0;
    const cambioQueSaleDeCaja =
        cambioManual !== '' ? Number(cambioManual) : cambioCalculadoAuto;

    // Recalcular cambio automáticamente en tiempo real
    useEffect(() => {
        if (montoRecibido !== '') {
            const mNum = Number(montoRecibido);
            if (mNum >= montoEfectivoRequerido) {
                setCambioManual(String(Number((mNum - montoEfectivoRequerido).toFixed(2))));
            } else {
                setCambioManual('');
            }
        }
    }, [totalCarrito, montoRecibido, montoEfectivoRequerido]);

    function handleChangeMontoRecibido(valor) {
        setMontoRecibido(valor);
        if (valor !== '' && Number(valor) >= montoEfectivoRequerido) {
            setCambioManual(String(Number((Number(valor) - montoEfectivoRequerido).toFixed(2))));
        } else if (valor === '') {
            setCambioManual('');
        }
    }

    function handleChangeMixtoEfectivo(valor) {
        setMontoMixtoEfectivo(valor);
        const num = Number(valor);
        if (valor !== '' && !isNaN(num) && num >= 0 && num <= totalCarrito) {
            setMontoMixtoQr(String(Number((totalCarrito - num).toFixed(2))));
        }
    }

    function handleChangeMixtoQr(valor) {
        setMontoMixtoQr(valor);
        const num = Number(valor);
        if (valor !== '' && !isNaN(num) && num >= 0 && num <= totalCarrito) {
            setMontoMixtoEfectivo(String(Number((totalCarrito - num).toFixed(2))));
        }
    }

    function handleSeleccionarMetodoPago(nuevoMetodo) {
        setMetodoPago(nuevoMetodo);
        if (nuevoMetodo === 'mixto' && totalCarrito > 0) {
            const mitadEf = Number((totalCarrito / 2).toFixed(2));
            const mitadQr = Number((totalCarrito - mitadEf).toFixed(2));
            setMontoMixtoEfectivo(String(mitadEf));
            setMontoMixtoQr(String(mitadQr));
        }
    }

    function resetearFormularioCobro() {
        setMontoRecibido('');
        setCambioManual('');
        setMontoMixtoEfectivo('');
        setMontoMixtoQr('');
        setReferenciaQr('');
        setConFacturaVenta(false);
        setNroFacturaVenta('');
        setNitClienteVenta('');
        setRazonSocialVenta('');
        setDescripcionVenta('Venta en mostrador');
    }

    async function handleConfirmarCobro(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        if (carrito.length === 0) {
            onError?.('Agrega al menos un producto al carrito.');
            return;
        }
        const itemInvalido = carrito.find((i) => !i.cantidad || Number(i.cantidad) <= 0);
        if (itemInvalido) {
            onError?.(`El producto "${itemInvalido.nombre}" no tiene una cantidad válida.`);
            return;
        }
        if (descuentoInvalido) {
            onError?.(`El descuento (Bs ${descuentoAplicadoNum.toFixed(2)}) debe ser menor al subtotal (Bs ${subtotalBrutoCarrito.toFixed(2)}).`);
            return;
        }
        if (metodoPago === 'mixto' && mixtoDescuadrado) {
            onError?.(`En pago mixto, la suma de Efectivo (Bs ${montoEfectivoRequerido.toFixed(2)}) + QR (Bs ${montoQrRequerido.toFixed(2)}) debe ser igual al total a cobrar (Bs ${totalCarrito.toFixed(2)}).`);
            return;
        }

        try {
            setErrorLocal(null);
            setSesionExpirada(false);
            setGuardando(true);
            const payload = {
                cajaId: cajaAbierta?.id,
                items: carrito.map((i) => ({
                    productoId: i.productoId,
                    cantidad: i.cantidad,
                    modificadores: (i.modificadores || []).map((m) => m.id)
                })),
                descuento: descuentoAplicadoNum > 0 ? descuentoAplicadoNum : 0,
                metodoPago,
                montoEfectivo: metodoPago === 'mixto' ? Number(montoEfectivoRequerido) : (metodoPago === 'efectivo' ? totalCarrito : 0),
                montoQr: metodoPago === 'mixto' ? Number(montoQrRequerido) : (metodoPago === 'qr' ? totalCarrito : 0),
                referenciaQr: (metodoPago === 'qr' || metodoPago === 'mixto') && referenciaQr.trim() !== '' ? referenciaQr.trim() : null,
                montoRecibido: (metodoPago === 'efectivo' || metodoPago === 'mixto') && montoRecibido !== '' ? Number(montoRecibido) : null,
                cambioEntregado: (metodoPago === 'efectivo' || metodoPago === 'mixto') ? Number(cambioQueSaleDeCaja) : 0,
                conFactura: conFacturaVenta,
                tipoComprobante: conFacturaVenta ? 'factura' : 'recibo',
                nroFactura: conFacturaVenta && nroFacturaVenta.trim() !== '' ? nroFacturaVenta.trim() : null,
                clienteNitCi: conFacturaVenta && nitClienteVenta.trim() !== '' ? nitClienteVenta.trim() : null,
                clienteRazonSocial: conFacturaVenta && razonSocialVenta.trim() !== '' ? razonSocialVenta.trim() : null,
                descripcion: `${descripcionVenta} (Operador: ${usuarioActual?.nombre || 'Cajero'})`
            };

            const res = await registrarVentaAction(payload);
            if (!res.ok) {
                const esErrorSesion = res.status === 401 ||
                    (res.error && (
                        res.error.toLowerCase().includes('sesión') ||
                        res.error.toLowerCase().includes('sesion') ||
                        res.error.toLowerCase().includes('expirada') ||
                        res.error.toLowerCase().includes('autenticado')
                    ));
                if (esErrorSesion) {
                    setSesionExpirada(true);
                }
                throw new Error(res.error || 'Error al procesar la venta.');
            }

            resetearFormularioCobro();
            onVentaExitosa?.(res.data.venta);
            onClose?.();
        } catch (err) {
            setErrorLocal(err.message);
            onError?.(err.message);
        } finally {
            setGuardando(false);
        }
    }

    async function handleReautenticarYCobrar(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (!pinReconexion.trim()) {
            setErrorLocal('Ingresa tu PIN o contraseña para reanudar la sesión.');
            return;
        }

        try {
            setReautenticando(true);
            setErrorLocal(null);

            const resAuth = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'login',
                    usuarioId: usuarioActual?.id,
                    nombreUsuario: usuarioActual?.nombre,
                    pin: pinReconexion
                })
            });

            const dataAuth = await resAuth.json();
            if (!resAuth.ok || !dataAuth.ok) {
                throw new Error(dataAuth.error || 'PIN o contraseña incorrectos.');
            }

            // Sesión restaurada con éxito, reintentar cobro de inmediato
            setSesionExpirada(false);
            setPinReconexion('');
            await handleConfirmarCobro(e || { preventDefault: () => {} });
        } catch (err) {
            setErrorLocal(err.message);
        } finally {
            setReautenticando(false);
        }
    }

    if (!isOpen) return null;

    const hayCantidadInvalida = carrito.some((i) => !i.cantidad || Number(i.cantidad) <= 0);

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-[580px] w-full max-h-[92vh] flex flex-col overflow-hidden">
                {/* Cabecera del Modal */}
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <span>💳</span> Cobro y Salida de Cambio
                        </h3>
                        <div className="text-xs text-slate-500 mt-0.5">
                            {cajaAbierta ? `Turno #${cajaAbierta.id} • ${cajaAbierta.caja_fisica_nombre || 'Caja Principal'}` : ''}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md p-1.5 transition-colors cursor-pointer text-lg leading-none"
                        aria-label="Cerrar modal"
                    >
                        ✕
                    </button>
                </div>

                {/* Contenido / Formulario de Cobro */}
                <form onSubmit={handleConfirmarCobro} className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-slate-800">
                    {/* Alerta de Error dentro del Modal */}
                    {errorLocal && (
                        <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-red-800 text-sm">
                            <div className="font-semibold flex items-center gap-1.5">
                                <span>⚠️</span>
                                <span>Error al procesar: {errorLocal}</span>
                            </div>

                            {sesionExpirada && (
                                <div className="mt-3 pt-3 border-t border-red-200">
                                    <div className="text-xs text-red-900 mb-2">
                                        Ingresa el PIN de <strong>{usuarioActual?.nombre || 'tu usuario'}</strong> para restaurar la sesión y completar el cobro sin perder los productos:
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <input
                                            type="password"
                                            placeholder="Ingresa tu PIN"
                                            value={pinReconexion}
                                            onChange={(e) => setPinReconexion(e.target.value)}
                                            className="flex-1 px-3 py-1.5 rounded-md border border-red-400 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-red-400"
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={handleReautenticarYCobrar}
                                            disabled={reautenticando}
                                            className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer disabled:opacity-60"
                                        >
                                            {reautenticando ? 'Reconectando...' : 'Reanudar y Cobrar'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CASILLAS SUPERIORES: TOTAL / CAMBIO REACTIVO */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-blue-50/80 border-2 border-blue-500 rounded-xl p-3.5 flex flex-col justify-between">
                            <div>
                                <div className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                                    Total a Cobrar
                                </div>
                                <div className="text-2xl font-black text-blue-950 mt-0.5">
                                    Bs {totalCarrito.toFixed(2)}
                                </div>
                            </div>
                            {descuentoAplicadoNum > 0 && !descuentoInvalido && (
                                <div className="text-xs text-slate-600 mt-1.5 flex items-center gap-1.5 flex-wrap">
                                    <span>Sub: Bs {subtotalBrutoCarrito.toFixed(2)}</span>
                                    <span className="text-red-600 font-semibold bg-red-100/70 px-1.5 py-0.5 rounded text-[11px]">
                                        Desc: -Bs {descuentoAplicadoNum.toFixed(2)}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className={`border-2 rounded-xl p-3.5 flex flex-col justify-between transition-colors ${
                            (metodoPago === 'efectivo' || metodoPago === 'mixto')
                                ? (faltaDineroRecibido ? 'bg-red-50/80 border-red-400' : 'bg-emerald-50/80 border-emerald-500')
                                : 'bg-slate-50 border-slate-300'
                        }`}>
                            <div className={`text-xs font-bold uppercase tracking-wide ${
                                (metodoPago === 'efectivo' || metodoPago === 'mixto')
                                    ? (faltaDineroRecibido ? 'text-red-700' : 'text-emerald-700')
                                    : 'text-slate-500'
                            }`}>
                                {(metodoPago === 'efectivo' || metodoPago === 'mixto') ? 'Cambio que Sale de Caja (Bs)' : 'Pago QR (Sin Cambio)'}
                            </div>
                            {(metodoPago === 'efectivo' || metodoPago === 'mixto') ? (
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={cambioManual}
                                    onChange={(e) => setCambioManual(e.target.value)}
                                    className="w-full mt-1 px-3 py-1 text-2xl font-black text-emerald-800 border-2 border-emerald-500 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
                                />
                            ) : (
                                <div className="text-2xl font-black text-slate-400 mt-1">
                                    Bs 0.00
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Descuento sobre el Ticket */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                        <label className="text-xs font-bold text-slate-700 flex flex-col gap-1">
                            <span>🏷️ Descuento Ticket (Bs, Opcional):</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={descuentoVenta}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setDescuentoVenta?.(val);
                                    const descNum = Number(val) || 0;
                                    const nuevoTotal = Math.max(0, Number((subtotalBrutoCarrito - Math.max(0, descNum)).toFixed(2)));
                                    if (metodoPago === 'mixto' && nuevoTotal > 0) {
                                        const mitadEf = Number((nuevoTotal / 2).toFixed(2));
                                        const mitadQr = Number((nuevoTotal - mitadEf).toFixed(2));
                                        setMontoMixtoEfectivo(String(mitadEf));
                                        setMontoMixtoQr(String(mitadQr));
                                    }
                                }}
                                className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                                    descuentoInvalido
                                        ? 'border-red-400 bg-red-50 text-red-900 focus:ring-red-300'
                                        : 'border-slate-300 bg-white text-slate-800 focus:ring-blue-400'
                                }`}
                            />
                        </label>
                        <div className="text-xs pb-2">
                            {descuentoInvalido ? (
                                <span className="font-semibold text-red-600">
                                    ⚠️ El descuento debe ser menor al subtotal (Bs {subtotalBrutoCarrito.toFixed(2)}).
                                </span>
                            ) : (
                                <span className="text-slate-500">
                                    Subtotal bruto: <strong className="text-slate-700">Bs {subtotalBrutoCarrito.toFixed(2)}</strong>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Selector de Método de Pago con Pestañas / Tabs */}
                    <div className="space-y-1.5">
                        <span className="text-xs font-bold text-slate-700 block">
                            Método de Pago:
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                            <button
                                type="button"
                                onClick={() => handleSeleccionarMetodoPago('efectivo')}
                                className={`py-2 px-2 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    metodoPago === 'efectivo'
                                        ? 'bg-white shadow-xs text-blue-700 border border-slate-200/80'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span>💵</span>
                                <span>Efectivo</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSeleccionarMetodoPago('qr')}
                                className={`py-2 px-2 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    metodoPago === 'qr'
                                        ? 'bg-white shadow-xs text-blue-700 border border-slate-200/80'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span>📱</span>
                                <span>QR</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSeleccionarMetodoPago('mixto')}
                                className={`py-2 px-2 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    metodoPago === 'mixto'
                                        ? 'bg-white shadow-xs text-blue-700 border border-slate-200/80'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span>🔀</span>
                                <span>Mixto</span>
                            </button>
                        </div>
                    </div>

                    {/* Inputs según Método de Pago */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                        {(metodoPago === 'efectivo' || metodoPago === 'mixto') && (
                            <label className="text-xs font-bold text-slate-700 flex flex-col gap-1 sm:col-span-2">
                                <span>Billete Recibido (Opcional):</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder={`Ej. ${montoEfectivoRequerido.toFixed(2)}`}
                                    value={montoRecibido}
                                    onChange={(e) => handleChangeMontoRecibido(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border-2 border-blue-400 bg-white text-base font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-300"
                                />
                            </label>
                        )}

                        {metodoPago === 'qr' && (
                            <label className="text-xs font-bold text-slate-700 flex flex-col gap-1 sm:col-span-2">
                                <span>N° Ref. / Comprobante QR:</span>
                                <input
                                    type="text"
                                    placeholder="Ej. 849201"
                                    value={referenciaQr}
                                    onChange={(e) => setReferenciaQr(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                />
                            </label>
                        )}
                    </div>

                    {/* Botones rápidos de billetes en efectivo */}
                    {(metodoPago === 'efectivo' || metodoPago === 'mixto') && montoEfectivoRequerido > 0 && (
                        <div className="flex gap-1.5 flex-wrap items-center">
                            <span className="text-xs text-slate-500 font-semibold">Billetes rápidos:</span>
                            <button
                                type="button"
                                onClick={() => handleChangeMontoRecibido(String(montoEfectivoRequerido))}
                                className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                            >
                                Exacto
                            </button>
                            {[10, 20, 50, 100, 200].map((billete) => (
                                <button
                                    key={billete}
                                    type="button"
                                    onClick={() => handleChangeMontoRecibido(String(billete))}
                                    className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                                >
                                    Bs {billete}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Desglose de Pago Mixto */}
                    {metodoPago === 'mixto' && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col gap-3">
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                <span>🔀</span>
                                <span>Desglose de Pago Mixto (Total: Bs {totalCarrito.toFixed(2)})</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                    <span>💵 Parte en Efectivo (Bs):</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        required
                                        value={montoMixtoEfectivo}
                                        onChange={(e) => handleChangeMixtoEfectivo(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-emerald-500 font-bold text-slate-800 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-300"
                                    />
                                </label>
                                <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                    <span>📱 Parte por QR (Bs):</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        required
                                        value={montoMixtoQr}
                                        onChange={(e) => handleChangeMixtoQr(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-sky-500 font-bold text-slate-800 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-300"
                                    />
                                </label>
                            </div>
                            <label className="text-xs text-slate-700 flex flex-col gap-1">
                                <span>N° Ref. / Comprobante QR (Opcional):</span>
                                <input
                                    type="text"
                                    placeholder="Código de transacción bancaria QR..."
                                    value={referenciaQr}
                                    onChange={(e) => setReferenciaQr(e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                />
                            </label>
                            {mixtoDescuadrado && totalCarrito > 0 && (
                                <div className="text-xs font-bold text-red-600">
                                    ⚠️ Efectivo + QR suma Bs {(montoEfectivoRequerido + montoQrRequerido).toFixed(2)} (debe sumar Bs {totalCarrito.toFixed(2)}).
                                </div>
                            )}
                        </div>
                    )}

                    {/* Respaldo Fiscal / Factura (Régimen General) */}
                    {configuracionNegocio?.regimen_tributario === 'regimen_general' &&
                        Number(configuracionNegocio?.emite_factura) === 1 &&
                        Number(usuarioActual?.puede_registrar_respaldo_fiscal ?? 1) === 1 &&
                        Number(cajaAbierta?.habilita_respaldo_fiscal ?? 1) === 1 && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={conFacturaVenta}
                                    onChange={(e) => setConFacturaVenta(e.target.checked)}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                />
                                <span>🧾 Registrar con Factura / Datos Fiscales del Cliente</span>
                            </label>
                            {conFacturaVenta && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                    <input
                                        type="text"
                                        required
                                        placeholder="NIT / CI del cliente"
                                        value={nitClienteVenta}
                                        onChange={(e) => setNitClienteVenta(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                    />
                                    <input
                                        type="text"
                                        required
                                        placeholder="N° Factura (ej. 104)"
                                        value={nroFacturaVenta}
                                        onChange={(e) => setNroFacturaVenta(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Nombre / Razón Social del cliente"
                                        value={razonSocialVenta}
                                        onChange={(e) => setRazonSocialVenta(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white sm:col-span-2 focus:outline-hidden focus:ring-2 focus:ring-blue-400"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Botones de Acción */}
                    <div className="flex gap-2.5 pt-2 border-t border-slate-200 justify-end items-center shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando || carrito.length === 0 || faltaDineroRecibido || hayCantidadInvalida || mixtoDescuadrado || descuentoInvalido}
                            className="px-5 py-2 text-sm font-bold rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {guardando ? 'Procesando...' : `Confirmar Cobro (${metodoPago.toUpperCase()})`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}