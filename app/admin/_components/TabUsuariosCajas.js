'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';
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

const NIVEL_ROL = { user: 1, admin: 2, propietario: 3, developer: 4 };

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
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* REGISTRAR NUEVO USUARIO */}
                <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-900 mt-0 mb-1">Registrar Nuevo Usuario</h3>
                    <p className="text-xs text-slate-600 mb-4">
                        Jerarquía activa: <strong>Propietario(a)</strong> &gt; <strong>Administrador</strong> &gt; <strong>Cajero</strong>.
                    </p>
                    <form onSubmit={handleCrearUsuario} className="flex flex-col gap-3">
                        <Input
                            placeholder="Nombre completo o usuario"
                            required
                            value={nuevoUsuarioNombre}
                            onChange={(e) => setNuevoUsuarioNombre(e.target.value)}
                            className="bg-white"
                        />
                        <PasswordInput
                            placeholder="PIN o Contraseña inicial"
                            required
                            value={nuevoUsuarioPin}
                            onChange={(e) => setNuevoUsuarioPin(e.target.value)}
                            className="bg-white"
                        />
                        <select
                            value={nuevoUsuarioRol}
                            onChange={(e) => setNuevoUsuarioRol(e.target.value)}
                            className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-950"
                        >
                            <option value="user">Cajero</option>
                            {(adminAutenticado?.rol === 'propietario' || adminAutenticado?.rol === 'developer') && (
                                <option value="admin">Administrador — Exclusivo Propietario(a)</option>
                            )}
                            {adminAutenticado?.rol === 'developer' && (
                                <option value="propietario">Propietario(a) — Exclusivo Desarrollador</option>
                            )}
                        </select>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold mt-1">
                            Crear Usuario
                        </Button>
                    </form>
                </section>

                {/* DIRECTORIO DE USUARIOS */}
                <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
                        <h3 className="text-lg font-bold text-slate-900 m-0">Directorio de Usuarios y Control de PIN</h3>
                        {adminAutenticado?.rol === 'developer' && (
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                    setUsuarioCambioPin(adminAutenticado);
                                    setPinActualInput('');
                                    setNuevoPinInput('');
                                }}
                                className="h-8 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 font-bold text-xs"
                            >
                                Cambiar mi PIN (Desarrollador)
                            </Button>
                        )}
                    </div>
                    <ul className="list-none p-0 m-0 divide-y divide-slate-100">
                        {(datos?.usuarios || []).map((u) => {
                            const esMismoUsuario = Number(u.id) === Number(adminAutenticado?.id);
                            const esInferior = NIVEL_ROL[adminAutenticado?.rol || 'user'] > NIVEL_ROL[u.rol || 'user'];
                            const rolBadge = u.rol === 'propietario' ? (
                                <Badge className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-100 font-bold text-[11px]">
                                    PROPIETARIO(A)
                                </Badge>
                            ) : u.rol === 'admin' ? (
                                <Badge className="bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-100 font-bold text-[11px]">
                                    ADMINISTRADOR
                                </Badge>
                            ) : u.rol === 'developer' ? (
                                <Badge className="bg-slate-900 text-amber-400 border border-slate-700 hover:bg-slate-900 font-bold text-[11px]">
                                    DESARROLLADOR
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px]">
                                    CAJERO
                                </Badge>
                            );

                            return (
                                <li key={u.id} className="flex justify-between items-center py-3 flex-wrap gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <strong className="text-sm text-slate-900">{u.nombre}</strong>
                                        {rolBadge}
                                        <small className="text-slate-400 text-xs">ID #{u.id}</small>
                                    </div>
                                    <div className="flex gap-1.5 items-center flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => handleTogglePermisoFiscalUsuario(u.id, Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1, u.nombre)}
                                            className={`px-2 py-1 rounded text-xs font-semibold border transition-colors ${
                                                Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                            }`}
                                            title="Habilitar o deshabilitar que este usuario pueda registrar datos de factura/respaldo en ventas y egresos"
                                        >
                                            Respaldo: {Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1 ? 'SÍ' : 'NO'}
                                        </button>
                                        {(esMismoUsuario || esInferior) ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setUsuarioCambioPin(u);
                                                    setPinActualInput('');
                                                    setNuevoPinInput('');
                                                }}
                                                className="h-7 text-xs border-sky-300 text-sky-700 hover:bg-sky-50"
                                            >
                                                {esMismoUsuario ? 'Cambiar mi PIN' : 'Cambiar PIN'}
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">
                                                Rango igual o superior
                                            </span>
                                        )}
                                        {esInferior && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => handleBorrarUsuario(u.id)}
                                                className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white font-medium px-2.5 shadow-sm transition-colors"
                                            >
                                                Dar de baja
                                            </Button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    {/* FORMULARIO DE CAMBIO DE PIN */}
                    {usuarioCambioPin && (
                        <form onSubmit={confirmarCambioPassword} className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-300 flex flex-col gap-2.5">
                            <strong className="text-xs text-slate-800">Cambiar PIN / Contraseña de: {usuarioCambioPin.nombre}</strong>
                            {Number(usuarioCambioPin.id) === Number(adminAutenticado?.id) && (
                                <PasswordInput
                                    placeholder="Tu PIN / Contraseña actual"
                                    required
                                    value={pinActualInput}
                                    onChange={(e) => setPinActualInput(e.target.value)}
                                    className="bg-white h-9"
                                />
                            )}
                            <PasswordInput
                                placeholder="Nuevo PIN / Contraseña"
                                required
                                value={nuevoPinInput}
                                onChange={(e) => setNuevoPinInput(e.target.value)}
                                className="bg-white h-9"
                            />
                            <div className="flex gap-2 mt-1">
                                <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                    Guardar Nuevo PIN
                                </Button>
                                <Button type="button" size="sm" variant="secondary" onClick={() => setUsuarioCambioPin(null)}>
                                    Cancelar
                                </Button>
                            </div>
                        </form>
                    )}
                </section>
            </div>

            {/* SECCIÓN ESTACIONES FÍSICAS DE CAJA */}
            <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center flex-wrap gap-3 mb-3">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 m-0">Estaciones Físicas de Caja (Puntos de Venta)</h3>
                        <p className="text-xs text-slate-500 m-0 mt-0.5">
                            Gestiona las estaciones de cobro del local. Se requiere al menos una caja física activa para operar.
                        </p>
                    </div>
                    <form onSubmit={handleCrearCajaFisica} className="flex gap-2 items-center">
                        <Input
                            type="text"
                            value={nuevaCajaFisicaNombre}
                            onChange={(e) => setNuevaCajaFisicaNombre(e.target.value)}
                            placeholder="ej. Caja 2 - Barra"
                            className="h-8 text-xs min-w-[170px] bg-white"
                        />
                        <Button type="submit" size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold">
                            + Crear Caja
                        </Button>
                    </form>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {(datos?.cajasFisicas || []).map((cf) => {
                        const esActiva = Number(cf.activa) === 1;
                        const totalActivas = (datos?.cajasFisicas || []).filter((c) => Number(c.activa) === 1).length;
                        const tieneTurno = Boolean(cf.turno_abierto_id);

                        return (
                            <div
                                key={cf.id}
                                className={`rounded-lg p-3.5 flex flex-col gap-2 border transition-all ${
                                    esActiva ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-100 border-slate-300 opacity-70'
                                }`}
                            >
                                <div className="flex justify-between items-center">
                                    <strong className="text-sm text-slate-900">{cf.nombre}</strong>
                                    {esActiva ? (
                                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold">
                                            ACTIVA
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="text-[10px] font-bold">
                                            INACTIVA
                                        </Badge>
                                    )}
                                </div>
                                <div className="text-xs text-slate-600">
                                    {tieneTurno ? (
                                        <span className="text-emerald-700 font-semibold inline-flex items-center">
                                            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block mr-1.5" />
                                            Turno #{cf.turno_abierto_id} en curso ({cf.operador_abierto || 'Cajero'})
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center text-slate-500">
                                            <span className="h-2 w-2 rounded-full bg-slate-300 inline-block mr-1.5" />
                                            Sin turno abierto actualmente
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 flex gap-1.5 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => handleTogglePermisoFiscalCaja(cf.id, Number(cf.habilita_respaldo_fiscal ?? 1) === 1, cf.nombre)}
                                        className={`text-[11px] px-2 py-1 rounded font-semibold border transition-colors ${
                                            Number(cf.habilita_respaldo_fiscal ?? 1) === 1
                                                ? 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100'
                                                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                        }`}
                                        title="Habilitar o deshabilitar el registro de factura/respaldo en ventas y egresos de esta estación"
                                    >
                                        Respaldo: {Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? 'SÍ' : 'NO'}
                                    </button>
                                    {esActiva ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            disabled={totalActivas <= 1 || tieneTurno}
                                            onClick={() => handleDesactivarCajaFisica(cf.id, cf.nombre)}
                                            title={totalActivas <= 1 ? 'El sistema debe mantener al menos 1 caja activa' : tieneTurno ? 'Cierra el turno antes de desactivarla' : 'Desactivar esta caja'}
                                            className="h-6 text-[11px] px-2 bg-red-100 text-red-800 border border-red-200 hover:bg-red-200 disabled:opacity-50"
                                        >
                                            {totalActivas <= 1 ? 'Mínimo 1' : tieneTurno ? 'En curso' : 'Desactivar'}
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => handleReactivarCajaFisica(cf.id, cf.nombre)}
                                            className="h-6 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                        >
                                            Reactivar
                                        </Button>
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
