'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Store, KeyRound, ArrowRight, User } from 'lucide-react';
import { abrirTurnoAction } from '../../../server/actions/turnos.actions';

export default function AperturaTurno({
    usuarioActual,
    cajasFisicas = [],
    onTurnoAbierto,
    onError,
    onLimpiarAlertas
}) {
    const [montoInicial, setMontoInicial] = useState('100');
    const [cajaFisicaSeleccionada, setCajaFisicaSeleccionada] = useState('');
    const [abriendo, setAbriendo] = useState(false);

    const puedeAbrirCaja = Boolean(usuarioActual);

    async function handleAbrirCaja(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        const montoNum = Number(montoInicial);
        if (isNaN(montoNum) || montoNum < 0) {
            onError?.('Ingresa un monto inicial en efectivo válido mayor o igual a 0.');
            return;
        }

        try {
            setAbriendo(true);
            const res = await abrirTurnoAction({
                montoInicial: montoNum,
                cajaFisicaId: cajaFisicaSeleccionada ? Number(cajaFisicaSeleccionada) : null
            });

            if (!res.ok) throw new Error(res.error || 'Error al abrir turno de caja.');

            setCajaFisicaSeleccionada('');
            onTurnoAbierto?.(
                res.data?.cajaId,
                `Turno #${res.data?.cajaId} abierto exitosamente por ${usuarioActual?.nombre || 'Cajero'}.`
            );
        } catch (err) {
            onError?.(err.message);
        } finally {
            setAbriendo(false);
        }
    }

    return (
        <Card className="max-w-lg mx-auto shadow-sm border-slate-200 mt-8 mb-8">
            <CardHeader className="p-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
                        <Store className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-xl font-bold text-slate-900 tracking-tight">
                        Estado: Sin Turno Abierto
                    </CardTitle>
                </div>
            </CardHeader>

            <CardContent className="p-5 pt-4">
                {!puedeAbrirCaja ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 font-bold text-sm">
                            <KeyRound className="w-4 h-4 text-amber-700" />
                            <span>Reapertura Restringida al Administrador</span>
                        </div>
                        <p className="text-xs text-amber-800 leading-relaxed">
                            El turno de caja ya fue cerrado. Un cajero (<code>user</code>) no puede volver a abrir la caja después de cerrada.
                            Solicita al <strong>Administrador</strong> que la habilite.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleAbrirCaja} className="space-y-4">
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                <span>Abriendo turno con:</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                                <strong className="text-slate-900 font-semibold">{usuarioActual?.nombre}</strong>
                                <Badge variant="secondary" className="text-[10px] bg-slate-200 text-slate-700 font-semibold">
                                    {usuarioActual?.rol === 'propietario' ? 'Propietario(a)' : usuarioActual?.rol === 'admin' ? 'Administrador' : usuarioActual?.rol === 'developer' ? 'Desarrollador' : 'Cajero'}
                                </Badge>
                            </div>
                        </div>

                        {cajasFisicas.filter((cf) => Number(cf.activa) === 1).length > 1 ? (
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-700 block">
                                    Estación de Caja Física:
                                </label>
                                <select
                                    value={cajaFisicaSeleccionada}
                                    onChange={(e) => setCajaFisicaSeleccionada(e.target.value)}
                                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                >
                                    <option value="">-- Seleccionar Estación --</option>
                                    {cajasFisicas.filter((cf) => Number(cf.activa) === 1).map((cf) => (
                                        <option key={cf.id} value={cf.id} disabled={!!cf.turno_abierto_id}>
                                            {cf.nombre} {cf.turno_abierto_id ? `(Ocupada: Turno #${cf.turno_abierto_id})` : '(Disponible)'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="text-xs text-sky-800 bg-sky-50 border border-sky-200 p-3 rounded-lg font-medium flex items-center justify-between">
                                <span>Estación asignada:</span>
                                <strong className="font-bold text-sky-900">{cajasFisicas[0]?.nombre || 'Caja 1 - Principal'}</strong>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 block">
                                Fondo Inicial en Efectivo (Bs):
                            </label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={montoInicial}
                                onChange={(e) => setMontoInicial(e.target.value)}
                                required
                                className="h-11 text-base font-bold bg-white border-slate-300 rounded-lg focus-visible:ring-sky-500"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={abriendo}
                            className="w-full h-11 text-base font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-lg shadow-sm transition-all"
                        >
                            {abriendo ? (
                                <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                                    <span>Abriendo turno...</span>
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    <span>Abrir Turno de Caja</span>
                                    <ArrowRight className="w-4 h-4" />
                                </span>
                            )}
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
