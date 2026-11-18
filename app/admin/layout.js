'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminProvider, useAdmin } from './_context/AdminContext';
import { PasswordInput } from '@/components/ui/password-input';
import { 
    Lock, 
    Landmark, 
    BarChart3, 
    Package, 
    Layers, 
    Users, 
    Download, 
    Settings, 
    Briefcase, 
    X, 
    Pin, 
    Crosshair, 
    ShoppingCart, 
    AlertCircle, 
    CheckCircle2, 
    Folder 
} from 'lucide-react';

function AdminShell({ children }) {
    const pathname = usePathname();
    const {
        datos,
        cargando,
        adminAutenticado,
        setAdminAutenticado,
        turnoAuditadoId,
        cargarTodo,
        mensaje,
        error,
        setError,
        limpiarAlertas,
        handleLogout
    } = useAdmin();

    // Estado del formulario de Login Administrativo
    const [loginAdminPin, setLoginAdminPin] = useState('');
    const [loginAdminNombreManual, setLoginAdminNombreManual] = useState('');

    // Control de Barra Lateral Desplegable (Drawer) con Auto-Ocultado por Inactividad
    const [sidebarAbierto, setSidebarAbierto] = useState(false);
    const [sidebarFijado, setSidebarFijado] = useState(false);
    const timerCierreSidebarRef = useRef(null);

    const reiniciarTimerCierreAuto = () => {
        if (timerCierreSidebarRef.current) {
            clearTimeout(timerCierreSidebarRef.current);
        }
        if (sidebarAbierto && !sidebarFijado) {
            timerCierreSidebarRef.current = setTimeout(() => {
                setSidebarAbierto(false);
            }, 4500);
        }
    };

    const abrirSidebar = () => {
        setSidebarAbierto(true);
    };

    const cerrarSidebar = () => {
        if (timerCierreSidebarRef.current) {
            clearTimeout(timerCierreSidebarRef.current);
        }
        setSidebarAbierto(false);
    };

    useEffect(() => {
        if (sidebarAbierto && !sidebarFijado) {
            reiniciarTimerCierreAuto();
        } else if (timerCierreSidebarRef.current) {
            clearTimeout(timerCierreSidebarRef.current);
        }
        return () => {
            if (timerCierreSidebarRef.current) {
                clearTimeout(timerCierreSidebarRef.current);
            }
        };
    }, [sidebarAbierto, sidebarFijado]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && sidebarAbierto) {
                cerrarSidebar();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [sidebarAbierto]);

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
                throw new Error('Acceso denegado: este panel es exclusivo para Administradores y Propietarios.');
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
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white mb-3 shadow-md">
                            <Lock className="w-6 h-6" />
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
                            <PasswordInput
                                placeholder="Ingresa tu PIN o contraseña"
                                required
                                value={loginAdminPin}
                                onChange={(e) => setLoginAdminPin(e.target.value)}
                                className="h-10 border-slate-300 px-3.5 text-sm text-slate-900 placeholder-slate-400 focus-visible:ring-slate-800 focus-visible:border-slate-800"
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
    const esDeveloper = adminAutenticado?.rol === 'developer';
    const usaRecetas = Boolean(configActual.usa_recetas_ensamblaje);

    // Lista de Pestañas y Enlaces para Navegación
    const pestanas = [
        { id: 'arqueos', href: '/admin/arqueos', label: '1. Arqueos y Cierres', Icon: Landmark, titulo: 'Control de Arqueos y Cierres de Turno' },
        { id: 'resumen', href: '/admin/resumen', label: '2. Ventas y Resumen', Icon: BarChart3, titulo: 'Resumen Financiero, KPIs y Auditoría' },
        { id: 'catalogo', href: '/admin/catalogo', label: usaRecetas ? '3. Artículos y Ensamblaje' : '3. Catálogo y Stock', Icon: Package, titulo: usaRecetas ? 'Artículos y Ensamblaje de Menú' : 'Catálogo y Control de Stock' },
        ...(usaRecetas ? [{ id: 'insumos', href: '/admin/insumos', label: '4. Materiales / Insumos', Icon: Layers, titulo: 'Kardex de Materiales e Insumos' }] : []),
        { id: 'usuarios', href: '/admin/usuarios', label: `${usaRecetas ? '5' : '4'}. Usuarios y Roles`, Icon: Users, titulo: 'Gestión de Cuentas y Permisos' },
        { id: 'exportacion', href: '/admin/exportacion', label: `${usaRecetas ? '6' : '5'}. Exportar Reportes`, Icon: Download, titulo: 'Exportación de Libros Contables (Excel/PDF/CSV)' },
        ...(esDeveloper ? [{ id: 'configuracion', href: '/admin/configuracion', label: 'Modalidad', Icon: Settings, titulo: 'Configuración de Modalidad' }] : [])
    ];

    const pestanaActiva = pestanas.find((p) => pathname === p.href || pathname.startsWith(p.href + '/')) || pestanas[0];

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 font-sans relative flex flex-col">
            {/* BACKDROP SEMITRANSPARENTE */}
            {sidebarAbierto && (
                <div
                    onClick={cerrarSidebar}
                    className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-40 transition-opacity duration-300"
                    aria-hidden="true"
                />
            )}

            {/* BARRA LATERAL IZQUIERDA (DRAWER RETRÁCTIL CON AUTO-OCULTADO INTELIGENTE) */}
            <aside
                onMouseMove={reiniciarTimerCierreAuto}
                onMouseEnter={reiniciarTimerCierreAuto}
                onTouchStart={reiniciarTimerCierreAuto}
                onKeyDown={reiniciarTimerCierreAuto}
                className={`fixed top-0 bottom-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-900 text-slate-100 flex flex-col justify-between shadow-2xl border-r border-slate-800 transition-transform duration-300 ease-in-out ${
                    sidebarAbierto ? 'translate-x-0' : '-translate-x-full pointer-events-none'
                }`}
                aria-label="Menú principal de administración"
            >
                <div className="flex flex-col flex-1 min-h-0">
                    {/* Header del Negocio y Botón Cerrar */}
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-sky-400 shrink-0" />
                                <h2 className="font-bold text-sm tracking-tight text-white truncate">
                                    {configActual.nombre_negocio || 'Panel Admin'}
                                </h2>
                            </div>
                            <div className="text-[11px] font-medium text-sky-400 mt-0.5 truncate">
                                {configActual.modalidad_nombre}
                            </div>
                            <div className="text-[11px] mt-1">
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
                        <button
                            type="button"
                            onClick={cerrarSidebar}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                            title="Cerrar menú (Esc)"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Indicador de Auto-Ocultado e Interruptor de Fijar */}
                    <div className="px-3.5 py-1.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${sidebarFijado ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                            {sidebarFijado ? 'Fijo en pantalla' : 'Auto-ocultado (4s)'}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setSidebarFijado(!sidebarFijado);
                                if (sidebarFijado) {
                                    reiniciarTimerCierreAuto();
                                } else if (timerCierreSidebarRef.current) {
                                    clearTimeout(timerCierreSidebarRef.current);
                                }
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                                sidebarFijado
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                            title={sidebarFijado ? 'Cambiar a modo auto-ocultable' : 'Fijar para que no se cierre solo'}
                        >
                            <Pin className="w-3 h-3" />
                            <span>{sidebarFijado ? 'Fijado' : 'Fijar'}</span>
                        </button>
                    </div>

                    {/* Perfil del Operador */}
                    <div className="p-3 bg-slate-950/50 border-b border-slate-800 text-xs">
                        <div className="text-slate-400 text-[11px]">Sesión activa:</div>
                        <div className="font-bold text-amber-400 text-sm mt-0.5 flex items-center gap-1.5">
                            <span className="truncate">{adminAutenticado.nombre}</span>
                        </div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mt-0.5">
                            Rango: {adminAutenticado.rol === 'superadmin' ? 'Propietario' : adminAutenticado.rol === 'admin' ? 'Administrador' : adminAutenticado.rol === 'developer' ? 'Desarrollador' : 'Cajero'}
                        </div>
                        <button
                            onClick={handleLogout}
                            className="mt-2 w-full rounded bg-slate-800 hover:bg-slate-700 py-1 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
                        >
                            Cerrar Sesión
                        </button>
                    </div>

                    {/* Menú de Módulos (Sidebar Links) */}
                    <nav className="p-2 space-y-1 overflow-y-auto flex-1" role="tablist" aria-label="Módulos administrativos">
                        {pestanas.map((p) => {
                            const activa = pathname === p.href || pathname.startsWith(p.href + '/');
                            const IconComponent = p.Icon;
                            return (
                                <Link
                                    key={p.id}
                                    href={p.href}
                                    onClick={() => {
                                        limpiarAlertas();
                                        if (!sidebarFijado) {
                                            cerrarSidebar();
                                        }
                                    }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                                        activa
                                            ? 'bg-sky-600 text-white font-semibold shadow-sm'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    {IconComponent && <IconComponent className={`w-4 h-4 shrink-0 ${activa ? 'text-white' : 'text-slate-400'}`} />}
                                    <span className="truncate">{p.label}</span>
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* Accesos Rápidos Inferiores */}
                <div className="p-3 border-t border-slate-800 space-y-2 shrink-0">
                    <a
                        href="/caja"
                        className="block w-full text-center py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition-colors"
                    >
                        Punto de Venta POS &rarr;
                    </a>
                    <a
                        href="/"
                        className="block w-full text-center py-1.5 rounded-lg bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-colors"
                    >
                        Menú Principal
                    </a>
                </div>
            </aside>

            {/* ÁREA PRINCIPAL DERECHA */}
            <main className="flex-1 flex flex-col min-w-0 w-full overflow-y-auto">
                {/* BARRA SUPERIOR LIMPIA CON BOTÓN DE MENÚ (3 LÍNEAS) */}
                <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sticky top-0 z-30 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <button
                                type="button"
                                onClick={abrirSidebar}
                                aria-label="Abrir menú de navegación"
                                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors border border-slate-300 shadow-xs cursor-pointer group shrink-0"
                                title="Abrir menú lateral (3 líneas)"
                            >
                                <span className="flex flex-col gap-1 w-4 h-3.5 justify-center items-center">
                                    <span className="w-4 h-0.5 bg-slate-700 rounded-full group-hover:bg-slate-900 transition-colors" />
                                    <span className="w-4 h-0.5 bg-slate-700 rounded-full group-hover:bg-slate-900 transition-colors" />
                                    <span className="w-4 h-0.5 bg-slate-700 rounded-full group-hover:bg-slate-900 transition-colors" />
                                </span>
                                <span className="text-xs font-semibold text-slate-800 hidden sm:inline">Menú</span>
                            </button>

                            {/* Título del módulo activo */}
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="shrink-0">
                                        {pestanaActiva?.Icon ? (
                                            <pestanaActiva.Icon className="w-5 h-5 text-slate-700" />
                                        ) : (
                                            <Folder className="w-5 h-5 text-slate-700" />
                                        )}
                                    </span>
                                    <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight truncate">
                                        {pestanaActiva?.titulo || 'Panel de Administración'}
                                    </h1>
                                </div>
                                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
                                    {configActual.nombre_negocio || 'Panel Admin'} &bull; {configActual.modalidad_nombre}
                                </p>
                            </div>
                        </div>

                        {/* Accesos e Indicadores Rápidos */}
                        <div className="flex items-center gap-2 shrink-0">
                            {turnoAuditadoId && (
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs text-sky-800 font-medium">
                                    <Crosshair className="w-3.5 h-3.5 text-sky-700" />
                                    <span className="font-semibold hidden sm:inline">Turno #{turnoAuditadoId}</span>
                                    <span className="font-semibold sm:hidden">#{turnoAuditadoId}</span>
                                </div>
                            )}
                            <a
                                href="/caja"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
                            >
                                <ShoppingCart className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Ir a Caja POS</span>
                                <span className="sm:hidden">Caja</span>
                            </a>
                        </div>
                    </div>
                </header>

                {/* CONTENIDO DEL MÓDULO */}
                <div className="p-4 sm:p-6 flex-1">
                    {error && (
                        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-800 flex items-start gap-2 shadow-xs">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <strong className="font-semibold">Error:</strong> {error}
                            </div>
                        </div>
                    )}
                    {mensaje && (
                        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs sm:text-sm text-emerald-800 flex items-start gap-2 shadow-xs">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div>{mensaje}</div>
                        </div>
                    )}

                    {children}
                </div>
            </main>
        </div>
    );
}

export default function AdminLayout({ children }) {
    return (
        <AdminProvider>
            <AdminShell>{children}</AdminShell>
        </AdminProvider>
    );
}
