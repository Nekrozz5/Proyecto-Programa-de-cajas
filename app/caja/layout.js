'use client';

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
    X 
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
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 font-semibold">
                            {usuarioActual.rol === 'propietario' ? 'Propietario(a)' : usuarioActual.rol === 'admin' ? 'Administrador' : usuarioActual.rol === 'developer' ? 'Desarrollador' : 'Cajero'}
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
                            <Button type="submit" size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
                                Guardar PIN
                            </Button>
                        </form>
                    )}
                </div>

                {/* Menú de Navegación Lateral */}
                <nav className="flex flex-col p-3 gap-1.5 flex-1 overflow-y-auto">
                    <Link
                        href="/caja/pos"
                        onClick={limpiarAlertas}
                        className={`flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left transition-colors min-h-[44px] ${
                            esRutaPos
                                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                    >
                        <ShoppingCart className="w-4 h-4 shrink-0" />
                        <span>1. Punto de Venta (Cobrar)</span>
                    </Link>

                    {cajaAbierta && (
                        <>
                            <button
                                type="button"
                                onClick={() => abrirModalMovimientos('ingreso')}
                                className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-colors min-h-[44px] cursor-pointer"
                            >
                                <ArrowDownCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                                <span>2. Ingresar Efectivo / Sencillo</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => abrirModalMovimientos('egreso')}
                                className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-colors min-h-[44px] cursor-pointer"
                            >
                                <ArrowUpCircle className="w-4 h-4 shrink-0 text-rose-400" />
                                <span>3. Registrar Egreso</span>
                            </button>
                            <button
                                type="button"
                                onClick={abrirModalArqueo}
                                className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-colors min-h-[44px] cursor-pointer"
                            >
                                <Lock className="w-4 h-4 shrink-0 text-amber-400" />
                                <span>4. Cerrar Turno (Arqueo)</span>
                            </button>
                            <Link
                                href="/caja/movimientos"
                                onClick={limpiarAlertas}
                                className={`flex items-center gap-2.5 px-3.5 py-3 rounded-lg text-sm font-medium text-left transition-colors min-h-[44px] ${
                                    esRutaMovimientos
                                        ? 'bg-sky-600 text-white font-semibold shadow-sm'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <ReceiptText className="w-4 h-4 shrink-0 text-sky-400" />
                                <span>5. Historial del Turno</span>
                            </Link>
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
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                            <span className="font-semibold">Error:</span>
                            <span>{error}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={limpiarAlertas} className="h-6 w-6 p-0 text-red-800 hover:bg-red-100">
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                )}

                {mensaje && (
                    <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span>{mensaje}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={limpiarAlertas} className="h-6 w-6 p-0 text-emerald-800 hover:bg-emerald-100">
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
            </main>
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
