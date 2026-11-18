'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useCarrito } from '../_hooks/useCarrito';
import { useInactividad } from '../_hooks/useInactividad';
import { cambiarPasswordAction } from '@/server/actions/admin.actions';

const CajaContext = createContext(null);

export function CajaProvider({ children }) {
    const [cargando, setCargando] = useState(true);

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
    const carritoHook = useCarrito({
        onError: setError,
        onLimpiarAlertas: limpiarAlertas
    });

    // Hook de Cierre por Inactividad para roles de alta seguridad (15 minutos)
    useInactividad(usuarioActual, (mensajeInactividad) => {
        setUsuarioActual(null);
        carritoHook.vaciarCarrito();
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
        carritoHook.vaciarCarrito();
    }

    async function handleCambiarMiPin(e) {
        if (e && e.preventDefault) e.preventDefault();
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
            carritoHook.agregarAlCarrito(prod, []);
        }
    }

    function handleConfirmarModificadores(prod, opcionesElegidas) {
        carritoHook.agregarAlCarrito(prod, opcionesElegidas);
    }

    // Callbacks de éxito
    async function handleVentaExitosa(datosVenta) {
        setUltimoTicket({ ...datosVenta, operador: usuarioActual?.nombre || 'Cajero' });
        carritoHook.vaciarCarrito();
        setMensaje(`Venta #${datosVenta.movimientoId} registrada exitosamente. Cambio entregado: Bs ${Number(datosVenta.cambio || 0).toFixed(2)}`);
        await cargarDatos();
    }

    async function handleCierreExitoso(datosArqueo) {
        setConfirmacionCierreCiego(datosArqueo);
        carritoHook.vaciarCarrito();
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

    // Funciones de control de modales
    const abrirModalCobro = () => {
        limpiarAlertas();
        setMostrarModalCobro(true);
    };
    const cerrarModalCobro = () => setMostrarModalCobro(false);

    const abrirModalArqueo = () => {
        limpiarAlertas();
        setMostrarModalArqueo(true);
    };
    const cerrarModalArqueo = () => setMostrarModalArqueo(false);

    const abrirModalMovimientos = (tipo = 'ingreso') => {
        limpiarAlertas();
        setModalMovimientosConfig({ isOpen: true, tipo });
    };
    const cerrarModalMovimientos = () => setModalMovimientosConfig({ isOpen: false, tipo: 'ingreso' });

    const value = {
        cargando,
        setCargando,
        cajaAbierta,
        setCajaAbierta,
        cajasFisicas,
        setCajasFisicas,
        productos,
        setProductos,
        categorias,
        setCategorias,
        usuarios,
        setUsuarios,
        movimientos,
        setMovimientos,
        configuracionNegocio,
        setConfiguracionNegocio,
        usuarioActual,
        setUsuarioActual,
        cargarDatos,
        cerrarSesion,
        // Alertas
        mensaje,
        setMensaje,
        error,
        setError,
        limpiarAlertas,
        // Modales y sus configuraciones
        mostrarModalCobro,
        setMostrarModalCobro,
        abrirModalCobro,
        cerrarModalCobro,
        productoParaPersonalizar,
        setProductoParaPersonalizar,
        mostrarModalArqueo,
        setMostrarModalArqueo,
        abrirModalArqueo,
        cerrarModalArqueo,
        modalMovimientosConfig,
        setModalMovimientosConfig,
        abrirModalMovimientos,
        cerrarModalMovimientos,
        // Comprobantes
        confirmacionCierreCiego,
        setConfirmacionCierreCiego,
        ultimoTicket,
        setUltimoTicket,
        // PIN cajero
        mostrarFormPin,
        setMostrarFormPin,
        pinActualCajero,
        setPinActualCajero,
        nuevoPinCajero,
        setNuevoPinCajero,
        handleCambiarMiPin,
        // Handlers de negocio y catálogo
        handleSeleccionarProducto,
        handleConfirmarModificadores,
        handleVentaExitosa,
        handleCierreExitoso,
        handleMovimientoExitoso,
        handleTurnoAbierto,
        // Estado y métodos del carrito
        ...carritoHook
    };

    return <CajaContext.Provider value={value}>{children}</CajaContext.Provider>;
}

export function useCaja() {
    const context = useContext(CajaContext);
    if (!context) {
        throw new Error('useCaja debe usarse dentro de un CajaProvider');
    }
    return context;
}

export const useCajaContext = useCaja;

export default CajaContext;
