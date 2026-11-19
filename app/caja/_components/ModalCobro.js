'use client';

import { useState, useEffect } from 'react';
import { registrarVentaAction } from '../../../server/actions/ventas.actions';
import { useCaja } from '../_context/CajaContext';
import {
    Banknote,
    QrCode,
    Split,
    CheckCircle2,
    ArrowRight,
    X,
    AlertCircle,
    Tag,
    Receipt,
    CreditCard,
    Smartphone,
    Bike,
    User,
    MapPin,
    Phone
} from 'lucide-react';
import { PasswordInput } from '@/components/ui/password-input';

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
    siguienteNumeroFactura = 1,
    onVentaExitosa,
    onError,
    onLimpiarAlertas
}) {
    let contextCaja = null;
    try {
        contextCaja = useCaja();
    } catch {
        // En caso de montaje sin provider
    }
    const config = configuracionNegocio || contextCaja?.configuracionNegocio;
    const habilitaAppsComida = Number(config?.habilita_apps_comida ?? 0) === 1 || Boolean(config?.habilita_apps_comida);

    const [metodoPago, setMetodoPago] = useState('efectivo');
    const [referenciaExterna, setReferenciaExterna] = useState('');
    const [esEnvioMototaxi, setEsEnvioMototaxi] = useState(false);
    const [clienteEntrega, setClienteEntrega] = useState('');
    const [direccionEntrega, setDireccionEntrega] = useState('');
    const [telefonoEntrega, setTelefonoEntrega] = useState('');
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
            setMetodoPago('efectivo');
            setReferenciaExterna('');
            setEsEnvioMototaxi(false);
            setClienteEntrega('');
            setDireccionEntrega('');
            setTelefonoEntrega('');
        }
    }, [isOpen]);

    // Cálculos para Efectivo, QR y Pagos Mixtos
    const usuario = usuarioActual || contextCaja?.usuarioActual;
    const esAdministrativo = Boolean(
        usuario && (usuario.rol === 'admin' || usuario.rol === 'propietario' || usuario.rol === 'developer')
    );
    const maxDescuentoCajero = Number((subtotalBrutoCarrito * 0.15).toFixed(2));
    const superaLimiteCajero = !esAdministrativo && descuentoAplicadoNum > 0 && (
        descuentoAplicadoNum > maxDescuentoCajero || (subtotalBrutoCarrito > 0 && (descuentoAplicadoNum / subtotalBrutoCarrito) * 100 > 15.001)
    );
    const descuentoBloqueado = Boolean(descuentoInvalido || superaLimiteCajero);

    const montoEfectivoRequerido = metodoPago === 'mixto'
        ? (montoMixtoEfectivo !== '' ? Number(montoMixtoEfectivo) : 0)
        : (metodoPago === 'efectivo' ? totalCarrito : 0);
    const montoQrRequerido = metodoPago === 'mixto'
        ? (montoMixtoQr !== '' ? Number(montoMixtoQr) : 0)
        : (metodoPago === 'qr' ? totalCarrito : 0);

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
        (metodoPago === 'efectivo' || metodoPago === 'mixto')
            ? (cambioManual !== '' ? Number(cambioManual) : cambioCalculadoAuto)
            : 0;

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
        } else if (nuevoMetodo === 'pedidos_ya' || nuevoMetodo === 'yango') {
            setMontoRecibido('');
            setCambioManual('');
            setEsEnvioMototaxi(false);
            if (descripcionVenta === 'Venta en mostrador' || descripcionVenta === 'Despacho por mototaxi') {
                setDescripcionVenta(nuevoMetodo === 'pedidos_ya' ? 'Pedido por PedidosYa' : 'Pedido por Yango');
            }
        } else if (nuevoMetodo === 'efectivo' || nuevoMetodo === 'qr') {
            if (descripcionVenta === 'Pedido por PedidosYa' || descripcionVenta === 'Pedido por Yango') {
                setDescripcionVenta('Venta en mostrador');
            }
        }
    }

    function handleToggleMototaxi(activar) {
        setEsEnvioMototaxi(activar);
        if (activar) {
            if (descripcionVenta === 'Venta en mostrador') {
                setDescripcionVenta('Despacho por mototaxi');
            }
        } else {
            if (descripcionVenta === 'Despacho por mototaxi') {
                setDescripcionVenta('Venta en mostrador');
            }
        }
    }

    function resetearFormularioCobro() {
        setMetodoPago('efectivo');
        setMontoRecibido('');
        setCambioManual('');
        setMontoMixtoEfectivo('');
        setMontoMixtoQr('');
        setReferenciaQr('');
        setReferenciaExterna('');
        setEsEnvioMototaxi(false);
        setClienteEntrega('');
        setDireccionEntrega('');
        setTelefonoEntrega('');
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
        if (superaLimiteCajero) {
            onError?.(`Permiso denegado: como cajero no puedes aplicar más del 15% de descuento (Bs ${maxDescuentoCajero.toFixed(2)} máximo) sin autorización administrativa.`);
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

            const canalVentaCalculado = (metodoPago === 'pedidos_ya' || metodoPago === 'yango')
                ? metodoPago
                : (esEnvioMototaxi ? 'mototaxi' : 'local');

            const datosEntregaPayload = esEnvioMototaxi
                ? {
                    cliente: clienteEntrega.trim(),
                    direccion: direccionEntrega.trim(),
                    telefono: telefonoEntrega.trim()
                }
                : null;

            const referenciaExternaPayload = (metodoPago === 'pedidos_ya' || metodoPago === 'yango')
                ? (referenciaExterna.trim() || null)
                : null;

            const payload = {
                cajaId: cajaAbierta?.id,
                items: carrito.map((i) => ({
                    productoId: i.productoId,
                    cantidad: i.cantidad,
                    loteId: i.loteId || null,
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
                descripcion: `${descripcionVenta} (Operador: ${usuarioActual?.nombre || 'Cajero'})`,
                canalVenta: canalVentaCalculado,
                datosEntrega: datosEntregaPayload,
                referenciaExterna: referenciaExternaPayload
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
                            <CreditCard className="w-5 h-5 text-sky-600" />
                            <span>Cobro y Salida de Cambio</span>
                        </h3>
                        <div className="text-xs text-slate-500 mt-0.5">
                            {cajaAbierta ? `Turno #${cajaAbierta.id} • ${cajaAbierta.caja_fisica_nombre || 'Caja Principal'}` : ''}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md p-1.5 transition-colors cursor-pointer"
                        aria-label="Cerrar modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Contenido / Formulario de Cobro */}
                <form onSubmit={handleConfirmarCobro} className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-slate-800">
                    {/* Alerta de Error dentro del Modal */}
                    {errorLocal && (
                        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800 text-sm">
                            <div className="font-semibold flex items-center gap-1.5">
                                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                <span>Error al procesar: {errorLocal}</span>
                            </div>

                            {sesionExpirada && (
                                <div className="mt-3 pt-3 border-t border-rose-200">
                                    <div className="text-xs text-rose-900 mb-2">
                                        Ingresa el PIN de <strong>{usuarioActual?.nombre || 'tu usuario'}</strong> para restaurar la sesión y completar el cobro sin perder los productos:
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <PasswordInput
                                            placeholder="Ingresa tu PIN"
                                            value={pinReconexion}
                                            onChange={(e) => setPinReconexion(e.target.value)}
                                            containerClassName="flex-1"
                                            className="h-8 border-rose-300 bg-white text-sm focus-visible:ring-rose-400 focus-visible:border-rose-400"
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
                        <div className="bg-sky-50/80 border-2 border-sky-500 rounded-xl p-3.5 flex flex-col justify-between">
                            <div>
                                <div className="text-xs font-bold text-sky-700 uppercase tracking-wide">
                                    Total a Cobrar
                                </div>
                                <div className="text-2xl font-black text-sky-950 mt-0.5">
                                    Bs {totalCarrito.toFixed(2)}
                                </div>
                            </div>
                            {descuentoAplicadoNum > 0 && !descuentoBloqueado && (
                                <div className="text-xs text-slate-600 mt-1.5 flex items-center gap-1.5 flex-wrap">
                                    <span>Sub: Bs {subtotalBrutoCarrito.toFixed(2)}</span>
                                    <span className="text-rose-600 font-semibold bg-rose-100/70 px-1.5 py-0.5 rounded text-[11px]">
                                        Desc: -Bs {descuentoAplicadoNum.toFixed(2)}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className={`border-2 rounded-xl p-3.5 flex flex-col justify-between transition-colors ${
                            (metodoPago === 'efectivo' || metodoPago === 'mixto')
                                ? (faltaDineroRecibido ? 'bg-rose-50/80 border-rose-400' : 'bg-emerald-50/80 border-emerald-500')
                                : 'bg-slate-50 border-slate-300'
                        }`}>
                            <div className={`text-xs font-bold uppercase tracking-wide ${
                                (metodoPago === 'efectivo' || metodoPago === 'mixto')
                                    ? (faltaDineroRecibido ? 'text-rose-700' : 'text-emerald-700')
                                    : 'text-slate-500'
                            }`}>
                                {(metodoPago === 'efectivo' || metodoPago === 'mixto')
                                    ? 'Cambio que Sale de Caja (Bs)'
                                    : (metodoPago === 'qr' ? 'Pago QR (Sin Cambio)' : 'Pago App (Sin Cambio)')}
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
                            <span className="flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5 text-slate-500" />
                                <span>Descuento Ticket (Bs, Opcional):</span>
                            </span>
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
                                    descuentoBloqueado
                                        ? 'border-rose-400 bg-rose-50 text-rose-900 focus:ring-rose-300'
                                        : 'border-slate-300 bg-white text-slate-800 focus:ring-sky-400'
                                }`}
                            />
                        </label>
                        <div className="text-xs pb-2">
                            {descuentoInvalido ? (
                                <span className="font-semibold text-rose-600 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>El descuento debe ser menor al subtotal (Bs {subtotalBrutoCarrito.toFixed(2)}).</span>
                                </span>
                            ) : superaLimiteCajero ? (
                                <span className="font-semibold text-rose-600 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>Tope cajero superado: máx. 15% (Bs {maxDescuentoCajero.toFixed(2)}). Requiere autorización admin.</span>
                                </span>
                            ) : (
                                <div className="text-slate-500 space-y-0.5">
                                    <div>
                                        Subtotal bruto: <strong className="text-slate-700">Bs {subtotalBrutoCarrito.toFixed(2)}</strong>
                                    </div>
                                    {!esAdministrativo && (
                                        <div className="text-[11px] text-amber-700 font-medium">
                                            Límite cajero: máx. 15% (Bs {maxDescuentoCajero.toFixed(2)})
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Selector de Canal / Método de Pago */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 block">
                                Canal y Método de Pago:
                            </span>
                            {habilitaAppsComida && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.5 rounded">
                                    Apps de Comida Habilitadas
                                </span>
                            )}
                        </div>
                        <div className={`grid gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 ${
                            habilitaAppsComida ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-3'
                        }`}>
                            <button
                                type="button"
                                onClick={() => handleSeleccionarMetodoPago('efectivo')}
                                className={`py-2 px-1.5 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    metodoPago === 'efectivo'
                                        ? 'bg-white shadow-xs text-sky-700 border border-slate-200/80'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <Banknote className="w-4 h-4 shrink-0" />
                                <span>Efectivo</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSeleccionarMetodoPago('qr')}
                                className={`py-2 px-1.5 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    metodoPago === 'qr'
                                        ? 'bg-white shadow-xs text-sky-700 border border-slate-200/80'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <QrCode className="w-4 h-4 shrink-0" />
                                <span>QR</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSeleccionarMetodoPago('mixto')}
                                className={`py-2 px-1.5 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    metodoPago === 'mixto'
                                        ? 'bg-white shadow-xs text-sky-700 border border-slate-200/80'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <Split className="w-4 h-4 shrink-0" />
                                <span>Mixto</span>
                            </button>
                            {habilitaAppsComida && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleSeleccionarMetodoPago('pedidos_ya')}
                                        className={`py-2 px-1.5 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                            metodoPago === 'pedidos_ya'
                                                ? 'bg-red-500 shadow-xs text-white border border-red-600'
                                                : 'text-red-700 hover:text-red-900 hover:bg-red-50'
                                        }`}
                                    >
                                        <Smartphone className="w-4 h-4 shrink-0" />
                                        <span>PedidosYa</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSeleccionarMetodoPago('yango')}
                                        className={`py-2 px-1.5 text-xs sm:text-sm font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                            metodoPago === 'yango'
                                                ? 'bg-rose-600 shadow-xs text-white border border-rose-700'
                                                : 'text-rose-700 hover:text-rose-900 hover:bg-rose-50'
                                        }`}
                                    >
                                        <Bike className="w-4 h-4 shrink-0" />
                                        <span>Yango</span>
                                    </button>
                                </>
                            )}
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
                                    className="w-full px-3 py-2 rounded-lg border-2 border-sky-400 bg-white text-base font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-300"
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
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-400"
                                />
                            </label>
                        )}

                        {(metodoPago === 'pedidos_ya' || metodoPago === 'yango') && (
                            <label className="text-xs font-bold text-slate-700 flex flex-col gap-1 sm:col-span-2">
                                <span className="flex items-center gap-1.5 text-slate-800">
                                    <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                                    <span>N° de Orden / Pedido de la App ({metodoPago === 'pedidos_ya' ? 'PedidosYa' : 'Yango'}, Opcional):</span>
                                </span>
                                <input
                                    type="text"
                                    placeholder={`Ej. #${metodoPago === 'pedidos_ya' ? 'PY' : 'YA'}-9481`}
                                    value={referenciaExterna}
                                    onChange={(e) => setReferenciaExterna(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-400 font-medium"
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
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 hover:border-sky-300 transition-colors cursor-pointer shadow-xs"
                            >
                                Exacto
                            </button>
                            {[10, 20, 50, 100, 200].map((billete) => (
                                <button
                                    key={billete}
                                    type="button"
                                    onClick={() => handleChangeMontoRecibido(String(billete))}
                                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer shadow-xs"
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
                                <Split className="w-4 h-4 text-sky-600" />
                                <span>Desglose de Pago Mixto (Total: Bs {totalCarrito.toFixed(2)})</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                    <span className="flex items-center gap-1">
                                        <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Parte en Efectivo (Bs):</span>
                                    </span>
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
                                    <span className="flex items-center gap-1">
                                        <QrCode className="w-3.5 h-3.5 text-sky-600" />
                                        <span>Parte por QR (Bs):</span>
                                    </span>
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
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-400"
                                />
                            </label>
                            {mixtoDescuadrado && totalCarrito > 0 && (
                                <div className="text-xs font-bold text-rose-600 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>Efectivo + QR suma Bs {(montoEfectivoRequerido + montoQrRequerido).toFixed(2)} (debe sumar Bs {totalCarrito.toFixed(2)}).</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Opción de Despacho / Envío por Mototaxi (Para cualquier modalidad de negocio) */}
                    {metodoPago !== 'pedidos_ya' && metodoPago !== 'yango' && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={esEnvioMototaxi}
                                        onChange={(e) => handleToggleMototaxi(e.target.checked)}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                                    />
                                    <span className="flex items-center gap-1.5">
                                        <Bike className="w-4 h-4 text-slate-600" />
                                        <span>Envío / Mototaxi</span>
                                    </span>
                                </label>
                                {esEnvioMototaxi && (
                                    <span className="text-[10px] bg-sky-100 text-sky-800 font-semibold px-2 py-0.5 rounded-full">
                                        Canal: Mototaxi
                                    </span>
                                )}
                            </div>

                            {esEnvioMototaxi && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                                    <label className="text-xs text-slate-700 flex flex-col gap-1">
                                        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                                            <User className="w-3 h-3 text-slate-400" />
                                            <span>Cliente (Opcional):</span>
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Nombre cliente"
                                            value={clienteEntrega}
                                            onChange={(e) => setClienteEntrega(e.target.value)}
                                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-400"
                                        />
                                    </label>
                                    <label className="text-xs text-slate-700 flex flex-col gap-1">
                                        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                                            <MapPin className="w-3 h-3 text-slate-400" />
                                            <span>Dirección (Opcional):</span>
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Dirección o ref."
                                            value={direccionEntrega}
                                            onChange={(e) => setDireccionEntrega(e.target.value)}
                                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-400"
                                        />
                                    </label>
                                    <label className="text-xs text-slate-700 flex flex-col gap-1">
                                        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                                            <Phone className="w-3 h-3 text-slate-400" />
                                            <span>Teléfono (Opcional):</span>
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Ej. 70012345"
                                            value={telefonoEntrega}
                                            onChange={(e) => setTelefonoEntrega(e.target.value)}
                                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-400"
                                        />
                                    </label>
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
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setConFacturaVenta(checked);
                                        if (checked && !nroFacturaVenta) {
                                            setNroFacturaVenta(String(siguienteNumeroFactura || 1));
                                        }
                                    }}
                                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                                />
                                <span className="flex items-center gap-1.5">
                                    <Receipt className="w-4 h-4 text-slate-600" />
                                    <span>Registrar con Factura / Datos Fiscales del Cliente</span>
                                </span>
                            </label>
                            {conFacturaVenta && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                    <input
                                        type="text"
                                        required
                                        placeholder="NIT / CI del cliente"
                                        value={nitClienteVenta}
                                        onChange={(e) => setNitClienteVenta(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-400"
                                    />
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center justify-between px-0.5">
                                            <span className="text-[10px] text-slate-500">N° Factura:</span>
                                            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-semibold px-1 rounded">
                                                Correlativo automático
                                            </span>
                                        </div>
                                        <input
                                            type="text"
                                            required
                                            placeholder={`Automático: #${siguienteNumeroFactura || 1}`}
                                            value={nroFacturaVenta}
                                            onChange={(e) => setNroFacturaVenta(e.target.value)}
                                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-400 font-semibold text-slate-800"
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Nombre / Razón Social del cliente"
                                        value={razonSocialVenta}
                                        onChange={(e) => setRazonSocialVenta(e.target.value)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white sm:col-span-2 focus:outline-hidden focus:ring-2 focus:ring-sky-400"
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
                            disabled={guardando || carrito.length === 0 || faltaDineroRecibido || hayCantidadInvalida || mixtoDescuadrado || descuentoBloqueado}
                            className="px-5 py-2 text-sm font-bold rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {guardando ? (
                                <span>Procesando...</span>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>
                                        Confirmar Cobro ({
                                            metodoPago === 'pedidos_ya'
                                                ? 'PEDIDOSYA'
                                                : (metodoPago === 'yango' ? 'YANGO' : metodoPago.toUpperCase())
                                        })
                                    </span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
