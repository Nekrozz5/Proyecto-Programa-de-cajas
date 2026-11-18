'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    ShoppingCart,
    Trash2,
    CreditCard,
    ShoppingBag,
    Plus,
    Minus,
    Tag,
    CheckCircle2,
    Banknote,
    QrCode,
    Calendar
} from 'lucide-react';

function obtenerEstadoVencimiento(fechaStr) {
    if (!fechaStr) return { estado: 'normal', dias: 999 };
    try {
        const [y, m, d] = fechaStr.split('-').map(Number);
        const fecha = new Date(y, m - 1, d);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const dias = Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        if (dias < 0) return { estado: 'vencido', dias, label: 'Vencido' };
        if (dias <= 30) return { estado: 'proximo', dias, label: `${dias}d para vencer` };
        return { estado: 'normal', dias, label: `Vence ${fechaStr}` };
    } catch {
        return { estado: 'normal', dias: 999 };
    }
}

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
        <Card className="shadow-sm border-slate-200">
            <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <ShoppingCart className="w-5 h-5 text-sky-600" />
                            <span>Detalle del Pedido</span>
                        </CardTitle>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-semibold text-xs">
                            {carrito.length} {carrito.length === 1 ? 'ítem' : 'ítems'}
                        </Badge>
                    </div>

                    {carrito.length > 0 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={vaciarCarrito}
                            className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold min-h-[36px] px-2.5 cursor-pointer flex items-center gap-1.5"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Vaciar pedido</span>
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Lista de productos en el pedido */}
                {carrito.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
                            <ShoppingBag className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="text-slate-600 text-sm font-medium">El carrito está vacío</p>
                        <p className="text-slate-400 text-xs mt-1">
                            Selecciona productos del catálogo para agregarlos al pedido.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
                        {carrito.map((item) => {
                            const itemClave = item.itemKey || String(item.productoId);
                            const precioNum = Number(item.precio) || 0;
                            const cantidadNum = Number(item.cantidad) || 0;
                            const subtotalItem = (precioNum * cantidadNum).toFixed(2);
                            const tieneErrorCantidad = !item.cantidad || item.cantidad <= 0 || item.cantidadTexto === '';

                            return (
                                <div
                                    key={itemClave}
                                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">
                                            {item.nombre}
                                        </div>

                                        {/* Badge de Lote y Vencimiento */}
                                        {item.fechaVencimiento && (() => {
                                            const estadoV = obtenerEstadoVencimiento(item.fechaVencimiento);
                                            return (
                                                <div className="mt-1 flex items-center gap-1.5">
                                                    <span
                                                        className={`inline-flex items-center gap-1 text-[11px] border rounded px-1.5 py-0.5 font-semibold ${
                                                            estadoV.estado === 'vencido'
                                                                ? 'bg-rose-50 text-rose-800 border-rose-300'
                                                                : estadoV.estado === 'proximo'
                                                                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                                                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                                        }`}
                                                    >
                                                        <Calendar className="w-3 h-3 text-slate-500" />
                                                        <span>Lote: {item.fechaVencimiento}</span>
                                                        {estadoV.estado === 'proximo' && (
                                                            <span className="text-[10px] text-amber-700 font-bold">({estadoV.label})</span>
                                                        )}
                                                    </span>
                                                </div>
                                            );
                                        })()}

                                        {/* Modificadores / Adicionales seleccionados */}
                                        {item.modificadores && item.modificadores.length > 0 && (
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {item.modificadores.map((m, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="inline-flex items-center text-[11px] bg-sky-50 text-sky-700 border border-sky-200/80 rounded px-1.5 py-0.5 font-medium"
                                                    >
                                                        {m.nombre} {Number(m.precio_adicional || 0) > 0 ? `(+Bs ${Number(m.precio_adicional).toFixed(2)})` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="text-xs text-slate-500 mt-1">
                                            Bs {precioNum.toFixed(2)} × {cantidadNum} = <strong className="text-slate-900 font-bold">Bs {subtotalItem}</strong>
                                        </div>

                                        {item.maximoDisponible !== null && item.maximoDisponible !== Infinity && (
                                            <div className="text-[11px] text-sky-700 font-medium mt-0.5">
                                                Máx. disponible: {item.maximoDisponible} u.
                                            </div>
                                        )}
                                    </div>

                                    {/* Controles de cantidad táctiles */}
                                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                        <button
                                            type="button"
                                            onClick={() => cambiarCantidad && cambiarCantidad(itemClave, -1, productos)}
                                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors active:scale-95 cursor-pointer"
                                            title="Restar 1 unidad"
                                        >
                                            <Minus className="w-4 h-4" />
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
                                            className={`w-14 h-10 text-center font-bold text-sm rounded-lg border outline-none transition-colors ${
                                                tieneErrorCantidad
                                                    ? 'border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-amber-400/30'
                                                    : 'border-slate-300 bg-white text-slate-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20'
                                            }`}
                                            title="Escribe la cantidad deseada desde el teclado"
                                            placeholder="Cant"
                                        />

                                        <button
                                            type="button"
                                            onClick={() => cambiarCantidad && cambiarCantidad(itemClave, 1, productos)}
                                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors active:scale-95 cursor-pointer"
                                            title="Sumar 1 unidad"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => eliminarDelCarrito && eliminarDelCarrito(itemClave)}
                                            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                            title="Eliminar del pedido"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Resumen monetario y botón principal de cobro */}
                <div className="pt-3 border-t-2 border-slate-100 space-y-2">
                    <div className="flex justify-between items-center text-sm text-slate-600">
                        <span>Subtotal Bruto:</span>
                        <span className="font-semibold text-slate-900">Bs {subtotalBrutoCarrito.toFixed(2)}</span>
                    </div>

                    {descuentoAplicadoNum > 0 && !descuentoInvalido && (
                        <div className="flex justify-between items-center text-sm text-rose-600">
                            <span>Descuento aplicado:</span>
                            <span className="font-bold">-Bs {descuentoAplicadoNum.toFixed(2)}</span>
                        </div>
                    )}

                    {/* Caja de Total a Cobrar */}
                    <div className="flex justify-between items-center p-4 bg-sky-50 border-2 border-sky-200 rounded-xl my-3">
                        <span className="font-bold text-sky-900 text-sm sm:text-base">TOTAL A COBRAR:</span>
                        <span className="font-black text-sky-950 text-xl sm:text-2xl tracking-tight">
                            Bs {totalCarrito.toFixed(2)}
                        </span>
                    </div>

                    <Button
                        type="button"
                        onClick={onAbrirCobro}
                        disabled={carrito.length === 0 || hayCantidadInvalida}
                        className="w-full min-h-[50px] text-base font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 rounded-xl"
                    >
                        <CreditCard className="w-5 h-5" />
                        <span>Proceder al Cobro (Bs {totalCarrito.toFixed(2)})</span>
                    </Button>
                </div>

                {/* Notificación de último ticket emitido */}
                {ultimoTicket && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1.5">
                        <div className="font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Último Ticket #{ultimoTicket.movimientoId}: Cobrado Bs {Number(ultimoTicket.montoTotal || 0).toFixed(2)} ({String(ultimoTicket.metodoPago || '').toUpperCase()})</span>
                            {Number(ultimoTicket.descuento || 0) > 0 && (
                                <span className="text-rose-600 font-bold ml-1">
                                    (-Bs {Number(ultimoTicket.descuento).toFixed(2)})
                                </span>
                            )}
                        </div>
                        {ultimoTicket.metodoPago === 'mixto' && (
                            <div className="text-slate-600 flex items-center gap-2 flex-wrap text-[11px]">
                                <span>Desglose Mixto:</span>
                                <span className="inline-flex items-center gap-1 font-medium text-slate-700 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                                    <Banknote className="w-3.5 h-3.5 text-emerald-700" />
                                    Efectivo Bs {Number(ultimoTicket.montoEfectivo || 0).toFixed(2)}
                                </span>
                                <span>+</span>
                                <span className="inline-flex items-center gap-1 font-medium text-slate-700 bg-sky-100/60 px-1.5 py-0.5 rounded">
                                    <QrCode className="w-3.5 h-3.5 text-sky-700" />
                                    QR Bs {Number(ultimoTicket.montoQr || 0).toFixed(2)}
                                </span>
                            </div>
                        )}
                        {(ultimoTicket.metodoPago === 'efectivo' || ultimoTicket.metodoPago === 'mixto') && (
                            <div className="text-slate-600">
                                Entregó cliente: Bs {Number(ultimoTicket.montoRecibido || 0).toFixed(2)} | <strong className="text-emerald-700 font-bold">Cambio entregado: Bs {Number(ultimoTicket.cambio || 0).toFixed(2)}</strong>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
