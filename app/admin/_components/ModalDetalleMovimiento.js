'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Receipt,
    Bike,
    MapPin,
    Phone,
    User,
    CheckCircle2,
    AlertTriangle,
    ShieldCheck,
    CreditCard,
    Building2,
    DollarSign,
    FileText
} from 'lucide-react';

function parsearDatosEntrega(datos) {
    if (!datos) return null;
    if (typeof datos === 'object') return datos;
    try {
        return JSON.parse(datos);
    } catch {
        return { direccion: String(datos) };
    }
}

export default function ModalDetalleMovimiento({ movimiento, isOpen, onClose }) {
    if (!movimiento) return null;

    const esMototaxi = movimiento.canal_venta === 'mototaxi';
    const datosEntrega = parsearDatosEntrega(movimiento.datos_entrega);
    const esAnulado = movimiento.estado === 'anulado';
    const esFactura = movimiento.tipo_comprobante === 'factura';

    const ivaMonto = Number(movimiento.iva_monto || 0);
    const itMonto = Number(movimiento.it_monto || 0);
    const ivaPorc = Number(movimiento.iva_porcentaje || 0);
    const itPorc = Number(movimiento.it_porcentaje || 0);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="border-b border-slate-100 pb-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap pr-6">
                        <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-sky-600 shrink-0" />
                            <span>Auditoría de Movimiento #{movimiento.id}</span>
                        </DialogTitle>
                        <div className="flex items-center gap-2">
                            {esMototaxi && (
                                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border border-amber-300 font-bold text-xs flex items-center gap-1">
                                    <Bike className="w-3.5 h-3.5" />
                                    <span>Despacho Mototaxi</span>
                                </Badge>
                            )}
                            {esAnulado ? (
                                <Badge variant="destructive" className="font-bold text-xs">
                                    ANULADO
                                </Badge>
                            ) : (
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 font-bold text-xs flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Completado</span>
                                </Badge>
                            )}
                        </div>
                    </div>
                    <DialogDescription className="text-xs text-slate-500 mt-1">
                        Turno #{movimiento.caja_id || '—'} &bull; Fecha: {movimiento.fecha_hora} &bull; Operador: <strong>{movimiento.usuario_nombre || `Usuario #${movimiento.usuario_id}`}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-2 text-xs sm:text-sm">
                    {/* ALERTA SI FUE ANULADO */}
                    {esAnulado && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-900 flex flex-col gap-1 text-xs">
                            <div className="font-bold flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 text-red-600" />
                                <span>Venta Anulada el {movimiento.fecha_anulacion || '—'}</span>
                            </div>
                            <div><strong>Motivo:</strong> {movimiento.motivo_anulacion || 'Sin motivo especificado'}</div>
                            {movimiento.anulado_por_nombre && (
                                <div><strong>Anulado por:</strong> {movimiento.anulado_por_nombre}</div>
                            )}
                        </div>
                    )}

                    {/* BLOQUE 1: DATOS DE DESPACHO Y ENTREGA (MOTOTAXI) */}
                    {esMototaxi && (
                        <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3.5 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-amber-950 flex items-center gap-1.5 text-xs sm:text-sm">
                                    <Bike className="w-4 h-4 text-amber-700" />
                                    <span>Datos de Entrega / Despacho Local (Mototaxi)</span>
                                </span>
                                <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[11px] font-semibold">
                                    Canal: Mototaxi
                                </Badge>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-md border border-amber-200/80 text-xs">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                                        <User className="w-3 h-3 text-slate-400" />
                                        Cliente:
                                    </span>
                                    <strong className="text-slate-800 text-xs sm:text-sm">
                                        {datosEntrega?.cliente || 'Cliente de Entrega'}
                                    </strong>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                                        <Phone className="w-3 h-3 text-slate-400" />
                                        Teléfono de Contacto:
                                    </span>
                                    <strong className="text-slate-800 text-xs sm:text-sm">
                                        {datosEntrega?.telefono || '—'}
                                    </strong>
                                </div>
                                <div className="flex flex-col gap-0.5 sm:col-span-1">
                                    <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                                        <MapPin className="w-3 h-3 text-slate-400" />
                                        Dirección de Entrega:
                                    </span>
                                    <strong className="text-slate-800 text-xs sm:text-sm break-words">
                                        {datosEntrega?.direccion || '—'}
                                    </strong>
                                </div>
                            </div>
                            <p className="text-[11px] text-amber-800 m-0">
                                ℹ️ Despacho coordinado mediante transporte mototaxi local. El monto de la venta fue cobrado e ingresado a la caja física de la estación.
                            </p>
                        </div>
                    )}

                    {/* BLOQUE 2: SNAPSHOT FISCAL INMUTABLE (RESPALDO TRIBUTARIO) */}
                    <div className="bg-sky-50/60 border border-sky-200 rounded-lg p-3.5 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-bold text-sky-950 flex items-center gap-1.5 text-xs sm:text-sm">
                                <ShieldCheck className="w-4 h-4 text-sky-700" />
                                <span>Snapshot Fiscal y Respaldo Tributario Inmutable</span>
                            </span>
                            <Badge variant="outline" className="bg-sky-100 text-sky-900 border-sky-300 text-[11px] font-semibold">
                                {movimiento.regimen_tributario === 'regimen_general' ? 'Régimen General' : 'RTS / Control Interno'}
                            </Badge>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white p-3 rounded-md border border-sky-200/80 text-xs">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-500 text-[11px]">Tipo de Documento:</span>
                                <strong className="text-slate-900 capitalize">
                                    {esFactura ? 'Factura Oficial' : (movimiento.tipo_comprobante || 'Recibo')}
                                </strong>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-500 text-[11px]">N° Factura / Recibo:</span>
                                <strong className="text-slate-900 font-mono">
                                    {movimiento.nro_factura ? `#${movimiento.nro_factura}` : 'S/N'}
                                </strong>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-500 text-[11px]">IVA Débito ({ivaPorc}%):</span>
                                <strong className="text-slate-900">
                                    Bs {ivaMonto.toFixed(2)}
                                </strong>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-500 text-[11px]">IT Calculado ({itPorc}%):</span>
                                <strong className="text-slate-900">
                                    Bs {itMonto.toFixed(2)}
                                </strong>
                            </div>
                        </div>

                        {(movimiento.cliente_razon_social || movimiento.cliente_nit_ci) && (
                            <div className="flex flex-wrap gap-4 bg-white px-3 py-2 rounded-md border border-sky-200/80 text-xs text-slate-700">
                                <div><strong>Razón Social / Cliente:</strong> {movimiento.cliente_razon_social || '—'}</div>
                                <div><strong>NIT / CI:</strong> {movimiento.cliente_nit_ci || '—'}</div>
                            </div>
                        )}
                    </div>

                    {/* BLOQUE 3: AUDITORÍA DE INGRESO A CAJA FÍSICA */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col gap-2.5">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs sm:text-sm">
                            <CreditCard className="w-4 h-4 text-slate-700" />
                            <span>Liquidación y Arqueo Físico en Caja</span>
                        </span>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white p-3 rounded-md border border-slate-200 text-xs">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-500 text-[11px]">Total Venta:</span>
                                <strong className="text-slate-900 text-sm font-bold">
                                    Bs {Number(movimiento.monto).toFixed(2)}
                                </strong>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-500 text-[11px]">Método de Pago:</span>
                                <strong className="text-slate-800 uppercase font-semibold">
                                    {movimiento.metodo_pago || 'EFECTIVO'}
                                </strong>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-500 text-[11px]">Efectivo Físico:</span>
                                <strong className="text-emerald-700 font-semibold">
                                    Bs {Number(movimiento.monto_efectivo || 0).toFixed(2)}
                                </strong>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-500 text-[11px]">Pago QR / Banco:</span>
                                <strong className="text-sky-700 font-semibold">
                                    Bs {Number(movimiento.monto_qr || 0).toFixed(2)}
                                </strong>
                            </div>
                        </div>

                        {Number(movimiento.cambio || 0) > 0 && (
                            <div className="text-xs text-slate-600 bg-white px-3 py-1.5 rounded-md border border-slate-200 flex justify-between">
                                <span>Monto recibido: Bs {Number(movimiento.monto_recibido || 0).toFixed(2)}</span>
                                <span className="font-semibold text-slate-800">Cambio devuelto de caja: Bs {Number(movimiento.cambio).toFixed(2)}</span>
                            </div>
                        )}

                        <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/80 p-2.5 rounded-md border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                                <strong>Fondos Verificados en Caja:</strong> El importe cobrado ingresó a la estación física de caja correspondiente al Turno #{movimiento.caja_id} y forma parte del arqueo esperado.
                            </span>
                        </div>
                    </div>

                    {/* BLOQUE 4: DESCRIPCIÓN DEL CONCEPTO */}
                    {movimiento.descripcion && (
                        <div className="text-xs bg-white p-3 rounded-lg border border-slate-200 flex flex-col gap-1">
                            <span className="font-semibold text-slate-700">Concepto / Detalle de la Venta:</span>
                            <p className="text-slate-600 m-0 break-words">{movimiento.descripcion}</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-slate-100 pt-3">
                    <Button type="button" variant="secondary" onClick={onClose} className="text-xs font-semibold">
                        Cerrar Auditoría
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
