'use client';

import React, { useState, useEffect, useMemo, useRef, useTransition, useDeferredValue } from 'react';
import {
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    ZAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    Cell
} from 'recharts';
import {
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    AlertCircle,
    CheckCircle2,
    Clock,
    Copy,
    Check,
    Sparkles,
    Package,
    ShoppingCart,
    ShieldAlert,
    DollarSign,
    Filter,
    ArrowUpRight,
    Info,
    Calendar,
    RefreshCw,
    Search,
    ChevronLeft,
    ChevronRight,
    SlidersHorizontal,
    BarChart3,
    Layers,
    ListPlus,
    Flame,
    X
} from 'lucide-react';
import { obtenerMetricasInteligenciaAction } from '../../../server/actions/admin.actions';

// Constantes y configuraciones de color
const COLORES_CUADRANTES = {
    lideres: {
        nombre: 'Líderes de Ganancia',
        hex: '#10b981', // emerald-500
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-800'
    },
    volumen_bajo_margen: {
        nombre: 'Volumen con Margen Bajo',
        hex: '#f59e0b', // amber-500
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-700',
        badge: 'border-amber-200 bg-amber-50 text-amber-800'
    },
    alto_margen_impulsar: {
        nombre: 'Alto Margen por Impulsar',
        hex: '#0284c7', // sky-600
        bg: 'bg-sky-50',
        border: 'border-sky-200',
        text: 'text-sky-700',
        badge: 'border-sky-200 bg-sky-50 text-sky-800'
    },
    bajo_rendimiento: {
        nombre: 'Bajo Rendimiento',
        hex: '#64748b', // slate-500
        bg: 'bg-slate-50',
        border: 'border-slate-200',
        text: 'text-slate-700',
        badge: 'border-slate-200 bg-slate-100 text-slate-700'
    }
};

const NOMBRES_URGENCIA = {
    vencido: 'Vencidos',
    critico_7d: 'Crítico ≤ 7 Días',
    alerta_15d: 'Alerta ≤ 15 Días',
    atencion_30d: 'Atención ≤ 30 Días'
};

function formatearBs(valor) {
    const num = Number(valor);
    if (!Number.isFinite(num)) return 'Bs 0.00';
    return `Bs ${num.toFixed(2)}`;
}

function formatearNumero(valor, decimales = 2) {
    const num = Number(valor);
    if (!Number.isFinite(num)) return '0';
    return num.toLocaleString('es-BO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimales
    });
}

export default function TabInteligenciaNegocio({
    metricas: metricasProp,
    configuracionNegocio,
    setMensaje,
    setError
}) {
    // Estado de montaje para evitar discrepancias de SSR con Recharts
    const [montado, setMontado] = useState(false);
    useEffect(() => {
        setMontado(true);
    }, []);

    // Estados principales
    const [subPestana, setSubPestana] = useState('rendimiento'); // 'rendimiento' | 'reposicion' | 'vencimientos'
    const [diasVentana, setDiasVentana] = useState(30);
    const [metricas, setMetricas] = useState(metricasProp || null);
    const [cargando, setCargando] = useState(!metricasProp);
    const [isPending, startTransition] = useTransition();

    // Filtros y búsquedas
    const [filtroCuadrante, setFiltroCuadrante] = useState('todos');
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [tipoGraficoRendimiento, setTipoGraficoRendimiento] = useState('dispersion'); // 'dispersion' | 'barras'
    const [deltaPrecioSimulado, setDeltaPrecioSimulado] = useState(1.0); // +Bs 1.00 por defecto

    // Referencias y controles fijos de desplazamiento horizontal suave
    const scrollGraficoRef = useRef(null);
    const scrollTablaRendimientoRef = useRef(null);
    const scrollTablaReposicionRef = useRef(null);
    const scrollTablaRadarRef = useRef(null);

    const [arrastrandoGrafico, setArrastrandoGrafico] = useState(false);
    const [startXGrafico, setStartXGrafico] = useState(0);
    const [scrollLeftGrafico, setScrollLeftGrafico] = useState(0);

    const scrollHorizontal = (ref, offset) => {
        if (ref?.current) {
            ref.current.scrollBy({ left: offset, behavior: 'smooth' });
        }
    };

    const scrollExtremo = (ref, destino) => {
        if (ref?.current) {
            ref.current.scrollTo({
                left: destino === 'inicio' ? 0 : ref.current.scrollWidth,
                behavior: 'smooth'
            });
        }
    };

    const handleMouseDownGrafico = (e) => {
        if (!scrollGraficoRef.current) return;
        setArrastrandoGrafico(true);
        setStartXGrafico(e.pageX - scrollGraficoRef.current.offsetLeft);
        setScrollLeftGrafico(scrollGraficoRef.current.scrollLeft);
    };

    const handleMouseLeaveGrafico = () => {
        setArrastrandoGrafico(false);
    };

    const handleMouseUpGrafico = () => {
        setArrastrandoGrafico(false);
    };

    const handleMouseMoveGrafico = (e) => {
        if (!arrastrandoGrafico || !scrollGraficoRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollGraficoRef.current.offsetLeft;
        const walk = (x - startXGrafico) * 1.5;
        scrollGraficoRef.current.scrollLeft = scrollLeftGrafico - walk;
    };

    // Semáforo de reposición
    const [filtroReposicion, setFiltroReposicion] = useState('todos'); // 'todos' | 'agotados' | 'insumos' | 'productos'
    const [busquedaReposicion, setBusquedaReposicion] = useState('');
    const [copiadoWhatsApp, setCopiadoWhatsApp] = useState(false);

    // Radar de vencimientos
    const [filtroUrgencia, setFiltroUrgencia] = useState('todos'); // 'todos' | 'vencido' | 'critico_7d' | 'alerta_15d' | 'atencion_30d'
    const [busquedaVencimientos, setBusquedaVencimientos] = useState('');

    // Variables diferidas para optimizar el rendimiento reactivo de búsqueda
    const busquedaProductoDiferida = useDeferredValue(busquedaProducto);
    const busquedaReposicionDiferida = useDeferredValue(busquedaReposicion);
    const busquedaVencimientosDiferida = useDeferredValue(busquedaVencimientos);

    // Carga de datos
    const cargarMetricas = async (dias = diasVentana) => {
        setCargando(true);
        try {
            const res = await obtenerMetricasInteligenciaAction({ dias });
            if ((res?.ok || res?.success) && res?.data) {
                setMetricas(res.data);
            } else if (res?.error) {
                if (setError) setError(res.error);
            }
        } catch (err) {
            if (setError) setError(err.message || 'Error al cargar métricas de inteligencia');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        if (!metricasProp) {
            cargarMetricas(diasVentana);
        } else {
            setMetricas(metricasProp);
        }
    }, [metricasProp]);

    // Manejo de cambio de ventana temporal
    const handleCambiarDias = (nuevosDias) => {
        setDiasVentana(nuevosDias);
        startTransition(() => {
            cargarMetricas(nuevosDias);
        });
    };

    // --- 1. DATOS DE MATRIZ DE RENDIMIENTO ---
    const matriz = metricas?.matrizRendimiento || {};
    const productosRendimiento = useMemo(() => {
        return Array.isArray(matriz.productos) ? matriz.productos : [];
    }, [matriz.productos]);

    const promedios = matriz.promedios || {
        volumen: matriz.promedioVolumen || 0,
        margen: matriz.promedioMargen || 0
    };

    const cuadrantes = useMemo(() => {
        return matriz.cuadrantes || {
            lideres: productosRendimiento.filter((p) => p.estado === 'lideres'),
            volumen_bajo_margen: productosRendimiento.filter((p) => p.estado === 'volumen_bajo_margen'),
            alto_margen_impulsar: productosRendimiento.filter((p) => p.estado === 'alto_margen_impulsar'),
            bajo_rendimiento: productosRendimiento.filter((p) => p.estado === 'bajo_rendimiento')
        };
    }, [matriz.cuadrantes, productosRendimiento]);

    // Productos filtrados para la tabla de rendimiento
    const productosFiltradosRendimiento = useMemo(() => {
        return productosRendimiento.filter((p) => {
            const coincideFiltro = filtroCuadrante === 'todos' || p.estado === filtroCuadrante;
            const coincideBusqueda = !busquedaProductoDiferida.trim() ||
                p.producto_nombre?.toLowerCase().includes(busquedaProductoDiferida.toLowerCase()) ||
                p.categoria?.toLowerCase().includes(busquedaProductoDiferida.toLowerCase());
            return coincideFiltro && coincideBusqueda;
        });
    }, [productosRendimiento, filtroCuadrante, busquedaProductoDiferida]);

    // Datos para el gráfico de dispersión (Scatter)
    const datosDispersion = useMemo(() => {
        return productosRendimiento.map((p) => ({
            id: p.producto_id,
            nombre: p.producto_nombre,
            categoria: p.categoria,
            volumen: Number(p.unidades_vendidas || 0),
            margenUnitario: Number(p.margen_unitario_promedio || 0),
            margenTotal: Number(p.margen_total || 0),
            ingresos: Number(p.ingresos_totales || 0),
            estado: p.estado || 'bajo_rendimiento'
        }));
    }, [productosRendimiento]);

    // Top 8 productos para comparativa de barras
    const datosBarrasComparativas = useMemo(() => {
        return [...productosRendimiento]
            .sort((a, b) => Number(b.ingresos_totales || 0) - Number(a.ingresos_totales || 0))
            .slice(0, 8)
            .map((p) => ({
                nombre: p.producto_nombre || 'Producto',
                nombreCompleto: p.producto_nombre || 'Producto',
                ingresos: Number(p.ingresos_totales || 0),
                costo: Number(p.costo_total || 0),
                ganancia: Number(p.margen_total || 0),
                unidades: Number(p.unidades_vendidas || 0)
            }));
    }, [productosRendimiento]);

    // Cálculo macro de simulación de impacto de precio
    const impactoTotalProyectado = useMemo(() => {
        const factorDias = diasVentana > 0 ? (30 / diasVentana) : 1;
        return productosFiltradosRendimiento.reduce((acc, p) => {
            const unidadesMes = Number(p.unidades_vendidas || 0) * factorDias;
            return acc + (unidadesMes * Number(deltaPrecioSimulado || 0));
        }, 0);
    }, [productosFiltradosRendimiento, deltaPrecioSimulado, diasVentana]);

    // --- 2. DATOS DE SEMÁFORO DE REPOSICIÓN ---
    const reposicion = metricas?.semaforoReposicion || {};
    const itemsReposicion = useMemo(() => {
        return Array.isArray(reposicion.items) ? reposicion.items : [];
    }, [reposicion.items]);

    const itemsReposicionFiltrados = useMemo(() => {
        return itemsReposicion.filter((it) => {
            let coincideTipo = true;
            if (filtroReposicion === 'agotados') coincideTipo = Number(it.stock_actual || 0) <= 0;
            else if (filtroReposicion === 'insumos') coincideTipo = it.tipo === 'insumo';
            else if (filtroReposicion === 'productos') coincideTipo = it.tipo === 'producto';

            const coincideBusqueda = !busquedaReposicionDiferida.trim() ||
                it.nombre?.toLowerCase().includes(busquedaReposicionDiferida.toLowerCase()) ||
                it.categoria?.toLowerCase().includes(busquedaReposicionDiferida.toLowerCase());

            return coincideTipo && coincideBusqueda;
        });
    }, [itemsReposicion, filtroReposicion, busquedaReposicionDiferida]);

    const costoInversionTotal = useMemo(() => {
        return itemsReposicion.reduce((acc, it) => acc + Number(it.costo_estimado_inversion || 0), 0);
    }, [itemsReposicion]);

    // Función para copiar la lista de compras formateada para WhatsApp
    const copiarListaWhatsApp = async () => {
        if (itemsReposicion.length === 0) return;

        const nombreNegocio = configuracionNegocio?.nombre_negocio || 'Control de Cajas';
        const fechaHoy = new Date().toLocaleDateString('es-BO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        let texto = `📋 *LISTA DE COMPRAS Y REPOSICIÓN*\n`;
        texto += `🏪 *${nombreNegocio}*\n`;
        texto += `📅 *Fecha:* ${fechaHoy}\n`;
        texto += `⚠️ *Ítems Críticos Requeridos:* ${itemsReposicion.length}\n`;
        texto += `-------------------------------------------\n\n`;

        itemsReposicion.forEach((it, idx) => {
            const stockAct = Number(it.stock_actual || 0);
            const sug = Number(it.sugerencia_compra || 0);
            const unidad = it.unidad_medida || 'unidades';
            const costoEst = Number(it.costo_estimado_inversion || 0);
            const estadoBadge = stockAct <= 0 ? '🔴 AGOTADO' : '🟡 BAJO MÍNIMO';

            texto += `${idx + 1}. *${it.nombre}* [${estadoBadge}]\n`;
            texto += `   • Sugerido a comprar: *${formatearNumero(sug)} ${unidad}*\n`;
            texto += `   • Stock actual: ${formatearNumero(stockAct)} (Mín: ${formatearNumero(it.stock_minimo)})\n`;
            if (costoEst > 0) {
                texto += `   • Inversión est.: Bs ${costoEst.toFixed(2)}\n`;
            }
            texto += `\n`;
        });

        texto += `-------------------------------------------\n`;
        texto += `💰 *INVERSIÓN TOTAL ESTIMADA:* Bs ${costoInversionTotal.toFixed(2)}\n`;
        texto += `_Generado automáticamente desde Sistema POS Cajas_`;

        try {
            await navigator.clipboard.writeText(texto);
            setCopiadoWhatsApp(true);
            if (setMensaje) setMensaje('¡Lista de compras copiada al portapapeles! Lista para pegar en WhatsApp.');
            setTimeout(() => setCopiadoWhatsApp(false), 3500);
        } catch (_) {
            if (setError) setError('No se pudo acceder al portapapeles.');
        }
    };

    // --- 3. DATOS DE RADAR DE VENCIMIENTOS ---
    const radar = metricas?.radarVencimientos || {};
    const alertasRadar = useMemo(() => {
        return Array.isArray(radar.alertas) ? radar.alertas : (Array.isArray(radar.items) ? radar.items : []);
    }, [radar.alertas, radar.items]);

    const resumenRadar = useMemo(() => {
        return radar.resumen || {
            vencidos: alertasRadar.filter((a) => a.urgencia === 'vencido').length,
            critico_7d: alertasRadar.filter((a) => a.urgencia === 'critico_7d').length,
            alerta_15d: alertasRadar.filter((a) => a.urgencia === 'alerta_15d').length,
            atencion_30d: alertasRadar.filter((a) => a.urgencia === 'atencion_30d').length,
            totalEnRiesgo: alertasRadar.length
        };
    }, [radar.resumen, alertasRadar]);

    const valorTotalEnRiesgo = useMemo(() => {
        return alertasRadar.reduce((acc, it) => acc + Number(it.valor_en_riesgo || 0), 0);
    }, [alertasRadar]);

    const alertasRadarFiltradas = useMemo(() => {
        return alertasRadar.filter((a) => {
            const coincideUrgencia = filtroUrgencia === 'todos' || a.urgencia === filtroUrgencia;
            const coincideBusqueda = !busquedaVencimientosDiferida.trim() ||
                a.nombre?.toLowerCase().includes(busquedaVencimientosDiferida.toLowerCase()) ||
                a.categoria?.toLowerCase().includes(busquedaVencimientosDiferida.toLowerCase());
            return coincideUrgencia && coincideBusqueda;
        });
    }, [alertasRadar, filtroUrgencia, busquedaVencimientosDiferida]);

    return (
        <div className="space-y-6">
            {/* Header del Tab con Controles Globales */}
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-md border border-slate-800">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <Sparkles className="w-5 h-5" />
                        </span>
                        <h2 className="text-lg md:text-xl font-bold tracking-tight text-white">
                            Inteligencia Operativa y Comercial
                        </h2>
                    </div>
                    <p className="text-xs text-slate-300">
                        Análisis matricial de rentabilidad, reposición preventiva de stock y control PEPS de vencimientos.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Selector de ventana temporal para análisis */}
                    <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
                        <span className="px-2 text-slate-400 font-medium hidden sm:inline flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" /> Ventana:
                        </span>
                        {[7, 15, 30, 90].map((dias) => (
                            <button
                                key={dias}
                                onClick={() => handleCambiarDias(dias)}
                                disabled={cargando || isPending}
                                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                                    diasVentana === dias
                                        ? 'bg-emerald-500 text-white shadow-sm'
                                        : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                                }`}
                            >
                                {dias}d
                            </button>
                        ))}
                    </div>

                    {/* Botón de recarga */}
                    <button
                        onClick={() => cargarMetricas(diasVentana)}
                        disabled={cargando || isPending}
                        title="Actualizar métricas"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white transition-all disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${cargando || isPending ? 'animate-spin text-emerald-400' : ''}`} />
                    </button>
                </div>
            </header>

            {/* Barra de Navegación de Sub-Paneles (Tabs Limpias, Sólidas y Centradas) */}
            <nav className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button
                    type="button"
                    onClick={() => setSubPestana('rendimiento')}
                    className={`flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all text-center min-h-[44px] cursor-pointer ${
                        subPestana === 'rendimiento'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-medium'
                    }`}
                >
                    <TrendingUp className={`w-4 h-4 shrink-0 ${subPestana === 'rendimiento' ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>1. Rendimiento y Rentabilidad</span>
                    {productosRendimiento.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                            subPestana === 'rendimiento' ? 'bg-slate-800 text-emerald-300' : 'bg-slate-200 text-slate-700'
                        }`}>
                            {productosRendimiento.length}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setSubPestana('reposicion')}
                    className={`flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all text-center min-h-[44px] cursor-pointer ${
                        subPestana === 'reposicion'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-medium'
                    }`}
                >
                    <ShoppingCart className={`w-4 h-4 shrink-0 ${subPestana === 'reposicion' ? 'text-amber-400' : 'text-slate-500'}`} />
                    <span>2. Semáforo de Reposición</span>
                    {itemsReposicion.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                            subPestana === 'reposicion' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-amber-100 text-amber-800'
                        }`}>
                            {itemsReposicion.length}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setSubPestana('vencimientos')}
                    className={`flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all text-center min-h-[44px] cursor-pointer ${
                        subPestana === 'vencimientos'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-medium'
                    }`}
                >
                    <Clock className={`w-4 h-4 shrink-0 ${subPestana === 'vencimientos' ? 'text-sky-400' : 'text-slate-500'}`} />
                    <span>3. Radar de Vencimientos</span>
                    {alertasRadar.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                            subPestana === 'vencimientos' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-sky-100 text-sky-800'
                        }`}>
                            {alertasRadar.length}
                        </span>
                    )}
                </button>
            </nav>

            {/* Estado de Carga */}
            {cargando && (
                <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium text-slate-600">Calculando indicadores de inteligencia operativa...</p>
                </div>
            )}

            {/* ========================================================================= */}
            {/* PANEL 1: RENDIMIENTO Y RENTABILIDAD (MATRIZ BCG / INGENIERÍA DE PRODUCTOS) */}
            {/* ========================================================================= */}
            {!cargando && subPestana === 'rendimiento' && (
                <div className="space-y-6">
                    {/* 4 Tarjetas Resumen Ejecutivas con Badges Semánticos (Filtros Interactivos Centrados) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* 🟢 Líderes de Ganancia */}
                        <button
                            type="button"
                            onClick={() => setFiltroCuadrante(filtroCuadrante === 'lideres' ? 'todos' : 'lideres')}
                            className={`w-full text-left rounded-2xl border p-4 sm:p-5 bg-white transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between h-full ${
                                filtroCuadrante === 'lideres'
                                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 shadow-sm'
                                    : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-200 bg-emerald-50 text-emerald-800">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        Líderes de Ganancia
                                    </span>
                                    <span className="text-xl font-black text-emerald-600">
                                        {cuadrantes.lideres.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 leading-snug">Alto volumen y alto margen unitario.</p>
                                    <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 text-[11px] text-emerald-900 leading-tight">
                                        💡 <strong>Estrategia:</strong> Proteger stock y calidad, mantener visibilidad prioritaria.
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                <span className={`font-semibold ${filtroCuadrante === 'lideres' ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    {filtroCuadrante === 'lideres' ? '✓ Filtro activo' : 'Clic para filtrar'}
                                </span>
                                {filtroCuadrante === 'lideres' && (
                                    <span className="text-slate-400 text-[10px] hover:underline">Quitar</span>
                                )}
                            </div>
                        </button>

                        {/* 🟡 Volumen con Margen Bajo */}
                        <button
                            type="button"
                            onClick={() => setFiltroCuadrante(filtroCuadrante === 'volumen_bajo_margen' ? 'todos' : 'volumen_bajo_margen')}
                            className={`w-full text-left rounded-2xl border p-4 sm:p-5 bg-white transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between h-full ${
                                filtroCuadrante === 'volumen_bajo_margen'
                                    ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20 shadow-sm'
                                    : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-200 bg-amber-50 text-amber-800">
                                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                                        Volumen Margen Bajo
                                    </span>
                                    <span className="text-xl font-black text-amber-600">
                                        {cuadrantes.volumen_bajo_margen.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 leading-snug">Alto volumen pero margen reducido.</p>
                                    <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100 text-[11px] text-amber-900 leading-tight">
                                        💡 <strong>Sugerencia:</strong> Renegociar costos con proveedor o ajustar precio +Bs 1-2.
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                <span className={`font-semibold ${filtroCuadrante === 'volumen_bajo_margen' ? 'text-amber-700' : 'text-slate-400'}`}>
                                    {filtroCuadrante === 'volumen_bajo_margen' ? '✓ Filtro activo' : 'Clic para filtrar'}
                                </span>
                                {filtroCuadrante === 'volumen_bajo_margen' && (
                                    <span className="text-slate-400 text-[10px] hover:underline">Quitar</span>
                                )}
                            </div>
                        </button>

                        {/* 🔵 Alto Margen por Impulsar */}
                        <button
                            type="button"
                            onClick={() => setFiltroCuadrante(filtroCuadrante === 'alto_margen_impulsar' ? 'todos' : 'alto_margen_impulsar')}
                            className={`w-full text-left rounded-2xl border p-4 sm:p-5 bg-white transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between h-full ${
                                filtroCuadrante === 'alto_margen_impulsar'
                                    ? 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-50/20 shadow-sm'
                                    : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-sky-200 bg-sky-50 text-sky-800">
                                        <span className="w-2 h-2 rounded-full bg-sky-500" />
                                        Alto Margen Impulsar
                                    </span>
                                    <span className="text-xl font-black text-sky-600">
                                        {cuadrantes.alto_margen_impulsar.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 leading-snug">Buen margen con baja venta.</p>
                                    <div className="p-2.5 rounded-xl bg-sky-50/60 border border-sky-100 text-[11px] text-sky-900 leading-tight">
                                        💡 <strong>Sugerencia:</strong> Venta activa en caja, sugerir a comensales o incluir en combos.
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                <span className={`font-semibold ${filtroCuadrante === 'alto_margen_impulsar' ? 'text-sky-700' : 'text-slate-400'}`}>
                                    {filtroCuadrante === 'alto_margen_impulsar' ? '✓ Filtro activo' : 'Clic para filtrar'}
                                </span>
                                {filtroCuadrante === 'alto_margen_impulsar' && (
                                    <span className="text-slate-400 text-[10px] hover:underline">Quitar</span>
                                )}
                            </div>
                        </button>

                        {/* ⚪ Bajo Rendimiento */}
                        <button
                            type="button"
                            onClick={() => setFiltroCuadrante(filtroCuadrante === 'bajo_rendimiento' ? 'todos' : 'bajo_rendimiento')}
                            className={`w-full text-left rounded-2xl border p-4 sm:p-5 bg-white transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between h-full ${
                                filtroCuadrante === 'bajo_rendimiento'
                                    ? 'border-slate-500 ring-2 ring-slate-500/20 bg-slate-50/50 shadow-sm'
                                    : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-200 bg-slate-100 text-slate-700">
                                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                                        Bajo Rendimiento
                                    </span>
                                    <span className="text-xl font-black text-slate-700">
                                        {cuadrantes.bajo_rendimiento.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 leading-snug">Bajo volumen y margen estrecho.</p>
                                    <div className="p-2.5 rounded-xl bg-slate-100/70 border border-slate-200 text-[11px] text-slate-800 leading-tight">
                                        💡 <strong>Sugerencia:</strong> Evaluar sustitución, reformular receta o descontinuar.
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                <span className={`font-semibold ${filtroCuadrante === 'bajo_rendimiento' ? 'text-slate-800' : 'text-slate-400'}`}>
                                    {filtroCuadrante === 'bajo_rendimiento' ? '✓ Filtro activo' : 'Clic para filtrar'}
                                </span>
                                {filtroCuadrante === 'bajo_rendimiento' && (
                                    <span className="text-slate-400 text-[10px] hover:underline">Quitar</span>
                                )}
                            </div>
                        </button>
                    </div>

                    {/* Gráfico Recharts: Dispersión de Cuadrantes o Barras Comparativas */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>Contraste Visual: Margen de Ganancia vs Volumen Vendido</span>
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Promedio de volumen: <strong>{formatearNumero(promedios.volumen)} un.</strong> | Promedio de margen: <strong>{formatearBs(promedios.margen)}</strong>
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                                {/* Controles fijos de desplazamiento horizontal del gráfico */}
                                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs border border-slate-200/80 shadow-xs">
                                    <button
                                        type="button"
                                        onClick={() => scrollExtremo(scrollGraficoRef, 'inicio')}
                                        title="Ir al inicio del gráfico"
                                        className="px-2 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        Inicio
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollHorizontal(scrollGraficoRef, -280)}
                                        title="Desplazar gráfico a la izquierda"
                                        className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="px-2 text-[11px] font-semibold text-slate-600 select-none">
                                        Desplazar Gráfico
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => scrollHorizontal(scrollGraficoRef, 280)}
                                        title="Desplazar gráfico a la derecha"
                                        className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollExtremo(scrollGraficoRef, 'fin')}
                                        title="Ir al final del gráfico"
                                        className="px-2 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        Fin
                                    </button>
                                </div>

                                {/* Selector de visualización de gráfico */}
                                <div className="inline-flex items-center justify-center bg-slate-100 p-1 rounded-xl text-xs font-semibold border border-slate-200/60">
                                    <button
                                        type="button"
                                        onClick={() => setTipoGraficoRendimiento('dispersion')}
                                        className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer font-semibold ${
                                            tipoGraficoRendimiento === 'dispersion'
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        Matriz de Cuadrantes
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTipoGraficoRendimiento('barras')}
                                        className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer font-semibold ${
                                            tipoGraficoRendimiento === 'barras'
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        Top 8 Ingresos vs Costos
                                    </button>
                                </div>
                            </div>
                        </div>

                        {productosRendimiento.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-sm gap-2">
                                <Info className="w-8 h-8 text-slate-300" />
                                <span>No se registran ventas en la ventana seleccionada ({diasVentana} días).</span>
                            </div>
                        ) : montado && (
                            <div className="space-y-2">
                                <style dangerouslySetInnerHTML={{ __html: `
                                    .recharts-wrapper,
                                    .recharts-wrapper:focus,
                                    .recharts-wrapper:focus-visible,
                                    .recharts-wrapper:focus-within,
                                    .recharts-wrapper *,
                                    .recharts-surface,
                                    .recharts-surface:focus,
                                    .recharts-surface:focus-visible,
                                    .recharts-surface *,
                                    svg.recharts-surface,
                                    svg.recharts-surface:focus,
                                    svg.recharts-surface:focus-visible,
                                    svg.recharts-surface * {
                                        outline: none !important;
                                        outline-style: none !important;
                                        outline-width: 0px !important;
                                        outline-color: transparent !important;
                                        box-shadow: none !important;
                                        -webkit-focus-ring-color: transparent !important;
                                        -webkit-tap-highlight-color: transparent !important;
                                    }
                                ` }} />
                                <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                                    <span className="flex items-center gap-1.5 text-slate-600">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        Lienzo de Análisis Gráfico (Arrastra con el mouse o usa los botones para mover)
                                    </span>
                                    <span className="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 font-medium">
                                        ↔ Barra fija de desplazamiento
                                    </span>
                                </div>
                                <div
                                    ref={scrollGraficoRef}
                                    onMouseDown={handleMouseDownGrafico}
                                    onMouseLeave={handleMouseLeaveGrafico}
                                    onMouseUp={handleMouseUpGrafico}
                                    onMouseMove={handleMouseMoveGrafico}
                                    className={`w-full overflow-x-scroll custom-scrollbar pb-3 pt-1 border border-slate-200/80 rounded-2xl bg-slate-50/40 p-2.5 outline-none focus:outline-none focus-visible:outline-none select-none ${
                                        arrastrandoGrafico ? 'cursor-grabbing' : 'cursor-grab'
                                    }`}
                                >
                                    <div className={`${tipoGraficoRendimiento === 'barras' ? 'min-w-[1020px] h-[460px]' : 'min-w-[840px] h-[400px]'} w-full outline-none focus:outline-none transition-all duration-200`} style={{ outline: 'none' }}>
                                        {tipoGraficoRendimiento === 'dispersion' ? (
                                            <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none' }}>
                                                <ScatterChart
                                                    style={{ outline: 'none' }}
                                                    tabIndex={-1}
                                                    margin={{ top: 25, right: 35, bottom: 35, left: 20 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis
                                                        type="number"
                                                        dataKey="volumen"
                                                        name="Volumen (Unidades)"
                                                        unit=" un"
                                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                                        label={{ value: 'Volumen Vendido (Unidades)', position: 'insideBottom', offset: -16, fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                                                    />
                                                    <YAxis
                                                        type="number"
                                                        dataKey="margenUnitario"
                                                        name="Margen Unitario (Bs)"
                                                        unit=" Bs"
                                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                                        label={{ value: 'Margen Unitario (Bs)', angle: -90, position: 'insideLeft', offset: -6, fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                                                    />
                                                    <ZAxis range={[70, 240]} />
                                                    <Tooltip
                                                        cursor={{ strokeDasharray: '3 3' }}
                                                        content={({ active, payload }) => {
                                                            if (!active || !payload || !payload.length) return null;
                                                            const d = payload[0].payload;
                                                            const estilo = COLORES_CUADRANTES[d.estado] || COLORES_CUADRANTES.bajo_rendimiento;
                                                            return (
                                                                <div className="rounded-xl bg-white/95 backdrop-blur-xs border border-slate-200 p-3 shadow-xl text-xs space-y-1.5 max-w-[250px] pointer-events-none select-none">
                                                                    <div className="font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center justify-between gap-2">
                                                                        <span className="truncate">{d.nombre}</span>
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${estilo.bg} ${estilo.text}`}>
                                                                            {estilo.nombre}
                                                                        </span>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-x-2 text-slate-600 text-[11px] pt-0.5">
                                                                        <span>Volumen:</span>
                                                                        <span className="font-semibold text-right text-slate-900">{formatearNumero(d.volumen)} un</span>
                                                                        <span>Margen Unit.:</span>
                                                                        <span className="font-semibold text-right text-emerald-600">{formatearBs(d.margenUnitario)}</span>
                                                                        <span>Margen Total:</span>
                                                                        <span className="font-semibold text-right text-emerald-600">{formatearBs(d.margenTotal)}</span>
                                                                        <span>Ingresos:</span>
                                                                        <span className="font-semibold text-right text-slate-900">{formatearBs(d.ingresos)}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }}
                                                    />
                                                    {/* Líneas de referencia para dividir los 4 cuadrantes con etiquetas protegidas de cortes */}
                                                    <ReferenceLine
                                                        x={promedios.volumen}
                                                        stroke="#94a3b8"
                                                        strokeDasharray="4 4"
                                                        label={{ value: 'Prom. Volumen', fill: '#475569', fontSize: 11, position: 'insideTopLeft', offset: 8, fontWeight: 700 }}
                                                    />
                                                    <ReferenceLine
                                                        y={promedios.margen}
                                                        stroke="#94a3b8"
                                                        strokeDasharray="4 4"
                                                        label={{ value: 'Prom. Margen', fill: '#475569', fontSize: 11, position: 'insideBottomRight', offset: 8, fontWeight: 700 }}
                                                    />
                                                    <Scatter
                                                        name="Productos"
                                                        data={datosDispersion}
                                                        shape={(props) => {
                                                            const { cx, cy, fill } = props;
                                                            return (
                                                                <circle
                                                                    cx={cx}
                                                                    cy={cy}
                                                                    r={6.5}
                                                                    fill={fill}
                                                                    stroke="#ffffff"
                                                                    strokeWidth={2}
                                                                    className="transition-transform duration-150 hover:scale-125 cursor-pointer filter drop-shadow-xs"
                                                                />
                                                            );
                                                        }}
                                                    >
                                                        {datosDispersion.map((entry, index) => {
                                                            const color = COLORES_CUADRANTES[entry.estado]?.hex || '#64748b';
                                                            return <Cell key={`cell-${index}`} fill={color} />;
                                                        })}
                                                    </Scatter>
                                                </ScatterChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none' }}>
                                                <BarChart
                                                    style={{ outline: 'none' }}
                                                    tabIndex={-1}
                                                    data={datosBarrasComparativas}
                                                    margin={{ top: 20, right: 35, left: 15, bottom: 25 }}
                                                    barCategoryGap="20%"
                                                    barGap={4}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis
                                                        dataKey="nombre"
                                                        height={85}
                                                        tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                                                        interval={0}
                                                        angle={-30}
                                                        textAnchor="end"
                                                    />
                                                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                                                    <Tooltip
                                                        formatter={(val, name) => [formatearBs(val), name]}
                                                        labelFormatter={(label, payload) => {
                                                            const item = payload?.[0]?.payload;
                                                            return item?.nombreCompleto || item?.nombre || label;
                                                        }}
                                                        contentStyle={{
                                                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                                                            backdropFilter: 'blur(8px)',
                                                            borderRadius: '14px',
                                                            border: '1px solid #e2e8f0',
                                                            fontSize: '12px',
                                                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12)',
                                                            padding: '12px 16px'
                                                        }}
                                                        labelStyle={{ fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}
                                                    />
                                                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: '15px' }} />
                                                    <Bar dataKey="ingresos" name="Ingresos Totales (Bs)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="ganancia" name="Margen Bruto (Bs)" fill="#10b981" radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="costo" name="Costo CMV (Bs)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Simulador Interactivo de Sensibilidad e Impacto de Precio */}
                    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/30 p-5 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                                    <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                                    Simulador de Sensibilidad de Precios
                                </span>
                                <h4 className="text-sm font-bold text-slate-800">
                                    ¿Cuánto ganarías si ajustas levemente los precios de venta?
                                </h4>
                                <p className="text-xs text-slate-600">
                                    Simula el impacto de margen mensual asumiendo demanda constante con incrementos de precio en los productos filtrados.
                                </p>
                            </div>

                            <div className="flex items-center gap-2 self-start sm:self-auto">
                                <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Δ Precio:</span>
                                <div className="inline-flex items-center bg-white border border-slate-300 rounded-xl p-1 shadow-sm gap-1">
                                    {[0.5, 1.0, 2.0, 5.0].map((delta) => (
                                        <button
                                            type="button"
                                            key={delta}
                                            onClick={() => setDeltaPrecioSimulado(delta)}
                                            className={`min-w-[62px] px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                                                deltaPrecioSimulado === delta
                                                    ? 'bg-emerald-600 text-white shadow-sm'
                                                    : 'text-slate-600 hover:bg-slate-100'
                                            }`}
                                        >
                                            +Bs {delta.toFixed(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Banner de resultado de la simulación */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-xl bg-white border border-emerald-200/80 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                                    <Flame className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div className="text-xs text-slate-700">
                                    <p className="font-semibold text-slate-900">
                                        Impacto Proyectado para los {productosFiltradosRendimiento.length} productos seleccionados:
                                    </p>
                                    <p className="text-slate-600">
                                        Ajustando <strong className="text-emerald-700">+Bs {deltaPrecioSimulado.toFixed(2)}</strong> por unidad, generarías aproximadamente:
                                    </p>
                                </div>
                            </div>

                            <div className="text-left sm:text-right shrink-0">
                                <span className="text-lg md:text-xl font-black text-emerald-600">
                                    +{formatearBs(impactoTotalProyectado)}
                                </span>
                                <span className="block text-[11px] font-medium text-slate-500">
                                    adicionales estimados por mes
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Detalle Filtrable con Simulación de Impacto */}
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-bold text-sm text-slate-800">
                                    Detalle Operativo de Catálogo
                                </h4>
                                <span className="text-xs text-slate-400">
                                    ({productosFiltradosRendimiento.length} de {productosRendimiento.length} ítems)
                                </span>
                                {filtroCuadrante !== 'todos' && (
                                    <button
                                        type="button"
                                        onClick={() => setFiltroCuadrante('todos')}
                                        title="Restablecer filtro a todos"
                                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200/80 hover:text-emerald-900 transition-all cursor-pointer shadow-2xs"
                                    >
                                        <span>Filtro: {COLORES_CUADRANTES[filtroCuadrante]?.nombre || filtroCuadrante}</span>
                                        <X className="w-3.5 h-3.5 text-emerald-700" />
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                {/* Controles fijos de desplazamiento lateral de la tabla */}
                                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs border border-slate-200/80 shadow-xs">
                                    <button
                                        type="button"
                                        onClick={() => scrollExtremo(scrollTablaRendimientoRef, 'inicio')}
                                        title="Ir al inicio de la tabla"
                                        className="px-2 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        Inicio
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollHorizontal(scrollTablaRendimientoRef, -300)}
                                        title="Desplazar tabla a la izquierda"
                                        className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="px-2 text-[11px] font-semibold text-slate-600 select-none">
                                        Desplazar Tabla
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => scrollHorizontal(scrollTablaRendimientoRef, 300)}
                                        title="Desplazar tabla a la derecha"
                                        className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollExtremo(scrollTablaRendimientoRef, 'fin')}
                                        title="Ir al final de la tabla"
                                        className="px-2 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        Fin
                                    </button>
                                </div>

                                {/* Buscador */}
                                <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Buscar producto o categoría..."
                                        value={busquedaProducto}
                                        onChange={(e) => setBusquedaProducto(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                                    />
                                </div>

                                {/* Filtro por Cuadrante */}
                                <select
                                    value={filtroCuadrante}
                                    onChange={(e) => setFiltroCuadrante(e.target.value)}
                                    className="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                                >
                                    <option value="todos">Todos los cuadrantes</option>
                                    <option value="lideres">🟢 Líderes de Ganancia ({cuadrantes.lideres.length})</option>
                                    <option value="volumen_bajo_margen">🟡 Volumen Margen Bajo ({cuadrantes.volumen_bajo_margen.length})</option>
                                    <option value="alto_margen_impulsar">🔵 Alto Margen por Impulsar ({cuadrantes.alto_margen_impulsar.length})</option>
                                    <option value="bajo_rendimiento">⚪ Bajo Rendimiento ({cuadrantes.bajo_rendimiento.length})</option>
                                </select>
                            </div>
                        </div>

                        <div
                            ref={scrollTablaRendimientoRef}
                            className="max-h-[540px] overflow-x-auto overflow-y-auto custom-scrollbar outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                            style={{ outline: 'none' }}
                        >
                            <table className="w-full min-w-[820px] text-left border-collapse text-xs outline-none focus:outline-none focus-visible:outline-none select-text">
                                <thead className="select-none sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
                                    <tr className="text-slate-600 font-semibold select-none">
                                        <th className="py-3 px-4 sticky left-0 z-30 bg-slate-50 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] min-w-[200px]">
                                            Producto
                                        </th>
                                        <th className="py-3 px-3 text-center min-w-[140px]">Clasificación</th>
                                        <th className="py-3 px-3 text-right min-w-[90px]">Volumen</th>
                                        <th className="py-3 px-3 text-right min-w-[100px]">Ingresos</th>
                                        <th className="py-3 px-3 text-right min-w-[100px]">Margen Unit.</th>
                                        <th className="py-3 px-3 text-right min-w-[110px]">Margen Total</th>
                                        <th className="py-3 px-4 text-right bg-emerald-50/70 text-emerald-800 font-bold min-w-[130px]">
                                            Simulación (+Bs {deltaPrecioSimulado.toFixed(1)})
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {productosFiltradosRendimiento.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-8 text-center text-slate-400">
                                                No se encontraron productos con los criterios especificados.
                                            </td>
                                        </tr>
                                    ) : (
                                        productosFiltradosRendimiento.map((p) => {
                                            const configCuadrante = COLORES_CUADRANTES[p.estado] || COLORES_CUADRANTES.bajo_rendimiento;
                                            const factorDias = diasVentana > 0 ? (30 / diasVentana) : 1;
                                            const impactoProducto = Number(p.unidades_vendidas || 0) * factorDias * Number(deltaPrecioSimulado || 0);

                                            return (
                                                <tr key={p.producto_id} className="group hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-3 px-4 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                                                        <div className="font-semibold text-slate-900">{p.producto_nombre}</div>
                                                        <span className="text-[11px] text-slate-400">{p.categoria || 'General'}</span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${configCuadrante.badge}`}>
                                                            {configCuadrante.nombre}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-medium">
                                                        {formatearNumero(p.unidades_vendidas)} un
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-medium">
                                                        {formatearBs(p.ingresos_totales)}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-semibold text-slate-900">
                                                        {formatearBs(p.margen_unitario_promedio)}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-bold text-emerald-600">
                                                        {formatearBs(p.margen_total)}
                                                    </td>
                                                    <td className="py-3 px-4 text-right bg-emerald-50/20 font-bold text-emerald-700">
                                                        +{formatearBs(impactoProducto)}/mes
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* PANEL 2: SEMÁFORO DE REPOSICIÓN (STOCK CRÍTICO Y COMPRAS PARA WHATSAPP)    */}
            {/* ========================================================================= */}
            {!cargando && subPestana === 'reposicion' && (
                <div className="space-y-6">
                    {/* Header Ejecutivo de Reposición (Tarjetas Balanceadas y Centradas) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <button
                            type="button"
                            onClick={() => setFiltroReposicion(filtroReposicion === 'agotados' ? 'todos' : 'agotados')}
                            className={`text-left rounded-2xl border p-4 sm:p-5 bg-white shadow-sm flex flex-col justify-between h-full transition-all duration-200 hover:shadow-md cursor-pointer ${
                                filtroReposicion === 'agotados'
                                    ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/20'
                                    : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> Total Ítems Críticos
                                    </span>
                                    <span className="text-2xl font-black text-slate-900">
                                        {itemsReposicion.length}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 leading-snug">
                                    {itemsReposicion.filter((it) => Number(it.stock_actual || 0) <= 0).length} agotados en cero
                                </p>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                                <span>Bajo stock de seguridad</span>
                                <span className="text-amber-600 font-semibold">{filtroReposicion === 'agotados' ? '✓ Filtrando agotados' : 'Clic para filtrar'}</span>
                            </div>
                        </button>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-col justify-between h-full">
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" /> Inversión Estimada
                                    </span>
                                    <span className="text-2xl font-black text-emerald-600">
                                        {formatearBs(costoInversionTotal)}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 leading-snug">
                                    Cálculo preventivo para reponer al mínimo requerido
                                </p>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-400">
                                Basado en costo unitario ponderado (CPP)
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-col justify-between h-full">
                            <div>
                                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                                    <Copy className="w-4 h-4 text-sky-600 shrink-0" /> Acción con Proveedores
                                </span>
                                <p className="text-xs text-slate-500 leading-snug">
                                    Genera la lista con cantidades sugeridas lista para WhatsApp.
                                </p>
                            </div>
                            <div className="mt-3">
                                <button
                                    type="button"
                                    onClick={copiarListaWhatsApp}
                                    disabled={itemsReposicion.length === 0}
                                    className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm min-h-[42px] cursor-pointer ${
                                        copiadoWhatsApp
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-emerald-500 hover:bg-emerald-600 text-white hover:shadow-md disabled:opacity-50'
                                    }`}
                                >
                                    {copiadoWhatsApp ? (
                                        <>
                                            <Check className="w-4 h-4" />
                                            <span>¡Lista Copiada para WhatsApp!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4" />
                                            <span>Copiar Lista de Compras</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Reposición */}
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-slate-800">
                                    Semáforo de Reposición y Sugerencias
                                </h4>
                                <span className="text-xs text-slate-400">
                                    ({itemsReposicionFiltrados.length} ítems)
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                {/* Controles fijos de desplazamiento de la tabla de reposición */}
                                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs border border-slate-200/80 shadow-xs">
                                    <button
                                        type="button"
                                        onClick={() => scrollExtremo(scrollTablaReposicionRef, 'inicio')}
                                        title="Ir al inicio de la tabla"
                                        className="px-2 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        Inicio
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollHorizontal(scrollTablaReposicionRef, -300)}
                                        title="Desplazar tabla a la izquierda"
                                        className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="px-2 text-[11px] font-semibold text-slate-600 select-none">
                                        Desplazar Tabla
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => scrollHorizontal(scrollTablaReposicionRef, 300)}
                                        title="Desplazar tabla a la derecha"
                                        className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollExtremo(scrollTablaReposicionRef, 'fin')}
                                        title="Ir al final de la tabla"
                                        className="px-2 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        Fin
                                    </button>
                                </div>

                                {/* Buscador */}
                                <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Buscar insumo o producto..."
                                        value={busquedaReposicion}
                                        onChange={(e) => setBusquedaReposicion(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
                                    />
                                </div>

                                {/* Botones Filtro por tipo */}
                                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold border border-slate-200/60">
                                    {[
                                        { id: 'todos', label: 'Todos' },
                                        { id: 'agotados', label: '🔴 Agotados' },
                                        { id: 'insumos', label: '🌾 Insumos' },
                                        { id: 'productos', label: '📦 Productos' }
                                    ].map((op) => (
                                        <button
                                            key={op.id}
                                            type="button"
                                            onClick={() => setFiltroReposicion(op.id)}
                                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer font-semibold ${
                                                filtroReposicion === op.id
                                                    ? 'bg-white text-slate-900 shadow-sm'
                                                    : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            {op.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div
                            ref={scrollTablaReposicionRef}
                            className="max-h-[540px] overflow-x-auto overflow-y-auto custom-scrollbar outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                            style={{ outline: 'none' }}
                        >
                            <table className="w-full min-w-[780px] text-left border-collapse text-xs outline-none focus:outline-none focus-visible:outline-none select-text">
                                <thead className="select-none sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
                                    <tr className="text-slate-600 font-semibold select-none">
                                        <th className="py-3 px-4 sticky left-0 z-30 bg-slate-50 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] min-w-[200px]">
                                            Ítem
                                        </th>
                                        <th className="py-3 px-3 text-center min-w-[100px]">Tipo</th>
                                        <th className="py-3 px-4 min-w-[150px]">Nivel de Stock</th>
                                        <th className="py-3 px-3 text-right min-w-[100px]">Stock Actual</th>
                                        <th className="py-3 px-3 text-right min-w-[90px]">Mínimo</th>
                                        <th className="py-3 px-3 text-right font-bold text-amber-700 min-w-[130px]">Sugerencia Compra</th>
                                        <th className="py-3 px-4 text-right font-bold text-slate-900 min-w-[110px]">Inversión Est.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {itemsReposicionFiltrados.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-8 text-center text-slate-400">
                                                <div className="flex flex-col items-center justify-center gap-1">
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                                    <span className="font-semibold text-slate-700">¡Inventario en niveles óptimos!</span>
                                                    <span className="text-xs text-slate-400">No hay productos ni insumos bajo su stock de seguridad.</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        itemsReposicionFiltrados.map((it) => {
                                            const stockAct = Number(it.stock_actual || 0);
                                            const stockMin = Number(it.stock_minimo || 1);
                                            const pct = Math.min(100, Math.max(0, Math.round((stockAct / (stockMin || 1)) * 100)));
                                            const estaAgotado = stockAct <= 0;

                                            return (
                                                <tr key={`${it.tipo}-${it.id}`} className="group hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-3 px-4 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                                                        <div className="font-semibold text-slate-900">{it.nombre}</div>
                                                        <span className="text-[11px] text-slate-400">{it.categoria}</span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                            it.tipo === 'insumo'
                                                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                                                        }`}>
                                                            {it.tipo === 'insumo' ? 'Insumo' : 'Producto'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center justify-between text-[10px] font-medium text-slate-500">
                                                                <span>{pct}% del mínimo</span>
                                                                {estaAgotado ? (
                                                                    <span className="text-red-600 font-bold">Agotado</span>
                                                                ) : (
                                                                    <span className="text-amber-600 font-semibold">Crítico</span>
                                                                )}
                                                            </div>
                                                            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${
                                                                        estaAgotado
                                                                            ? 'bg-red-500'
                                                                            : pct < 40
                                                                                ? 'bg-amber-500'
                                                                                : 'bg-emerald-500'
                                                                    }`}
                                                                    style={{ width: `${Math.max(4, pct)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-bold text-slate-900">
                                                        {formatearNumero(it.stock_actual)} {it.unidad_medida}
                                                    </td>
                                                    <td className="py-3 px-3 text-right text-slate-500">
                                                        {formatearNumero(it.stock_minimo)} {it.unidad_medida}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-bold text-amber-700 bg-amber-50/30">
                                                        +{formatearNumero(it.sugerencia_compra)} {it.unidad_medida}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                                                        {formatearBs(it.costo_estimado_inversion)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* PANEL 3: RADAR PREVENTIVO DE VENCIMIENTOS (LOTES PEPS Y ACCIONES)          */}
            {/* ========================================================================= */}
            {!cargando && subPestana === 'vencimientos' && (
                <div className="space-y-6">
                    {/* Tarjetas Resumen de Urgencia (Filtros Interactivos 4 Columnas Armónicas) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* 🔴 Vencidos */}
                        <button
                            type="button"
                            onClick={() => setFiltroUrgencia(filtroUrgencia === 'vencido' ? 'todos' : 'vencido')}
                            className={`w-full text-left rounded-2xl border p-4 sm:p-5 bg-white transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between h-full ${
                                filtroUrgencia === 'vencido'
                                    ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/20 shadow-sm'
                                    : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-red-200 bg-red-50 text-red-800">
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                        Vencidos
                                    </span>
                                    <span className="text-xl font-black text-red-600">
                                        {resumenRadar.vencidos} lotes
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 leading-snug">Fecha límite ya superada.</p>
                                    <div className="p-2.5 rounded-xl bg-red-50/60 border border-red-100 text-[11px] text-red-900 leading-tight">
                                        💡 <strong>Acción:</strong> Retirar inmediatamente de inventario y registrar baja por merma.
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                <span className={`font-semibold ${filtroUrgencia === 'vencido' ? 'text-red-700' : 'text-slate-400'}`}>
                                    {filtroUrgencia === 'vencido' ? '✓ Filtro activo' : 'Clic para filtrar'}
                                </span>
                                {filtroUrgencia === 'vencido' && (
                                    <span className="text-slate-400 text-[10px] hover:underline">Quitar</span>
                                )}
                            </div>
                        </button>

                        {/* 🟠 ≤ 7 Días */}
                        <button
                            type="button"
                            onClick={() => setFiltroUrgencia(filtroUrgencia === 'critico_7d' ? 'todos' : 'critico_7d')}
                            className={`w-full text-left rounded-2xl border p-4 sm:p-5 bg-white transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between h-full ${
                                filtroUrgencia === 'critico_7d'
                                    ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/20 shadow-sm'
                                    : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-orange-200 bg-orange-50 text-orange-800">
                                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                                        Crítico ≤ 7 Días
                                    </span>
                                    <span className="text-xl font-black text-orange-600">
                                        {resumenRadar.critico_7d} lotes
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 leading-snug">Vencimiento inminente esta semana.</p>
                                    <div className="p-2.5 rounded-xl bg-orange-50/60 border border-orange-100 text-[11px] text-orange-900 leading-tight">
                                        💡 <strong>Acción:</strong> Priorizar en caja, venta flash o combo de liquidación hoy.
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                <span className={`font-semibold ${filtroUrgencia === 'critico_7d' ? 'text-orange-700' : 'text-slate-400'}`}>
                                    {filtroUrgencia === 'critico_7d' ? '✓ Filtro activo' : 'Clic para filtrar'}
                                </span>
                                {filtroUrgencia === 'critico_7d' && (
                                    <span className="text-slate-400 text-[10px] hover:underline">Quitar</span>
                                )}
                            </div>
                        </button>

                        {/* 🟡 ≤ 15 Días */}
                        <button
                            type="button"
                            onClick={() => setFiltroUrgencia(filtroUrgencia === 'alerta_15d' ? 'todos' : 'alerta_15d')}
                            className={`w-full text-left rounded-2xl border p-4 sm:p-5 bg-white transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between h-full ${
                                filtroUrgencia === 'alerta_15d'
                                    ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20 shadow-sm'
                                    : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-200 bg-amber-50 text-amber-800">
                                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                                        Alerta ≤ 15 Días
                                    </span>
                                    <span className="text-xl font-black text-amber-600">
                                        {resumenRadar.alerta_15d} lotes
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 leading-snug">Vencimiento en próxima quincena.</p>
                                    <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100 text-[11px] text-amber-900 leading-tight">
                                        💡 <strong>Acción:</strong> Acelerar rotación activa en caja y no reponer stock nuevo.
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                <span className={`font-semibold ${filtroUrgencia === 'alerta_15d' ? 'text-amber-700' : 'text-slate-400'}`}>
                                    {filtroUrgencia === 'alerta_15d' ? '✓ Filtro activo' : 'Clic para filtrar'}
                                </span>
                                {filtroUrgencia === 'alerta_15d' && (
                                    <span className="text-slate-400 text-[10px] hover:underline">Quitar</span>
                                )}
                            </div>
                        </button>

                        {/* 🔵 ≤ 30 Días */}
                        <button
                            type="button"
                            onClick={() => setFiltroUrgencia(filtroUrgencia === 'atencion_30d' ? 'todos' : 'atencion_30d')}
                            className={`w-full text-left rounded-2xl border p-4 sm:p-5 bg-white transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between h-full ${
                                filtroUrgencia === 'atencion_30d'
                                    ? 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-50/20 shadow-sm'
                                    : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-sky-200 bg-sky-50 text-sky-800">
                                        <span className="w-2 h-2 rounded-full bg-sky-500" />
                                        Atención ≤ 30 Días
                                    </span>
                                    <span className="text-xl font-black text-sky-600">
                                        {resumenRadar.atencion_30d} lotes
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 leading-snug">Vencimiento dentro del mes.</p>
                                    <div className="p-2.5 rounded-xl bg-sky-50/60 border border-sky-100 text-[11px] text-sky-900 leading-tight">
                                        💡 <strong>Acción:</strong> Supervisar rotación PEPS/FIFO y programar consumo semanal.
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                <span className={`font-semibold ${filtroUrgencia === 'atencion_30d' ? 'text-sky-700' : 'text-slate-400'}`}>
                                    {filtroUrgencia === 'atencion_30d' ? '✓ Filtro activo' : 'Clic para filtrar'}
                                </span>
                                {filtroUrgencia === 'atencion_30d' && (
                                    <span className="text-slate-400 text-[10px] hover:underline">Quitar</span>
                                )}
                            </div>
                        </button>
                    </div>

                    {/* Banner de Capital Total en Riesgo */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-red-500/10 via-amber-500/10 to-transparent border border-red-200/60 shadow-sm">
                        <div className="flex items-center gap-3">
                            <span className="p-2.5 rounded-xl bg-red-100 text-red-700 font-bold shrink-0">
                                <ShieldAlert className="w-5 h-5" />
                            </span>
                            <div className="text-xs">
                                <h4 className="font-bold text-slate-900 text-sm">
                                    Capital Inmovilizado en Riesgo de Vencimiento
                                </h4>
                                <p className="text-slate-600">
                                    Total de mercadería perecedera en monitoreo preventivo dentro de los próximos 30 días.
                                </p>
                            </div>
                        </div>

                        <div className="text-left sm:text-right shrink-0">
                            <span className="text-xl font-black text-red-600">
                                {formatearBs(valorTotalEnRiesgo)}
                            </span>
                            <span className="block text-[11px] font-medium text-slate-500">
                                costo de inventario monitoreado
                            </span>
                        </div>
                    </div>

                    {/* Tabla Cronológica de Lotes e Insumos */}
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-bold text-sm text-slate-800">
                                    Lista Cronológica de Lotes y Fechas de Caducidad
                                </h4>
                                <span className="text-xs text-slate-400">
                                    ({alertasRadarFiltradas.length} ítems)
                                </span>
                                {filtroUrgencia !== 'todos' && (
                                    <button
                                        type="button"
                                        onClick={() => setFiltroUrgencia('todos')}
                                        title="Restablecer filtro a todos"
                                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200/80 hover:text-slate-900 transition-all cursor-pointer shadow-2xs"
                                    >
                                        <span>Filtro: {NOMBRES_URGENCIA[filtroUrgencia] || filtroUrgencia}</span>
                                        <X className="w-3.5 h-3.5 text-slate-600" />
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                {/* Controles fijos de desplazamiento de la tabla de vencimientos */}
                                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs border border-slate-200/80 shadow-xs">
                                    <button
                                        type="button"
                                        onClick={() => scrollExtremo(scrollTablaRadarRef, 'inicio')}
                                        title="Ir al inicio de la tabla"
                                        className="px-2 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        Inicio
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollHorizontal(scrollTablaRadarRef, -300)}
                                        title="Desplazar tabla a la izquierda"
                                        className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="px-2 text-[11px] font-semibold text-slate-600 select-none">
                                        Desplazar Tabla
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => scrollHorizontal(scrollTablaRadarRef, 300)}
                                        title="Desplazar tabla a la derecha"
                                        className="p-1.5 rounded-lg hover:bg-white text-slate-700 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollExtremo(scrollTablaRadarRef, 'fin')}
                                        title="Ir al final de la tabla"
                                        className="px-2 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                                    >
                                        Fin
                                    </button>
                                </div>

                                {/* Buscador */}
                                <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por lote o producto..."
                                        value={busquedaVencimientos}
                                        onChange={(e) => setBusquedaVencimientos(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 bg-white"
                                    />
                                </div>

                                {/* Botones Filtro por Urgencia */}
                                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold border border-slate-200/60">
                                    {[
                                        { id: 'todos', label: 'Todos' },
                                        { id: 'vencido', label: '🔴 Vencidos' },
                                        { id: 'critico_7d', label: '🟠 ≤ 7d' },
                                        { id: 'alerta_15d', label: '🟡 ≤ 15d' },
                                        { id: 'atencion_30d', label: '🔵 ≤ 30d' }
                                    ].map((op) => (
                                        <button
                                            key={op.id}
                                            type="button"
                                            onClick={() => setFiltroUrgencia(op.id)}
                                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer font-semibold ${
                                                filtroUrgencia === op.id
                                                    ? 'bg-white text-slate-900 shadow-sm'
                                                    : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            {op.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div
                            ref={scrollTablaRadarRef}
                            className="max-h-[540px] overflow-x-auto overflow-y-auto custom-scrollbar outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                            style={{ outline: 'none' }}
                        >
                            <table className="w-full min-w-[780px] text-left border-collapse text-xs outline-none focus:outline-none focus-visible:outline-none select-text">
                                <thead className="select-none sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
                                    <tr className="text-slate-600 font-semibold select-none">
                                        <th className="py-3 px-4 sticky left-0 z-30 bg-slate-50 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] min-w-[200px]">
                                            Ítem / Lote
                                        </th>
                                        <th className="py-3 px-3 text-center min-w-[100px]">Tipo</th>
                                        <th className="py-3 px-3 min-w-[120px]">Fecha Vencimiento</th>
                                        <th className="py-3 px-3 text-center min-w-[110px]">Urgencia</th>
                                        <th className="py-3 px-3 text-right min-w-[90px]">Stock</th>
                                        <th className="py-3 px-3 text-right min-w-[110px]">Valor en Riesgo</th>
                                        <th className="py-3 px-4 min-w-[240px]">Acción Recomendada</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {alertasRadarFiltradas.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-8 text-center text-slate-400">
                                                <div className="flex flex-col items-center justify-center gap-1">
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                                    <span className="font-semibold text-slate-700">¡Sin alertas críticas de vencimiento!</span>
                                                    <span className="text-xs text-slate-400">No hay lotes con fechas próximas a expirar en este criterio.</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        alertasRadarFiltradas.map((a) => {
                                            const dias = a.dias_restantes;
                                            const esVencido = dias !== null && dias < 0;

                                            // Configuración de badge y acción
                                            let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                                            let labelUrgencia = `${dias} días`;
                                            let accionRecomendada = 'Monitorear rotación habitual en inventario.';

                                            if (esVencido) {
                                                badgeClass = 'bg-red-100 text-red-800 border-red-300 font-bold';
                                                labelUrgencia = `Venció hace ${Math.abs(dias)}d`;
                                                accionRecomendada = 'Retirar inmediatamente de inventario y registrar baja por merma.';
                                            } else if (dias <= 7) {
                                                badgeClass = 'bg-orange-100 text-orange-800 border-orange-300 font-bold';
                                                labelUrgencia = `Vence en ${dias}d`;
                                                accionRecomendada = 'Priorizar en venta del día, lanzar promoción flash o combo de liquidación hoy.';
                                            } else if (dias <= 15) {
                                                badgeClass = 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
                                                labelUrgencia = `Vence en ${dias}d`;
                                                accionRecomendada = 'Acelerar rotación mediante sugerencia activa en caja y no reponer stock nuevo.';
                                            } else if (dias <= 30) {
                                                badgeClass = 'bg-sky-100 text-sky-800 border-sky-300';
                                                labelUrgencia = `Vence en ${dias}d`;
                                                accionRecomendada = 'Supervisar rotación PEPS/FIFO en despensa y programar consumo semanal.';
                                            }

                                            return (
                                                <tr key={`${a.tipo}-${a.id}-${a.fecha_vencimiento}`} className="group hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-3 px-4 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                                                        <div className="font-semibold text-slate-900">{a.nombre}</div>
                                                        <span className="text-[11px] text-slate-400">
                                                            Lote #{a.lote_id || a.id} • {a.categoria}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                            a.tipo === 'insumo'
                                                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                                                        }`}>
                                                            {a.tipo === 'insumo' ? 'Insumo' : 'Producto'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 font-medium text-slate-800">
                                                        {a.fecha_vencimiento}
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] border ${badgeClass}`}>
                                                            {labelUrgencia}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-medium">
                                                        {formatearNumero(a.stock_actual)} {a.unidad_medida}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-bold text-red-600">
                                                        {formatearBs(a.valor_en_riesgo)}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 p-2 rounded-xl">
                                                            {accionRecomendada}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
