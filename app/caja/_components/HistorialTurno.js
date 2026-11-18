'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { anularVentaAction } from '../../../server/actions/ventas.actions';

export default function HistorialTurno({
    cajaAbierta,
    movimientos = [],
    usuarioActual,
    onActualizar,
    onMovimientoAnulado,
    onError,
    onLimpiarAlertas
}) {
    const [movimientoAAnularId, setMovimientoAAnularId] = useState(null);
    const [motivoAnulacionCaja, setMotivoAnulacionCaja] = useState('');
    const [anulando, setAnulando] = useState(false);

    async function confirmarAnularMovimiento(movimientoId) {
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        if (!motivoAnulacionCaja || motivoAnulacionCaja.trim().length < 3) {
            onError?.('Debes ingresar un motivo justificado (mínimo 3 caracteres) para anular el movimiento.');
            return;
        }

        try {
            setAnulando(true);
            const res = await anularVentaAction({
                movimientoId,
                motivo: motivoAnulacionCaja.trim()
            });

            if (!res.ok) throw new Error(res.error || 'Error al anular movimiento.');

            setMovimientoAAnularId(null);
            setMotivoAnulacionCaja('');
            onMovimientoAnulado?.(`Movimiento #${movimientoId} anulado y stock reintegrado al inventario.`);
        } catch (err) {
            onError?.(err.message);
        } finally {
            setAnulando(false);
        }
    }

    return (
        <Card className="shadow-sm border-slate-200">
            <CardHeader className="p-4 sm:p-5 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <CardTitle className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <span>📋</span>
                            <span>Historial de Movimientos del Turno #{cajaAbierta?.id}</span>
                        </CardTitle>
                        <p className="text-xs text-slate-500 mt-1">
                            Estación: <strong>{cajaAbierta?.caja_fisica_nombre || `Estación #${cajaAbierta?.caja_fisica_id || 1}`}</strong> | Operaciones registradas en este turno.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onActualizar}
                        className="min-h-[44px] px-4 text-xs font-semibold border-slate-300 hover:bg-slate-50 self-start sm:self-auto"
                    >
                        🔄 Actualizar
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 pt-2">
                {movimientos.length === 0 ? (
                    <div className="text-center py-10 px-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
                        <p className="text-slate-500 text-sm">Aún no hay movimientos registrados en este turno.</p>
                    </div>
                ) : (
                    <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <Table className="text-xs">
                            <TableHeader className="bg-slate-50 border-b border-slate-200">
                                <TableRow>
                                    <TableHead className="font-bold text-slate-700 w-16">ID</TableHead>
                                    <TableHead className="font-bold text-slate-700">Hora</TableHead>
                                    <TableHead className="font-bold text-slate-700">Tipo</TableHead>
                                    <TableHead className="font-bold text-slate-700">Método</TableHead>
                                    <TableHead className="font-bold text-slate-700">Comprobante</TableHead>
                                    <TableHead className="font-bold text-slate-700 min-w-[180px]">Detalle / Motivo</TableHead>
                                    <TableHead className="font-bold text-slate-700 text-right">Descuento</TableHead>
                                    <TableHead className="font-bold text-slate-700 text-right">Monto Neto</TableHead>
                                    <TableHead className="font-bold text-slate-700">Operador</TableHead>
                                    <TableHead className="font-bold text-slate-700">Estado</TableHead>
                                    {usuarioActual?.rol !== 'user' && (
                                        <TableHead className="font-bold text-slate-700">Acción Admin</TableHead>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {movimientos.map((m) => {
                                    const esAnulado = m.estado === 'anulado';
                                    return (
                                        <TableRow
                                            key={m.id}
                                            className={`${
                                                esAnulado
                                                    ? 'bg-rose-50/50 opacity-60 text-slate-500'
                                                    : 'hover:bg-slate-50/80'
                                            }`}
                                        >
                                            <TableCell className="font-bold text-slate-900">#{m.id}</TableCell>
                                            <TableCell className="whitespace-nowrap text-slate-600">
                                                {m.fecha_hora_local || m.fecha_hora}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={`text-[10px] font-bold uppercase ${
                                                        m.tipo === 'venta'
                                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                            : m.tipo === 'egreso'
                                                                ? 'bg-rose-100 text-rose-800 border-rose-200'
                                                                : 'bg-sky-100 text-sky-800 border-sky-200'
                                                    }`}
                                                >
                                                    {m.tipo}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="uppercase font-medium text-slate-700">
                                                <div>{m.metodo_pago}</div>
                                                {m.metodo_pago === 'mixto' && (
                                                    <div className="text-[10px] text-slate-500 font-normal lowercase">
                                                        ef: Bs {Number(m.monto_efectivo || 0).toFixed(2)} | qr: Bs {Number(m.monto_qr || 0).toFixed(2)}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {m.tipo_comprobante === 'factura' ? (
                                                    <span className="text-blue-700 font-semibold">
                                                        🧾 Fact. #{m.nro_factura || '-'} ({m.cliente_nit || m.proveedor_nit || 'S/N'})
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-500">{m.tipo_comprobante || 'recibo'}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-slate-800">{m.motivo}</div>
                                                {esAnulado && m.motivo_anulacion && (
                                                    <div className="text-[11px] text-rose-700 mt-0.5">
                                                        <strong>Anulado:</strong> {m.motivo_anulacion}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className={`text-right font-medium ${
                                                Number(m.descuento_total || 0) > 0 ? 'text-rose-600' : 'text-slate-400'
                                            }`}>
                                                {Number(m.descuento_total || 0) > 0 ? `-Bs ${Number(m.descuento_total).toFixed(2)}` : '-'}
                                            </TableCell>
                                            <TableCell className={`text-right font-bold text-slate-900 ${
                                                esAnulado ? 'line-through text-slate-400' : ''
                                            }`}>
                                                Bs {Number(m.monto || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-slate-600">
                                                {m.usuario_nombre || m.operador || '-'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={`text-[10px] font-bold ${
                                                        esAnulado
                                                            ? 'bg-rose-100 text-rose-800'
                                                            : 'bg-emerald-100 text-emerald-800'
                                                    }`}
                                                >
                                                    {m.estado.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                            {usuarioActual?.rol !== 'user' && (
                                                <TableCell>
                                                    {!esAnulado && (
                                                        movimientoAAnularId === m.id ? (
                                                            <div className="flex flex-col gap-1.5 min-w-[200px]">
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Motivo de anulación..."
                                                                    value={motivoAnulacionCaja}
                                                                    onChange={(e) => setMotivoAnulacionCaja(e.target.value)}
                                                                    className="h-8 text-xs bg-white"
                                                                />
                                                                <div className="flex gap-1.5">
                                                                    <Button
                                                                        type="button"
                                                                        variant="destructive"
                                                                        size="sm"
                                                                        disabled={anulando}
                                                                        onClick={() => confirmarAnularMovimiento(m.id)}
                                                                        className="h-7 text-xs font-bold px-2.5"
                                                                    >
                                                                        {anulando ? '...' : 'Confirmar'}
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => { setMovimientoAAnularId(null); setMotivoAnulacionCaja(''); }}
                                                                        className="h-7 text-xs px-2.5"
                                                                    >
                                                                        Cancelar
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => { setMovimientoAAnularId(m.id); setMotivoAnulacionCaja(''); }}
                                                                className="h-7 text-xs text-rose-700 border-rose-200 bg-rose-50 hover:bg-rose-100 font-semibold px-2.5"
                                                            >
                                                                🚫 Anular
                                                            </Button>
                                                        )
                                                    )}
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
