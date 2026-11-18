'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginCaja({
    usuarios = [],
    onLoginExitoso,
    onError,
    onLimpiarAlertas
}) {
    const [loginUsuarioId, setLoginUsuarioId] = useState(usuarios.length > 0 ? String(usuarios[0].id) : '');
    const [loginPin, setLoginPin] = useState('');
    const [modoLoginManualCaja, setModoLoginManualCaja] = useState(usuarios.length === 0);
    const [loginNombreManualCaja, setLoginNombreManualCaja] = useState('');
    const [procesando, setProcesando] = useState(false);

    async function handleLogin(e) {
        e.preventDefault();
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        try {
            setProcesando(true);
            const payload = modoLoginManualCaja
                ? {
                    accion: 'login',
                    nombreUsuario: loginNombreManualCaja.trim(),
                    pin: loginPin
                }
                : {
                    accion: 'login',
                    usuarioId: Number(loginUsuarioId),
                    pin: loginPin
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
            onLoginExitoso?.(data.usuario, `Sesión iniciada como ${data.usuario.nombre} (${data.usuario.rol}).`);
        } catch (err) {
            setLoginPin('');
            onError?.(err.message);
        } finally {
            setProcesando(false);
        }
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg border-slate-200">
                <CardHeader className="text-center pb-4">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <span className="text-2xl">🔐</span>
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Iniciar Sesión en Caja</CardTitle>
                    <CardDescription className="text-slate-500 text-sm">
                        Identifícate con tu PIN o contraseña para registrar tus operaciones y ventas.
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        {!modoLoginManualCaja ? (
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">
                                    Selecciona tu Usuario
                                </label>
                                <select
                                    value={loginUsuarioId}
                                    onChange={(e) => setLoginUsuarioId(e.target.value)}
                                    required
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {usuarios.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.nombre}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">
                                    Nombre de Usuario
                                </label>
                                <Input
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
                            <label className="text-sm font-semibold text-slate-700">
                                PIN / Contraseña
                            </label>
                            <Input
                                type="password"
                                placeholder="Ingresa tu PIN o contraseña"
                                value={loginPin}
                                onChange={(e) => setLoginPin(e.target.value)}
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={procesando}
                            className="w-full h-11 text-base font-semibold transition-all"
                        >
                            {procesando ? 'Verificando...' : 'Ingresar a Caja'}
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
                                    ? '← Seleccionar usuario de la lista'
                                    : '¿Ingresar nombre de usuario manualmente?'}
                            </button>
                        </div>
                    </form>
                </CardContent>

                <CardFooter className="flex gap-2 pt-2 border-t border-slate-100 bg-slate-50/50 rounded-b-lg">
                    <Button variant="outline" asChild className="flex-1">
                        <Link href="/">
                            🏠 Inicio
                        </Link>
                    </Button>
                    <Button variant="outline" asChild className="flex-1">
                        <Link href="/admin">
                            🛡️ Panel Admin
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
