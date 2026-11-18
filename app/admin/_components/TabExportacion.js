'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
    Download, 
    Calendar, 
    X, 
    Info, 
    FileSpreadsheet, 
    FileText, 
    FileDown,
    Landmark,
    Loader2,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { exportarReportePDF } from '../exportarPDF';

export default function TabExportacion({
    datos,
    adminAutenticado,
    turnoAuditadoId,
    setTurnoAuditadoId,
    cargarTodo,
    setMensaje
}) {
    // Filtros de Exportación
    const [filtroExportDesde, setFiltroExportDesde] = useState('');
    const [filtroExportHasta, setFiltroExportHasta] = useState('');
    const [filtroExportUsuarioId, setFiltroExportUsuarioId] = useState('');
    const [filtroExportCajaFisicaId, setFiltroExportCajaFisicaId] = useState('');

    // Estado de Carga y Toast de Notificación
    const [cargandoFormato, setCargandoFormato] = useState(null);
    const [toast, setToast] = useState(null);
    const timerToastRef = useRef(null);

    const mostrarToast = (mensaje, tipo = 'exito') => {
        if (timerToastRef.current) clearTimeout(timerToastRef.current);
        setToast({ mensaje, tipo });
        setMensaje?.(mensaje);
        timerToastRef.current = setTimeout(() => {
            setToast(null);
        }, 4500);
    };

    useEffect(() => {
        return () => {
            if (timerToastRef.current) clearTimeout(timerToastRef.current);
        };
    }, []);

    const handleDescargarRCV = async (formato, extension) => {
        try {
            setCargandoFormato(formato);
            const params = new URLSearchParams();
            params.set('formato', formato);
            if (filtroExportDesde) params.set('desde', filtroExportDesde);
            if (filtroExportHasta) params.set('hasta', filtroExportHasta);
            if (filtroExportUsuarioId) params.set('usuarioId', filtroExportUsuarioId);
            if (filtroExportCajaFisicaId) params.set('cajaFisicaId', filtroExportCajaFisicaId);

            const res = await fetch(`/api/reportes?${params.toString()}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Error al generar el archivo');
            }

            const blob = await res.blob();
            const disposition = res.headers.get('Content-Disposition');
            let nombreArchivo = `rcv_compras_${filtroExportDesde || 'inicio'}_a_${filtroExportHasta || 'hoy'}.${extension}`;
            if (disposition && disposition.includes('filename=')) {
                const match = disposition.match(/filename="?([^";]+)"?/);
                if (match && match[1]) nombreArchivo = match[1];
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivo;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            mostrarToast(`Descarga exitosa: ${nombreArchivo}`, 'exito');
        } catch (err) {
            console.error('Error al descargar RCV:', err);
            mostrarToast(err.message || 'Error al descargar el archivo', 'error');
        } finally {
            setCargandoFormato(null);
        }
    };

    const configActual = datos?.configuracionNegocio || {};
    const est = datos?.estadisticas;

    return (
        <div className="flex flex-col gap-6 max-w-5xl">
            {/* Encabezado de la Sección */}
            <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900 m-0 mb-1.5 flex items-center gap-2">
                    <Download className="w-5 h-5 text-slate-700" />
                    <span>Centro de Exportación de Reportes</span>
                </h2>
                <p className="text-slate-600 text-sm m-0">
                    Exporta y audita los datos operativos y financieros del negocio en los 3 formatos oficiales: <strong>Excel (.xlsx)</strong>, <strong>PDF de Auditoría de Turno</strong> y <strong>CSV Contable</strong>. Puedes aplicar filtros por rango de fechas, operador y estación física de caja.
                </p>
            </section>

            {/* Filtros de Exportación */}
            <section className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-3.5 flex-wrap gap-2">
                    <h3 className="m-0 text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-slate-600" />
                        <span>Filtros de Exportación (Excel y CSV)</span>
                    </h3>
                    {(filtroExportDesde || filtroExportHasta || filtroExportUsuarioId || filtroExportCajaFisicaId) && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                setFiltroExportDesde('');
                                setFiltroExportHasta('');
                                setFiltroExportUsuarioId('');
                                setFiltroExportCajaFisicaId('');
                            }}
                            className="h-7 text-xs font-semibold gap-1"
                        >
                            <X className="w-3.5 h-3.5" />
                            <span>Limpiar Filtros</span>
                        </Button>
                    )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-xs text-slate-600 font-bold mb-1">
                            Fecha Desde:
                        </label>
                        <Input
                            type="date"
                            title="Fecha desde"
                            value={filtroExportDesde}
                            onChange={(e) => setFiltroExportDesde(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-600 font-bold mb-1">
                            Fecha Hasta:
                        </label>
                        <Input
                            type="date"
                            title="Fecha hasta"
                            value={filtroExportHasta}
                            onChange={(e) => setFiltroExportHasta(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-600 font-bold mb-1">
                            Operador / Cajero:
                        </label>
                        <select
                            title="Filtrar por operador"
                            value={filtroExportUsuarioId}
                            onChange={(e) => setFiltroExportUsuarioId(e.target.value)}
                            className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-950"
                        >
                            <option value="">Todos los operadores</option>
                            {(datos?.usuarios || []).map((u) => (
                                <option key={u.id} value={u.id}>{u.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-600 font-bold mb-1">
                            Estación Física de Caja:
                        </label>
                        <select
                            title="Filtrar por estación física"
                            value={filtroExportCajaFisicaId}
                            onChange={(e) => setFiltroExportCajaFisicaId(e.target.value)}
                            className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-950"
                        >
                            <option value="">Todas las estaciones</option>
                            {(datos?.cajasFisicas || []).map((cf) => (
                                <option key={cf.id} value={cf.id}>{cf.nombre}</option>
                            ))}
                        </select>
                    </div>
                </div>
                {(filtroExportDesde || filtroExportHasta || filtroExportUsuarioId || filtroExportCajaFisicaId) && (
                    <div className="mt-3 text-xs text-sky-800 bg-sky-50 border border-sky-200 px-3 py-2 rounded-md flex items-center flex-wrap gap-2">
                        <Info className="w-4 h-4 text-sky-700 shrink-0" />
                        <span className="font-semibold">Filtro activo:</span>
                        <span>{[
                            filtroExportDesde ? `Desde: ${filtroExportDesde}` : '',
                            filtroExportHasta ? `Hasta: ${filtroExportHasta}` : '',
                            filtroExportUsuarioId ? `Operador: ${(datos?.usuarios || []).find(u => Number(u.id) === Number(filtroExportUsuarioId))?.nombre || filtroExportUsuarioId}` : '',
                            filtroExportCajaFisicaId ? `Estación: ${(datos?.cajasFisicas || []).find(cf => Number(cf.id) === Number(filtroExportCajaFisicaId))?.nombre || filtroExportCajaFisicaId}` : ''
                        ].filter(Boolean).join(' | ')}</span>
                    </div>
                )}
            </section>

            {/* Las 3 Opciones de Formato */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Formato 1: Excel Contable (.xlsx) */}
                <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between border-t-4 border-t-emerald-600 gap-4">
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="m-0 text-emerald-800 font-bold text-lg flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                                <span>Excel Contable (.xlsx)</span>
                            </h3>
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 font-bold">
                                10 Hojas Contables
                            </Badge>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                            Libro contable y de auditoría integral con 10 hojas estructuradas:
                        </p>
                        <ul className="text-slate-500 text-xs pl-4 my-2 leading-relaxed list-disc">
                            <li>Movimientos y arqueos de caja auditados.</li>
                            <li>Detalle Ventas (CMV) con prorrateo exacto de descuentos.</li>
                            <li>Rentabilidad neta por producto y compras/mermas.</li>
                            <li>Kardex cronológico de productos directos e insumos.</li>
                            <li>Historial de anulaciones y resumen contable.</li>
                        </ul>
                    </div>
                    <a
                        href={`/api/reportes?formato=xlsx${filtroExportDesde ? `&desde=${filtroExportDesde}` : ''}${filtroExportHasta ? `&hasta=${filtroExportHasta}` : ''}${filtroExportUsuarioId ? `&usuarioId=${filtroExportUsuarioId}` : ''}${filtroExportCajaFisicaId ? `&cajaFisicaId=${filtroExportCajaFisicaId}` : ''}`}
                        className="w-full text-center py-2.5 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow transition-colors flex items-center justify-center gap-2"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Descargar Excel Contable (.xlsx)</span>
                    </a>
                </section>

                {/* Formato 2: PDF de Auditoría de Turno */}
                <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between border-t-4 border-t-red-600 gap-4">
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="m-0 text-red-800 font-bold text-lg flex items-center gap-2">
                                <FileText className="w-5 h-5 text-red-600" />
                                <span>PDF de Auditoría de Turno</span>
                            </h3>
                            <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100 border border-red-300 font-bold">
                                Turno #{datos?.cajaAuditada?.id || '—'}
                            </Badge>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                            Reporte imprimible de cierre y auditoría de turno con liquidación tributaria:
                        </p>
                        <ul className="text-slate-500 text-xs pl-4 my-2 leading-relaxed list-disc">
                            <li>Resumen ejecutivo y liquidación fiscal (IVA / IT).</li>
                            <li>Conciliación separada de efectivo vs. QR y arqueo ciego.</li>
                            <li>Ventas netas de descuentos y rentabilidad por producto.</li>
                            <li>Bitácora de movimientos y ventas anuladas.</li>
                        </ul>
                        <div className="bg-slate-50 p-2.5 rounded-md border border-slate-200 my-2">
                            <label className="block text-xs text-slate-600 font-bold mb-1">
                                Turno Seleccionado para Auditoría:
                            </label>
                            <select
                                value={datos?.cajaAuditada?.id || ''}
                                onChange={async (e) => {
                                    const nuevoId = e.target.value;
                                    if (nuevoId) {
                                        setTurnoAuditadoId?.(nuevoId);
                                        await cargarTodo?.(nuevoId);
                                    }
                                }}
                                className="w-full h-8 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs shadow-sm focus:outline-none"
                            >
                                {(datos?.historialCajas || []).map((c) => (
                                    <option key={c.id} value={c.id}>
                                        Turno #{c.id} — {c.cajero_nombre} ({c.caja_fisica_nombre || 'Caja Principal'}) [{c.estado}]
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={() =>
                            exportarReportePDF({
                                nombreNegocio: configActual.nombre_negocio,
                                configuracionNegocio: configActual,
                                usuarioGenerador: adminAutenticado?.nombre,
                                cajaAuditada: datos?.cajaAuditada,
                                estadisticas: est,
                                movimientos: datos?.movimientos,
                                desglosePagos: datos?.desglosePagos
                            })
                        }
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-2.5 shadow flex items-center justify-center gap-2"
                    >
                        <FileText className="w-4 h-4" />
                        <span>Descargar PDF (Turno #{datos?.cajaAuditada?.id || '—'})</span>
                    </Button>
                </section>

                {/* Formato 3: CSV Contable */}
                <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between border-t-4 border-t-sky-600 gap-4">
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="m-0 text-sky-800 font-bold text-lg flex items-center gap-2">
                                <FileDown className="w-5 h-5 text-sky-600" />
                                <span>CSV Contable</span>
                            </h3>
                            <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-300 font-bold">
                                Texto Plano UTF-8
                            </Badge>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                            Exportación de movimientos en formato plano delimitado por comas:
                        </p>
                        <ul className="text-slate-500 text-xs pl-4 my-2 leading-relaxed list-disc">
                            <li>Compatible con cualquier hoja de cálculo o sistema contable.</li>
                            <li>Ideal para importar a bases de datos o pipelines externos.</li>
                            <li>Incluye desglose por tipo, monto, método de pago y cajero.</li>
                            <li>Aplica los filtros de fecha, operador y estación física.</li>
                        </ul>
                    </div>
                    <a
                        href={`/api/reportes?formato=csv${filtroExportDesde ? `&desde=${filtroExportDesde}` : ''}${filtroExportHasta ? `&hasta=${filtroExportHasta}` : ''}${filtroExportUsuarioId ? `&usuarioId=${filtroExportUsuarioId}` : ''}${filtroExportCajaFisicaId ? `&cajaFisicaId=${filtroExportCajaFisicaId}` : ''}`}
                        className="w-full text-center py-2.5 px-4 rounded-md bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow transition-colors flex items-center justify-center gap-2"
                    >
                        <FileDown className="w-4 h-4" />
                        <span>Descargar CSV Contable</span>
                    </a>
                </section>
            </div>

            {/* Sección de Reportes Fiscales / Tributarios (RCV SIAT) */}
            <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm border-t-4 border-t-indigo-600 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                        <div className="flex items-center gap-2">
                            <Landmark className="w-5 h-5 text-indigo-600" />
                            <h3 className="m-0 text-slate-900 font-bold text-lg">
                                Registro de Compras y Ventas (RCV - SIAT Bolivia)
                            </h3>
                        </div>
                        <p className="text-slate-600 text-xs mt-1.5 m-0 leading-relaxed">
                            Archivos normalizados con las 22 columnas normativas para importación masiva directa en la plataforma SIAT del SIN.
                        </p>
                    </div>
                    <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50 border border-indigo-200 font-bold text-xs self-start sm:self-auto shrink-0">
                        Normativa RND SIAT
                    </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Botón 1: Descargar RCV Compras (.txt SIAT) */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-1">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                <span>Formato Texto Plano (.txt)</span>
                            </div>
                            <p className="text-slate-500 text-xs m-0 leading-relaxed">
                                Archivo delimitado por plecas (|) listo para la importación masiva directa en el módulo RCV de la plataforma SIAT en Línea.
                            </p>
                        </div>
                        <Button
                            type="button"
                            disabled={cargandoFormato !== null}
                            onClick={() => handleDescargarRCV('rcv_compras_txt', 'txt')}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-2.5 shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                            {cargandoFormato === 'rcv_compras_txt' ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Generando .txt SIAT...</span>
                                </>
                            ) : (
                                <>
                                    <Download className="w-4 h-4" />
                                    <span>Descargar RCV Compras (.txt SIAT)</span>
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Botón 2: Descargar RCV Compras (.xlsx) */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-1">
                                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                <span>Planilla de Verificación (.xlsx)</span>
                            </div>
                            <p className="text-slate-500 text-xs m-0 leading-relaxed">
                                Planilla Excel con las 22 columnas fiscales normadas por el SIN, cabeceras estructuradas y totales para auditoría contable.
                            </p>
                        </div>
                        <Button
                            type="button"
                            disabled={cargandoFormato !== null}
                            onClick={() => handleDescargarRCV('rcv_compras_xlsx', 'xlsx')}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-2.5 shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                            {cargandoFormato === 'rcv_compras_xlsx' ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Generando .xlsx...</span>
                                </>
                            ) : (
                                <>
                                    <FileSpreadsheet className="w-4 h-4" />
                                    <span>Descargar RCV Compras (.xlsx)</span>
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </section>

            {/* Toast Flotante de Notificación */}
            {toast && (
                <div
                    role="alert"
                    className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-sm transition-all duration-300 ${
                        toast.tipo === 'error'
                            ? 'bg-rose-50 border-rose-200 text-rose-800'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}
                >
                    {toast.tipo === 'error' ? (
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    )}
                    <span className="font-semibold">{toast.mensaje}</span>
                    <button
                        type="button"
                        onClick={() => setToast(null)}
                        className="text-slate-400 hover:text-slate-600 ml-2 p-0.5 rounded cursor-pointer"
                        title="Cerrar notificación"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
