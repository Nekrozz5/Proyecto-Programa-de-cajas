'use client';

import { useState, useEffect } from 'react';

export default function CajaPage() {
    const [cargando, setCargando] = useState(true);
    const [cajaAbierta, setCajaAbierta] = useState(null);
    const [productos, setProductos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [movimientos, setMovimientos] = useState([]);
    const [estadisticas, setEstadisticas] = useState(null);

    // Estado para abrir caja
    const [usuarioId, setUsuarioId] = useState('');
    const [montoInicial, setMontoInicial] = useState('100');

    // Estado del carrito y cobro
    const [carrito, setCarrito] = useState([]);
    const [metodoPago, setMetodoPago] = useState('efectivo');
    const [montoRecibido, setMontoRecibido] = useState('');
    const [descripcionVenta, setDescripcionVenta] = useState('Venta en mostrador');
    const [ultimoTicket, setUltimoTicket] = useState(null);

    // Estado para egresos
    const [montoEgreso, setMontoEgreso] = useState('');
    const [motivoEgreso, setMotivoEgreso] = useState('');
    const [metodoEgreso, setMetodoEgreso] = useState('efectivo');

    // Estado para cierre y arqueo
    const [efectivoReal, setEfectivoReal] = useState('');
    const [resultadoArqueo, setResultadoArqueo] = useState(null);

    // Mensajes de feedback
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    async function cargarDatos() {
        try {
            setCargando(true);
            const res = await fetch('/api/caja');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al cargar datos');

            setCajaAbierta(data.cajaAbierta);
            setProductos(data.productos || []);
            setUsuarios(data.usuarios || []);
            setMovimientos(data.movimientos || []);
            setEstadisticas(data.estadisticas || null);

            if (data.usuarios?.length > 0 && !usuarioId) {
                setUsuarioId(String(data.usuarios[0].id));
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    }

    useEffect(() => {
        cargarDatos();
    }, []);

    function limpiarAlertas() {
        setMensaje(null);
        setError(null);
    }

    function agregarAlCarrito(prod) {
        limpiarAlertas();
        setCarrito((prev) => {
            const existe = prev.find((item) => item.productoId === prod.id);
            const nuevaCantidad = existe ? existe.cantidad + 1 : 1;

            if (prod.tipo_inventario !== 'libre' && prod.unidades_disponibles !== null) {
                if (nuevaCantidad > prod.unidades_disponibles) {
                    setError(`Stock máximo alcanzado para ${prod.nombre} (${prod.unidades_disponibles} disponibles).`);
                    return prev;
                }
            }

            if (existe) {
                return prev.map((item) =>
                    item.productoId === prod.id ? { ...item, cantidad: nuevaCantidad } : item
                );
            }
            return [
                ...prev,
                {
                    productoId: prod.id,
                    nombre: prod.nombre,
                    precio: prod.precio,
                    cantidad: 1
                }
            ];
        });
    }

    function cambiarCantidad(productoId, delta) {
        limpiarAlertas();
        setCarrito((prev) =>
            prev
                .map((item) =>
                    item.productoId === productoId
                        ? { ...item, cantidad: item.cantidad + delta }
                        : item
                )
                .filter((item) => item.cantidad > 0)
        );
    }

    const totalCarrito = Number(
        carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0).toFixed(2)
    );

    const cambioEstimado =
        metodoPago === 'efectivo' && montoRecibido !== '' && Number(montoRecibido) >= totalCarrito
            ? Number((Number(montoRecibido) - totalCarrito).toFixed(2))
            : 0;

    async function handleAbrirCaja(e) {
        e.preventDefault();
        limpiarAlertas();
        setResultadoArqueo(null);
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'abrir',
                    usuarioId: Number(usuarioId),
                    montoInicial: Number(montoInicial)
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMensaje(`Turno de caja #${data.cajaId} abierto correctamente.`);
            await cargarDatos();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleCobrarVenta(e) {
        e.preventDefault();
        limpiarAlertas();
        if (carrito.length === 0) {
            setError('Agrega al menos un producto al carrito.');
            return;
        }
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'vender',
                    cajaId: cajaAbierta.id,
                    items: carrito.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
                    metodoPago,
                    montoRecibido: metodoPago === 'efectivo' && montoRecibido !== '' ? Number(montoRecibido) : totalCarrito,
                    descripcion: descripcionVenta
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setUltimoTicket(data.venta);
            setCarrito([]);
            setMontoRecibido('');
            setDescripcionVenta('Venta en mostrador');
            setMensaje(`Venta #${data.venta.movimientoId} registrada con éxito.`);
            await cargarDatos();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleRegistrarEgreso(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'egreso',
                    cajaId: cajaAbierta.id,
                    monto: Number(montoEgreso),
                    descripcion: motivoEgreso,
                    metodoPago: metodoEgreso
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setMontoEgreso('');
            setMotivoEgreso('');
            setMensaje(`Egreso #${data.movimientoId} registrado correctamente.`);
            await cargarDatos();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleCerrarCaja(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'cerrar',
                    cajaId: cajaAbierta.id,
                    efectivoReal: Number(efectivoReal)
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setResultadoArqueo(data.arqueo);
            setEfectivoReal('');
            setCarrito([]);
            setMensaje('Caja cerrada. Revisa el reporte de arqueo separado abajo.');
            await cargarDatos();
        } catch (err) {
            setError(err.message);
        }
    }

    // Cálculo en vivo de efectivo esperado en cajón
    const ingresosEfectivoTurno = movimientos
        .filter((m) => m.estado === 'completado' && m.tipo === 'ingreso' && m.metodo_pago === 'efectivo')
        .reduce((acc, m) => acc + m.monto, 0);
    const egresosEfectivoTurno = movimientos
        .filter((m) => m.estado === 'completado' && m.tipo === 'egreso' && m.metodo_pago === 'efectivo')
        .reduce((acc, m) => acc + m.monto, 0);
    const ingresosQRTurno = movimientos
        .filter((m) => m.estado === 'completado' && m.tipo === 'ingreso' && m.metodo_pago === 'qr')
        .reduce((acc, m) => acc + m.monto, 0);
    const efectivoEsperadoActual = cajaAbierta
        ? Number((cajaAbierta.monto_inicial + ingresosEfectivoTurno - egresosEfectivoTurno).toFixed(2))
        : 0;

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ margin: 0 }}>Punto de Venta y Control de Caja</h1>
                    <p style={{ margin: '0.25rem 0 0', color: '#555' }}>
                        Operación de turno, cobro en Efectivo / QR y Arqueo Separado
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <a href="/" style={btnSecundario}>Inicio</a>
                    <a href="/admin" style={btnOscuro}>Ir a Panel Admin</a>
                </div>
            </header>

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

            {resultadoArqueo && (
                <section style={{ ...cardStyle, border: '2px solid #0070f3', marginBottom: '1.5rem', background: '#f8fafc' }}>
                    <h2 style={{ marginTop: 0 }}>Resultado del Arqueo de Cierre (Caja #{resultadoArqueo.cajaId})</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        <div style={kpiBox}>
                            <small>Fondo Inicial + Efectivo Neto</small>
                            <strong>Bs {resultadoArqueo.efectivoEsperado.toFixed(2)}</strong>
                            <span>(Inicial: {resultadoArqueo.fondoInicial} | +Ing: {resultadoArqueo.ingresosEfectivo} | -Egr: {resultadoArqueo.egresosEfectivo})</span>
                        </div>
                        <div style={kpiBox}>
                            <small>Efectivo Físico Contado</small>
                            <strong>Bs {resultadoArqueo.efectivoReal.toFixed(2)}</strong>
                            <span style={{ color: resultadoArqueo.diferenciaEfectivo === 0 ? '#166534' : '#b91c1c', fontWeight: 'bold' }}>
                                Diferencia: Bs {resultadoArqueo.diferenciaEfectivo.toFixed(2)}
                            </span>
                        </div>
                        <div style={kpiBox}>
                            <small>Total Cobros por QR (Separado)</small>
                            <strong style={{ color: '#0070f3' }}>Bs {resultadoArqueo.qrEsperado.toFixed(2)}</strong>
                            <span>No suma al efectivo físico del cajón</span>
                        </div>
                    </div>
                </section>
            )}

            {cargando ? (
                <p>Cargando estado de caja...</p>
            ) : !cajaAbierta ? (
                <section style={{ ...cardStyle, maxWidth: '480px', margin: '2rem auto' }}>
                    <h2 style={{ marginTop: 0 }}>Abrir Nuevo Turno de Caja</h2>
                    <form onSubmit={handleAbrirCaja} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <label>
                            Operador / Cajero:
                            <select
                                value={usuarioId}
                                onChange={(e) => setUsuarioId(e.target.value)}
                                required
                                style={inputStyle}
                            >
                                {usuarios.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nombre} ({u.rol})
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Fondo Inicial en Efectivo (Bs):
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={montoInicial}
                                onChange={(e) => setMontoInicial(e.target.value)}
                                required
                                style={inputStyle}
                            />
                        </label>
                        <button type="submit" style={btnPrimario}>
                            Abrir Caja
                        </button>
                    </form>
                </section>
            ) : (
                <>
                    {/* Resumen en vivo del turno */}
                    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={kpiBox}>
                            <small>Turno Activo</small>
                            <strong>Caja #{cajaAbierta.id}</strong>
                            <span>Fondo inicial: Bs {Number(cajaAbierta.monto_inicial).toFixed(2)}</span>
                        </div>
                        <div style={kpiBox}>
                            <small>Efectivo Físico Esperado en Cajón</small>
                            <strong style={{ color: '#166534' }}>Bs {efectivoEsperadoActual.toFixed(2)}</strong>
                            <span>Inicial + Ing. Efectivo ({ingresosEfectivoTurno.toFixed(2)}) - Egr. ({egresosEfectivoTurno.toFixed(2)})</span>
                        </div>
                        <div style={kpiBox}>
                            <small>Cobros por QR (Banco/Digital)</small>
                            <strong style={{ color: '#0070f3' }}>Bs {ingresosQRTurno.toFixed(2)}</strong>
                            <span>Separado del cajón físico</span>
                        </div>
                        <div style={kpiBox}>
                            <small>Ventas Totales del Turno</small>
                            <strong>Bs {(estadisticas?.ventasTotales || 0).toFixed(2)}</strong>
                            <span>{estadisticas?.cantidadTickets || 0} tickets completados</span>
                        </div>
                    </section>

                    {/* Grilla principal: Catálogo + Carrito */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
                        {/* Catálogo de Productos */}
                        <section style={cardStyle}>
                            <h2 style={{ marginTop: 0 }}>Catálogo de Productos</h2>
                            {productos.length === 0 ? (
                                <p>No hay productos registrados. Créalos desde el Panel Admin.</p>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.85rem' }}>
                                    {productos.map((p) => {
                                        const sinStock = p.tipo_inventario !== 'libre' && p.unidades_disponibles !== null && p.unidades_disponibles <= 0;
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => agregarAlCarrito(p)}
                                                disabled={sinStock}
                                                style={{
                                                    textAlign: 'left',
                                                    padding: '0.85rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #dce1e7',
                                                    background: sinStock ? '#f3f4f6' : '#fff',
                                                    cursor: sinStock ? 'not-allowed' : 'pointer',
                                                    opacity: sinStock ? 0.6 : 1
                                                }}
                                            >
                                                <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>
                                                    {p.categoria} • {p.tipo_inventario}
                                                </div>
                                                <div style={{ fontWeight: 'bold', fontSize: '1rem', margin: '0.25rem 0' }}>
                                                    {p.nombre}
                                                </div>
                                                <div style={{ color: '#0070f3', fontWeight: 'bold' }}>
                                                    Bs {Number(p.precio).toFixed(2)}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: sinStock ? '#b91c1c' : '#166534', marginTop: '0.35rem' }}>
                                                    {p.tipo_inventario === 'libre' || p.unidades_disponibles === null
                                                        ? 'Disponible (Libre)'
                                                        : `Disponibles: ${p.unidades_disponibles} u.`}
                                                </div>
                                                {p.insumo_limitante && (
                                                    <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '0.2rem' }}>
                                                        Límite: {p.insumo_limitante}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* Carrito y Cobro */}
                        <section style={cardStyle}>
                            <h2 style={{ marginTop: 0 }}>Ticket Actual</h2>
                            {carrito.length === 0 ? (
                                <p style={{ color: '#666' }}>Selecciona productos del catálogo para agregar al ticket.</p>
                            ) : (
                                <div style={{ marginBottom: '1rem' }}>
                                    {carrito.map((item) => (
                                        <div
                                            key={item.productoId}
                                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}
                                        >
                                            <div>
                                                <strong>{item.nombre}</strong>
                                                <div style={{ fontSize: '0.85rem', color: '#555' }}>
                                                    Bs {item.precio.toFixed(2)} x {item.cantidad} = Bs {(item.precio * item.cantidad).toFixed(2)}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                <button type="button" onClick={() => cambiarCantidad(item.productoId, -1)} style={btnMini}>-</button>
                                                <button type="button" onClick={() => cambiarCantidad(item.productoId, 1)} style={btnMini}>+</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '1rem 0', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Total a Cobrar:</span>
                                <span>Bs {totalCarrito.toFixed(2)}</span>
                            </div>

                            <form onSubmit={handleCobrarVenta} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <label>
                                    Método de Pago:
                                    <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={inputStyle}>
                                        <option value="efectivo">Efectivo Físico</option>
                                        <option value="qr">Pago por QR</option>
                                    </select>
                                </label>

                                {metodoPago === 'efectivo' && (
                                    <label>
                                        Monto Recibido del Cliente (Bs):
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder={`Mínimo Bs ${totalCarrito.toFixed(2)}`}
                                            value={montoRecibido}
                                            onChange={(e) => setMontoRecibido(e.target.value)}
                                            style={inputStyle}
                                        />
                                        <small style={{ color: '#166534', fontWeight: 'bold', display: 'block', marginTop: '0.25rem' }}>
                                            Cambio a devolver: Bs {cambioEstimado.toFixed(2)}
                                        </small>
                                    </label>
                                )}

                                <label>
                                    Nota / Descripción:
                                    <input
                                        type="text"
                                        value={descripcionVenta}
                                        onChange={(e) => setDescripcionVenta(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>

                                <button type="submit" disabled={carrito.length === 0} style={btnPrimario}>
                                    Confirmar Cobro ({metodoPago.toUpperCase()})
                                </button>
                            </form>

                            {ultimoTicket && (
                                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0', fontSize: '0.9rem' }}>
                                    <strong>Último Ticket #{ultimoTicket.movimientoId}:</strong> Total Bs {ultimoTicket.montoTotal.toFixed(2)} ({ultimoTicket.metodoPago.toUpperCase()})
                                    {ultimoTicket.metodoPago === 'efectivo' && (
                                        <div>Recibido: Bs {ultimoTicket.montoRecibido.toFixed(2)} | <strong>Cambio: Bs {ultimoTicket.cambio.toFixed(2)}</strong></div>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Egresos y Cierre de Caja */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
                        <section style={cardStyle}>
                            <h3 style={{ marginTop: 0 }}>Registrar Egreso / Gasto de Caja</h3>
                            <form onSubmit={handleRegistrarEgreso} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <label>
                                    Monto del Egreso (Bs):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.1"
                                        required
                                        value={montoEgreso}
                                        onChange={(e) => setMontoEgreso(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label>
                                    Método de Salida:
                                    <select value={metodoEgreso} onChange={(e) => setMetodoEgreso(e.target.value)} style={inputStyle}>
                                        <option value="efectivo">Efectivo del Cajón</option>
                                        <option value="qr">Transferencia / QR</option>
                                    </select>
                                </label>
                                <label>
                                    Motivo Obligatorio:
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej. Compra de hielo, pago transporte..."
                                        value={motivoEgreso}
                                        onChange={(e) => setMotivoEgreso(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <button type="submit" style={btnOscuro}>Registrar Egreso</button>
                            </form>
                        </section>

                        <section style={cardStyle}>
                            <h3 style={{ marginTop: 0 }}>Cerrar Turno y Arqueo Físico</h3>
                            <p style={{ fontSize: '0.9rem', color: '#555' }}>
                                Cuenta los billetes y monedas físicas del cajón e ingresa el monto total para compararlo con los <strong>Bs {efectivoEsperadoActual.toFixed(2)}</strong> esperados.
                            </p>
                            <form onSubmit={handleCerrarCaja} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <label>
                                    Efectivo Físico Real Contado (Bs):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        required
                                        placeholder="Ej. 250.00"
                                        value={efectivoReal}
                                        onChange={(e) => setEfectivoReal(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <button type="submit" style={{ ...btnPrimario, background: '#dc2626' }}>
                                    Ejecutar Arqueo y Cerrar Caja
                                </button>
                            </form>
                        </section>
                    </div>

                    {/* Movimientos del turno */}
                    <section style={{ ...cardStyle, marginTop: '1.5rem' }}>
                        <h3 style={{ marginTop: 0 }}>Movimientos del Turno Actual</h3>
                        {movimientos.length === 0 ? (
                            <p style={{ color: '#666' }}>Aún no hay movimientos en este turno.</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                        <th style={thTd}>#</th>
                                        <th style={thTd}>Fecha/Hora</th>
                                        <th style={thTd}>Tipo</th>
                                        <th style={thTd}>Método</th>
                                        <th style={thTd}>Monto</th>
                                        <th style={thTd}>Cambio</th>
                                        <th style={thTd}>Estado</th>
                                        <th style={thTd}>Descripción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movimientos.map((m) => (
                                        <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: m.estado === 'anulado' ? 0.55 : 1 }}>
                                            <td style={thTd}>{m.id}</td>
                                            <td style={thTd}>{m.fecha_hora}</td>
                                            <td style={{ ...thTd, fontWeight: 'bold', color: m.tipo === 'ingreso' ? '#166534' : '#b91c1c' }}>
                                                {m.tipo.toUpperCase()}
                                            </td>
                                            <td style={thTd}>{m.metodo_pago.toUpperCase()}</td>
                                            <td style={thTd}>Bs {Number(m.monto).toFixed(2)}</td>
                                            <td style={thTd}>Bs {Number(m.cambio || 0).toFixed(2)}</td>
                                            <td style={thTd}>{m.estado}</td>
                                            <td style={thTd}>{m.descripcion}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

const cardStyle = {
    background: '#fff',
    padding: '1.25rem',
    borderRadius: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
};

const kpiBox = {
    background: '#fff',
    padding: '1rem',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
};

const inputStyle = {
    width: '100%',
    padding: '0.55rem',
    marginTop: '0.3rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    boxSizing: 'border-box'
};

const btnPrimario = {
    padding: '0.7rem 1.2rem',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

const btnOscuro = {
    padding: '0.7rem 1.2rem',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

const btnSecundario = {
    padding: '0.7rem 1.2rem',
    background: '#e5e7eb',
    color: '#111',
    borderRadius: '6px',
    fontWeight: 'bold',
    textDecoration: 'none'
};

const btnMini = {
    padding: '0.25rem 0.6rem',
    borderRadius: '4px',
    border: '1px solid #ccc',
    background: '#f9fafb',
    cursor: 'pointer',
    fontWeight: 'bold'
};

const thTd = {
    padding: '0.55rem 0.4rem'
};
