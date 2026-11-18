'use client';

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts';

const COLORES_PAGO = ['#16a34a', '#0284c7', '#f59e0b', '#7c3aed'];

function formatearBs(valor) {
    return `Bs ${Number(valor || 0).toFixed(2)}`;
}

/**
 * Panel visual de estadísticas financieras y tendencias operativas usando Recharts integrado con Tailwind CSS.
 */
export default function GraficosFinancieros({ estadisticas, tendencias, desglosePagos, cajaId }) {
    const comparativaSemanal = tendencias?.comparativaSemanal || [];
    const ventasPorHora = tendencias?.ventasPorHora || [];
    const topProductos = (estadisticas?.productosMasVendidos || []).slice(0, 6).map((p) => ({
        nombre: p.nombre.length > 16 ? `${p.nombre.slice(0, 15)}…` : p.nombre,
        ingresos: Number(p.ingresos_generados || 0),
        ganancia: Number(p.ganancia_generada || 0),
        unidades: Number(p.unidades_vendidas || 0)
    }));
    const pagos = (desglosePagos || []).map((d) => ({
        name: String(d.metodoPago || 'otro').toUpperCase(),
        value: Number(d.montoTotal || 0),
        transacciones: Number(d.transacciones || 0),
        porcentaje: Number(d.porcentaje || 0)
    }));

    return (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            {/* 1. Comparativa Semanal: Ingresos vs Egresos */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
                    <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                        <span>📈</span> Ingresos vs Egresos (Últimos 7 días)
                    </h3>
                    <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        Semanal
                    </span>
                </div>
                {comparativaSemanal.length === 0 ? (
                    <div className="flex items-center justify-center h-[260px] text-slate-400 text-sm text-center">
                        Sin movimientos registrados en los últimos 7 días.
                    </div>
                ) : (
                    <div className="w-full h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={comparativaSemanal} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                                <Tooltip
                                    formatter={(val) => formatearBs(val)}
                                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: '6px' }} />
                                <Bar dataKey="ingresos" name="Ingresos (Bs)" fill="#16a34a" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="egresos" name="Egresos (Bs)" fill="#dc2626" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* 2. Flujo de Ventas por Hora (Hoy) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
                    <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                        <span>🕒</span> Ventas por Hora (Hoy)
                    </h3>
                    <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        En tiempo real
                    </span>
                </div>
                {ventasPorHora.length === 0 ? (
                    <div className="flex items-center justify-center h-[260px] text-slate-400 text-sm text-center">
                        Aún no hay ventas registradas hoy.
                    </div>
                ) : (
                    <div className="w-full h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={ventasPorHora} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="hora" tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                                <Tooltip
                                    formatter={(val) => formatearBs(val)}
                                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="total_vendido"
                                    name="Vendido (Bs)"
                                    stroke="#0284c7"
                                    fill="#bae6fd"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* 3. Top Productos por Rentabilidad (Caja Auditada) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
                    <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                        <span>🏆</span> Top Productos (Turno #{cajaId || '—'})
                    </h3>
                    <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        Ingreso vs Ganancia
                    </span>
                </div>
                {topProductos.length === 0 ? (
                    <div className="flex items-center justify-center h-[260px] text-slate-400 text-sm text-center">
                        Sin ventas de productos en la caja auditada.
                    </div>
                ) : (
                    <div className="w-full h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProductos} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                                <Tooltip
                                    formatter={(val) => formatearBs(val)}
                                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: '6px' }} />
                                <Bar dataKey="ingresos" name="Ingresos (Bs)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="ganancia" name="Ganancia Bruta (Bs)" fill="#16a34a" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* 4. Distribución por Método de Pago (Caja Auditada) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
                    <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                        <span>💳</span> Métodos de Pago (Turno #{cajaId || '—'})
                    </h3>
                    <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        Efectivo / QR
                    </span>
                </div>
                {pagos.length === 0 ? (
                    <div className="flex items-center justify-center h-[260px] text-slate-400 text-sm text-center">
                        Sin ingresos registrados en la caja auditada.
                    </div>
                ) : (
                    <div className="w-full h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pagos}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={82}
                                    label={({ name, porcentaje }) => `${name} (${porcentaje}%)`}
                                >
                                    {pagos.map((_, idx) => (
                                        <Cell key={idx} fill={COLORES_PAGO[idx % COLORES_PAGO.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(val) => formatearBs(val)}
                                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: '6px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </section>
    );
}
