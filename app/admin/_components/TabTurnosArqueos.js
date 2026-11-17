'use client';

import { useState } from 'react';
import { cardStyle, btnPrimario, btnSecundario, inputStyle, thTd } from './adminStyles';
import { abrirTurnoAction, reabrirTurnoAction } from '../../../server/actions/turnos.actions';
import {
    probarEmailAction,
    reenviarCierreEmailAction,
    crearCajaFisicaAction,
    desactivarCajaFisicaAction,
    reactivarCajaFisicaAction,
    actualizarPermisoFiscalCajaAction,
    guardarConfiguracionContableAction
} from '../../../server/actions/admin.actions';

export default function TabTurnosArqueos({
    datos,
    seleccionarTurnoParaAuditar,
    cargarTodo,
    setMensaje,
    setError,
    limpiarAlertas
}) {
    // Configuración Contable y Régimen Tributario
    const [mostrarPanelContable, setMostrarPanelContable] = useState(false);
    const [cfgNitNegocio, setCfgNitNegocio] = useState(datos?.configuracionNegocio?.nit_negocio || '');
    const [cfgRegimenTributario, setCfgRegimenTributario] = useState(datos?.configuracionNegocio?.regimen_tributario || 'simplificado_control_interno');
    const [cfgEmiteFactura, setCfgEmiteFactura] = useState(Boolean(datos?.configuracionNegocio?.emite_factura));
    const [cfgIvaPorcentaje, setCfgIvaPorcentaje] = useState(String(datos?.configuracionNegocio?.iva_porcentaje ?? 13));
    const [cfgItPorcentaje, setCfgItPorcentaje] = useState(String(datos?.configuracionNegocio?.it_porcentaje ?? 3));
    const [cfgItBase, setCfgItBase] = useState(datos?.configuracionNegocio?.it_base || 'todas_las_ventas');
    const [cfgUsaRespaldoComprasEgresos, setCfgUsaRespaldoComprasEgresos] = useState(Boolean(datos?.configuracionNegocio?.usa_respaldo_compras_egresos ?? true));

    // Estaciones Físicas de Caja
    const [mostrarPanelCajasFisicas, setMostrarPanelCajasFisicas] = useState(false);
    const [nuevaCajaFisicaNombre, setNuevaCajaFisicaNombre] = useState('');

    // Apertura de nuevo turno
    const [nuevoFondoInicial, setNuevoFondoInicial] = useState('100');
    const [cajaFisicaParaAbrir, setCajaFisicaParaAbrir] = useState('');

    // Reapertura de turno
    const [cajaAReabrirId, setCajaAReabrirId] = useState(null);
    const [motivoReapertura, setMotivoReapertura] = useState('Reconteo / Corrección de cierre');

    // Notificaciones por correo
    const [enviandoPruebaEmail, setEnviandoPruebaEmail] = useState(false);
    const [enviandoEmailCajaId, setEnviandoEmailCajaId] = useState(null);

    const cajasFisicasDisponibles = (datos?.cajasFisicas || []).filter(
        (cf) => Number(cf.activa) === 1 && !cf.turno_abierto_id
    );

    async function handleAbrirNuevoTurnoAdmin(e) {
        e.preventDefault();
        limpiarAlertas?.();
        try {
            const res = await abrirTurnoAction({
                montoInicial: Number(nuevoFondoInicial),
                cajaFisicaId: cajaFisicaParaAbrir ? Number(cajaFisicaParaAbrir) : null
            });
            if (!res.ok) throw new Error(res.error || 'Error al abrir nuevo turno.');
            setMensaje?.('Nuevo turno de caja habilitado por el Administrador.');
            setCajaFisicaParaAbrir('');
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function confirmarReabrirCaja(cajaId) {
        limpiarAlertas?.();
        try {
            const res = await reabrirTurnoAction({
                cajaId,
                motivo: motivoReapertura.trim() || 'Revisión administrativa'
            });
            if (!res.ok) throw new Error(res.error || 'Error al reabrir caja.');
            setMensaje?.(`Caja #${cajaId} reabierta exitosamente. Se guardó el registro de reapertura en el historial.`);
            setCajaAReabrirId(null);
            setMotivoReapertura('Reconteo / Corrección de cierre');
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleProbarEmail() {
        limpiarAlertas?.();
        try {
            setEnviandoPruebaEmail(true);
            const res = await probarEmailAction();
            if (!res.ok) throw new Error(res.error || 'Error al enviar correo de prueba.');
            setMensaje?.(`✅ ${res.data?.mensaje || 'Correo de prueba enviado exitosamente.'}`);
        } catch (err) {
            setError?.(err.message);
        } finally {
            setEnviandoPruebaEmail(false);
        }
    }

    async function handleReenviarEmailCierre(cajaId) {
        limpiarAlertas?.();
        try {
            setEnviandoEmailCajaId(cajaId);
            const res = await reenviarCierreEmailAction({ cajaId });
            if (!res.ok) throw new Error(res.error || 'Error al enviar el reporte por correo.');
            setMensaje?.(`✅ ${res.data?.mensaje || 'Reporte de cierre enviado exitosamente por correo.'}`);
        } catch (err) {
            setError?.(err.message);
        } finally {
            setEnviandoEmailCajaId(null);
        }
    }

    async function handleGuardarConfiguracionContable(e) {
        e.preventDefault();
        limpiarAlertas?.();
        try {
            const res = await guardarConfiguracionContableAction({
                nombreNegocio: datos?.configuracionNegocio?.nombre_negocio || 'Mi Negocio',
                nitNegocio: cfgNitNegocio,
                regimenTributario: cfgRegimenTributario,
                emiteFactura: cfgEmiteFactura,
                ivaPorcentaje: Number(cfgIvaPorcentaje || 13),
                itPorcentaje: Number(cfgItPorcentaje || 3),
                itBase: cfgItBase,
                usaRespaldoComprasEgresos: cfgUsaRespaldoComprasEgresos
            });
            if (!res.ok) throw new Error(res.error || 'Error al guardar la configuración contable.');
            setMensaje?.(`Configuración contable actualizada (${cfgRegimenTributario === 'regimen_general' ? 'Régimen General con Facturación' : 'Control Interno / Régimen Simplificado'}).`);
            setMostrarPanelContable(false);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleCrearCajaFisica(e) {
        e.preventDefault();
        const nom = nuevaCajaFisicaNombre.trim();
        if (!nom) return;
        limpiarAlertas?.();
        try {
            const res = await crearCajaFisicaAction({ nombre: nom });
            if (!res.ok) throw new Error(res.error || 'Error al crear la estación física.');
            setMensaje?.(`Estación de caja "${nom}" creada exitosamente.`);
            setNuevaCajaFisicaNombre('');
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleDesactivarCajaFisica(cajaFisicaId, nombre) {
        if (!confirm(`¿Estás seguro de desactivar la estación "${nombre}"? Sus turnos y arqueos históricos se conservarán.`)) {
            return;
        }
        limpiarAlertas?.();
        try {
            const res = await desactivarCajaFisicaAction({ cajaFisicaId });
            if (!res.ok) throw new Error(res.error || 'Error al desactivar la estación.');
            setMensaje?.(`Estación "${nombre}" desactivada.`);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleReactivarCajaFisica(cajaFisicaId, nombre) {
        limpiarAlertas?.();
        try {
            const res = await reactivarCajaFisicaAction({ cajaFisicaId });
            if (!res.ok) throw new Error(res.error || 'Error al reactivar la estación.');
            setMensaje?.(`Estación "${nombre}" reactivada exitosamente.`);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleTogglePermisoFiscalCaja(cajaFisicaId, actualHabilitado, nombre) {
        const nuevo = !actualHabilitado;
        limpiarAlertas?.();
        try {
            const res = await actualizarPermisoFiscalCajaAction({
                cajaFisicaId,
                habilitado: nuevo
            });
            if (!res.ok) throw new Error(res.error || 'Error al actualizar permiso fiscal.');
            setMensaje?.(`Respaldo fiscal en "${nombre}" ${nuevo ? 'HABILITADO' : 'DESHABILITADO'}.`);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    return (
        <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                    <h2 style={{ margin: 0 }}>🏦 Auditoría de Cierres y Arqueos por Turno</h2>
                    <p style={{ margin: '0.25rem 0 0', color: '#555', fontSize: '0.9rem' }}>
                        Revisa si hubo dinero faltante o sobrante en cada turno cerrado y habilita o reabre turnos cuando sea necesario.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setMostrarPanelContable(!mostrarPanelContable)}
                        style={{ ...btnSecundario, fontSize: '0.84rem', padding: '0.45rem 0.8rem', background: mostrarPanelContable ? '#dbeafe' : '#e2e8f0', color: '#0f172a' }}
                    >
                        🧾 {mostrarPanelContable ? 'Ocultar Régimen Contable' : 'Régimen Contable / Facturación'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setMostrarPanelCajasFisicas(!mostrarPanelCajasFisicas)}
                        style={{ ...btnSecundario, fontSize: '0.84rem', padding: '0.45rem 0.8rem' }}
                    >
                        🏢 {mostrarPanelCajasFisicas ? 'Ocultar Estaciones' : 'Gestionar Estaciones de Caja'} ({(datos?.cajasFisicas || []).length})
                    </button>

                    {cajasFisicasDisponibles.length > 0 && (
                        <form onSubmit={handleAbrirNuevoTurnoAdmin} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {cajasFisicasDisponibles.length > 1 && (
                                <select
                                    value={cajaFisicaParaAbrir}
                                    onChange={(e) => setCajaFisicaParaAbrir(e.target.value)}
                                    style={{ padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.84rem', background: '#fff' }}
                                >
                                    <option value="">-- Estación --</option>
                                    {cajasFisicasDisponibles.map((cf) => (
                                        <option key={cf.id} value={cf.id}>{cf.nombre}</option>
                                    ))}
                                </select>
                            )}
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={nuevoFondoInicial}
                                onChange={(e) => setNuevoFondoInicial(e.target.value)}
                                placeholder="Fondo inicial Bs"
                                style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '120px', fontSize: '0.85rem' }}
                            />
                            <button type="submit" style={{ ...btnPrimario, fontSize: '0.85rem', padding: '0.45rem 0.8rem' }}>
                                + Abrir Turno
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* BANNER INFORMATIVO Y DE PRUEBA DE CORREO ELECTRÓNICO */}
            <div style={{
                background: datos?.estadoEmail?.configurado ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${datos?.estadoEmail?.configurado ? '#bbf7d0' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.86rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{datos?.estadoEmail?.configurado ? '🟢' : '✉️'}</span>
                    <div>
                        {datos?.estadoEmail?.configurado ? (
                            <>
                                <strong style={{ color: '#166534' }}>Notificaciones automáticas por correo activadas:</strong>{' '}
                                <span style={{ color: '#334155' }}>
                                    Al cerrar cada turno se envía el resumen ejecutivo y el Excel a: <strong>{datos.estadoEmail.destinatarios}</strong>
                                </span>
                            </>
                        ) : (
                            <>
                                <strong style={{ color: '#475569' }}>Notificaciones automáticas por correo desactivadas:</strong>{' '}
                                <span style={{ color: '#64748b' }}>
                                    Configura <code>SMTP_USER</code>, <code>SMTP_PASS</code> y <code>EMAIL_DESTINATARIO_CIERRE</code> en <code>.env.local</code> para recibir el arqueo y Excel automáticamente.
                                </span>
                            </>
                        )}
                    </div>
                </div>
                {datos?.estadoEmail?.configurado && (
                    <button
                        type="button"
                        disabled={enviandoPruebaEmail}
                        onClick={handleProbarEmail}
                        style={{
                            padding: '0.4rem 0.8rem',
                            background: '#16a34a',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: enviandoPruebaEmail ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {enviandoPruebaEmail ? '⏳ Enviando prueba...' : '🧪 Enviar Correo de Prueba'}
                    </button>
                )}
            </div>

            {/* PANEL DE CONFIGURACIÓN CONTABLE / RÉGIMEN TRIBUTARIO MODULAR */}
            {mostrarPanelContable && (
                <form onSubmit={handleGuardarConfiguracionContable} style={{ background: '#f8fafc', border: '2px solid #0284c7', borderRadius: '8px', padding: '1.1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div>
                        <h4 style={{ margin: 0, color: '#0f172a' }}>🧾 Configuración Contable y Régimen Tributario Modular (Bolivia)</h4>
                        <p style={{ margin: '0.2rem 0 0', color: '#475569', fontSize: '0.84rem' }}>
                            Adapta el sistema según el régimen del cliente: <strong>Control Interno / Régimen Simplificado (RTS)</strong> o <strong>Régimen General (Con Facturación IVA / IT)</strong>. Todos los reportes Excel, CSV y PDF se ajustan automáticamente.
                        </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                            Régimen del Negocio:
                            <select
                                value={cfgRegimenTributario}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setCfgRegimenTributario(val);
                                    setCfgEmiteFactura(val === 'regimen_general');
                                }}
                                style={inputStyle}
                            >
                                <option value="simplificado_control_interno">📋 Control Interno / Régimen Simplificado (Sin IVA)</option>
                                <option value="regimen_general">🏛️ Régimen General (Facturación IVA / IT)</option>
                            </select>
                        </label>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                            NIT del Establecimiento (Opcional):
                            <input
                                type="text"
                                placeholder="Ej. 1029384015"
                                value={cfgNitNegocio}
                                onChange={(e) => setCfgNitNegocio(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                        {cfgRegimenTributario === 'regimen_general' && (
                            <>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                    Alícuota IVA (%):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={cfgIvaPorcentaje}
                                        onChange={(e) => setCfgIvaPorcentaje(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                    Alícuota IT (%):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={cfgItPorcentaje}
                                        onChange={(e) => setCfgItPorcentaje(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                    Base Imponible del IT:
                                    <select
                                        value={cfgItBase}
                                        onChange={(e) => setCfgItBase(e.target.value)}
                                        style={inputStyle}
                                    >
                                        <option value="todas_las_ventas">Todas las ventas (Facturadas y no facturadas)</option>
                                        <option value="solo_facturadas">Solo ventas formalmente facturadas</option>
                                    </select>
                                </label>
                            </>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={cfgEmiteFactura}
                                onChange={(e) => setCfgEmiteFactura(e.target.checked)}
                            />
                            <span>Habilitar emisión de Factura Formal (con NIT/CI y Razón Social)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={cfgUsaRespaldoComprasEgresos}
                                onChange={(e) => setCfgUsaRespaldoComprasEgresos(e.target.checked)}
                            />
                            <span>Permitir registrar factura en Compras y Gastos (Crédito Fiscal)</span>
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                        <button type="submit" style={{ ...btnPrimario, fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}>
                            Guardar Configuración Contable
                        </button>
                        <button type="button" onClick={() => setMostrarPanelContable(false)} style={{ ...btnSecundario, fontSize: '0.85rem', padding: '0.45rem 0.9rem', border: 'none', cursor: 'pointer' }}>
                            Cerrar
                        </button>
                    </div>
                </form>
            )}

            {/* PANEL DE GESTIÓN DE ESTACIONES FÍSICAS DE CAJA */}
            {mostrarPanelCajasFisicas && (
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                            <h4 style={{ margin: 0, color: '#0f172a' }}>🏢 Estaciones Físicas de Caja (Puntos de Venta)</h4>
                            <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                                Define las terminales físicas del negocio. Puedes agregar nuevas o desactivar las que no uses (mínimo 1 activa requerida).
                            </p>
                        </div>
                        <form onSubmit={handleCrearCajaFisica} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                                type="text"
                                value={nuevaCajaFisicaNombre}
                                onChange={(e) => setNuevaCajaFisicaNombre(e.target.value)}
                                placeholder="ej. Caja 2 - Barra"
                                style={{ padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', minWidth: '170px' }}
                            />
                            <button type="submit" style={{ ...btnPrimario, fontSize: '0.82rem', padding: '0.45rem 0.8rem' }}>
                                + Crear Caja
                            </button>
                        </form>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
                        {(datos?.cajasFisicas || []).map((cf) => {
                            const esActiva = Number(cf.activa) === 1;
                            const totalActivas = (datos?.cajasFisicas || []).filter((c) => Number(c.activa) === 1).length;
                            const tieneTurno = Boolean(cf.turno_abierto_id);

                            return (
                                <div
                                    key={cf.id}
                                    style={{
                                        background: esActiva ? '#fff' : '#f1f5f9',
                                        border: `1px solid ${esActiva ? '#e2e8f0' : '#cbd5e1'}`,
                                        borderRadius: '6px',
                                        padding: '0.75rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.4rem',
                                        opacity: esActiva ? 1 : 0.65
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{cf.nombre}</strong>
                                        <span
                                            style={{
                                                fontSize: '0.72rem',
                                                fontWeight: 'bold',
                                                padding: '0.15rem 0.45rem',
                                                borderRadius: '4px',
                                                background: esActiva ? '#dcfce7' : '#e2e8f0',
                                                color: esActiva ? '#166534' : '#64748b'
                                            }}
                                        >
                                            {esActiva ? 'ACTIVA' : 'INACTIVA'}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        {tieneTurno ? (
                                            <span style={{ color: '#16a34a', fontWeight: '600' }}>
                                                🟢 Turno #{cf.turno_abierto_id} en curso ({cf.operador_abierto || 'Cajero'})
                                            </span>
                                        ) : (
                                            <span>⚪ Sin turno abierto actualmente</span>
                                        )}
                                    </div>
                                    <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleTogglePermisoFiscalCaja(cf.id, Number(cf.habilita_respaldo_fiscal ?? 1) === 1, cf.nombre)}
                                            style={{
                                                fontSize: '0.73rem',
                                                padding: '0.25rem 0.55rem',
                                                borderRadius: '4px',
                                                border: `1px solid ${Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? '#38bdf8' : '#cbd5e1'}`,
                                                background: Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? '#e0f2fe' : '#f1f5f9',
                                                color: Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? '#0369a1' : '#64748b',
                                                cursor: 'pointer',
                                                fontWeight: '600'
                                            }}
                                            title="Habilitar o deshabilitar el registro de factura/respaldo en ventas y egresos de esta estación"
                                        >
                                            🧾 Respaldo Fiscal: {Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? 'SÍ' : 'NO'}
                                        </button>
                                        {esActiva ? (
                                            <button
                                                type="button"
                                                disabled={totalActivas <= 1 || tieneTurno}
                                                onClick={() => handleDesactivarCajaFisica(cf.id, cf.nombre)}
                                                title={totalActivas <= 1 ? 'El sistema debe mantener al menos 1 caja activa' : tieneTurno ? 'Cierra el turno antes de desactivarla' : 'Desactivar esta caja'}
                                                style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.25rem 0.55rem',
                                                    borderRadius: '4px',
                                                    border: '1px solid #f87171',
                                                    background: totalActivas <= 1 || tieneTurno ? '#f1f5f9' : '#fee2e2',
                                                    color: totalActivas <= 1 || tieneTurno ? '#94a3b8' : '#991b1b',
                                                    cursor: totalActivas <= 1 || tieneTurno ? 'not-allowed' : 'pointer',
                                                    fontWeight: '600'
                                                }}
                                            >
                                                {totalActivas <= 1 ? 'Mínimo 1 requerida' : tieneTurno ? 'Turno en curso' : 'Desactivar'}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => handleReactivarCajaFisica(cf.id, cf.nombre)}
                                                style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.25rem 0.55rem',
                                                    borderRadius: '4px',
                                                    border: '1px solid #86efac',
                                                    background: '#dcfce7',
                                                    color: '#166534',
                                                    cursor: 'pointer',
                                                    fontWeight: '600'
                                                }}
                                            >
                                                Reactivar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TABLA HISTORIAL DE TURNOS DE CAJA */}
            {(datos?.historialCajas || []).length === 0 ? (
                <p style={{ color: '#666' }}>Aún no se ha abierto ni cerrado ningún turno de caja.</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #cbd5e1', textAlign: 'left', background: '#f8fafc' }}>
                                <th style={thTd}>N° Turno</th>
                                <th style={thTd}>Estación / Caja</th>
                                <th style={thTd}>Abierta por</th>
                                <th style={thTd}>Estado</th>
                                <th style={thTd}>Fondo Inicial</th>
                                <th style={thTd}>Efectivo Esperado</th>
                                <th style={thTd}>Efectivo Real Contado</th>
                                <th style={thTd}>Resultado / Diferencia</th>
                                <th style={thTd}>Total QR</th>
                                <th style={thTd}>Acción Admin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(datos?.historialCajas || []).map((c) => {
                                const dif = c.diferencia_efectivo !== null && c.diferencia_efectivo !== undefined ? Number(c.diferencia_efectivo) : null;
                                let badgeColor = '#166534';
                                let badgeBg = '#dcfce7';
                                let textoDif = 'En curso (Abierto)';

                                if (c.estado === 'cerrada' && dif !== null) {
                                    if (dif < 0) {
                                        badgeColor = '#991b1b';
                                        badgeBg = '#fee2e2';
                                        textoDif = `⚠️ FALTANTE: Bs ${dif.toFixed(2)}`;
                                    } else if (dif > 0) {
                                        badgeColor = '#1e40af';
                                        badgeBg = '#dbeafe';
                                        textoDif = `SOBRANTE: +Bs ${dif.toFixed(2)}`;
                                    } else {
                                        badgeColor = '#166534';
                                        badgeBg = '#dcfce7';
                                        textoDif = '✅ CUADRE EXACTO (Bs 0.00)';
                                    }
                                }

                                return (
                                    <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={thTd}><strong>Turno #{c.id}</strong></td>
                                        <td style={thTd}><span style={{ fontWeight: '600', color: '#0369a1' }}>{c.caja_fisica_nombre || 'Caja Principal'}</span></td>
                                        <td style={thTd}>{c.usuario_nombre || `Usuario #${c.usuario_id}`}</td>
                                        <td style={thTd}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                                                <span style={{
                                                    padding: '0.2rem 0.55rem',
                                                    borderRadius: '4px',
                                                    fontWeight: 'bold',
                                                    fontSize: '0.8rem',
                                                    background: c.estado === 'abierta' ? '#dcfce7' : '#e2e8f0',
                                                    color: c.estado === 'abierta' ? '#166534' : '#334155'
                                                }}>
                                                    {c.estado.toUpperCase()}
                                                </span>
                                                {Number(c.veces_reabierta) > 0 && (
                                                    <span style={{
                                                        padding: '0.18rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 'bold',
                                                        fontSize: '0.75rem',
                                                        background: '#fef3c7',
                                                        color: '#92400e',
                                                        border: '1px solid #f59e0b'
                                                    }}>
                                                        🔄 REABIERTO ({c.veces_reabierta} {Number(c.veces_reabierta) === 1 ? 'vez' : 'veces'})
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={thTd}>Bs {Number(c.monto_inicial).toFixed(2)}</td>
                                        <td style={thTd}>
                                            {c.efectivo_esperado !== null ? `Bs ${Number(c.efectivo_esperado).toFixed(2)}` : '—'}
                                        </td>
                                        <td style={thTd}>
                                            {c.efectivo_real !== null ? <strong>Bs {Number(c.efectivo_real).toFixed(2)}</strong> : '—'}
                                        </td>
                                        <td style={thTd}>
                                            <div>
                                                <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: 'bold', background: badgeBg, color: badgeColor, display: 'inline-block' }}>
                                                    {textoDif}
                                                </span>
                                                {c.historial_reaperturas && (
                                                    <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#78350f', background: '#fffbeb', padding: '0.35rem 0.5rem', borderRadius: '4px', borderLeft: '3px solid #f59e0b' }}>
                                                        <strong>Historial previo:</strong> {c.historial_reaperturas}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={thTd}>Bs {Number(c.qr_esperado || 0).toFixed(2)}</td>
                                        <td style={thTd}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '170px' }}>
                                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => seleccionarTurnoParaAuditar?.(c.id)}
                                                        style={{
                                                            padding: '0.3rem 0.55rem',
                                                            background: Number(datos?.cajaAuditada?.id) === Number(c.id) ? '#0f172a' : '#e2e8f0',
                                                            color: Number(datos?.cajaAuditada?.id) === Number(c.id) ? '#fff' : '#0f172a',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600'
                                                        }}
                                                    >
                                                        {Number(datos?.cajaAuditada?.id) === Number(c.id) ? '👁️ Auditando' : '🔍 Auditar / PDF'}
                                                    </button>
                                                    <a
                                                        href={`/api/reportes?formato=xlsx&cajaId=${c.id}`}
                                                        style={{
                                                            padding: '0.3rem 0.55rem',
                                                            background: '#dcfce7',
                                                            color: '#166534',
                                                            borderRadius: '4px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            textDecoration: 'none'
                                                        }}
                                                    >
                                                        📊 Excel
                                                    </a>
                                                </div>
                                                {c.estado === 'cerrada' && !datos?.cajaAbierta && (
                                                    cajaAReabrirId === c.id ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '200px' }}>
                                                            <input
                                                                type="text"
                                                                placeholder="Motivo de reapertura..."
                                                                value={motivoReapertura}
                                                                onChange={(e) => setMotivoReapertura(e.target.value)}
                                                                style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #94a3b8', fontSize: '0.8rem' }}
                                                            />
                                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => confirmarReabrirCaja(c.id)}
                                                                    style={{ padding: '0.3rem 0.6rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.78rem' }}
                                                                >
                                                                    Confirmar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCajaAReabrirId(null)}
                                                                    style={{ padding: '0.3rem 0.6rem', background: '#64748b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setCajaAReabrirId(c.id);
                                                                setMotivoReapertura('Reconteo / Corrección de cierre');
                                                            }}
                                                            style={{ padding: '0.35rem 0.7rem', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
                                                        >
                                                            Reabrir este Turno
                                                        </button>
                                                    )
                                                )}
                                                {c.estado === 'cerrada' && (
                                                    <button
                                                        type="button"
                                                        disabled={enviandoEmailCajaId === c.id}
                                                        onClick={() => handleReenviarEmailCierre(c.id)}
                                                        style={{
                                                            padding: '0.35rem 0.65rem',
                                                            background: '#047857',
                                                            color: '#fff',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: enviandoEmailCajaId === c.id ? 'not-allowed' : 'pointer',
                                                            fontSize: '0.78rem',
                                                            fontWeight: '600'
                                                        }}
                                                    >
                                                        {enviandoEmailCajaId === c.id ? '⏳ Enviando...' : '✉️ Enviar por Correo'}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
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
