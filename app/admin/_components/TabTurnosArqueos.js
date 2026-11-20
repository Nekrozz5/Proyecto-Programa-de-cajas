'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
    Receipt, 
    Building2, 
    Mail, 
    Send, 
    Eye, 
    FileSpreadsheet, 
    RotateCcw, 
    CheckCircle2,
    Smartphone,
    Bike
} from 'lucide-react';
import ModalDetalleMovimiento from './ModalDetalleMovimiento';
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

    // Auditoría de movimientos del turno
    const [movimientoParaDetalle, setMovimientoParaDetalle] = useState(null);

    const cajaAuditada = datos?.cajaAuditada;
    const totalAppsAuditada = (() => {
        const pagosApps = (datos?.desglosePagos || [])
            .filter((p) => p.metodoPago === 'pedidos_ya' || p.metodoPago === 'yango')
            .reduce((acc, p) => acc + Number(p.total || 0), 0);
        if (pagosApps > 0) return pagosApps;

        const movsApps = (datos?.movimientos || [])
            .filter((m) => m.tipo === 'ingreso' && m.estado !== 'anulado' && (
                m.canal_venta === 'pedidos_ya' || m.metodo_pago === 'pedidos_ya' ||
                m.canal_venta === 'yango' || m.metodo_pago === 'yango'
            ))
            .reduce((acc, m) => acc + Number(m.monto || 0), 0);
        if (movsApps > 0) return movsApps;

        return Number(cajaAuditada?.ventas_apps_total || (Number(cajaAuditada?.ventas_pedidos_ya || 0) + Number(cajaAuditada?.ventas_yango || 0)));
    })();

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
            setMensaje?.(res.data?.mensaje || 'Correo de prueba enviado exitosamente.');
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
            setMensaje?.(res.data?.mensaje || 'Reporte de cierre enviado exitosamente por correo.');
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
        <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-5">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 m-0 flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-slate-700" />
                        <span>Auditoría de Cierres y Arqueos por Turno</span>
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 mb-0">
                        Revisa si hubo dinero faltante o sobrante en cada turno cerrado y habilita o reabre turnos cuando sea necesario.
                    </p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setMostrarPanelContable(!mostrarPanelContable)}
                        className={`text-xs font-semibold gap-1.5 ${mostrarPanelContable ? 'bg-sky-100 text-sky-900 hover:bg-sky-200' : ''}`}
                    >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>{mostrarPanelContable ? 'Ocultar Régimen Contable' : 'Régimen Contable / Facturación'}</span>
                    </Button>

                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setMostrarPanelCajasFisicas(!mostrarPanelCajasFisicas)}
                        className="text-xs font-semibold gap-1.5"
                    >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{mostrarPanelCajasFisicas ? 'Ocultar Estaciones' : 'Gestionar Estaciones de Caja'} ({(datos?.cajasFisicas || []).length})</span>
                    </Button>

                    {cajasFisicasDisponibles.length > 0 && (
                        <form onSubmit={handleAbrirNuevoTurnoAdmin} className="flex gap-2 items-center flex-wrap">
                            {cajasFisicasDisponibles.length > 1 && (
                                <select
                                    value={cajaFisicaParaAbrir}
                                    onChange={(e) => setCajaFisicaParaAbrir(e.target.value)}
                                    className="h-8 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs shadow-sm focus:outline-none"
                                >
                                    <option value="">-- Estación --</option>
                                    {cajasFisicasDisponibles.map((cf) => (
                                        <option key={cf.id} value={cf.id}>{cf.nombre}</option>
                                    ))}
                                </select>
                            )}
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={nuevoFondoInicial}
                                onChange={(e) => setNuevoFondoInicial(e.target.value)}
                                placeholder="Fondo inicial Bs"
                                className="h-8 text-xs w-28 bg-white"
                            />
                            <Button type="submit" size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                + Abrir Turno
                            </Button>
                        </form>
                    )}
                </div>
            </div>

            {/* BANNER INFORMATIVO Y DE PRUEBA DE CORREO ELECTRÓNICO */}
            <div className={`p-3.5 rounded-lg border flex justify-between items-center flex-wrap gap-3 ${
                datos?.estadoEmail?.configurado ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
            }`}>
                <div className="flex items-center gap-2.5 text-xs">
                    {datos?.estadoEmail?.configurado ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                        <Mail className="w-5 h-5 text-slate-400 shrink-0" />
                    )}
                    <div>
                        {datos?.estadoEmail?.configurado ? (
                            <>
                                <strong className="text-emerald-800">Notificaciones automáticas por correo activadas:</strong>{' '}
                                <span className="text-slate-700">
                                    Al cerrar cada turno se envía el resumen ejecutivo y el Excel a: <strong>{datos.estadoEmail.destinatarios}</strong>
                                </span>
                            </>
                        ) : (
                            <>
                                <strong className="text-slate-700">Notificaciones automáticas por correo desactivadas:</strong>{' '}
                                <span className="text-slate-500">
                                    Configura <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">SMTP_USER</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">SMTP_PASS</code> y <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">EMAIL_DESTINATARIO_CIERRE</code> en <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">.env.local</code> para recibir el arqueo y Excel automáticamente.
                                </span>
                            </>
                        )}
                    </div>
                </div>
                {datos?.estadoEmail?.configurado && (
                    <Button
                        type="button"
                        size="sm"
                        disabled={enviandoPruebaEmail}
                        onClick={handleProbarEmail}
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                        {enviandoPruebaEmail ? 'Enviando prueba...' : 'Enviar Correo de Prueba'}
                    </Button>
                )}
            </div>

            {/* PANEL DE CONFIGURACIÓN CONTABLE / RÉGIMEN TRIBUTARIO MODULAR */}
            {mostrarPanelContable && (
                <form onSubmit={handleGuardarConfiguracionContable} className="bg-slate-50 border-2 border-sky-600 rounded-lg p-4 flex flex-col gap-3.5">
                    <div>
                        <h4 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-1.5">
                            <Receipt className="w-4 h-4 text-slate-700" />
                            <span>Configuración Contable y Régimen Tributario Modular (Bolivia)</span>
                        </h4>
                        <p className="text-xs text-slate-600 m-0 mt-0.5">
                            Adapta el sistema según el régimen del cliente: <strong>Control Interno / Régimen Simplificado (RTS)</strong> o <strong>Régimen General (Con Facturación IVA / IT)</strong>. Todos los reportes Excel, CSV y PDF se ajustan automáticamente.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <label className="text-xs font-semibold text-slate-800 flex flex-col gap-1">
                            Régimen del Negocio:
                            <select
                                value={cfgRegimenTributario}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setCfgRegimenTributario(val);
                                    setCfgEmiteFactura(val === 'regimen_general');
                                }}
                                className="w-full h-8 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs shadow-sm focus:outline-none"
                            >
                                <option value="simplificado_control_interno">Control Interno / Régimen Simplificado (Sin IVA)</option>
                                <option value="regimen_general">Régimen General (Facturación IVA / IT)</option>
                            </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-800 flex flex-col gap-1">
                            NIT del Establecimiento (Opcional):
                            <Input
                                type="text"
                                placeholder="Ej. 1029384015"
                                value={cfgNitNegocio}
                                onChange={(e) => setCfgNitNegocio(e.target.value)}
                                className="h-8 text-xs bg-white"
                            />
                        </label>
                        {cfgRegimenTributario === 'regimen_general' && (
                            <>
                                <label className="text-xs font-semibold text-slate-800 flex flex-col gap-1">
                                    Alícuota IVA (%):
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={cfgIvaPorcentaje}
                                        onChange={(e) => setCfgIvaPorcentaje(e.target.value)}
                                        className="h-8 text-xs bg-white"
                                    />
                                </label>
                                <label className="text-xs font-semibold text-slate-800 flex flex-col gap-1">
                                    Alícuota IT (%):
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={cfgItPorcentaje}
                                        onChange={(e) => setCfgItPorcentaje(e.target.value)}
                                        className="h-8 text-xs bg-white"
                                    />
                                </label>
                                <label className="text-xs font-semibold text-slate-800 flex flex-col gap-1">
                                    Base Imponible del IT:
                                    <select
                                        value={cfgItBase}
                                        onChange={(e) => setCfgItBase(e.target.value)}
                                        className="w-full h-8 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs shadow-sm focus:outline-none"
                                    >
                                        <option value="todas_las_ventas">Todas las ventas (Facturadas y no facturadas)</option>
                                        <option value="solo_facturadas">Solo ventas formalmente facturadas</option>
                                    </select>
                                </label>
                            </>
                        )}
                    </div>
                    <div className="flex gap-4 flex-wrap items-center pt-1">
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={cfgEmiteFactura}
                                onChange={(e) => setCfgEmiteFactura(e.target.checked)}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>Habilitar emisión de Factura Formal (con NIT/CI y Razón Social)</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={cfgUsaRespaldoComprasEgresos}
                                onChange={(e) => setCfgUsaRespaldoComprasEgresos(e.target.checked)}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>Permitir registrar factura en Compras y Gastos (Crédito Fiscal)</span>
                        </label>
                    </div>
                    <div className="flex gap-2 mt-1">
                        <Button type="submit" size="sm" className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs">
                            Guardar Configuración Contable
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setMostrarPanelContable(false)} className="text-xs">
                            Cerrar
                        </Button>
                    </div>
                </form>
            )}

            {/* PANEL DE GESTIÓN DE ESTACIONES FÍSICAS DE CAJA */}
            {mostrarPanelCajasFisicas && (
                <div className="bg-slate-50 border border-slate-300 rounded-lg p-4">
                    <div className="flex justify-between items-center flex-wrap gap-3 mb-3">
                        <div>
                            <h4 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-1.5">
                                <Building2 className="w-4 h-4 text-slate-700" />
                                <span>Estaciones Físicas de Caja (Puntos de Venta)</span>
                            </h4>
                            <p className="text-xs text-slate-500 m-0 mt-0.5">
                                Define las terminales físicas del negocio. Puedes agregar nuevas o desactivar las que no uses (mínimo 1 activa requerida).
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
                                    className={`rounded-lg p-3 flex flex-col gap-2 border transition-all ${
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
                                            <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                                                <span>Turno #{cf.turno_abierto_id} en curso ({cf.operador_abierto || 'Cajero'})</span>
                                            </span>
                                        ) : (
                                            <span className="text-slate-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                                                <span>Sin turno abierto actualmente</span>
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex gap-1.5 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => handleTogglePermisoFiscalCaja(cf.id, Number(cf.habilita_respaldo_fiscal ?? 1) === 1, cf.nombre)}
                                            className={`text-[11px] px-2 py-0.5 rounded font-semibold border transition-colors ${
                                                Number(cf.habilita_respaldo_fiscal ?? 1) === 1
                                                    ? 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100'
                                                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                            }`}
                                            title="Habilitar o deshabilitar el registro de factura/respaldo en ventas y egresos de esta estación"
                                        >
                                            Respaldo Fiscal: {Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? 'SÍ' : 'NO'}
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
                </div>
            )}

            {/* TARJETA INFORMATIVA DIFERENCIADA DE VENTAS POR APPS DE COMIDA */}
            {cajaAuditada && (
                <div className="p-3.5 rounded-lg border border-purple-200 bg-purple-50 flex justify-between items-center flex-wrap gap-3">
                    <div className="flex items-center gap-2.5 text-xs">
                        <Smartphone className="w-5 h-5 text-purple-600 shrink-0" />
                        <div>
                            <span className="font-bold text-purple-950 text-sm">
                                Turno #{cajaAuditada.id} ({cajaAuditada.caja_fisica_nombre || 'Caja Principal'}) — Ventas por Apps (PedidosYa / Yango): Bs {totalAppsAuditada.toFixed(2)}
                            </span>
                            <div className="text-purple-700 text-xs mt-0.5">
                                Cobro liquidado externamente (no afecta arqueo en efectivo).
                            </div>
                        </div>
                    </div>
                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300 font-semibold text-xs">
                        Plataformas Externas
                    </Badge>
                </div>
            )}

            {/* TABLA HISTORIAL DE TURNOS DE CAJA */}
            {(datos?.historialCajas || []).length === 0 ? (
                <p className="text-slate-500 text-sm">Aún no se ha abierto ni cerrado ningún turno de caja.</p>
            ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50">
                                <TableHead className="font-bold text-slate-900">N° Turno</TableHead>
                                <TableHead className="font-bold text-slate-900">Estación / Caja</TableHead>
                                <TableHead className="font-bold text-slate-900">Abierta por</TableHead>
                                <TableHead className="font-bold text-slate-900">Estado</TableHead>
                                <TableHead className="font-bold text-slate-900">Fondo Inicial</TableHead>
                                <TableHead className="font-bold text-slate-900">Efectivo Esperado</TableHead>
                                <TableHead className="font-bold text-slate-900">Efectivo Real Contado</TableHead>
                                <TableHead className="font-bold text-slate-900">Resultado / Diferencia</TableHead>
                                <TableHead className="font-bold text-slate-900">Total QR</TableHead>
                                <TableHead className="font-bold text-slate-900">Acción Admin</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(datos?.historialCajas || []).map((c) => {
                                const dif = c.diferencia_efectivo !== null && c.diferencia_efectivo !== undefined ? Number(c.diferencia_efectivo) : null;
                                let badgeDiferencia = (
                                    <Badge variant="outline" className="bg-slate-50 text-slate-600 font-medium">
                                        En curso (Abierto)
                                    </Badge>
                                );

                                if (c.estado === 'cerrada' && dif !== null) {
                                    if (dif < 0) {
                                        badgeDiferencia = (
                                            <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100 border border-red-300 font-bold">
                                                Faltante: Bs {dif.toFixed(2)}
                                            </Badge>
                                        );
                                    } else if (dif > 0) {
                                        badgeDiferencia = (
                                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border border-blue-300 font-bold">
                                                Sobrante: +Bs {dif.toFixed(2)}
                                            </Badge>
                                        );
                                    } else {
                                        badgeDiferencia = (
                                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 font-bold">
                                                Cuadre exacto (Bs 0.00)
                                            </Badge>
                                        );
                                    }
                                }

                                return (
                                    <TableRow key={c.id}>
                                        <TableCell className="font-bold text-slate-900">Turno #{c.id}</TableCell>
                                        <TableCell>
                                            <span className="font-semibold text-sky-700">{c.caja_fisica_nombre || 'Caja Principal'}</span>
                                        </TableCell>
                                        <TableCell>{c.usuario_nombre || `Usuario #${c.usuario_id}`}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1 items-start">
                                                {c.estado === 'abierta' ? (
                                                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 font-bold text-[11px]">
                                                        ABIERTA
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-bold text-[11px]">
                                                        CERRADA
                                                    </Badge>
                                                )}
                                                {Number(c.veces_reabierta) > 0 && (
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-bold text-[10px]">
                                                        Reabierto ({c.veces_reabierta} {Number(c.veces_reabierta) === 1 ? 'vez' : 'veces'})
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>Bs {Number(c.monto_inicial).toFixed(2)}</TableCell>
                                        <TableCell>
                                            {c.efectivo_esperado !== null ? `Bs ${Number(c.efectivo_esperado).toFixed(2)}` : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {c.efectivo_real !== null ? <strong>Bs {Number(c.efectivo_real).toFixed(2)}</strong> : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                {badgeDiferencia}
                                                {c.historial_reaperturas && (
                                                    <div className="mt-1 text-xs text-amber-900 bg-amber-50 p-1.5 rounded border-l-2 border-amber-500">
                                                        <strong>Historial:</strong> {c.historial_reaperturas}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-semibold text-slate-800">Bs {Number(c.qr_esperado || 0).toFixed(2)}</div>
                                            {Number(datos?.cajaAuditada?.id) === Number(c.id) && totalAppsAuditada > 0 && (
                                                <span className="text-[11px] text-purple-700 font-bold block" title="Cobro liquidado externamente (no afecta arqueo en efectivo)">
                                                    Apps: Bs {totalAppsAuditada.toFixed(2)}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1.5 min-w-[170px]">
                                                <div className="flex gap-1.5 flex-wrap">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={Number(datos?.cajaAuditada?.id) === Number(c.id) ? "default" : "secondary"}
                                                        onClick={() => seleccionarTurnoParaAuditar?.(c.id)}
                                                        className="h-7 text-xs font-semibold gap-1"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        <span>{Number(datos?.cajaAuditada?.id) === Number(c.id) ? 'Auditando' : 'Auditar / PDF'}</span>
                                                    </Button>
                                                    <a
                                                        href={`/api/reportes?formato=xlsx&cajaId=${c.id}`}
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                                                    >
                                                        <FileSpreadsheet className="w-3.5 h-3.5" />
                                                        <span>Excel</span>
                                                    </a>
                                                </div>
                                                {c.estado === 'cerrada' && !datos?.cajaAbierta && (
                                                    cajaAReabrirId === c.id ? (
                                                        <div className="flex flex-col gap-1.5 min-w-[200px] mt-1">
                                                            <Input
                                                                type="text"
                                                                placeholder="Motivo de reapertura..."
                                                                value={motivoReapertura}
                                                                onChange={(e) => setMotivoReapertura(e.target.value)}
                                                                className="h-7 text-xs bg-white"
                                                            />
                                                            <div className="flex gap-1.5">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    onClick={() => confirmarReabrirCaja(c.id)}
                                                                    className="h-6 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                                                >
                                                                    Confirmar
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="secondary"
                                                                    onClick={() => setCajaAReabrirId(null)}
                                                                    className="h-6 text-xs"
                                                                >
                                                                    Cancelar
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => {
                                                                setCajaAReabrirId(c.id);
                                                                setMotivoReapertura('Reconteo / Corrección de cierre');
                                                            }}
                                                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold self-start"
                                                        >
                                                            Reabrir este Turno
                                                        </Button>
                                                    )
                                                )}
                                                {c.estado === 'cerrada' && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={enviandoEmailCajaId === c.id}
                                                        onClick={() => handleReenviarEmailCierre(c.id)}
                                                        className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-semibold self-start gap-1"
                                                    >
                                                        <Mail className="w-3.5 h-3.5" />
                                                        <span>{enviandoEmailCajaId === c.id ? 'Enviando...' : 'Enviar por Correo'}</span>
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* AUDITORÍA FISCAL Y DE MOVIMIENTOS DEL TURNO SELECCIONADO */}
            {cajaAuditada && (
                <div className="mt-4 border-t border-slate-200 pt-5 flex flex-col gap-3">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                        <div>
                            <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-sky-600" />
                                <span>Movimientos y Trazabilidad Fiscal - Turno #{cajaAuditada.id} ({cajaAuditada.caja_fisica_nombre || 'Caja Principal'})</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5 mb-0">
                                Inspección fiscal y comprobación de ingresos a caja física de cada venta y despacho registrado en este turno.
                            </p>
                        </div>
                        <Badge variant="outline" className="text-xs font-semibold">
                            {(datos?.movimientos || []).length} movimiento{(datos?.movimientos || []).length !== 1 ? 's' : ''} auditado{(datos?.movimientos || []).length !== 1 ? 's' : ''}
                        </Badge>
                    </div>

                    {!(datos?.movimientos || []).length ? (
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center text-xs text-slate-500">
                            No hay movimientos registrados en este turno.
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="text-xs font-semibold">ID</TableHead>
                                        <TableHead className="text-xs font-semibold">Fecha/Hora</TableHead>
                                        <TableHead className="text-xs font-semibold">Operador</TableHead>
                                        <TableHead className="text-xs font-semibold">Canal / Despacho</TableHead>
                                        <TableHead className="text-xs font-semibold">Documento / Fiscal</TableHead>
                                        <TableHead className="text-xs font-semibold">Pago / Monto</TableHead>
                                        <TableHead className="text-xs font-semibold">Estado</TableHead>
                                        <TableHead className="text-xs font-semibold text-center">Auditoría</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(datos?.movimientos || []).map((m) => (
                                        <TableRow key={m.id} className="hover:bg-slate-50/70">
                                            <TableCell className="font-mono text-xs text-slate-700">#{m.id}</TableCell>
                                            <TableCell className="text-xs text-slate-600 whitespace-nowrap">{m.fecha_hora}</TableCell>
                                            <TableCell className="text-xs font-medium text-slate-900">{m.usuario_nombre || `Usuario #${m.usuario_id}`}</TableCell>
                                            <TableCell className="text-xs">
                                                {m.canal_venta === 'mototaxi' ? (
                                                    <Badge className="bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] flex items-center gap-1 w-fit">
                                                        <Bike className="w-3 h-3" />
                                                        <span>Despacho Mototaxi</span>
                                                    </Badge>
                                                ) : m.canal_venta === 'pedidos_ya' ? (
                                                    <Badge className="bg-red-100 text-red-900 border-red-300 text-[10px]">PedidosYa</Badge>
                                                ) : m.canal_venta === 'yango' ? (
                                                    <Badge className="bg-yellow-100 text-yellow-900 border-yellow-300 text-[10px]">Yango</Badge>
                                                ) : (
                                                    <span className="text-slate-600">Local</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-700">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-800">
                                                        {m.tipo_comprobante === 'factura' ? 'Factura' : 'Recibo'} {m.nro_factura ? `#${m.nro_factura}` : '(S/N)'}
                                                    </span>
                                                    {Number(m.iva_monto || 0) > 0 && (
                                                        <span className="text-[10px] text-slate-500">
                                                            IVA: Bs {Number(m.iva_monto).toFixed(2)} | IT: Bs {Number(m.it_monto || 0).toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                <div className="flex flex-col">
                                                    <strong className="text-slate-900">Bs {Number(m.monto).toFixed(2)}</strong>
                                                    <span className="text-[10px] text-slate-500 uppercase">{m.metodo_pago}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {m.estado === 'anulado' ? (
                                                    <Badge variant="destructive" className="text-[10px]">Anulado</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px] font-semibold">Completado</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs text-center">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setMovimientoParaDetalle(m)}
                                                    className="h-7 text-xs font-semibold text-sky-700 border-sky-300 hover:bg-sky-50 gap-1"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    <span>Inspeccionar</span>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            )}

            {/* MODAL DE AUDITORÍA Y DETALLE DE MOVIMIENTO */}
            <ModalDetalleMovimiento
                movimiento={movimientoParaDetalle}
                isOpen={Boolean(movimientoParaDetalle)}
                onClose={() => setMovimientoParaDetalle(null)}
            />
        </section>
    );
}
