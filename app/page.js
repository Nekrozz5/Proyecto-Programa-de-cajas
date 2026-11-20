'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, ShieldCheck } from 'lucide-react';

export default function HomePage() {
    const [cargando, setCargando] = useState(true);
    const [config, setConfig] = useState(null);

    useEffect(() => {
        async function cargarConfiguracion() {
            try {
                const res = await fetch('/api/caja');
                const data = await res.json();
                if (res.ok && data.configuracionNegocio) {
                    setConfig(data.configuracionNegocio);
                }
            } catch (_) {
                // Fallback silencioso a valores por defecto
            } finally {
                setCargando(false);
            }
        }
        cargarConfiguracion();
    }, []);

    if (cargando) {
        return (
            <main className="min-h-screen flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-3 text-slate-500 animate-pulse">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium">Cargando sistema...</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-xl shadow-xl border-slate-200 text-center">
                <CardHeader className="space-y-3 pb-4">
                    <div className="flex justify-center">
                        <Badge variant="secondary" className="bg-sky-50 text-sky-700 border-sky-200 font-semibold px-3 py-1">
                            {config?.modalidad_nombre || 'Punto de Venta POS'}
                        </Badge>
                    </div>
                    <CardTitle className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {config?.nombre_negocio || 'Sistema POS'}
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-sm max-w-md mx-auto">
                        Sistema integral de Punto de Venta, Arqueo Ciego y Control de Inventario Adaptativo
                    </CardDescription>
                </CardHeader>

                <CardContent className="pt-4 pb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Button asChild size="lg" className="h-14 text-base font-semibold shadow-md">
                            <Link href="/caja" className="flex items-center justify-center gap-2">
                                <ShoppingCart className="w-5 h-5" />
                                <span>Ir a Caja (Ventas)</span>
                            </Link>
                        </Button>
                        <Button asChild size="lg" variant="secondary" className="h-14 text-base font-semibold shadow-sm bg-slate-800 text-white hover:bg-slate-900">
                            <Link href="/admin" className="flex items-center justify-center gap-2">
                                <ShieldCheck className="w-5 h-5" />
                                <span>Panel de Administración</span>
                            </Link>
                        </Button>
                    </div>
                </CardContent>

                <CardFooter className="justify-center border-t border-slate-100 bg-slate-50/50 py-3 text-xs text-slate-400">
                    Control de Cajas • Modernizado con Shadcn & Tailwind CSS
                </CardFooter>
            </Card>
        </main>
    );
}
