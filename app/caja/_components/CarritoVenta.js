'use client';

import { cardStyle, btnMini, btnPrimario } from './cajaStyles';

export default function CarritoVenta({
    carrito = [],
    productos = [],
    cambiarCantidad,
    handleInputCantidad,
    finalizarEdicionCantidad,
    eliminarDelCarrito,
    vaciarCarrito,
    subtotalBrutoCarrito = 0,
    descuentoAplicadoNum = 0,
    descuentoInvalido = false,
    totalCarrito = 0,
    onAbrirCobro,
    ultimoTicket
}) {
    const hayCantidadInvalida = carrito.some((i) => !i.cantidad || Number(i.cantidad) <= 0);

    return (
        <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
                    🛒 Detalle del Pedido ({carrito.length} {carrito.length === 1 ? 'ítem' : 'ítems'})
                </h3>
                {carrito.length > 0 && (
                    <button
                        type="button"
                        onClick={vaciarCarrito}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                    >
                        Vaciar pedido
                    </button>
                )}
            </div>

            {/* Lista de productos en el pedido */}
            {carrito.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    <p style={{ color: '#64748b', fontSize: '0.92rem', margin: 0 }}>
                        Selecciona productos a la izquierda para agregarlos al pedido.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                    {carrito.map((item) => {
                        const itemClave = item.itemKey || String(item.productoId);
                        return (
                            <div
                                key={itemClave}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.55rem 0',
                                    borderBottom: '1px solid #f1f5f9',
                                    fontSize: '0.9rem',
                                    gap: '0.5rem'
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 'bold', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.nombre}
                                    </div>
                                    {item.modificadores && item.modificadores.length > 0 && (
                                        <div style={{ margin: '0.15rem 0 0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                            {item.modificadores.map((m, idx) => (
                                                <span
                                                    key={idx}
                                                    style={{
                                                        fontSize: '0.72rem',
                                                        background: '#e0f2fe',
                                                        color: '#0369a1',
                                                        borderRadius: '4px',
                                                        padding: '0.05rem 0.35rem',
                                                        fontWeight: 500
                                                    }}
                                                >
                                                    {m.nombre} {Number(m.precio_adicional || 0) > 0 ? `(+Bs ${Number(m.precio_adicional).toFixed(2)})` : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        Bs {Number(item.precio).toFixed(2)} x {item.cantidad || 0} = <strong style={{ color: '#0f172a' }}>Bs {((Number(item.precio) || 0) * (Number(item.cantidad) || 0)).toFixed(2)}</strong>
                                    </div>
                                    {item.maximoDisponible !== null && item.maximoDisponible !== Infinity && (
                                        <div style={{ fontSize: '0.72rem', color: '#0369a1' }}>
                                            Máx. disponible: {item.maximoDisponible} u.
                                        </div>
                                    )}
                                </div>

                                {/* Controles de cantidad: restar, escribir por teclado, sumar, borrar */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        onClick={() => cambiarCantidad && cambiarCantidad(itemClave, -1, productos)}
                                        style={{
                                            ...btnMini,
                                            width: '28px',
                                            height: '28px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                        title="Restar 1 unidad"
                                    >
                                        -
                                    </button>

                                    <input
                                        type="number"
                                        min="1"
                                        max={item.maximoDisponible !== Infinity ? item.maximoDisponible : undefined}
                                        value={item.cantidadTexto ?? item.cantidad ?? ''}
                                        onChange={(e) => handleInputCantidad && handleInputCantidad(itemClave, e.target.value, productos)}
                                        onBlur={(e) => finalizarEdicionCantidad && finalizarEdicionCantidad(itemClave, e.target.value, productos)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                finalizarEdicionCantidad && finalizarEdicionCantidad(itemClave, e.target.value, productos);
                                                e.target.blur();
                                            }
                                        }}
                                        onFocus={(e) => e.target.select()}
                                        style={{
                                            width: '54px',
                                            height: '28px',
                                            padding: '0 0.25rem',
                                            textAlign: 'center',
                                            fontWeight: 'bold',
                                            fontSize: '0.92rem',
                                            border: (!item.cantidad || item.cantidad <= 0 || item.cantidadTexto === '') ? '2px dashed #f59e0b' : '1px solid #cbd5e1',
                                            borderRadius: '6px',
                                            background: (!item.cantidad || item.cantidad <= 0 || item.cantidadTexto === '') ? '#fffbeb' : '#ffffff',
                                            outline: 'none'
                                        }}
                                        title="Escribe la cantidad deseada desde el teclado"
                                        placeholder="Cant"
                                    />

                                    <button
                                        type="button"
                                        onClick={() => cambiarCantidad && cambiarCantidad(itemClave, 1, productos)}
                                        style={{
                                            ...btnMini,
                                            width: '28px',
                                            height: '28px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                        title="Sumar 1 unidad"
                                    >
                                        +
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => eliminarDelCarrito && eliminarDelCarrito(itemClave)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#94a3b8',
                                            fontSize: '0.9rem',
                                            cursor: 'pointer',
                                            padding: '0.2rem 0.35rem',
                                            borderRadius: '4px',
                                            marginLeft: '0.15rem'
                                        }}
                                        title="Eliminar del pedido"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Resumen monetario y botón principal de cobro */}
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                    <span style={{ color: '#64748b' }}>Subtotal Bruto:</span>
                    <span style={{ fontWeight: 600 }}>Bs {subtotalBrutoCarrito.toFixed(2)}</span>
                </div>

                {descuentoAplicadoNum > 0 && !descuentoInvalido && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.9rem', color: '#dc2626' }}>
                        <span>Descuento aplicado:</span>
                        <span style={{ fontWeight: 600 }}>-Bs {descuentoAplicadoNum.toFixed(2)}</span>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.5rem 0 1rem', padding: '0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontWeight: 'bold', color: '#1e40af', fontSize: '1.05rem' }}>TOTAL A COBRAR:</span>
                    <span style={{ fontWeight: 'bold', color: '#1e3a8a', fontSize: '1.4rem' }}>
                        Bs {totalCarrito.toFixed(2)}
                    </span>
                </div>

                <button
                    type="button"
                    onClick={onAbrirCobro}
                    disabled={carrito.length === 0 || hayCantidadInvalida}
                    style={{
                        ...btnPrimario,
                        width: '100%',
                        padding: '0.85rem',
                        fontSize: '1.05rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 4px 6px -1px rgba(0, 112, 243, 0.3)',
                        opacity: (carrito.length === 0 || hayCantidadInvalida) ? 0.6 : 1,
                        cursor: (carrito.length === 0 || hayCantidadInvalida) ? 'not-allowed' : 'pointer'
                    }}
                >
                    <span>💳</span>
                    <span>Proceder al Cobro (Bs {totalCarrito.toFixed(2)})</span>
                </button>
            </div>

            {/* Notificación de último ticket emitido */}
            {ultimoTicket && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0', fontSize: '0.86rem' }}>
                    <div>
                        <strong>✅ Último Ticket #{ultimoTicket.movimientoId}:</strong> Cobrado Bs {Number(ultimoTicket.montoTotal || 0).toFixed(2)} ({String(ultimoTicket.metodoPago || '').toUpperCase()})
                        {Number(ultimoTicket.descuento || 0) > 0 && (
                            <span style={{ color: '#dc2626', marginLeft: '0.4rem' }}>
                                (Desc: -Bs {Number(ultimoTicket.descuento).toFixed(2)})
                            </span>
                        )}
                    </div>
                    {ultimoTicket.metodoPago === 'mixto' && (
                        <div style={{ marginTop: '0.2rem', color: '#0369a1' }}>
                            Desglose Mixto: 💵 Efectivo Bs {Number(ultimoTicket.montoEfectivo || 0).toFixed(2)} + 📱 QR Bs {Number(ultimoTicket.montoQr || 0).toFixed(2)}
                        </div>
                    )}
                    {(ultimoTicket.metodoPago === 'efectivo' || ultimoTicket.metodoPago === 'mixto') && (
                        <div style={{ marginTop: '0.2rem' }}>
                            Entregó cliente: Bs {Number(ultimoTicket.montoRecibido || 0).toFixed(2)} | <strong style={{ color: '#15803d' }}>Cambio entregado: Bs {Number(ultimoTicket.cambio || 0).toFixed(2)}</strong>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
