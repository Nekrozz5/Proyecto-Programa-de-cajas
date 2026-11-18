'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    verificarCodigoDestinatarioAction,
    reenviarCodigoAction
} from '../../../server/actions/notificaciones.actions';
import {
    KeyRound,
    Loader2,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    MailCheck
} from 'lucide-react';

export default function ModalVerificarEmail({
    abierto,
    destinatario,
    onCerrar,
    onVerificado
}) {
    const [codigo, setCodigo] = useState('');
    const [cargando, setCargando] = useState(false);
    const [reenviando, setReenviando] = useState(false);
    const [error, setError] = useState(null);
    const [mensajeExito, setMensajeExito] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (abierto) {
            setCodigo('');
            setError(null);
            setMensajeExito(null);
            setCargando(false);
            setReenviando(false);
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [abierto, destinatario?.id]);

    if (!destinatario) return null;

    async function handleVerificar(e) {
        if (e) e.preventDefault();
        const codigoLimpio = codigo.trim();
        if (codigoLimpio.length < 4) {
            setError('Ingresa el código completo de 4 cifras.');
            return;
        }

        try {
            setCargando(true);
            setError(null);
            setMensajeExito(null);

            const res = await verificarCodigoDestinatarioAction({
                id: destinatario.id,
                codigo: codigoLimpio
            });

            if (!res.ok) {
                throw new Error(res.error || 'Código incorrecto o expirado.');
            }

            setMensajeExito(res.data?.mensaje || '¡Correo verificado con éxito!');
            
            // Notificar al componente padre de forma inmediata
            if (onVerificado) {
                onVerificado(res.data?.destinatario || { ...destinatario, verificado: 1 });
            }

            setTimeout(() => {
                onCerrar?.();
            }, 900);
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    }

    async function handleReenviar() {
        try {
            setReenviando(true);
            setError(null);
            setMensajeExito(null);

            const res = await reenviarCodigoAction({ id: destinatario.id });
            if (!res.ok) {
                throw new Error(res.error || 'No se pudo reenviar el código.');
            }

            setMensajeExito(res.data?.mensaje || 'Nuevo código de 4 cifras enviado a tu bandeja.');
            setCodigo('');
            inputRef.current?.focus();
        } catch (err) {
            setError(err.message);
        } finally {
            setReenviando(false);
        }
    }

    return (
        <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar?.()}>
            <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-2xl p-6">
                <DialogHeader className="text-center sm:text-center items-center">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-700 mb-2">
                        <KeyRound className="h-6 w-6" />
                    </div>
                    <DialogTitle className="text-xl font-bold text-slate-900">
                        Verificar Correo Electrónico
                    </DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm text-slate-600 mt-1 max-w-sm text-center">
                        Hemos enviado un código de seguridad de 4 cifras al correo:
                        <br />
                        <span className="font-semibold text-slate-900 block mt-1 break-all">
                            {destinatario.email}
                        </span>
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                        <span>{error}</span>
                    </div>
                )}

                {mensajeExito && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                        <span>{mensajeExito}</span>
                    </div>
                )}

                <form onSubmit={handleVerificar} className="space-y-4">
                    <div className="flex flex-col items-center gap-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                            Código de 4 Dígitos
                        </label>
                        <Input
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={4}
                            value={codigo}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9a-zA-Z]/g, '').slice(0, 4).toUpperCase();
                                setCodigo(val);
                                if (val.length === 4) {
                                    setError(null);
                                }
                            }}
                            placeholder="0000"
                            className="h-14 w-48 text-center text-3xl font-mono font-bold tracking-[0.35em] text-slate-900 border-2 border-slate-300 focus-visible:border-sky-600 focus-visible:ring-sky-600/20 bg-slate-50"
                        />
                        <span className="text-[11px] text-slate-500">
                            El código es válido durante 15 minutos.
                        </span>
                    </div>

                    <div className="flex items-center justify-center">
                        <button
                            type="button"
                            onClick={handleReenviar}
                            disabled={reenviando || cargando}
                            className="text-xs text-sky-600 hover:text-sky-800 font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${reenviando ? 'animate-spin' : ''}`} />
                            <span>{reenviando ? 'Enviando nuevo código...' : '¿No lo recibiste? Reenviar código'}</span>
                        </button>
                    </div>

                    <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCerrar}
                            disabled={cargando}
                            className="border-slate-300 text-slate-700 hover:bg-slate-100"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={cargando || codigo.trim().length < 4}
                            className="bg-sky-600 hover:bg-sky-700 text-white font-semibold inline-flex items-center gap-2"
                        >
                            {cargando ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Verificando...</span>
                                </>
                            ) : (
                                <>
                                    <MailCheck className="h-4 w-4" />
                                    <span>Confirmar y Activar</span>
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
