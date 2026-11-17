'use client';

import { useState } from 'react';
import { cardStyle, formCol, inputStyle, btnPrimario, btnSecundario } from './adminStyles';
import {
    crearUsuarioAction,
    borrarUsuarioAction,
    cambiarPasswordAction,
    actualizarPermisoFiscalUsuarioAction,
    crearCajaFisicaAction,
    desactivarCajaFisicaAction,
    reactivarCajaFisicaAction,
    actualizarPermisoFiscalCajaAction
} from '../../../server/actions/admin.actions';

const NIVEL_ROL = { user: 1, admin: 2, superadmin: 3, developer: 4 };

export default function TabUsuariosCajas({
    datos,
    adminAutenticado,
    cargarTodo,
    setMensaje,
    setError,
    limpiarAlertas
}) {
    // Estado Nuevo Usuario
    const [nuevoUsuarioNombre, setNuevoUsuarioNombre] = useState('');
    const [nuevoUsuarioPin, setNuevoUsuarioPin] = useState('');
    const [nuevoUsuarioRol, setNuevoUsuarioRol] = useState('user');

    // Estado Cambio de PIN
    const [usuarioCambioPin, setUsuarioCambioPin] = useState(null);
    const [pinActualInput, setPinActualInput] = useState('');
    const [nuevoPinInput, setNuevoPinInput] = useState('');

    // Estado Estaciones Físicas de Caja
    const [nuevaCajaFisicaNombre, setNuevaCajaFisicaNombre] = useState('');

    async function handleCrearUsuario(e) {
        e.preventDefault();
        limpiarAlertas?.();
        try {
            const res = await crearUsuarioAction({
                nombre: nuevoUsuarioNombre.trim(),
                pin: nuevoUsuarioPin.trim(),
                rol: nuevoUsuarioRol
            });
            if (!res.ok) throw new Error(res.error || 'Error al crear usuario.');
            setMensaje?.(`Usuario "${nuevoUsuarioNombre}" creado correctamente.`);
            setNuevoUsuarioNombre('');
            setNuevoUsuarioPin('');
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleBorrarUsuario(idBorrar) {
        if (!confirm(`¿Estás seguro de dar de baja lógica al usuario #${idBorrar}?`)) return;
        limpiarAlertas?.();
        try {
            const res = await borrarUsuarioAction(idBorrar);
            if (!res.ok) throw new Error(res.error || 'Error al dar de baja al usuario.');
            setMensaje?.(`Usuario #${idBorrar} dado de baja lógica.`);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function confirmarCambioPassword(e) {
        e.preventDefault();
        if (!usuarioCambioPin) return;
        limpiarAlertas?.();
        try {
            const res = await cambiarPasswordAction({
                usuarioObjetivoId: usuarioCambioPin.id,
                nuevoPin: nuevoPinInput,
                pinActual: Number(usuarioCambioPin.id) === Number(adminAutenticado?.id) ? pinActualInput : null
            });
            if (!res.ok) throw new Error(res.error || 'Error al cambiar la contraseña/PIN.');
            setMensaje?.(`Contraseña / PIN de "${usuarioCambioPin.nombre}" actualizada correctamente.`);
            setUsuarioCambioPin(null);
            setPinActualInput('');
            setNuevoPinInput('');
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleTogglePermisoFiscalUsuario(usuarioObjetivoId, actualHabilitado, nombre) {
        const nuevo = !actualHabilitado;
        limpiarAlertas?.();
        try {
            const res = await actualizarPermisoFiscalUsuarioAction({
                usuarioObjetivoId,
                habilitado: nuevo
            });
            if (!res.ok) throw new Error(res.error || 'Error al actualizar permiso fiscal del usuario.');
            setMensaje?.(`Permiso de registro de respaldo fiscal para "${nombre}" ${nuevo ? 'HABILITADO' : 'DESHABILITADO'}.`);
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
        if (!confirm(`¿Estás seguro de desactivar la estación "${nombre}"? Sus turnos y arqueos históricos se conservarán.`)) return;
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
            if (!res.ok) throw new Error(res.error || 'Error al actualizar permiso fiscal de la estación.');
            setMensaje?.(`Respaldo fiscal en "${nombre}" ${nuevo ? 'HABILITADO' : 'DESHABILITADO'}.`);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1.5rem', alignItems: 'start' }}>
                {/* REGISTRAR NUEVO USUARIO */}
                <section style={cardStyle}>
                    <h3 style={{ marginTop: 0 }}>👥 Registrar Nuevo Usuario</h3>
                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#555' }}>
                        Jerarquía activa: <strong>Super Admin</strong> &gt; <strong>Admin</strong> &gt; <strong>Cajero (user)</strong>.
                    </p>
                    <form onSubmit={handleCrearUsuario} style={formCol}>
                        <input
                            placeholder="Nombre completo o usuario"
                            required
                            value={nuevoUsuarioNombre}
                            onChange={(e) => setNuevoUsuarioNombre(e.target.value)}
                            style={inputStyle}
                        />
                        <input
                            placeholder="PIN o Contraseña inicial"
                            required
                            value={nuevoUsuarioPin}
                            onChange={(e) => setNuevoUsuarioPin(e.target.value)}
                            style={inputStyle}
                        />
                        <select
                            value={nuevoUsuarioRol}
                            onChange={(e) => setNuevoUsuarioRol(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="user">Cajero (user)</option>
                            {(adminAutenticado?.rol === 'superadmin' || adminAutenticado?.rol === 'developer') && (
                                <option value="admin">Administrador (admin) — Exclusivo Super Admin</option>
                            )}
                            {adminAutenticado?.rol === 'developer' && (
                                <option value="superadmin">Super Admin (superadmin) — Exclusivo Developer</option>
                            )}
                        </select>
                        <button type="submit" style={btnPrimario}>Crear Usuario</button>
                    </form>
                </section>

                {/* DIRECTORIO DE USUARIOS */}
                <section style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <h3 style={{ margin: 0 }}>Directorio de Usuarios y Control de PIN</h3>
                        {adminAutenticado?.rol === 'developer' && (
                            <button
                                type="button"
                                onClick={() => {
                                    setUsuarioCambioPin(adminAutenticado);
                                    setPinActualInput('');
                                    setNuevoPinInput('');
                                }}
                                style={{ padding: '0.32rem 0.65rem', background: '#0f172a', color: '#facc15', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                            >
                                💻 Cambiar mi PIN (developer)
                            </button>
                        )}
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {(datos?.usuarios || []).map((u) => {
                            const esMismoUsuario = Number(u.id) === Number(adminAutenticado?.id);
                            const esInferior = NIVEL_ROL[adminAutenticado?.rol || 'user'] > NIVEL_ROL[u.rol || 'user'];
                            const etiquetaRol = u.rol === 'superadmin' ? '👑 SUPER ADMIN' : u.rol === 'admin' ? '🛡️ ADMIN' : '👤 CAJERO';

                            return (
                                <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0', borderBottom: '1px solid #eee', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <div>
                                        <strong>{u.nombre}</strong>{' '}
                                        <span style={{
                                            fontSize: '0.75rem',
                                            padding: '0.15rem 0.45rem',
                                            borderRadius: '4px',
                                            background: u.rol === 'superadmin' ? '#fef3c7' : u.rol === 'admin' ? '#dbeafe' : '#f3f4f6',
                                            color: u.rol === 'superadmin' ? '#92400e' : u.rol === 'admin' ? '#1e40af' : '#374151',
                                            fontWeight: 'bold'
                                        }}>
                                            {etiquetaRol}
                                        </span>{' '}
                                        <small style={{ color: '#6b7280' }}>ID #{u.id}</small>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleTogglePermisoFiscalUsuario(u.id, Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1, u.nombre)}
                                            style={{
                                                padding: '0.3rem 0.55rem',
                                                background: Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1 ? '#dcfce7' : '#f1f5f9',
                                                color: Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1 ? '#166534' : '#64748b',
                                                border: `1px solid ${Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1 ? '#86efac' : '#cbd5e1'}`,
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '0.76rem',
                                                fontWeight: 'bold'
                                            }}
                                            title="Habilitar o deshabilitar que este usuario pueda registrar datos de factura/respaldo en ventas y egresos"
                                        >
                                            🧾 Respaldo Fiscal: {Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1 ? 'SÍ' : 'NO'}
                                        </button>
                                        {(esMismoUsuario || esInferior) ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setUsuarioCambioPin(u);
                                                    setPinActualInput('');
                                                    setNuevoPinInput('');
                                                }}
                                                style={{ padding: '0.32rem 0.65rem', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}
                                            >
                                                {esMismoUsuario ? 'Cambiar mi PIN' : 'Cambiar PIN'}
                                            </button>
                                        ) : (
                                            <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                                                🔒 Rango igual/superior
                                            </span>
                                        )}
                                        {esInferior && (
                                            <button
                                                type="button"
                                                onClick={() => handleBorrarUsuario(u.id)}
                                                style={{ padding: '0.32rem 0.65rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}
                                            >
                                                Dar de baja
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    {/* FORMULARIO DE CAMBIO DE PIN */}
                    {usuarioCambioPin && (
                        <form onSubmit={confirmarCambioPassword} style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <strong>Cambiar PIN / Contraseña de: {usuarioCambioPin.nombre}</strong>
                            {Number(usuarioCambioPin.id) === Number(adminAutenticado?.id) && (
                                <input
                                    type="password"
                                    placeholder="Tu PIN / Contraseña actual"
                                    required
                                    value={pinActualInput}
                                    onChange={(e) => setPinActualInput(e.target.value)}
                                    style={inputStyle}
                                />
                            )}
                            <input
                                type="password"
                                placeholder="Nuevo PIN / Contraseña"
                                required
                                value={nuevoPinInput}
                                onChange={(e) => setNuevoPinInput(e.target.value)}
                                style={inputStyle}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="submit" style={btnPrimario}>Guardar Nuevo PIN</button>
                                <button type="button" onClick={() => setUsuarioCambioPin(null)} style={btnSecundario}>Cancelar</button>
                            </div>
                        </form>
                    )}
                </section>
            </div>

            {/* SECCIÓN ESTACIONES FÍSICAS DE CAJA */}
            <section style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#0f172a' }}>🏢 Estaciones Físicas de Caja (Puntos de Venta)</h3>
                        <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                            Gestiona las estaciones de cobro del local. Se requiere al menos una caja física activa para operar.
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
            </section>
        </div>
    );
}
