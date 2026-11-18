'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import CatalogoProductos from './_components/CatalogoProductos';
import CarritoVenta from './_components/CarritoVenta';
import ModalCobro from './_components/ModalCobro';
import ModalModificadores from './_components/ModalModificadores';
import ModalArqueoCiego from './_components/ModalArqueoCiego';
import ModalMovimientosEfectivo from './_components/ModalMovimientosEfectivo';
import HistorialTurno from './_components/HistorialTurno';
import AperturaTurno from './_components/AperturaTurno';
import LoginCaja from './_components/LoginCaja';
import { cambiarPasswordAction } from '../../server/actions/admin.actions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useCarrito } from './_hooks/useCarrito';
import { useInactividad } from './_hooks/useInactividad';

export default function CajaPage() {
    const [cargando, setCargando] = useState(true);
    const [seccionActiva, setSeccionActiva] = useState('pos'); // 'pos' | 'movimientos'

    // Datos del negocio y del turno
    const [cajaAbierta, setCajaAbierta] = useState(null);
    const [cajasFisicas, setCajasFisicas] = useState([]);
    const [productos, setProductos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [movimientos, setMovimientos] = useState([]);
    const [configuracionNegocio, setConfiguracionNegocio] = useState(null);
    const [usuarioActual, setUsuarioActual] = useState(null);

    // Estados de modales
    const [mostrarModalCobro, setMostrarModalCobro] = useState(false);
    const [productoParaPersonalizar, setProductoParaPersonalizar] = useState(null);
    const [mostrarModalArqueo, setMostrarModalArqueo] = useState(false);
    const [modalMovimientosConfig, setModalMovimientosConfig] = useState({ isOpen: false, tipo: 'ingreso' });

    // Comprobante de cierre ciego y último ticket
    const [confirmacionCierreCiego, setConfirmacionCierreCiego] = useState(null);
    const [ultimoTicket, setUltimoTicket] = useState(null);

    // Cambio de PIN propio para cajeros
    const [mostrarFormPin, setMostrarFormPin] = useState(false);
    const [pinActualCajero, setPinActualCajero] = useState('');
    const [nuevoPinCajero, setNuevoPinCajero] = useState('');

    // Mensajes y alertas
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    const limpiarAlertas = useCallback(() => {
        setMensaje(null);
        setError(null);
    }, []);

    // Hook de gestión integral del Carrito
    const {
        carrito,
        descuentoVenta,
        setDescuentoVenta,
        agregarAlCarrito,
        cambiarCantidad,
        handleInputCantidad,
        finalizarEdicionCantidad,
        eliminarDelCarrito,
        vaciarCarrito,
        subtotalBrutoCarrito,
        descuentoAplicadoNum,
        descuentoInvalido,
        totalCarrito
    } = useCarrito({
        onError: setError,
        onLimpiarAlertas: limpiarAlertas
    });

    // Hook de Cierre por Inactividad para roles de alta seguridad (15 minutos)
    useInactividad(usuarioActual, (mensajeInactividad) => {
        setUsuarioActual(null);
        vaciarCarrito();
        setError(mensajeInactividad);
    });

    const cargarDatos = useCallback(async () => {
        try {
            setCargando(true);
            const res = await fetch('/api/caja');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al cargar datos de caja');

            if (!data.configuracionNegocio || Number(data.configuracionNegocio.configurado) === 0 || !data.sistemaInstalado) {
                window.location.href = '/';
                return;
            }

            setConfiguracionNegocio(data.configuracionNegocio);
            setCajaAbierta(data.cajaAbierta);
            setCajasFisicas(data.cajasFisicas || []);
            setProductos(data.productos || []);
            setCategorias(data.categorias || []);
            setUsuarios(data.usuarios || []);
            setMovimientos(data.cajaAbierta ? (data.movimientos || []) : []);
            setUsuarioActual(data.usuarioSesion || null);
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    async function cerrarSesion() {
        limpiarAlertas();
        try {
            await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'logout' })
            });
        } catch (err) {
            console.error('Error al cerrar sesión:', err);
        }
        setUsuarioActual(null);
        vaciarCarrito();
        setSeccionActiva('pos');
    }

    async function handleCambiarMiPin(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const res = await cambiarPasswordAction({
                usuarioObjetivoId: usuarioActual.id,
                pinActual: pinActualCajero,
                nuevoPin: nuevoPinCajero
            });
            if (!res.ok) throw new Error(res.error || 'Error al cambiar la contraseña / PIN.');
            setMensaje('Tu contraseña / PIN se actualizó correctamente.');
            setMostrarFormPin(false);
            setPinActualCajero('');
            setNuevoPinCajero('');
        } catch (err) {
            setError(err.message);
        }
    }

    // Manejo de selección de productos desde el Catálogo
    function handleSeleccionarProducto(prod) {
        limpiarAlertas();
        if (prod.grupos_modificadores && prod.grupos_modificadores.length > 0) {
            setProductoParaPersonalizar(prod);
        } else {
            agregarAlCarrito(prod, []);
        }
    }

    function handleConfirmarModificadores(prod, opcionesElegidas) {
        agregarAlCarrito(prod, opcionesElegidas);
    }

    // Callbacks de éxito
    async function handleVentaExitosa(datosVenta) {
        setUltimoTicket({ ...datosVenta, operador: usuarioActual?.nombre || 'Cajero' });
        vaciarCarrito();
        setMensaje(`Venta #${datosVenta.movimientoId} registrada exitosamente. Cambio entregado: Bs ${Number(datosVenta.cambio || 0).toFixed(2)}`);
        await cargarDatos();
    }

    async function handleCierreExitoso(datosArqueo) {
        setConfirmacionCierreCiego(datosArqueo);
        vaciarCarrito();
        setMensaje('Caja cerrada con Arqueo Ciego. Los resultados de diferencias fueron enviados a Administración.');
        await cargarDatos();
    }

    async function handleMovimientoExitoso(msg) {
        setMensaje(msg);
        await cargarDatos();
    }

    async function handleTurnoAbierto(cajaId, msg) {
        setConfirmacionCierreCiego(null);
        setMensaje(msg);
        await cargarDatos();
    }

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

    // 2. Pantalla principal del Módulo de Caja
    return (
        <div className="flex min-h-screen flex-col lg:flex-row bg-slate-100 text-slate-900">
            {/* BARRA LATERAL IZQUIERDA (SIDEBAR) */}
            <aside className="w-full lg:w-72 bg-slate-900 text-slate-100 flex flex-col shrink-0 border-r border-slate-800">
                <div className="p-4 border-b border-slate-800">
                    <h2 className="text-lg font-bold text-white tracking-tight">Módulo de Caja</h2>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        {cajaAbierta ? (
                            <>
                                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span>[{cajaAbierta.caja_fisica_nombre || 'Caja Principal'}] Turno #{cajaAbierta.id} Abierto</span>
                            </>
                        ) : (
                            <>
                                <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                                <span>Sin Turno Abierto</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Datos del Operador */}
                <div className="p-4 bg-slate-950/70 border-b border-slate-800 text-xs">
                    <div className="text-slate-400 font-medium">Operador activo:</div>
                    <div className="flex items-center justify-between mt-1">
                        <span className="font-semibold text-sky-400 text-sm">{usuarioActual.nombre}</span>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5">
                            {usuarioActual.rol}
                        </Badge>
                    </div>

                    <div className="flex gap-2 mt-3">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                            onClick={() => setMostrarFormPin(!mostrarFormPin)}
                        >
                            Cambiar PIN
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-8 text-xs bg-slate-700 hover:bg-rose-700 text-white"
                            onClick={cerrarSesion}
                        >
                            Salir
                        </Button>
                    </div>

                    {mostrarFormPin && (
                        <form onSubmit={handleCambiarMiPin} className="mt-3 flex flex-col gap-2 p-2 bg-slate-900 rounded border border-slate-800">
                            <Input
                                type="password"
                                placeholder="PIN actual"
                                required
                                value={pinActualCajero}
                                onChange={(e) => setPinActualCajero(e.target.value)}
                                className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                            />
                            <Input
                                type="password"
                                placeholder="Nuevo PIN"
                                required
                                value={nuevoPinCajero}
                                onChange={(e) => setNuevoPinCajero(e.target.value)}
                                className="h-8 text-xs bg-slate-950 border-slate-700 text-white"
                            />
                            <Button type="submit" size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
                                Guardar PIN
                            </Button>
                        </form>
                    )}
                </div>

                {/* Menú de Navegación Lateral */}
                <nav className="flex flex-col p-3 gap-1.5 flex-1 overflow-y-auto">
                    <button
                        type="button"
                        onClick={() => { limpiarAlertas(); setSeccionActiva('pos'); }}
                        className={`flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left transition-colors min-h-[44px] ${
                            seccionActiva === 'pos'
                                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                    >
                        <span>🛒</span>
                        <span>1. Punto de Venta (Cobrar)</span>
                    </button>

                    {cajaAbierta && (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    limpiarAlertas();
                                    setModalMovimientosConfig({ isOpen: true, tipo: 'ingreso' });
                                }}
                                className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-colors min-h-[44px]"
                            >
                                <span>📥</span>
                                <span>2. Ingresar Efectivo / Sencillo</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    limpiarAlertas();
                                    setModalMovimientosConfig({ isOpen: true, tipo: 'egreso' });
                                }}
                                className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-colors min-h-[44px]"
                            >
                                <span>💸</span>
                                <span>3. Registrar Egreso</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    limpiarAlertas();
                                    setMostrarModalArqueo(true);
                                }}
                                className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-colors min-h-[44px]"
                            >
                                <span>🔒</span>
                                <span>4. Cerrar Turno (Arqueo)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { limpiarAlertas(); setSeccionActiva('movimientos'); }}
                                className={`flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left transition-colors min-h-[44px] ${
                                    seccionActiva === 'movimientos'
                                        ? 'bg-sky-600 text-white font-semibold shadow-sm'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <span>📋</span>
                                <span>5. Historial del Turno</span>
                            </button>
                        </>
                    )}
                </nav>

                <div className="p-4 border-t border-slate-800 flex flex-col gap-2">
                    <Button asChild variant="default" className="w-full h-10 bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm">
                        <Link href="/admin">Ir a Panel Admin</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full h-10 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm">
                        <Link href="/">Menú Principal</Link>
                    </Button>
                </div>
            </aside>

            {/* ÁREA PRINCIPAL DERECHA */}
            <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
                {error && (
                    <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold">Error:</span>
                            <span>{error}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={limpiarAlertas} className="h-6 w-6 p-0 text-red-800 hover:bg-red-100">✕</Button>
                    </div>
                )}

                {mensaje && (
                    <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                        <div className="flex items-center gap-2">
                            <span>✅</span>
                            <span>{mensaje}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={limpiarAlertas} className="h-6 w-6 p-0 text-emerald-800 hover:bg-emerald-100">✕</Button>
                    </div>
                )}

                {confirmacionCierreCiego && (
                    <Card className="mb-5 border-2 border-sky-500 bg-sky-50/50 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base text-sky-950 flex items-center gap-2">
                                <span>🔒</span>
                                Comprobante de Cierre Ciego (Turno #{confirmacionCierreCiego.cajaId})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-slate-700">
                            <p className="mb-1">
                                Cerrado por: <strong>{confirmacionCierreCiego.cerradoPor}</strong> | Efectivo físico declarado: <strong className="text-slate-900 font-bold">Bs {Number(confirmacionCierreCiego.efectivoDeclarado || 0).toFixed(2)}</strong>
                            </p>
                            <p className="text-xs text-slate-500">
                                🔒 El cálculo de diferencias fue enviado exclusivamente a Auditoría y al Panel de Administración.
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
                    <>
                        {/* SECCIÓN 1: PUNTO DE VENTA (CATÁLOGO Y CARRITO) */}
                        {seccionActiva === 'pos' && (
                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                                <div className="xl:col-span-7 2xl:col-span-8">
                                    <CatalogoProductos
                                        productos={productos}
                                        categorias={categorias}
                                        carrito={carrito}
                                        onSeleccionarProducto={handleSeleccionarProducto}
                                    />
                                </div>

                                <div className="xl:col-span-5 2xl:col-span-4 sticky top-4">
                                    <CarritoVenta
                                        carrito={carrito}
                                        productos={productos}
                                        cambiarCantidad={cambiarCantidad}
                                        handleInputCantidad={handleInputCantidad}
                                        finalizarEdicionCantidad={finalizarEdicionCantidad}
                                        eliminarDelCarrito={eliminarDelCarrito}
                                        vaciarCarrito={vaciarCarrito}
                                        subtotalBrutoCarrito={subtotalBrutoCarrito}
                                        descuentoAplicadoNum={descuentoAplicadoNum}
                                        descuentoInvalido={descuentoInvalido}
                                        totalCarrito={totalCarrito}
                                        onAbrirCobro={() => {
                                            limpiarAlertas();
                                            setMostrarModalCobro(true);
                                        }}
                                        ultimoTicket={ultimoTicket}
                                    />
                                </div>
                            </div>
                        )}

                        {/* SECCIÓN 5: HISTORIAL DE MOVIMIENTOS DEL TURNO */}
                        {seccionActiva === 'movimientos' && (
                            <HistorialTurno
                                cajaAbierta={cajaAbierta}
                                movimientos={movimientos}
                                usuarioActual={usuarioActual}
                                onActualizar={cargarDatos}
                                onMovimientoAnulado={async (msg) => {
                                    setMensaje(msg);
                                    await cargarDatos();
                                }}
                                onError={setError}
                                onLimpiarAlertas={limpiarAlertas}
                            />
                        )}

                        {/* MODALES DEL FLUJO DE CAJA */}
                        <ModalCobro
                            isOpen={mostrarModalCobro}
                            onClose={() => setMostrarModalCobro(false)}
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
                            onClose={() => setMostrarModalArqueo(false)}
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
                            onClose={() => setModalMovimientosConfig({ isOpen: false, tipo: 'ingreso' })}
                            cajaAbierta={cajaAbierta}
                            usuarioActual={usuarioActual}
                            configuracionNegocio={configuracionNegocio}
                            onMovimientoExitoso={handleMovimientoExitoso}
                            onError={setError}
                            onLimpiarAlertas={limpiarAlertas}
                        />
                    </>
                )}
            </main>
        </div>
    );
}
