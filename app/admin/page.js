'use client';

import { useState, useEffect } from 'react';
import TabResumen from './_components/TabResumen';
import TabTurnosArqueos from './_components/TabTurnosArqueos';
import TabCatalogo from './_components/TabCatalogo';
import TabKardex from './_components/TabKardex';
import TabUsuariosCajas from './_components/TabUsuariosCajas';
import TabConfigFiscal from './_components/TabConfigFiscal';
import TabExportacion from './_components/TabExportacion';

export default function AdminPage() {
    const [cargando, setCargando] = useState(true);
    const [seccionActiva, setSeccionActiva] = useState('arqueos'); // 'arqueos' | 'ventas' | 'catalogo' | 'insumos' | 'usuarios' | 'exportacion' | 'configuracion'

    const [datos, setDatos] = useState({
        configuracionNegocio: null,
        cajasFisicas: [],
        cajasAbiertas: [],
        cajaAbierta: null,
        cajaAuditada: null,
        historialCajas: [],
        estadisticas: null,
        movimientos: [],
        desglosePagos: [],
        productos: [],
        insumos: [],
        usuarios: [],
        prediccionInsumos: [],
        kardexDetallado: { kardexProductosDirectos: [], kardexInsumos: [] }
    });
    const [tendencias, setTendencias] = useState(null);

    // Sesión obligatoria de Administrador
    const [adminAutenticado, setAdminAutenticado] = useState(null);
    const [loginAdminPin, setLoginAdminPin] = useState('');
    const [loginAdminNombreManual, setLoginAdminNombreManual] = useState('');

    // Turno auditado seleccionado
    const [turnoAuditadoId, setTurnoAuditadoId] = useState(null);

    // Mensajes y Alertas Globales
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    function limpiarAlertas() {
        setMensaje(null);
        setError(null);
    }

    async function cargarTodo(cajaAuditadaOpcional = turnoAuditadoId) {
        try {
            setCargando(true);
            const urlCaja = cajaAuditadaOpcional ? `/api/caja?cajaAuditadaId=${cajaAuditadaOpcional}` : '/api/caja';
            const resCaja = await fetch(urlCaja);
            const dataCaja = await resCaja.json();

            if (!resCaja.ok) throw new Error(dataCaja.error || 'Error al consultar /api/caja');

            if (!dataCaja.configuracionNegocio || Number(dataCaja.configuracionNegocio.configurado) === 0 || !dataCaja.sistemaInstalado) {
                window.location.href = '/';
                return;
            }

            setDatos(dataCaja);

            const sesionAdminValida = dataCaja.usuarioSesion && ['admin', 'superadmin', 'developer'].includes(dataCaja.usuarioSesion.rol);
            if (sesionAdminValida) {
                setAdminAutenticado(dataCaja.usuarioSesion);
                const resRep = await fetch('/api/reportes');
                if (resRep.ok) {
                    const dataRep = await resRep.json();
                    setTendencias(dataRep);
                }
            } else {
                setAdminAutenticado(null);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    }

    useEffect(() => {
        cargarTodo();
    }, []);

    // Cierre automático de sesión por inactividad para developer y administradores
    useEffect(() => {
        if (!adminAutenticado) return;

        const MINUTOS_INACTIVIDAD = adminAutenticado.rol === 'developer' ? 15 : 20;
        const TIEMPO_LIMITE_MS = MINUTOS_INACTIVIDAD * 60 * 1000;
        let timerInactividad = null;

        const reiniciarTemporizador = () => {
            if (timerInactividad) clearTimeout(timerInactividad);
            timerInactividad = setTimeout(async () => {
                try {
                    await fetch('/api/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accion: 'logout' })
                    });
                } catch (_) {}
                setAdminAutenticado(null);
                setError(`Tu sesión de ${adminAutenticado.rol} se ha cerrado automáticamente tras ${MINUTOS_INACTIVIDAD} minutos de inactividad por seguridad.`);
            }, TIEMPO_LIMITE_MS);
        };

        const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        eventos.forEach((ev) => window.addEventListener(ev, reiniciarTemporizador, { passive: true }));
        reiniciarTemporizador();

        return () => {
            if (timerInactividad) clearTimeout(timerInactividad);
            eventos.forEach((ev) => window.removeEventListener(ev, reiniciarTemporizador));
        };
    }, [adminAutenticado]);

    async function handleLoginAdmin(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const payload = {
                accion: 'login',
                nombreUsuario: loginAdminNombreManual.trim(),
                pin: loginAdminPin
            };

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (!['admin', 'superadmin', 'developer'].includes(data.usuario.rol)) {
                await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accion: 'logout' })
                }).catch((logoutErr) => {
                    console.error('Error al revocar sesión no autorizada:', logoutErr);
                });
                throw new Error('Acceso denegado: este panel es exclusivo para Administradores y Super Admin.');
            }
            setAdminAutenticado(data.usuario);
            setLoginAdminPin('');
            setLoginAdminNombreManual('');
            await cargarTodo();
        } catch (err) {
            setLoginAdminPin('');
            setError(err.message);
        }
    }

    async function handleLogout() {
        try {
            await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'logout' })
            });
        } catch (err) {
            console.error('Error al cerrar sesión:', err);
        }
        setAdminAutenticado(null);
    }

    async function seleccionarTurnoParaAuditar(cajaId) {
        setTurnoAuditadoId(cajaId);
        await cargarTodo(cajaId);
        setMensaje(`Auditando Turno #${cajaId}. Los indicadores, movimientos y el botón de descarga PDF ahora apuntan a este turno.`);
    }

    if (cargando) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-800" />
                    <p className="text-sm font-medium text-slate-600">Cargando Panel de Administración...</p>
                </div>
            </div>
        );
    }

    // 1. PANTALLA DE LOGIN SI NO HAY SESIÓN ADMINISTRATIVA
    if (!adminAutenticado) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
                <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl">
                    <div className="mb-6 text-center">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white text-xl mb-3 shadow-md">
                            🔐
                        </div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-900">Acceso Administrativo</h2>
                        <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            Ingresa tus credenciales de Administrador para gestionar el negocio.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLoginAdmin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                Usuario
                            </label>
                            <input
                                type="text"
                                placeholder="Nombre de usuario"
                                autoComplete="username"
                                required
                                value={loginAdminNombreManual}
                                onChange={(e) => setLoginAdminNombreManual(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                PIN / Contraseña
                            </label>
                            <input
                                type="password"
                                placeholder="Ingresa tu PIN o contraseña"
                                required
                                value={loginAdminPin}
                                onChange={(e) => setLoginAdminPin(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white shadow hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            Entrar al Panel Admin
                        </button>
                        <a
                            href="/"
                            className="block text-center text-xs font-medium text-slate-500 hover:text-slate-800 pt-2 transition-colors"
                        >
                            &larr; Volver al Inicio
                        </a>
                    </form>
                </div>
            </div>
        );
    }

    const configActual = datos.configuracionNegocio || {
        usa_stock_directo: 1,
        usa_vencimiento: 0,
        usa_recetas_ensamblaje: 0,
        configurado: 0
    };
    const esPrimeraEjecucion = Number(configActual.configurado) === 0;
    const esDeveloper = adminAutenticado?.rol === 'developer';
    const mostrarAsistenteConfig = esDeveloper && (esPrimeraEjecucion || seccionActiva === 'configuracion');
    const usaRecetas = Boolean(configActual.usa_recetas_ensamblaje);

    // Lista de Pestañas para la Navegación Principal
    const pestanas = [
        { id: 'arqueos', label: '1. Arqueos y Cierres', icon: '🏦' },
        { id: 'ventas', label: '2. Ventas y Resumen', icon: '📊' },
        { id: 'catalogo', label: usaRecetas ? '3. Artículos y Ensamblaje' : '3. Catálogo y Stock', icon: '📦' },
        ...(usaRecetas ? [{ id: 'insumos', label: '4. Materiales / Insumos', icon: '🧱' }] : []),
        { id: 'usuarios', label: `${usaRecetas ? '5' : '4'}. Usuarios y Roles`, icon: '👥' },
        { id: 'exportacion', label: `${usaRecetas ? '6' : '5'}. Exportar Reportes`, icon: '📥' },
        ...(esDeveloper ? [{ id: 'configuracion', label: '⚙️ Modalidad', icon: '⚙️' }] : [])
    ];

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-slate-100 text-slate-900 font-sans">
            {/* BARRA LATERAL IZQUIERDA (SIDEBAR) */}
            <aside className="w-full md:w-64 bg-slate-900 text-slate-100 flex-shrink-0 flex flex-col justify-between border-r border-slate-800">
                <div>
                    {/* Header Negocio */}
                    <div className="p-4 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">💼</span>
                            <h2 className="font-bold text-sm tracking-tight text-white truncate">
                                {configActual.nombre_negocio || 'Panel Admin'}
                            </h2>
                        </div>
                        <div className="text-[11px] font-medium text-sky-400 mt-1">
                            {configActual.modalidad_nombre}
                        </div>
                        <div className="text-[11px] mt-1.5">
                            {(datos.cajasAbiertas || []).length > 0 ? (
                                <span className="inline-flex items-center text-emerald-400 font-medium">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                                    {(datos.cajasAbiertas || []).length === 1
                                        ? `Turno #${datos.cajasAbiertas[0].id}`
                                        : `${(datos.cajasAbiertas || []).length} turnos activos`}
                                </span>
                            ) : (
                                <span className="inline-flex items-center text-rose-400 font-medium">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400 mr-1.5" />
                                    Sin turnos abiertos
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Perfil del Operador */}
                    <div className="p-3.5 bg-slate-950/60 border-b border-slate-800 text-xs">
                        <div className="text-slate-400 text-[11px]">Sesión activa:</div>
                        <div className="font-bold text-amber-400 text-sm mt-0.5 flex items-center gap-1.5">
                            <span>{adminAutenticado.rol === 'developer' ? '💻' : adminAutenticado.rol === 'superadmin' ? '👑' : '🛡️'}</span>
                            <span className="truncate">{adminAutenticado.nombre}</span>
                        </div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mt-0.5">
                            Rango: {adminAutenticado.rol}
                        </div>
                        <button
                            onClick={handleLogout}
                            className="mt-2.5 w-full rounded bg-slate-800 hover:bg-slate-700 py-1 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
                        >
                            Cerrar Sesión
                        </button>
                    </div>

                    {/* Menú de Módulos (Sidebar) */}
                    <nav className="p-2 space-y-1" role="tablist" aria-label="Módulos administrativos">
                        {pestanas.map((p) => {
                            const activa = (!esPrimeraEjecucion && seccionActiva === p.id) || (p.id === 'configuracion' && mostrarAsistenteConfig);
                            return (
                                <button
                                    key={p.id}
                                    role="tab"
                                    aria-selected={activa}
                                    onClick={() => {
                                        limpiarAlertas();
                                        setSeccionActiva(p.id);
                                    }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                                        activa
                                            ? 'bg-sky-600 text-white font-semibold shadow-sm'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <span>{p.icon}</span>
                                    <span className="truncate">{p.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Accesos Rápidos Inferiores */}
                <div className="p-3 border-t border-slate-800 space-y-2">
                    <a
                        href="/caja"
                        className="block w-full text-center py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
                    >
                        Punto de Venta POS &rarr;
                    </a>
                    <a
                        href="/"
                        className="block w-full text-center py-1.5 rounded-lg bg-slate-950/40 hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-colors"
                    >
                        Menú Principal
                    </a>
                </div>
            </aside>

            {/* ÁREA PRINCIPAL DERECHA */}
            <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                {/* BARRA SUPERIOR DE PESTAÑAS (SHADCN UI TABS COMPONENT) */}
                <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-10 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                                {seccionActiva === 'arqueos' && 'Control de Arqueos y Cierres de Turno'}
                                {seccionActiva === 'ventas' && 'Resumen Financiero, KPIs y Auditoría'}
                                {seccionActiva === 'catalogo' && (usaRecetas ? 'Artículos y Ensamblaje de Menú' : 'Catálogo y Control de Stock')}
                                {seccionActiva === 'insumos' && 'Kardex de Materiales e Insumos'}
                                {seccionActiva === 'usuarios' && 'Gestión de Cuentas y Permisos'}
                                {seccionActiva === 'exportacion' && 'Exportación de Libros Contables (Excel/PDF/CSV)'}
                                {seccionActiva === 'configuracion' && 'Configuración de Modalidad'}
                            </h1>
                            <p className="text-xs text-slate-500">
                                {configActual.nombre_negocio || 'Panel Admin'} &bull; {configActual.modalidad_nombre}
                            </p>
                        </div>

                        {turnoAuditadoId && (
                            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-800 font-medium self-start sm:self-auto">
                                <span>🎯</span>
                                <span>Turno Auditado: #{turnoAuditadoId}</span>
                            </div>
                        )}
                    </div>

                    {/* Barra de Tabs estilo Shadcn UI con scroll horizontal accesible */}
                    <div className="w-full overflow-x-auto pb-1 pt-1">
                        <div
                            className="inline-flex h-10 items-center justify-start rounded-lg bg-slate-100 p-1 text-slate-600 gap-1 min-w-max border border-slate-200/80 shadow-inner"
                            role="tablist"
                            aria-label="Pestañas de navegación rápida"
                        >
                            {pestanas.map((p) => {
                                const seleccionada = (!esPrimeraEjecucion && seccionActiva === p.id) || (p.id === 'configuracion' && mostrarAsistenteConfig);
                                return (
                                    <button
                                        key={p.id}
                                        role="tab"
                                        aria-selected={seleccionada}
                                        onClick={() => {
                                            limpiarAlertas();
                                            setSeccionActiva(p.id);
                                        }}
                                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${
                                            seleccionada
                                                ? 'bg-white text-slate-950 shadow-xs font-semibold'
                                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                        }`}
                                    >
                                        <span className="mr-1.5">{p.icon}</span>
                                        {p.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </header>

                {/* CONTENIDO DEL MÓDULO */}
                <div className="p-4 sm:p-6 flex-1">
                    {error && (
                        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-800 flex items-start gap-2 shadow-xs">
                            <span className="text-base font-bold leading-none">⚠️</span>
                            <div>
                                <strong className="font-semibold">Error:</strong> {error}
                            </div>
                        </div>
                    )}
                    {mensaje && (
                        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs sm:text-sm text-emerald-800 flex items-start gap-2 shadow-xs">
                            <span className="text-base font-bold leading-none">✅</span>
                            <div>{mensaje}</div>
                        </div>
                    )}

                    {/* MODALIDAD / ASISTENTE INICIAL O CONFIGURACIÓN */}
                    {mostrarAsistenteConfig ? (
                        <TabConfigFiscal
                            datos={datos}
                            esPrimeraEjecucion={esPrimeraEjecucion}
                            onConfiguracionGuardada={() => {
                                if (seccionActiva === 'configuracion') setSeccionActiva('catalogo');
                            }}
                            cargarTodo={cargarTodo}
                            setMensaje={setMensaje}
                            setError={setError}
                            limpiarAlertas={limpiarAlertas}
                        />
                    ) : (
                        <>
                            {/* MÓDULO 1: ARQUEOS Y CIERRES */}
                            {seccionActiva === 'arqueos' && (
                                <TabTurnosArqueos
                                    datos={datos}
                                    seleccionarTurnoParaAuditar={seleccionarTurnoParaAuditar}
                                    cargarTodo={cargarTodo}
                                    setMensaje={setMensaje}
                                    setError={setError}
                                    limpiarAlertas={limpiarAlertas}
                                />
                            )}

                            {/* MÓDULO 2: VENTAS, KPIs Y ANULACIONES */}
                            {seccionActiva === 'ventas' && (
                                <TabResumen
                                    datos={datos}
                                    tendencias={tendencias}
                                    cargarTodo={cargarTodo}
                                    setMensaje={setMensaje}
                                    setError={setError}
                                    limpiarAlertas={limpiarAlertas}
                                />
                            )}

                            {/* MÓDULO 3: CATÁLOGO, STOCK Y ENSAMBLAJE */}
                            {seccionActiva === 'catalogo' && (
                                <TabCatalogo
                                    datos={datos}
                                    cargarTodo={cargarTodo}
                                    setMensaje={setMensaje}
                                    setError={setError}
                                    limpiarAlertas={limpiarAlertas}
                                    setSeccionActiva={setSeccionActiva}
                                />
                            )}

                            {/* MÓDULO 4: MATERIALES / INSUMOS */}
                            {seccionActiva === 'insumos' && usaRecetas && (
                                <TabKardex
                                    datos={datos}
                                    cargarTodo={cargarTodo}
                                    setMensaje={setMensaje}
                                    setError={setError}
                                    limpiarAlertas={limpiarAlertas}
                                />
                            )}

                            {/* MÓDULO 5: USUARIOS, JERARQUÍA Y ROLES */}
                            {seccionActiva === 'usuarios' && (
                                <TabUsuariosCajas
                                    datos={datos}
                                    adminAutenticado={adminAutenticado}
                                    cargarTodo={cargarTodo}
                                    setMensaje={setMensaje}
                                    setError={setError}
                                    limpiarAlertas={limpiarAlertas}
                                />
                            )}

                            {/* MÓDULO 6: EXPORTACIÓN DE REPORTES (EXCEL, PDF, CSV) */}
                            {seccionActiva === 'exportacion' && (
                                <TabExportacion
                                    datos={datos}
                                    adminAutenticado={adminAutenticado}
                                    turnoAuditadoId={turnoAuditadoId}
                                    setTurnoAuditadoId={setTurnoAuditadoId}
                                    cargarTodo={cargarTodo}
                                />
                            )}

                            {/* MÓDULO 7: CONFIGURACIÓN FISCAL Y MODALIDAD */}
                            {seccionActiva === 'configuracion' && (
                                <TabConfigFiscal
                                    datos={datos}
                                    esPrimeraEjecucion={esPrimeraEjecucion}
                                    onConfiguracionGuardada={() => setSeccionActiva('catalogo')}
                                    cargarTodo={cargarTodo}
                                    setMensaje={setMensaje}
                                    setError={setError}
                                    limpiarAlertas={limpiarAlertas}
                                />
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
