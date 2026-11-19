'use client';

import { useState, useEffect } from 'react';
import { 
    DownloadCloud, 
    RefreshCw, 
    CheckCircle2, 
    Sparkles, 
    ShieldCheck, 
    ExternalLink, 
    AlertCircle, 
    HardDrive, 
    FileText,
    Cpu,
    CloudCheck
} from 'lucide-react';

function formatearBytes(bytes) {
    if (!bytes || Number.isNaN(bytes)) return null;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
}

function formatearFecha(fechaStr) {
    if (!fechaStr) return null;
    try {
        const d = new Date(fechaStr);
        return d.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return fechaStr;
    }
}

export default function TabActualizaciones() {
    const [cargando, setCargando] = useState(false);
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [ultimaComprobacion, setUltimaComprobacion] = useState(null);

    const comprobarActualizaciones = async () => {
        setCargando(true);
        setError(null);
        try {
            const res = await fetch('/api/actualizaciones', {
                method: 'GET',
                cache: 'no-store'
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'No se pudo obtener información de actualizaciones.');
            }
            setInfo(data);
            setUltimaComprobacion(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } catch (err) {
            setError(err.message || 'Error de conexión.');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        comprobarActualizaciones();
    }, []);

    const versionActual = info?.versionActual || '1.2.0';
    const versionServidor = info?.versionNueva || (info?.offline ? 'Sin conexión' : versionActual);

    return (
        <div className="space-y-6">
            {/* 1. ENCABEZADO Y TARJETAS DE COMPARACIÓN DE VERSIÓN */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <span className="p-2.5 rounded-xl bg-sky-100 text-sky-700">
                            <Sparkles className="w-5 h-5" />
                        </span>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">
                                Centro de Actualizaciones del Sistema
                            </h3>
                            <p className="text-xs text-slate-500">
                                Sincronización oficial con GitHub Releases y distribución segura
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                        {ultimaComprobacion && (
                            <span className="text-[11px] text-slate-400 font-medium self-end sm:self-center">
                                Comprobado a las {ultimaComprobacion}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={comprobarActualizaciones}
                            disabled={cargando}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-60 cursor-pointer shrink-0"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
                            <span>{cargando ? 'Comprobando...' : 'Comprobar ahora'}</span>
                        </button>
                    </div>
                </div>

                {/* COMPARATIVA VISUAL: VERSIÓN INSTALADA VS SERVIDOR */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-200 text-slate-700">
                                <Cpu className="w-4 h-4" />
                            </div>
                            <div>
                                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                                    Versión Instalada Local
                                </span>
                                <span className="text-base font-bold text-slate-900">
                                    v{versionActual}
                                </span>
                            </div>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                            Esta máquina
                        </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${info?.hayActualizacion ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                <DownloadCloud className="w-4 h-4" />
                            </div>
                            <div>
                                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                                    Versión en Servidor
                                </span>
                                <span className="text-base font-bold text-slate-900">
                                    {info?.offline ? 'No disponible' : `v${versionServidor}`}
                                </span>
                            </div>
                        </div>
                        <div>
                            {info && !info.offline && !info.hayActualizacion && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Al día
                                </span>
                            )}
                            {info && info.hayActualizacion && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2.5 py-1 rounded-full border border-amber-300 animate-pulse">
                                    <Sparkles className="w-3 h-3 text-amber-600" />
                                    Nueva versión
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-semibold">Error al comprobar:</span> {error}
                        </div>
                    </div>
                )}

                {/* CASO 1: HAY ACTUALIZACIÓN DISPONIBLE (ALERTA ÁMBAR) */}
                {info && info.hayActualizacion && (
                    <div className="mt-6 rounded-2xl border-2 border-amber-400 bg-amber-50/60 p-5 sm:p-6 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-3 w-3 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                                </span>
                                <div>
                                    <h4 className="text-sm sm:text-base font-bold text-amber-950">
                                        ¿Quieres actualizar a la versión: {info.versionNueva}?
                                    </h4>
                                    <p className="text-xs text-amber-800 mt-0.5">
                                        {info.titulo} {info.fechaPublicacion && `• Publicada el ${formatearFecha(info.fechaPublicacion)}`}
                                    </p>
                                </div>
                            </div>

                            {info.instalador?.urlDescarga && (
                                <a
                                    href={info.instalador.urlDescarga}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer shrink-0"
                                >
                                    <DownloadCloud className="w-4 h-4" />
                                    <span>Sí, actualizar ahora (.exe)</span>
                                </a>
                            )}
                        </div>

                        {/* DETALLES DEL PAQUETE */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs border-t border-amber-200/80 text-amber-900">
                            {info.instalador && (
                                <div className="flex items-center gap-2">
                                    <HardDrive className="w-4 h-4 text-amber-700 shrink-0" />
                                    <span>
                                        Instalador: <strong>{info.instalador.nombre}</strong>
                                        {info.instalador.tamanoBytes && ` (${formatearBytes(info.instalador.tamanoBytes)})`}
                                    </span>
                                </div>
                            )}
                            {info.urlRelease && (
                                <div className="flex items-center gap-2">
                                    <ExternalLink className="w-4 h-4 text-amber-700 shrink-0" />
                                    <a
                                        href={info.urlRelease}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline hover:text-amber-950 font-medium"
                                    >
                                        Ver lanzamiento oficial en GitHub
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* VISOR DE NOVEDADES / CHANGELOG */}
                        {info.notas && (
                            <div className="rounded-xl bg-white/90 border border-amber-200 p-4 text-xs text-slate-700 space-y-2">
                                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                    <FileText className="w-3.5 h-3.5 text-slate-600" />
                                    <span>Notas de esta versión:</span>
                                </div>
                                <div className="whitespace-pre-wrap font-sans text-slate-600 leading-relaxed text-[11px] sm:text-xs max-h-48 overflow-y-auto">
                                    {info.notas}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* CASO 2: EL SISTEMA ESTÁ AL DÍA (BADGE VERDE) */}
                {info && !info.hayActualizacion && !info.offline && (
                    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 text-center sm:text-left flex flex-col sm:flex-row items-center gap-4">
                        <div className="p-3 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold mb-1 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Tu sistema está actualizado
                            </div>
                            <p className="text-xs text-slate-600 mt-1">
                                Estás utilizando la versión más reciente (<strong className="text-slate-800 font-semibold">v{versionActual}</strong>). 
                                No hay nuevas actualizaciones pendientes en este momento.
                            </p>
                        </div>
                    </div>
                )}

                {/* CASO 3: MODO SIN CONEXIÓN */}
                {info && info.offline && (
                    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-600">
                            <h4 className="font-bold text-sm text-slate-800">
                                Modo sin conexión
                            </h4>
                            <p className="mt-1">
                                No se pudo contactar con GitHub Releases. Puedes seguir operando tu caja con normalidad.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. MENSAJE INFORMATIVO DE TRANQUILIDAD Y PRESERVACIÓN DE DATOS */}
            <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/60 to-white p-6 shadow-sm">
                <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-sky-100 text-sky-800 shrink-0">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div className="space-y-2 text-xs text-slate-600">
                        <h4 className="text-sm font-bold text-slate-900">
                            Tus datos, ventas e inventario se mantendrán intactos al instalar
                        </h4>
                        <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
                            <li>
                                <strong>Blindaje de datos:</strong> El instalador oficial protege tu base de datos (<code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] text-slate-800">caja.db</code>) y tu archivo de configuración (<code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] text-slate-800">.env.local</code>), garantizando cero sobreescrituras.
                            </li>
                            <li>
                                <strong>Reinicio transparente:</strong> Inno Setup cierra limpiamente el servidor anterior, copia los archivos actualizados y vuelve a abrir el sistema.
                            </li>
                            <li>
                                <strong>Migraciones atómicas:</strong> Cualquier cambio en la estructura de base de datos se ejecuta de forma automática en el primer arranque.
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
