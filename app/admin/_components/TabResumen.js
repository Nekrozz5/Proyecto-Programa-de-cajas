'use client';

import { useState } from 'react';
import Link from 'next/link';
import { History, AlertTriangle, ArrowRight, TrendingUp, Bike, Eye } from 'lucide-react';
import dynamic from 'next/dynamic';
import ModalDetalleMovimiento from './ModalDetalleMovimiento';
import { anularVentaAction } from '../../../server/actions/ventas.actions';

const GraficosFinancieros = dynamic(() => import('../GraficosFinancieros'), {
    ssr: false,
    loading: () => (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2 border border-slate-200 rounded-xl bg-slate-50/50">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            <span className="text-xs font-medium">Cargando gráficos interactivos...</span>
        </div>
    )
});

function Card({ className = '', children, ...props }) {
    return (
        <div
            className={`rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm transition-all hover:shadow-md ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}

function CardHeader({ className = '', children, ...props }) {
    return (
        <div className={`p-5 pb-2 flex flex-col space-y-1.5 ${className}`} {...props}>
            {children}
        </div>
    );
}

function CardTitle({ className = '', children, ...props }) {
    return (
        <h3 className={`font-semibold leading-none tracking-tight ${className}`} {...props}>
            {children}
        </h3>
    );
}

function CardContent({ className = '', children, ...props }) {
    return (
        <div className={`p-5 pt-0 ${className}`} {...props}>
            {children}
        </div>
    );
}

function Badge({ className = '', variant = 'default', children, ...props }) {
    const variants = {
        default: 'border-transparent bg-slate-900 text-slate-50 shadow hover:bg-slate-900/80',
        secondary: 'border-transparent bg-slate-100 text-slate-700',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        blue: 'border-blue-200 bg-blue-50 text-blue-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
        destructive: 'border-red-200 bg-red-50 text-red-700'
    };
    return (
        <div
            className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 ${variants[variant] || variants.default} ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}

export default function TabResumen({
    datos,
    tendencias,
    metricasInteligencia,
    cargarTodo,
    setMensaje,
    setError,
    limpiarAlertas
}) {
    const [movimientoAAnularId, setMovimientoAAnularId] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('');
    const [anulando, setAnulando] = useState(false);
    const [movimientoParaDetalle, setMovimientoParaDetalle] = useState(null);

    const est = datos?.estadisticas;
    const cajaAuditada = datos?.cajaAuditada;
    const movimientos = datos?.movimientos || [];

    const itemsReposicion = metricasInteligencia?.semaforoReposicion?.items || [];
    const alertasVencimiento = metricasInteligencia?.radarVencimientos?.alertas || [];
    const hayAlertas = itemsReposicion.length > 0 || alertasVencimiento.length > 0;

    async function confirmarAnularMovimiento(movimientoId) {
        if (!motivoAnulacion || motivoAnulacion.trim().length < 3) {
            setError?.('Debes ingresar un motivo descriptivo y justificado para realizar la anulación.');
            return;
        }

        limpiarAlertas?.();
        try {
            setAnulando(true);
            const res = await anularVentaAction({
                movimientoId,
                motivo: motivoAnulacion.trim()
            });

            if (!res.ok) {
                throw new Error(res.error || 'Error al anular movimiento.');
            }

            setMensaje?.(`Movimiento #${movimientoId} anulado y stock reintegrado exitosamente.`);
            setMovimientoAAnularId(null);
            setMotivoAnulacion('');
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message || 'Error al procesar la anulación.');
        } finally {
            setAnulando(false);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            {/* MINI-BANNER DISCRETO DE ALERTAS OPERATIVAS */}
            {hayAlertas && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 sm:p-4 text-xs sm:text-sm text-amber-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="p-2 rounded-lg bg-amber-100 text-amber-700 shrink-0">
                            <AlertTriangle className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="font-semibold text-amber-950 flex items-center gap-2">
                                <span>Alertas de inventario y reposición</span>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-800">
                                    {itemsReposicion.length + alertasVencimiento.length}
                                </span>
                            </div>
                            <p className="text-amber-800/90 text-xs mt-0.5 truncate">
                                {[
                                    itemsReposicion.length > 0 ? `${itemsReposicion.length} artículo(s) con stock crítico/agotado` : null,
                                    alertasVencimiento.length > 0 ? `${alertasVencimiento.length} lote(s) con vencimiento urgente` : null
                                ].filter(Boolean).join(' • ')}
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/admin/inteligencia"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition-colors shrink-0 shadow-xs"
                    >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Ver Inteligencia y Alertas</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            )}

            {/* KPI CARDS FINANCIEROS (SHADCN CARD + BADGE) */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Ventas Totales */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Ventas Totales
                        </CardTitle>
                        <Badge variant="blue">
                            Turno #{cajaAuditada?.id || '—'}
                        </Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                            Bs {(est?.ventasTotales || 0).toFixed(2)}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>Ticket Promedio</span>
                            <span className="font-semibold text-slate-700">
                                Bs {(est?.ticketPromedio || 0).toFixed(2)}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Costo Total de Ventas (CMV) */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Costo de Ventas (CMV)
                        </CardTitle>
                        <Badge variant="secondary">
                            CPP / NIC 2
                        </Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                            Bs {(est?.costoTotalVentas || 0).toFixed(2)}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>Método de costeo</span>
                            <span className="font-medium text-slate-600">Congelado por ticket</span>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Ganancia Bruta */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Ganancia Bruta
                        </CardTitle>
                        <Badge variant="success">
                            + Margen Bruto
                        </Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-600">
                            Bs {(est?.gananciaBruta || 0).toFixed(2)}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>Margen operacional</span>
                            <span className="font-medium text-emerald-700">Ventas - Costo de Ventas</span>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Flujo Neto Operativo / Gastos */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Flujo Neto Operativo
                        </CardTitle>
                        <Badge variant="amber">
                            Egresos: Bs {(est?.totalEgresos || 0).toFixed(2)}
                        </Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-600">
                            Bs {(est?.flujoNetoOperativo || 0).toFixed(2)}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>Fórmula neta</span>
                            <span className="font-medium text-blue-700">Ganancia - Egresos</span>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* GRÁFICOS FINANCIEROS Y TENDENCIAS */}
            <GraficosFinancieros
                estadisticas={est}
                tendencias={tendencias}
                desglosePagos={datos?.desglosePagos}
                cajaId={cajaAuditada?.id}
            />

            {/* TABLA DE AUDITORÍA Y ANULACIÓN DE MOVIMIENTOS */}
            <Card>
                <CardHeader className="border-b border-slate-100 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <History className="w-4 h-4 text-slate-700" />
                            <span>Movimientos del Turno #{cajaAuditada?.id || '—'} ({cajaAuditada?.caja_fisica_nombre || 'Caja Principal'})</span>
                        </CardTitle>
                        <Badge variant="secondary">
                            {movimientos.length} registro{movimientos.length !== 1 ? 's' : ''} auditado{movimientos.length !== 1 ? 's' : ''}
                        </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Auditoría en tiempo real y anulación de ventas con restitución automática de inventario.
                    </p>
                </CardHeader>

                <CardContent className="pt-4">
                    {!movimientos.length ? (
                        <p className="text-slate-500 text-sm py-6 text-center">No hay movimientos registrados en esta caja.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                                <thead className="bg-slate-50/75">
                                    <tr>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">ID</th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Fecha/Hora</th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Operador</th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Tipo / Pago</th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Monto</th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Cambio</th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Estado</th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Descripción</th>
                                        <th className="px-3 py-2.5 text-center font-semibold text-slate-600">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {movimientos.map((m) => (
                                        <tr
                                            key={m.id}
                                            className={`transition-colors hover:bg-slate-50/80 ${
                                                m.estado === 'anulado' ? 'opacity-55 bg-slate-50/50' : ''
                                            }`}
                                        >
                                            <td className="px-3 py-2.5 font-mono text-slate-700">#{m.id}</td>
                                            <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{m.fecha_hora}</td>
                                            <td className="px-3 py-2.5 font-medium text-slate-900">{m.usuario_nombre || '—'}</td>
                                            <td className="px-3 py-2.5">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <div>
                                                        <span className="font-semibold text-slate-700">{m.tipo.toUpperCase()}</span>{' '}
                                                        <span className="text-slate-500">({m.metodo_pago.toUpperCase()})</span>
                                                    </div>
                                                    {m.canal_venta === 'mototaxi' && (
                                                        <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-bold text-[10px] flex items-center gap-1">
                                                            <Bike className="w-3 h-3" />
                                                            <span>Despacho Mototaxi</span>
                                                        </Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                                                Bs {Number(m.monto).toFixed(2)}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                                Bs {Number(m.cambio || 0).toFixed(2)}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {m.estado === 'anulado' ? (
                                                    <Badge variant="destructive">Anulado</Badge>
                                                ) : (
                                                    <Badge variant="success">Completado</Badge>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-600 max-w-[220px] truncate" title={m.descripcion}>
                                                {m.descripcion}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => setMovimientoParaDetalle(m)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:text-white bg-sky-50 hover:bg-sky-600 border border-sky-200 rounded-md transition-all shadow-sm cursor-pointer"
                                                        title="Ver trazabilidad fiscal y física"
                                                    >
                                                        <Eye className="w-3 h-3" />
                                                        <span>Auditar</span>
                                                    </button>
                                                    {m.estado === 'completado' && (
                                                        movimientoAAnularId === m.id ? (
                                                            <div className="flex flex-col gap-1.5 min-w-[180px] p-2 bg-slate-50 rounded-lg border border-slate-200">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Motivo de anulación..."
                                                                    value={motivoAnulacion}
                                                                    onChange={(e) => setMotivoAnulacion(e.target.value)}
                                                                    disabled={anulando}
                                                                    className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-red-500"
                                                                />
                                                                <div className="flex gap-1.5 justify-end">
                                                                    <button
                                                                        type="button"
                                                                        disabled={anulando || !motivoAnulacion || motivoAnulacion.trim().length < 3}
                                                                        onClick={() => confirmarAnularMovimiento(m.id)}
                                                                        className={`px-2.5 py-1 text-xs font-semibold text-white rounded transition-colors ${
                                                                            (anulando || !motivoAnulacion || motivoAnulacion.trim().length < 3)
                                                                                ? 'bg-slate-300 cursor-not-allowed'
                                                                                : 'bg-red-600 hover:bg-red-700 cursor-pointer shadow-sm'
                                                                        }`}
                                                                    >
                                                                        {anulando ? 'Anulando...' : 'Confirmar'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={anulando}
                                                                        onClick={() => {
                                                                            setMovimientoAAnularId(null);
                                                                            setMotivoAnulacion('');
                                                                        }}
                                                                        className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-200 hover:bg-slate-300 rounded transition-colors"
                                                                    >
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setMovimientoAAnularId(m.id);
                                                                    setMotivoAnulacion('');
                                                                }}
                                                                className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 rounded-md transition-all shadow-sm"
                                                            >
                                                                Anular
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* MODAL DE AUDITORÍA Y DETALLE DE MOVIMIENTO */}
            <ModalDetalleMovimiento
                movimiento={movimientoParaDetalle}
                isOpen={Boolean(movimientoParaDetalle)}
                onClose={() => setMovimientoParaDetalle(null)}
            />
        </div>
    );
}
