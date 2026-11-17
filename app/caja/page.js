'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
    sidebarStyle,
    navBtnStyle,
    btnSidebarMini,
    cardStyle,
    btnPrimario,
    btnSecundario
} from './_components/cajaStyles';
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
        return <div style={{ padding: '2rem' }}>Cargando módulo de caja...</div>;
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
        <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: '100vh', background: '#f1f5f9' }}>
            {/* BARRA LATERAL IZQUIERDA (SIDEBAR) */}
            <aside style={sidebarStyle}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #334155' }}>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>Módulo de Caja</h2>
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                        {cajaAbierta ? `🟢 [${cajaAbierta.caja_fisica_nombre || 'Caja Principal'}] Turno #${cajaAbierta.id} Abierto` : '🔴 Sin Turno Abierto'}
                    </div>
                </div>

                {/* Datos del Operador */}
                <div style={{ padding: '1rem 1.25rem', background: '#0f172a', borderBottom: '1px solid #334155', fontSize: '0.85rem' }}>
                    <div style={{ color: '#94a3b8' }}>Operador activo:</div>
                    <div style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '0.95rem', margin: '0.2rem 0' }}>
                        {usuarioActual.nombre} ({usuarioActual.rol})
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                        <button type="button" onClick={() => setMostrarFormPin(!mostrarFormPin)} style={btnSidebarMini}>
                            Cambiar PIN
                        </button>
                        <button type="button" onClick={cerrarSesion} style={{ ...btnSidebarMini, background: '#475569' }}>
                            Salir
                        </button>
                    </div>
                    {mostrarFormPin && (
                        <form onSubmit={handleCambiarMiPin} style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <input
                                type="password"
                                placeholder="PIN actual"
                                required
                                value={pinActualCajero}
                                onChange={(e) => setPinActualCajero(e.target.value)}
                                style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #475569', fontSize: '0.8rem' }}
                            />
                            <input
                                type="password"
                                placeholder="Nuevo PIN"
                                required
                                value={nuevoPinCajero}
                                onChange={(e) => setNuevoPinCajero(e.target.value)}
                                style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #475569', fontSize: '0.8rem' }}
                            />
                            <button type="submit" style={{ ...btnSidebarMini, background: '#16a34a' }}>Guardar PIN</button>
                        </form>
                    )}
                </div>

                {/* Menú de Navegación Lateral */}
                <nav style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', gap: '0.35rem', flex: 1 }}>
                    <button
                        type="button"
                        onClick={() => { limpiarAlertas(); setSeccionActiva('pos'); }}
                        style={navBtnStyle(seccionActiva === 'pos')}
                    >
                        🛒 1. Punto de Venta (Cobrar)
                    </button>
                    {cajaAbierta && (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    limpiarAlertas();
                                    setModalMovimientosConfig({ isOpen: true, tipo: 'ingreso' });
                                }}
                                style={navBtnStyle(false)}
                            >
                                📥 2. Ingresar Efectivo / Sencillo
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    limpiarAlertas();
                                    setModalMovimientosConfig({ isOpen: true, tipo: 'egreso' });
                                }}
                                style={navBtnStyle(false)}
                            >
                                💸 3. Registrar Egreso
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    limpiarAlertas();
                                    setMostrarModalArqueo(true);
                                }}
                                style={navBtnStyle(false)}
                            >
                                🔒 4. Cerrar Turno (Arqueo)
                            </button>
                            <button
                                type="button"
                                onClick={() => { limpiarAlertas(); setSeccionActiva('movimientos'); }}
                                style={navBtnStyle(seccionActiva === 'movimientos')}
                            >
                                📋 5. Historial del Turno
                            </button>
                        </>
                    )}
                </nav>

                <div style={{ padding: '1rem', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <a href="/admin" style={{ ...btnPrimario, textAlign: 'center', fontSize: '0.85rem' }}>
                        Ir a Panel Admin
                    </a>
                    <a href="/" style={{ ...btnSecundario, textAlign: 'center', fontSize: '0.85rem' }}>
                        Menú Principal
                    </a>
                </div>
            </aside>

            {/* ÁREA PRINCIPAL DERECHA */}
            <main style={{ flex: '1 1 340px', padding: '1.5rem', overflowY: 'auto' }}>
                {error && (
                    <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.85rem 1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #f87171' }}>
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {mensaje && (
                    <div style={{ background: '#dcfce7', color: '#166534', padding: '0.85rem 1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #4ade80' }}>
                        {mensaje}
                    </div>
                )}

                {confirmacionCierreCiego && (
                    <section style={{ ...cardStyle, border: '2px solid #0070f3', marginBottom: '1.5rem', background: '#f8fafc' }}>
                        <h3 style={{ marginTop: 0 }}>Comprobante de Cierre Ciego (Turno #{confirmacionCierreCiego.cajaId})</h3>
                        <p style={{ margin: '0.35rem 0' }}>
                            Cerrado por: <strong>{confirmacionCierreCiego.cerradoPor}</strong> | Efectivo físico declarado: <strong>Bs {Number(confirmacionCierreCiego.efectivoDeclarado || 0).toFixed(2)}</strong>
                        </p>
                        <small style={{ color: '#555' }}>
                            🔒 El cálculo de diferencias fue enviado exclusivamente a Auditoría y al Panel de Administración.
                        </small>
                    </section>
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
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                                gap: '1.25rem',
                                alignItems: 'start'
                            }}>
                                <CatalogoProductos
                                    productos={productos}
                                    categorias={categorias}
                                    carrito={carrito}
                                    onSeleccionarProducto={handleSeleccionarProducto}
                                />

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
