'use client';

import { useState, useEffect } from 'react';
import {
    modalOverlay,
    modalCard,
    cardStyle,
    inputStyle,
    btnPrimario,
    btnOscuro,
    btnSecundario
} from './cajaStyles';
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
        <div>
            {/* Pestañas para alternar entre Ingreso y Egreso */}
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                <button
                    type="button"
                    onClick={() => { if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas(); setPestaña('ingreso'); }}
                    style={{
                        padding: '0.45rem 0.9rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: pestaña === 'ingreso' ? '#0284c7' : '#f1f5f9',
                        color: pestaña === 'ingreso' ? '#ffffff' : '#475569',
                        fontWeight: pestaña === 'ingreso' ? 'bold' : 500,
                        cursor: 'pointer',
                        fontSize: '0.88rem'
                    }}
                >
                    📥 Ingreso de Sencillo
                </button>
                <button
                    type="button"
                    onClick={() => { if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas(); setPestaña('egreso'); }}
                    style={{
                        padding: '0.45rem 0.9rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: pestaña === 'egreso' ? '#0284c7' : '#f1f5f9',
                        color: pestaña === 'egreso' ? '#ffffff' : '#475569',
                        fontWeight: pestaña === 'egreso' ? 'bold' : 500,
                        cursor: 'pointer',
                        fontSize: '0.88rem'
                    }}
                >
                    💸 Salida / Egreso
                </button>
            </div>

            {pestaña === 'ingreso' ? (
                <div>
                    <p style={{ color: '#555', fontSize: '0.88rem', margin: '0 0 1rem' }}>
                        Usa esta opción cuando el dueño o administrador entregue billetes o monedas adicionales a la caja para tener cambio disponible.
                        Este monto <strong>se suma al dinero esperado en el cajón</strong>, pero <strong>no cuenta como venta de productos</strong>.
                    </p>
                    <form onSubmit={handleRegistrarIngreso} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                            Monto en Efectivo que Entra al Cajón (Bs):
                            <input
                                type="number"
                                step="0.01"
                                min="0.1"
                                required
                                placeholder="Ej. 200.00"
                                value={montoIngresoEfectivo}
                                onChange={(e) => setMontoIngresoEfectivo(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                        <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                            Motivo Obligatorio (Justificación):
                            <input
                                type="text"
                                required
                                placeholder="Ej. Aporte del director para sencillo, cambio de billetes grandes..."
                                value={motivoIngresoEfectivo}
                                onChange={(e) => setMotivoIngresoEfectivo(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                            {isModal && onClose && (
                                <button type="button" onClick={onClose} style={{ ...btnSecundario, padding: '0.65rem 1rem' }}>
                                    Cancelar
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={guardando}
                                style={{
                                    ...btnPrimario,
                                    padding: '0.65rem 1.2rem',
                                    opacity: guardando ? 0.6 : 1,
                                    cursor: guardando ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {guardando ? 'Guardando...' : 'Confirmar Entrada de Efectivo'}
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                <div>
                    <p style={{ color: '#555', fontSize: '0.88rem', margin: '0 0 1rem' }}>
                        Registra aquí cualquier salida de efectivo autorizada para gastos operativos del día (deja siempre el recibo o comprobante físico dentro del cajón).
                    </p>
                    <form onSubmit={handleRegistrarEgreso} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                            Monto que sale de Caja (Bs):
                            <input
                                type="number"
                                step="0.01"
                                min="0.1"
                                required
                                placeholder="0.00"
                                value={montoEgreso}
                                onChange={(e) => setMontoEgreso(e.target.value)}
                                style={inputStyle}
                            />
                        </label>

                        {usuarioActual?.rol === 'user' ? (
                            <div style={{ fontSize: '0.85rem', color: '#374151', background: '#f3f4f6', padding: '0.65rem', borderRadius: '6px' }}>
                                Modalidad: <strong>Efectivo Físico del Cajón</strong>
                            </div>
                        ) : (
                            <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                                Método de Salida:
                                <select value={metodoEgreso} onChange={(e) => setMetodoEgreso(e.target.value)} style={inputStyle}>
                                    <option value="efectivo">Efectivo del Cajón</option>
                                    <option value="qr">Transferencia / QR (Solo Admin)</option>
                                </select>
                            </label>
                        )}

                        <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                            Categoría Contable de la Salida:
                            <select value={categoriaEgreso} onChange={(e) => setCategoriaEgreso(e.target.value)} style={inputStyle}>
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
                            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <label style={{ fontSize: '0.88rem', fontWeight: 'bold' }}>
                                    🧾 Tipo de Respaldo Contable:
                                    <select value={tipoComprobanteEgreso} onChange={(e) => setTipoComprobanteEgreso(e.target.value)} style={inputStyle}>
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
                                    style={{ ...inputStyle, marginTop: 0 }}
                                />
                                {tipoComprobanteEgreso === 'factura' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        <input
                                            type="text"
                                            required
                                            placeholder="NIT del Proveedor"
                                            value={nitProveedorEgreso}
                                            onChange={(e) => setNitProveedorEgreso(e.target.value)}
                                            style={{ ...inputStyle, marginTop: 0 }}
                                        />
                                        <input
                                            type="text"
                                            required
                                            placeholder="N° de Factura"
                                            value={nroFacturaEgreso}
                                            onChange={(e) => setNroFacturaEgreso(e.target.value)}
                                            style={{ ...inputStyle, marginTop: 0 }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                            Motivo Obligatorio:
                            <input
                                type="text"
                                required
                                placeholder="Ej. Compra de hielo, botellón de agua, bolsas..."
                                value={motivoEgreso}
                                onChange={(e) => setMotivoEgreso(e.target.value)}
                                style={inputStyle}
                            />
                        </label>

                        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                            {isModal && onClose && (
                                <button type="button" onClick={onClose} style={{ ...btnSecundario, padding: '0.65rem 1rem' }}>
                                    Cancelar
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={guardando}
                                style={{
                                    ...btnOscuro,
                                    padding: '0.65rem 1.2rem',
                                    opacity: guardando ? 0.6 : 1,
                                    cursor: guardando ? 'not-allowed' : 'pointer'
                                }}
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
            <div style={modalOverlay}>
                <div style={{ ...modalCard, maxWidth: '540px' }}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>
                                {pestaña === 'ingreso' ? '📥 Ingresar Efectivo / Sencillo' : '💸 Registrar Egreso de Caja'}
                            </h3>
                            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.2rem' }}>
                                Turno #{cajaAbierta?.id} • {cajaAbierta?.caja_fisica_nombre || 'Principal'}
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
            <h2 style={{ marginTop: 0 }}>
                {pestaña === 'ingreso' ? '📥 Ingresar Efectivo / Sencillo' : '💸 Registrar Egreso de Caja'}
            </h2>
            {contenidoFormulario}
        </section>
    );
}
