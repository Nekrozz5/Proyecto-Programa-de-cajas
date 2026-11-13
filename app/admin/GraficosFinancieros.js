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
 * Panel visual de estadísticas financieras y tendencias operativas usando Recharts.
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
        <section
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '1.25rem',
                marginBottom: '1.5rem'
            }}
        >
            {/* 1. Comparativa Semanal: Ingresos vs Egresos */}
            <div style={cardGrafico}>
                <h3 style={tituloGrafico}>📈 Ingresos vs Egresos (Últimos 7 días)</h3>
                {comparativaSemanal.length === 0 ? (
                    <p style={vacioStyle}>Sin movimientos registrados en los últimos 7 días.</p>
                ) : (
                    <div style={{ width: '100%', height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={comparativaSemanal} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#475569' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                                <Tooltip formatter={(val) => formatearBs(val)} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="ingresos" name="Ingresos (Bs)" fill="#16a34a" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="egresos" name="Egresos (Bs)" fill="#dc2626" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* 2. Flujo de Ventas por Hora (Hoy) */}
            <div style={cardGrafico}>
                <h3 style={tituloGrafico}>🕒 Ventas por Hora (Hoy)</h3>
                {ventasPorHora.length === 0 ? (
                    <p style={vacioStyle}>Aún no hay ventas registradas hoy.</p>
                ) : (
                    <div style={{ width: '100%', height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={ventasPorHora} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="hora" tick={{ fontSize: 11, fill: '#475569' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                                <Tooltip formatter={(val) => formatearBs(val)} />
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
            <div style={cardGrafico}>
                <h3 style={tituloGrafico}>🏆 Top Productos: Ingreso vs Ganancia (Caja #{cajaId || '—'})</h3>
                {topProductos.length === 0 ? (
                    <p style={vacioStyle}>Sin ventas de productos en la caja auditada.</p>
                ) : (
                    <div style={{ width: '100%', height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProductos} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: '#475569' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                                <Tooltip formatter={(val) => formatearBs(val)} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="ingresos" name="Ingresos (Bs)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="ganancia" name="Ganancia Bruta (Bs)" fill="#16a34a" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* 4. Distribución por Método de Pago (Caja Auditada) */}
            <div style={cardGrafico}>
                <h3 style={tituloGrafico}>💳 Métodos de Pago (Caja #{cajaId || '—'})</h3>
                {pagos.length === 0 ? (
                    <p style={vacioStyle}>Sin ingresos registrados en la caja auditada.</p>
                ) : (
                    <div style={{ width: '100%', height: 260 }}>
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
                                <Tooltip formatter={(val) => formatearBs(val)} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </section>
    );
}

const cardGrafico = {
    background: '#fff',
    padding: '1.15rem',
    borderRadius: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
};

const tituloGrafico = {
    margin: '0 0 0.75rem 0',
    fontSize: '0.98rem',
    color: '#0f172a'
};

const vacioStyle = {
    color: '#64748b',
    fontSize: '0.88rem',
    padding: '2.5rem 0',
    textAlign: 'center'
};
