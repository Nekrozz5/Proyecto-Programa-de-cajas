'use client';

import { useState, useEffect } from 'react';
import {
    modalOverlay,
    modalCard,
    inputStyle,
    btnPrimario,
    btnSecundario,
    btnBillete
} from './cajaStyles';
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
        <div style={modalOverlay}>
            <div style={{ ...modalCard, maxWidth: '580px' }}>
                {/* Cabecera del Modal */}
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                            💳 Cobro y Salida de Cambio
                        </h3>
                        <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '0.2rem' }}>
                            {cajaAbierta ? `Turno #${cajaAbierta.id} • ${cajaAbierta.caja_fisica_nombre || 'Caja Principal'}` : ''}
                        </div>
                    </div>
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
                </div>

                {/* Contenido / Formulario de Cobro */}
                <form onSubmit={handleConfirmarCobro} style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    {/* Alerta de Error dentro del Modal */}
                    {errorLocal && (
                        <div style={{
                            background: '#fef2f2',
                            border: '1px solid #f87171',
                            borderRadius: '8px',
                            padding: '0.85rem 1rem',
                            color: '#991b1b',
                            fontSize: '0.88rem'
                        }}>
                            <strong>⚠️ Error al procesar:</strong> {errorLocal}

                            {sesionExpirada && (
                                <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid #fca5a5' }}>
                                    <div style={{ fontSize: '0.82rem', marginBottom: '0.45rem', color: '#7f1d1d' }}>
                                        Ingresa el PIN de <strong>{usuarioActual?.nombre || 'tu usuario'}</strong> para restaurar la sesión y completar el cobro sin perder los productos:
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input
                                            type="password"
                                            placeholder="Ingresa tu PIN"
                                            value={pinReconexion}
                                            onChange={(e) => setPinReconexion(e.target.value)}
                                            style={{
                                                padding: '0.4rem 0.6rem',
                                                borderRadius: '6px',
                                                border: '1px solid #dc2626',
                                                fontSize: '0.9rem',
                                                flex: 1
                                            }}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={handleReautenticarYCobrar}
                                            disabled={reautenticando}
                                            style={{
                                                ...btnPrimario,
                                                padding: '0.4rem 0.85rem',
                                                fontSize: '0.85rem',
                                                background: '#16a34a'
                                            }}
                                        >
                                            {reautenticando ? 'Reconectando...' : 'Reanudar y Cobrar'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {/* CASILLAS SUPERIORES: TOTAL / CAMBIO REACTIVO */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '8px', padding: '0.75rem' }}>
                            <div style={{ fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Total a Cobrar
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e3a8a', marginTop: '0.2rem' }}>
                                Bs {totalCarrito.toFixed(2)}
                            </div>
                            {descuentoAplicadoNum > 0 && !descuentoInvalido && (
                                <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '0.15rem' }}>
                                    Sub: Bs {subtotalBrutoCarrito.toFixed(2)} | <span style={{ color: '#dc2626', fontWeight: 600 }}>Desc: -Bs {descuentoAplicadoNum.toFixed(2)}</span>
                                </div>
                            )}
                        </div>

                        <div style={{
                            background: (metodoPago === 'efectivo' || metodoPago === 'mixto') ? (faltaDineroRecibido ? '#fef2f2' : '#f0fdf4') : '#f8fafc',
                            border: `2px solid ${(metodoPago === 'efectivo' || metodoPago === 'mixto') ? (faltaDineroRecibido ? '#ef4444' : '#22c55e') : '#cbd5e1'}`,
                            borderRadius: '8px',
                            padding: '0.75rem'
                        }}>
                            <div style={{ fontSize: '0.78rem', color: faltaDineroRecibido ? '#b91c1c' : '#15803d', fontWeight: 'bold', textTransform: 'uppercase' }}>
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
                                    style={{
                                        width: '100%',
                                        marginTop: '0.35rem',
                                        padding: '0.45rem 0.6rem',
                                        fontSize: '1.25rem',
                                        fontWeight: 'bold',
                                        color: '#166534',
                                        border: '2px solid #16a34a',
                                        borderRadius: '6px',
                                        background: '#fff',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            ) : (
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#64748b', marginTop: '0.2rem' }}>
                                    Bs 0.00
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Descuento sobre el Ticket */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <label style={{ fontSize: '0.84rem', fontWeight: 'bold' }}>
                            🏷️ Descuento Ticket (Bs, Opcional):
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
                                style={{
                                    ...inputStyle,
                                    borderColor: descuentoInvalido ? '#ef4444' : '#cbd5e1',
                                    background: descuentoInvalido ? '#fef2f2' : '#fff'
                                }}
                            />
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', fontSize: '0.78rem', color: descuentoInvalido ? '#b91c1c' : '#64748b', paddingBottom: '0.35rem' }}>
                            {descuentoInvalido ? (
                                <strong>⚠️ El descuento debe ser menor al subtotal (Bs {subtotalBrutoCarrito.toFixed(2)}).</strong>
                            ) : (
                                <span>Subtotal bruto: <strong>Bs {subtotalBrutoCarrito.toFixed(2)}</strong></span>
                            )}
                        </div>
                    </div>

                    {/* Método de Pago y Billete Recibido */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <label style={{ fontSize: '0.88rem', fontWeight: 'bold' }}>
                            Método de Pago:
                            <select
                                value={metodoPago}
                                onChange={(e) => {
                                    const nuevoMetodo = e.target.value;
                                    setMetodoPago(nuevoMetodo);
                                    if (nuevoMetodo === 'mixto' && totalCarrito > 0) {
                                        const mitadEf = Number((totalCarrito / 2).toFixed(2));
                                        const mitadQr = Number((totalCarrito - mitadEf).toFixed(2));
                                        setMontoMixtoEfectivo(String(mitadEf));
                                        setMontoMixtoQr(String(mitadQr));
                                    }
                                }}
                                style={inputStyle}
                            >
                                <option value="efectivo">💵 Efectivo Físico</option>
                                <option value="qr">📱 Pago por QR</option>
                                <option value="mixto">🔀 Pago Mixto (Efectivo + QR)</option>
                            </select>
                        </label>

                        {(metodoPago === 'efectivo' || metodoPago === 'mixto') && (
                            <label style={{ fontSize: '0.88rem', fontWeight: 'bold' }}>
                                Billete Recibido (Opcional):
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder={`Ej. ${montoEfectivoRequerido.toFixed(2)}`}
                                    value={montoRecibido}
                                    onChange={(e) => handleChangeMontoRecibido(e.target.value)}
                                    style={{ ...inputStyle, fontWeight: 'bold', borderColor: '#0070f3' }}
                                />
                            </label>
                        )}

                        {metodoPago === 'qr' && (
                            <label style={{ fontSize: '0.88rem', fontWeight: 'bold' }}>
                                N° Ref. / Comprobante QR:
                                <input
                                    type="text"
                                    placeholder="Ej. 849201"
                                    value={referenciaQr}
                                    onChange={(e) => setReferenciaQr(e.target.value)}
                                    style={inputStyle}
                                />
                            </label>
                        )}
                    </div>

                    {/* Botones rápidos de billetes en efectivo */}
                    {(metodoPago === 'efectivo' || metodoPago === 'mixto') && montoEfectivoRequerido > 0 && (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Billetes rápidos:</span>
                            <button type="button" onClick={() => handleChangeMontoRecibido(String(montoEfectivoRequerido))} style={btnBillete}>Exacto</button>
                            {[10, 20, 50, 100, 200].map((billete) => (
                                <button
                                    key={billete}
                                    type="button"
                                    onClick={() => handleChangeMontoRecibido(String(billete))}
                                    style={btnBillete}
                                >
                                    Bs {billete}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Desglose de Pago Mixto */}
                    {metodoPago === 'mixto' && (
                        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a' }}>
                                🔀 Desglose de Pago Mixto (Total: Bs {totalCarrito.toFixed(2)})
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                    💵 Parte en Efectivo (Bs):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        required
                                        value={montoMixtoEfectivo}
                                        onChange={(e) => handleChangeMixtoEfectivo(e.target.value)}
                                        style={{ ...inputStyle, borderColor: '#16a34a', fontWeight: 'bold' }}
                                    />
                                </label>
                                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                    📱 Parte por QR (Bs):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        required
                                        value={montoMixtoQr}
                                        onChange={(e) => handleChangeMixtoQr(e.target.value)}
                                        style={{ ...inputStyle, borderColor: '#0284c7', fontWeight: 'bold' }}
                                    />
                                </label>
                            </div>
                            <label style={{ fontSize: '0.8rem' }}>
                                N° Ref. / Comprobante QR (Opcional):
                                <input
                                    type="text"
                                    placeholder="Código de transacción bancaria QR..."
                                    value={referenciaQr}
                                    onChange={(e) => setReferenciaQr(e.target.value)}
                                    style={inputStyle}
                                />
                            </label>
                            {mixtoDescuadrado && totalCarrito > 0 && (
                                <div style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 'bold' }}>
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
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.55rem 0.7rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', color: '#1e293b' }}>
                                <input
                                    type="checkbox"
                                    checked={conFacturaVenta}
                                    onChange={(e) => setConFacturaVenta(e.target.checked)}
                                />
                                🧾 Registrar con Factura / Datos Fiscales del Cliente
                            </label>
                            {conFacturaVenta && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    <input
                                        type="text"
                                        required
                                        placeholder="NIT / CI del cliente"
                                        value={nitClienteVenta}
                                        onChange={(e) => setNitClienteVenta(e.target.value)}
                                        style={{ ...inputStyle, marginTop: 0, fontSize: '0.82rem', padding: '0.4rem' }}
                                    />
                                    <input
                                        type="text"
                                        required
                                        placeholder="N° Factura (ej. 104)"
                                        value={nroFacturaVenta}
                                        onChange={(e) => setNroFacturaVenta(e.target.value)}
                                        style={{ ...inputStyle, marginTop: 0, fontSize: '0.82rem', padding: '0.4rem' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Nombre / Razón Social del cliente"
                                        value={razonSocialVenta}
                                        onChange={(e) => setRazonSocialVenta(e.target.value)}
                                        style={{ ...inputStyle, marginTop: 0, fontSize: '0.82rem', padding: '0.4rem', gridColumn: '1 / -1' }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Botones de Acción */}
                    <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ ...btnSecundario, padding: '0.65rem 1rem' }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando || carrito.length === 0 || faltaDineroRecibido || hayCantidadInvalida || mixtoDescuadrado || descuentoInvalido}
                            style={{
                                ...btnPrimario,
                                padding: '0.65rem 1.4rem',
                                opacity: (guardando || carrito.length === 0 || faltaDineroRecibido || hayCantidadInvalida || mixtoDescuadrado || descuentoInvalido) ? 0.6 : 1,
                                cursor: (guardando || carrito.length === 0 || faltaDineroRecibido || hayCantidadInvalida || mixtoDescuadrado || descuentoInvalido) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {guardando ? 'Procesando...' : `Confirmar Cobro (${metodoPago.toUpperCase()})`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
