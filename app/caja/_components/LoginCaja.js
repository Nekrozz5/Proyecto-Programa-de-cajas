'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Store, KeyRound, ArrowRight, User, MonitorSmartphone } from 'lucide-react';
import { crearPruebaDispositivo, emparejarTerminal } from '../_lib/dispositivo-pos';

export default function LoginCaja({
    usuarios = [],
    onLoginExitoso,
    onError,
    onLimpiarAlertas
}) {
    const [loginNombreUsuario, setLoginNombreUsuario] = useState(usuarios.length > 0 ? String(usuarios[0].nombreUsuario || '') : '');
    const [loginPin, setLoginPin] = useState('');
    const [modoLoginManualCaja, setModoLoginManualCaja] = useState(usuarios.length === 0);
    const [loginNombreManualCaja, setLoginNombreManualCaja] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [mostrarEmparejamiento, setMostrarEmparejamiento] = useState(false);
    const [codigoEmparejamiento, setCodigoEmparejamiento] = useState('');
    const [nombreTerminal, setNombreTerminal] = useState('');
    const [emparejando, setEmparejando] = useState(false);
    const [mensajeDispositivo, setMensajeDispositivo] = useState('');

    async function handleLogin(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        try {
            setProcesando(true);
            const pruebaDispositivo = await crearPruebaDispositivo({ obligatoria: !modoLoginManualCaja });
            const payload = modoLoginManualCaja
                ? {
                    accion: 'login',
                    nombreUsuario: loginNombreManualCaja.trim(),
                    pin: loginPin,
                    ...pruebaDispositivo
                }
                : {
                    accion: 'login',
                    nombreUsuario: loginNombreUsuario,
                    pin: loginPin,
                    ...pruebaDispositivo
                };

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión.');

            setLoginPin('');
            setLoginNombreManualCaja('');
            const rolEtiqueta = data.usuario.rol === 'propietario' ? 'Propietario(a)' : data.usuario.rol === 'admin' ? 'Administrador' : data.usuario.rol === 'developer' ? 'Desarrollador' : 'Cajero';
            onLoginExitoso?.(data.usuario, `Sesión iniciada como ${data.usuario.nombre} (${rolEtiqueta}).`);
        } catch (err) {
            setLoginPin('');
            onError?.(err.message);
        } finally {
            setProcesando(false);
        }
    }

    async function handleEmparejar(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();
        setMensajeDispositivo('');
        try {
            setEmparejando(true);
            await emparejarTerminal({ codigo: codigoEmparejamiento, nombre: nombreTerminal });
            setCodigoEmparejamiento('');
            setMostrarEmparejamiento(false);
            setMensajeDispositivo('Terminal emparejada y lista para iniciar sesión.');
        } catch (err) {
            onError?.(err.message);
        } finally {
            setEmparejando(false);
        }
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg border-slate-200">
                <CardHeader className="text-center pb-4">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-8 ring-sky-50/50 shadow-inner">
                        <Store className="h-7 w-7" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">Iniciar Sesión en Caja</CardTitle>
                    <CardDescription className="text-slate-500 text-sm">
                        Identifícate con tu PIN o contraseña para registrar tus operaciones y ventas.
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        {!modoLoginManualCaja ? (
                            <div className="space-y-1.5">
                                <label htmlFor="usuario-caja" className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                                    <User className="h-4 w-4 text-slate-400" />
                                    <span>Selecciona tu Usuario</span>
                                </label>
                                <select
                                    id="usuario-caja"
                                    value={loginNombreUsuario}
                                    onChange={(e) => setLoginNombreUsuario(e.target.value)}
                                    required
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {usuarios.map((u) => (
                                        <option key={u.id} value={u.nombreUsuario}>
                                            {u.nombre}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <label htmlFor="nombre-usuario-caja" className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                                    <User className="h-4 w-4 text-slate-400" />
                                    <span>Nombre de Usuario</span>
                                </label>
                                <Input
                                    id="nombre-usuario-caja"
                                    type="text"
                                    placeholder="Ingresa tu nombre de usuario"
                                    value={loginNombreManualCaja}
                                    onChange={(e) => setLoginNombreManualCaja(e.target.value)}
                                    required
                                />
                                <p className="text-xs text-slate-500">
                                    Administradores y soporte: escriban su nombre de usuario.
                                </p>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label htmlFor="pin-caja" className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                                <KeyRound className="h-4 w-4 text-slate-400" />
                                <span>PIN / Contraseña</span>
                            </label>
                            <PasswordInput
                                id="pin-caja"
                                placeholder="Ingresa tu PIN o contraseña"
                                value={loginPin}
                                onChange={(e) => setLoginPin(e.target.value)}
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={procesando}
                            className="w-full h-11 text-base font-semibold transition-all gap-2"
                        >
                            {procesando ? (
                                'Verificando...'
                            ) : (
                                <>
                                    <span>Ingresar a Caja</span>
                                    <ArrowRight className="h-4 w-4" />
                                </>
                            )}
                        </Button>

                        <div className="text-center pt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();
                                    setModoLoginManualCaja(!modoLoginManualCaja);
                                    setLoginNombreManualCaja('');
                                    setLoginPin('');
                                }}
                                className="text-xs font-medium text-slate-500 hover:text-primary transition-colors underline underline-offset-4"
                            >
                                {modoLoginManualCaja
                                    ? 'Volver a lista de usuarios'
                                    : '¿Ingresar nombre de usuario manualmente?'}
                            </button>
                        </div>

                        <div className="border-t border-slate-200 pt-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setMostrarEmparejamiento(!mostrarEmparejamiento);
                                    setMensajeDispositivo('');
                                }}
                                className="mx-auto flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 transition-colors"
                            >
                                <MonitorSmartphone className="h-4 w-4" />
                                <span>Emparejar terminal</span>
                            </button>

                            {mostrarEmparejamiento && (
                                <div className="mt-3 space-y-3 rounded-lg border border-sky-100 bg-sky-50/60 p-3 text-left">
                                    <p className="m-0 text-xs text-slate-600">
                                        Solicita en el panel administrativo un código temporal para autorizar este dispositivo.
                                    </p>
                                    <div className="space-y-1">
                                        <label htmlFor="codigo-emparejamiento" className="text-xs font-semibold text-slate-700">Código de emparejamiento</label>
                                        <Input
                                            id="codigo-emparejamiento"
                                            value={codigoEmparejamiento}
                                            onChange={(e) => setCodigoEmparejamiento(e.target.value.toUpperCase())}
                                            placeholder="Código temporal"
                                            autoComplete="one-time-code"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label htmlFor="nombre-terminal" className="text-xs font-semibold text-slate-700">Nombre de la terminal</label>
                                        <Input
                                            id="nombre-terminal"
                                            value={nombreTerminal}
                                            onChange={(e) => setNombreTerminal(e.target.value)}
                                            placeholder="Ej. Caja mostrador"
                                            required
                                        />
                                    </div>
                                    <Button type="button" size="sm" onClick={handleEmparejar} disabled={emparejando} className="w-full">
                                        {emparejando ? 'Activando...' : 'Activar terminal'}
                                    </Button>
                                </div>
                            )}
                            {mensajeDispositivo && <p className="mt-2 mb-0 text-center text-xs font-semibold text-emerald-700">{mensajeDispositivo}</p>}
                        </div>
                    </form>
                </CardContent>

                <CardFooter className="flex gap-2 pt-3 border-t border-slate-100 bg-slate-50/50 rounded-b-lg">
                    <Button variant="outline" asChild className="flex-1 text-xs font-medium text-slate-600 border-slate-200">
                        <Link href="/">
                            Inicio
                        </Link>
                    </Button>
                    <Button variant="outline" asChild className="flex-1 text-xs font-medium text-slate-600 border-slate-200">
                        <Link href="/admin">
                            Panel Admin
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
