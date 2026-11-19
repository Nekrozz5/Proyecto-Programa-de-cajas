'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { obtenerMetricasInteligenciaAction } from '@/server/actions/admin.actions';

const AdminContext = createContext(null);

export function AdminProvider({ children }) {
    const [cargando, setCargando] = useState(true);
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
    const [metricasInteligencia, setMetricasInteligencia] = useState(null);
    const [cargandoMetricas, setCargandoMetricas] = useState(false);
    const [adminAutenticado, setAdminAutenticado] = useState(null);
    const [turnoAuditadoId, setTurnoAuditadoId] = useState(null);
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    function limpiarAlertas() {
        setMensaje(null);
        setError(null);
    }

    async function cargarMetricasInteligencia(dias = 30) {
        try {
            setCargandoMetricas(true);
            const res = await obtenerMetricasInteligenciaAction({ dias });
            if ((res?.ok || res?.success) && res?.data) {
                setMetricasInteligencia(res.data);
                return res.data;
            } else if (res?.error) {
                console.warn('Aviso al cargar métricas de inteligencia:', res.error);
            }
        } catch (err) {
            console.error('Error al cargar métricas de inteligencia:', err);
        } finally {
            setCargandoMetricas(false);
        }
        return null;
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

            const sesionAdminValida = dataCaja.usuarioSesion && ['admin', 'propietario', 'developer'].includes(dataCaja.usuarioSesion.rol);
            if (sesionAdminValida) {
                setAdminAutenticado(dataCaja.usuarioSesion);
                const resRep = await fetch('/api/reportes');
                if (resRep.ok) {
                    const dataRep = await resRep.json();
                    setTendencias(dataRep);
                }
                // Carga asíncrona de métricas de inteligencia bajo demanda / al inicio
                cargarMetricasInteligencia(30);
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
                const rolLabel = adminAutenticado.rol === 'propietario' ? 'Propietario(a)' : adminAutenticado.rol === 'admin' ? 'Administrador' : adminAutenticado.rol === 'developer' ? 'Desarrollador' : adminAutenticado.rol;
                setError(`Tu sesión de ${rolLabel} se ha cerrado automáticamente tras ${MINUTOS_INACTIVIDAD} minutos de inactividad por seguridad.`);
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

    const value = {
        datos,
        setDatos,
        tendencias,
        setTendencias,
        metricasInteligencia,
        setMetricasInteligencia,
        cargandoMetricas,
        cargarMetricasInteligencia,
        recargarMetricasInteligencia: cargarMetricasInteligencia,
        cargando,
        setCargando,
        adminAutenticado,
        setAdminAutenticado,
        turnoAuditadoId,
        setTurnoAuditadoId,
        cargarTodo,
        mensaje,
        setMensaje,
        error,
        setError,
        limpiarAlertas,
        seleccionarTurnoParaAuditar,
        handleLogout
    };

    return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
    const context = useContext(AdminContext);
    if (!context) {
        throw new Error('useAdmin debe usarse dentro de un AdminProvider');
    }
    return context;
}

export const useAdminContext = useAdmin;

export default AdminContext;
