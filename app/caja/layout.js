'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CajaProvider, useCaja } from './_context/CajaContext';
import LoginCaja from './_components/LoginCaja';
import AperturaTurno from './_components/AperturaTurno';
import ModalCobro from './_components/ModalCobro';
import ModalModificadores from './_components/ModalModificadores';
import ModalArqueoCiego from './_components/ModalArqueoCiego';
import ModalMovimientosEfectivo from './_components/ModalMovimientosEfectivo';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PasswordInput } from '@/components/ui/password-input';
import { 
    ShoppingCart, 
    ArrowDownCircle, 
    ArrowUpCircle, 
    Lock, 
    ReceiptText, 
    CheckCircle2, 
    AlertCircle, 
    X,
    Pin,
    Landmark,
    Briefcase,
    KeyRound
} from 'lucide-react';

function CajaShell({ children }) {
    const pathname = usePathname();
    const {
        cargando,
        cajaAbierta,
        cajasFisicas,
        usuarios,
        usuarioActual,
        setUsuarioActual,
        configuracionNegocio,
        mensaje,
        setMensaje,
        error,
        setError,
        limpiarAlertas,
        confirmacionCierreCiego,
        mostrarModalCobro,
        cerrarModalCobro,
        siguienteNumeroFactura,
        productoParaPersonalizar,
        setProductoParaPersonalizar,
        mostrarModalArqueo,
        abrirModalArqueo,
        cerrarModalArqueo,
        modalMovimientosConfig,
        abrirModalMovimientos,
        cerrarModalMovimientos,
        mostrarFormPin,
        setMostrarFormPin,
        pinActualCajero,
        setPinActualCajero,
        nuevoPinCajero,
        setNuevoPinCajero,
        handleCambiarMiPin,
        cerrarSesion,
        cargarDatos,
        handleConfirmarModificadores,
        handleVentaExitosa,
        handleCierreExitoso,
        handleMovimientoExitoso,
        handleTurnoAbierto,
        carrito,
        subtotalBrutoCarrito,
        descuentoVenta,
        setDescuentoVenta,
        descuentoAplicadoNum,
        descuentoInvalido,
        totalCarrito
    } = useCaja();

    // Control de Barra Lateral Desplegable (Drawer) con Auto-Ocultado por Inactividad
    const [sidebarAbierto, setSidebarAbierto] = useState(false);
    const [sidebarFijado, setSidebarFijado] = useState(false);
    const timerCierreSidebarRef = useRef(null);

    // Referencias y Estado para el Botón de Menú Secundario Semicircular Flotante
    const botonMenuPrincipalRef = useRef(null);
    const mainContenedorRef = useRef(null);
    const [mostrarBotonFlotante, setMostrarBotonFlotante] = useState(false);

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

    // Detección reactiva de visibilidad del botón principal de menú
    // Muestra el botón semicircular flotante en el lateral derecho SOLO cuando el botón principal no se ve en pantalla
    useEffect(() => {
        const el = botonMenuPrincipalRef.current;
        if (!el) return;

        const verificarVisibilidad = () => {
            if (!botonMenuPrincipalRef.current) return;
            const rect = botonMenuPrincipalRef.current.getBoundingClientRect();
            const fueraDePantalla = rect.bottom <= 8 || rect.top >= window.innerHeight;
            setMostrarBotonFlotante(fueraDePantalla);
        };

        let observer = null;
        if (typeof IntersectionObserver !== 'undefined') {
            observer = new IntersectionObserver(
                ([entry]) => {
                    setMostrarBotonFlotante(!entry.isIntersecting);
                },
                { threshold: 0.1 }
            );
            observer.observe(el);
        }

        const mainEl = mainContenedorRef.current;
        window.addEventListener('scroll', verificarVisibilidad, { passive: true });
        if (mainEl) {
            mainEl.addEventListener('scroll', verificarVisibilidad, { passive: true });
        }

        verificarVisibilidad();

        return () => {
            if (observer) observer.disconnect();
            window.removeEventListener('scroll', verificarVisibilidad);
            if (mainEl) {
                mainEl.removeEventListener('scroll', verificarVisibilidad);
            }
        };
    }, [pathname, usuarioActual]);

    if (cargando) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-100">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
                    <span className="text-sm font-medium text-slate-600">Cargando módulo de caja...</span>
                </div>
            </div>
        );
    }

    // 1. Pantalla de inicio de sesión si no hay operador autenticado
    if (!usuarioActual) {
        return (
            <LoginCaja
                usuarios={usuarios}
                onLoginExitoso={async (usr, msg) => {
                    setUsuarioActual(usr);
                    setMensaje(msg);
                    await cargarDatos();
                }}
                onError={setError}
                onLimpiarAlertas={limpiarAlertas}
            />
        );
    }

    const esRutaPos = pathname === '/caja/pos' || pathname === '/caja';
    const esRutaMovimientos = pathname === '/caja/movimientos';

    return (
        <div
            className="min-h-screen bg-slate-100 text-slate-900 font-sans relative flex flex-col"
            style={{
                '--brand-primary': configuracionNegocio?.color_primario || '#0284C7',
                '--brand-secondary': configuracionNegocio?.color_secundario || '#0F172A'
            }}
        >
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
                aria-label="Menú principal de caja"
            >
                <div className="flex flex-col flex-1 min-h-0">
                    {/* Header del Negocio y Botón Cerrar */}
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                {configuracionNegocio?.logo_url ? (
                                    <img
                                        src={configuracionNegocio.logo_url}
                                        alt=""
                                        aria-hidden="true"
                                        className="h-6 w-6 rounded object-contain bg-white/95 p-0.5 shrink-0"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                ) : (
                                    <ShoppingCart className="w-5 h-5 text-sky-400 shrink-0" aria-hidden="true" />
                                )}
                                <h2 className="font-bold text-sm tracking-tight text-white truncate">
                                    {configuracionNegocio?.nombre_negocio || 'Módulo de Caja'}
                                </h2>
                            </div>
                            <div className="text-[11px] font-medium text-sky-400 mt-0.5 truncate">
                                {configuracionNegocio?.modalidad_nombre || 'Terminal de Ventas POS'}
                            </div>
                            <div className="text-[11px] mt-1">
                                {cajaAbierta ? (
                                    <span className="inline-flex items-center text-emerald-400 font-medium">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                                        [{cajaAbierta.caja_fisica_nombre || 'Caja Principal'}] Turno #{cajaAbierta.id}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center text-rose-400 font-medium">
                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400 mr-1.5" />
                                        Sin turno abierto
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

                    {/* Datos del Operador */}
                    <div className="p-3 bg-slate-950/50 border-b border-slate-800 text-xs">
                        <div className="text-slate-400 text-[11px]">Operador activo:</div>
                        <div className="flex items-center justify-between mt-1">
                            <span className="font-bold text-amber-400 text-sm truncate">{usuarioActual.nombre}</span>
                            <Badge variant="secondary" className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 font-semibold">
                                {usuarioActual.rol === 'propietario' ? 'Propietario(a)' : usuarioActual.rol === 'admin' ? 'Administrador' : usuarioActual.rol === 'developer' ? 'Desarrollador' : 'Cajero'}
                            </Badge>
                        </div>

                        <div className="flex gap-2 mt-2.5">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-7 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex-1 flex items-center justify-center gap-1 cursor-pointer"
                                onClick={() => setMostrarFormPin(!mostrarFormPin)}
                            >
                                <KeyRound className="w-3 h-3" />
                                <span>Cambiar PIN</span>
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="h-7 text-xs bg-slate-700 hover:bg-rose-700 text-white flex-1 cursor-pointer"
                                onClick={cerrarSesion}
                            >
                                Salir
                            </Button>
                        </div>

                        {mostrarFormPin && (
                            <form onSubmit={handleCambiarMiPin} className="mt-2.5 flex flex-col gap-2 p-2 bg-slate-900 rounded border border-slate-800">
                                <PasswordInput
                                    placeholder="PIN actual"
                                    required
                                    value={pinActualCajero}
                                    onChange={(e) => setPinActualCajero(e.target.value)}
                                    className="h-8 text-xs bg-slate-950 border-slate-700 text-white placeholder-slate-500"
                                    toggleClassName="text-slate-400 hover:text-slate-200"
                                />
                                <PasswordInput
                                    placeholder="Nuevo PIN"
                                    required
                                    value={nuevoPinCajero}
                                    onChange={(e) => setNuevoPinCajero(e.target.value)}
                                    className="h-8 text-xs bg-slate-950 border-slate-700 text-white placeholder-slate-500"
                                    toggleClassName="text-slate-400 hover:text-slate-200"
                                />
                                <Button type="submit" size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
                                    Guardar PIN
                                </Button>
                            </form>
                        )}
                    </div>

                    {/* Menú de Navegación Lateral y Acciones de Caja */}
                    <nav className="p-2 space-y-1 overflow-y-auto flex-1" role="tablist" aria-label="Opciones de caja">
                        <Link
                            href="/caja/pos"
                            onClick={() => {
                                limpiarAlertas();
                                if (!sidebarFijado) cerrarSidebar();
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                                esRutaPos
                                    ? 'bg-sky-600 text-white font-semibold shadow-sm'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <ShoppingCart className={`w-4 h-4 shrink-0 ${esRutaPos ? 'text-white' : 'text-slate-400'}`} />
                            <span className="truncate">1. Punto de Venta (Cobrar)</span>
                        </Link>

                        {cajaAbierta && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!sidebarFijado) cerrarSidebar();
                                        abrirModalMovimientos('ingreso');
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
                                >
                                    <ArrowDownCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                                    <span className="truncate">2. Ingresar Efectivo / Sencillo</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!sidebarFijado) cerrarSidebar();
                                        abrirModalMovimientos('egreso');
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
                                >
                                    <ArrowUpCircle className="w-4 h-4 shrink-0 text-rose-400" />
                                    <span className="truncate">3. Registrar Egreso</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!sidebarFijado) cerrarSidebar();
                                        abrirModalArqueo();
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
                                >
                                    <Lock className="w-4 h-4 shrink-0 text-amber-400" />
                                    <span className="truncate">4. Cerrar Turno (Arqueo)</span>
                                </button>

                                <Link
                                    href="/caja/movimientos"
                                    onClick={() => {
                                        limpiarAlertas();
                                        if (!sidebarFijado) cerrarSidebar();
                                    }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                                        esRutaMovimientos
                                            ? 'bg-sky-600 text-white font-semibold shadow-sm'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <ReceiptText className={`w-4 h-4 shrink-0 ${esRutaMovimientos ? 'text-white' : 'text-sky-400'}`} />
                                    <span className="truncate">5. Historial del Turno</span>
                                </Link>
                            </>
                        )}
                    </nav>
                </div>

                {/* Accesos Rápidos Inferiores */}
                <div className="p-3 border-t border-slate-800 space-y-2 shrink-0">
                    <Button asChild variant="default" className="w-full h-9 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm cursor-pointer">
                        <Link href="/admin">
                            <Landmark className="w-3.5 h-3.5 mr-1.5" />
                            Ir a Panel Admin &rarr;
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full h-8 border-slate-700 bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs cursor-pointer">
                        <Link href="/">Menú Principal</Link>
                    </Button>
                </div>
            </aside>

            {/* ÁREA PRINCIPAL DERECHA */}
            <main ref={mainContenedorRef} className="flex-1 flex flex-col min-w-0 w-full overflow-y-auto">
                {/* BARRA SUPERIOR LIMPIA CON BOTÓN DE MENÚ (3 LÍNEAS) */}
                <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sticky top-0 z-30 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <button
                                ref={botonMenuPrincipalRef}
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

                            {/* Título de la sección activa */}
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="shrink-0">
                                        {esRutaMovimientos ? (
                                            <ReceiptText className="w-5 h-5 text-slate-700" />
                                        ) : (
                                            <ShoppingCart className="w-5 h-5 text-slate-700" />
                                        )}
                                    </span>
                                    <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight truncate">
                                        {esRutaMovimientos ? 'Historial y Movimientos del Turno' : 'Punto de Venta POS'}
                                    </h1>
                                </div>
                                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
                                    {configuracionNegocio?.nombre_negocio || 'Módulo de Caja'} &bull; {cajaAbierta ? `Turno #${cajaAbierta.id} (${cajaAbierta.caja_fisica_nombre || 'Caja Principal'})` : 'Sin turno activo'}
                                </p>
                            </div>
                        </div>

                        {/* Accesos e Indicadores Rápidos */}
                        <div className="flex items-center gap-2 shrink-0">
                            {cajaAbierta ? (
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 font-medium">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="font-semibold hidden sm:inline">Turno #{cajaAbierta.id}</span>
                                    <span className="font-semibold sm:hidden">#{cajaAbierta.id}</span>
                                </div>
                            ) : (
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs text-rose-800 font-medium">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                    <span className="font-semibold hidden sm:inline">Sin turno</span>
                                    <span className="font-semibold sm:hidden">Cerrado</span>
                                </div>
                            )}

                            <Button asChild variant="outline" size="sm" className="h-8 border-slate-300 text-xs text-slate-700 hover:bg-slate-100 hidden md:inline-flex">
                                <Link href="/admin">
                                    <Briefcase className="w-3.5 h-3.5 mr-1" />
                                    Panel Admin
                                </Link>
                            </Button>
                        </div>
                    </div>
                </header>

                {/* CONTENIDO PRINCIPAL */}
                <div className="p-4 sm:p-6 flex-1">
                    {error && (
                        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-800 shadow-xs">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                                <span className="font-semibold">Error:</span>
                                <span>{error}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={limpiarAlertas} className="h-6 w-6 p-0 text-red-800 hover:bg-red-100 cursor-pointer">
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    )}

                    {mensaje && (
                        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs sm:text-sm text-emerald-800 shadow-xs">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                <span>{mensaje}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={limpiarAlertas} className="h-6 w-6 p-0 text-emerald-800 hover:bg-emerald-100 cursor-pointer">
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    )}

                    {confirmacionCierreCiego && (
                        <Card className="mb-5 border-2 border-sky-500 bg-sky-50/50 shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base text-sky-950 flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-sky-700" />
                                    <span>Comprobante de Cierre Ciego (Turno #{confirmacionCierreCiego.cajaId})</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-slate-700">
                                <p className="mb-1">
                                    Cerrado por: <strong>{confirmacionCierreCiego.cerradoPor}</strong> | Efectivo físico declarado: <strong className="text-slate-900 font-bold">Bs {Number(confirmacionCierreCiego.efectivoDeclarado || 0).toFixed(2)}</strong>
                                </p>
                                <p className="text-xs text-slate-500">
                                    El cálculo de diferencias fue enviado exclusivamente a Auditoría y al Panel de Administración.
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {!cajaAbierta ? (
                        <AperturaTurno
                            usuarioActual={usuarioActual}
                            cajasFisicas={cajasFisicas}
                            onTurnoAbierto={handleTurnoAbierto}
                            onError={setError}
                            onLimpiarAlertas={limpiarAlertas}
                        />
                    ) : (
                        children
                    )}

                    {/* MODALES GLOBALES DEL FLUJO DE CAJA */}
                    <ModalCobro
                        isOpen={mostrarModalCobro}
                        onClose={cerrarModalCobro}
                        cajaAbierta={cajaAbierta}
                        usuarioActual={usuarioActual}
                        configuracionNegocio={configuracionNegocio}
                        carrito={carrito}
                        subtotalBrutoCarrito={subtotalBrutoCarrito}
                        descuentoVenta={descuentoVenta}
                        setDescuentoVenta={setDescuentoVenta}
                        descuentoAplicadoNum={descuentoAplicadoNum}
                        descuentoInvalido={descuentoInvalido}
                        totalCarrito={totalCarrito}
                        siguienteNumeroFactura={siguienteNumeroFactura}
                        onVentaExitosa={handleVentaExitosa}
                        onError={setError}
                        onLimpiarAlertas={limpiarAlertas}
                    />

                    <ModalModificadores
                        producto={productoParaPersonalizar}
                        onClose={() => setProductoParaPersonalizar(null)}
                        onConfirmar={handleConfirmarModificadores}
                        onError={setError}
                        onLimpiarAlertas={limpiarAlertas}
                    />

                    <ModalArqueoCiego
                        isOpen={mostrarModalArqueo}
                        isModal={true}
                        onClose={cerrarModalArqueo}
                        cajaAbierta={cajaAbierta}
                        usuarioActual={usuarioActual}
                        onCierreExitoso={handleCierreExitoso}
                        onError={setError}
                        onLimpiarAlertas={limpiarAlertas}
                    />

                    <ModalMovimientosEfectivo
                        isOpen={modalMovimientosConfig.isOpen}
                        isModal={true}
                        tipoInicial={modalMovimientosConfig.tipo}
                        onClose={cerrarModalMovimientos}
                        cajaAbierta={cajaAbierta}
                        usuarioActual={usuarioActual}
                        configuracionNegocio={configuracionNegocio}
                        onMovimientoExitoso={handleMovimientoExitoso}
                        onError={setError}
                        onLimpiarAlertas={limpiarAlertas}
                    />
                </div>
            </main>

            {/* BOTÓN SECUNDARIO: SEMICÍRCULO ESTÁTICO EN EL COSTADO DERECHO */}
            {/* Se muestra únicamente cuando el usuario hace scroll hacia abajo y el primer botón deja de verse */}
            <button
                type="button"
                onClick={abrirSidebar}
                aria-label="Abrir menú de opciones de caja"
                title="Abrir menú de caja"
                className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 h-14 w-8 sm:h-16 sm:w-10 rounded-l-full bg-slate-900/90 hover:bg-slate-900 active:scale-95 text-white border-y border-l border-slate-700/80 shadow-2xl backdrop-blur-xs flex items-center justify-center pl-1 cursor-pointer transition-all duration-300 ease-out group ${
                    mostrarBotonFlotante && !sidebarAbierto
                        ? 'translate-x-0 opacity-100 pointer-events-auto'
                        : 'translate-x-full opacity-0 pointer-events-none'
                }`}
            >
                <span className="flex flex-col gap-1 w-3.5 h-3 justify-center items-center">
                    <span className="w-3.5 h-0.5 bg-slate-200 rounded-full group-hover:bg-amber-400 group-hover:w-4 transition-all" />
                    <span className="w-3.5 h-0.5 bg-slate-200 rounded-full group-hover:bg-amber-400 group-hover:w-4 transition-all" />
                    <span className="w-3.5 h-0.5 bg-slate-200 rounded-full group-hover:bg-amber-400 group-hover:w-4 transition-all" />
                </span>
            </button>
        </div>
    );
}

export default function CajaLayout({ children }) {
    return (
        <CajaProvider>
            <CajaShell>{children}</CajaShell>
        </CajaProvider>
    );
}
