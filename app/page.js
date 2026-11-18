'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function HomePage() {
    const [cargando, setCargando] = useState(true);
    const [config, setConfig] = useState(null);
    const [sistemaInstalado, setSistemaInstalado] = useState(false);

    // Estado del Asistente de Primera Ejecución (3 pasos)
    const [paso, setPaso] = useState(1); // 1: Modalidad | 2: Nombre Empresa | 3: Crear Super Admin
    const [modalidadNombre, setModalidadNombre] = useState('Venta Directa de Artículos No Perecederos');
    const [usaStockDirecto, setUsaStockDirecto] = useState(true);
    const [usaVencimiento, setUsaVencimiento] = useState(false);
    const [usaRecetas, setUsaRecetas] = useState(false);

    const [nombreNegocio, setNombreNegocio] = useState('');
    const [adminNombre, setAdminNombre] = useState('');
    const [adminPin, setAdminPin] = useState('');
    const [setupToken, setSetupToken] = useState('');

    const [error, setError] = useState(null);
    const [guardando, setGuardando] = useState(false);

    async function verificarEstadoInicial() {
        try {
            setCargando(true);
            const res = await fetch('/api/caja');
            const data = await res.json();
            if (res.ok) {
                setConfig(data.configuracionNegocio || null);
                setSistemaInstalado(Boolean(data.sistemaInstalado));
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    }

    useEffect(() => {
        verificarEstadoInicial();
    }, []);

    function seleccionarModalidad(tipo) {
        if (tipo === 'no_perecedero') {
            setModalidadNombre('Venta Directa de Artículos No Perecederos');
            setUsaStockDirecto(true);
            setUsaVencimiento(false);
            setUsaRecetas(false);
        } else if (tipo === 'perecedero') {
            setModalidadNombre('Venta Directa de Productos con Fecha de Vencimiento');
            setUsaStockDirecto(true);
            setUsaVencimiento(true);
            setUsaRecetas(false);
        } else if (tipo === 'ensamblaje_no_perecedero') {
            setModalidadNombre('Producción / Ensamblaje con Materiales No Perecederos');
            setUsaStockDirecto(true);
            setUsaVencimiento(false);
            setUsaRecetas(true);
        } else if (tipo === 'elaboracion_perecedera') {
            setModalidadNombre('Elaboración con Recetas e Insumos Perecederos');
            setUsaStockDirecto(true);
            setUsaVencimiento(true);
            setUsaRecetas(true);
        }
    }

    async function finalizarInstalacion(e) {
        e.preventDefault();
        setError(null);
        setGuardando(true);
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'instalacion_inicial',
                    nombreNegocio,
                    modalidadNombre,
                    usaStockDirecto,
                    usaVencimiento,
                    usaRecetasEnsamblaje: usaRecetas,
                    adminNombre,
                    adminPin,
                    setupToken
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al inicializar el sistema');
            await verificarEstadoInicial();
        } catch (err) {
            setError(err.message);
        } finally {
            setGuardando(false);
        }
    }

    if (cargando) {
        return (
            <main className="min-h-screen flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-3 text-slate-500 animate-pulse">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium">Verificando estado del sistema...</p>
                </div>
            </main>
        );
    }

    const requierePrimeraEjecucion = !config || Number(config.configurado) === 0 || !sistemaInstalado;

    // ASISTENTE PASO A PASO EN LA PRIMERA EJECUCIÓN DEL PROGRAMA
    if (requierePrimeraEjecucion) {
        return (
            <main className="min-h-screen flex items-center justify-center p-4 py-8">
                <Card className="w-full max-w-3xl shadow-xl border-slate-200">
                    <CardHeader className="border-b border-slate-100 pb-5">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div>
                                <Badge variant="secondary" className="bg-sky-50 text-sky-700 border-sky-200 mb-1">
                                    Instalación Inicial • Paso {paso} de 3
                                </Badge>
                                <CardTitle className="text-2xl font-bold text-slate-900">
                                    Configuración de Primera Ejecución
                                </CardTitle>
                            </div>
                            <div className="flex items-center gap-2">
                                {[1, 2, 3].map((num) => (
                                    <div
                                        key={num}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                                            paso >= num
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'bg-slate-100 text-slate-400'
                                        }`}
                                    >
                                        {num}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-6">
                        {error && (
                            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-center gap-2">
                                <span>⚠️</span>
                                <div><strong>Error:</strong> {error}</div>
                            </div>
                        )}

                        {/* PASO 1: MODALIDAD DE FUNCIONAMIENTO */}
                        {paso === 1 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-800">
                                        Paso 1: ¿Cómo funciona el inventario de tu negocio?
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Esto adaptará automáticamente la interfaz del programa para mostrar solo las funciones que necesitas:
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    <button
                                        type="button"
                                        onClick={() => seleccionarModalidad('no_perecedero')}
                                        className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                                            usaStockDirecto && !usaVencimiento && !usaRecetas
                                                ? 'border-primary bg-sky-50/50 shadow-sm ring-1 ring-primary'
                                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                                        }`}
                                    >
                                        <span className="font-semibold text-slate-900 text-sm">
                                            🔧 Artículos No Perecederos
                                        </span>
                                        <span className="text-xs text-slate-600 mt-1">
                                            Compra y venta directa por unidad, metro o kilo con Costo Promedio Ponderado.
                                        </span>
                                        <span className="text-[11px] text-sky-600 font-medium mt-2">
                                            Ej: Repuestos de auto, piezas de PC, ferretería, maderera.
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => seleccionarModalidad('perecedero')}
                                        className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                                            usaStockDirecto && usaVencimiento && !usaRecetas
                                                ? 'border-primary bg-sky-50/50 shadow-sm ring-1 ring-primary'
                                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                                        }`}
                                    >
                                        <span className="font-semibold text-slate-900 text-sm">
                                            🛒 Productos Perecederos
                                        </span>
                                        <span className="text-xs text-slate-600 mt-1">
                                            Compra y venta directa solicitando fecha de vencimiento y cantidad por lote.
                                        </span>
                                        <span className="text-[11px] text-sky-600 font-medium mt-2">
                                            Ej: Supermercado, minimarket, farmacia.
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => seleccionarModalidad('ensamblaje_no_perecedero')}
                                        className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                                            usaStockDirecto && !usaVencimiento && usaRecetas
                                                ? 'border-primary bg-sky-50/50 shadow-sm ring-1 ring-primary'
                                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                                        }`}
                                    >
                                        <span className="font-semibold text-slate-900 text-sm">
                                            🪚 Ensamblaje / Fabricación
                                        </span>
                                        <span className="text-xs text-slate-600 mt-1">
                                            Usa materiales o piezas no perecederas que se ensamblan para armar un producto final.
                                        </span>
                                        <span className="text-[11px] text-sky-600 font-medium mt-2">
                                            Ej: Carpintería/muebles, ensamblaje de PCs, taller.
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => seleccionarModalidad('elaboracion_perecedera')}
                                        className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                                            usaStockDirecto && usaVencimiento && usaRecetas
                                                ? 'border-primary bg-sky-50/50 shadow-sm ring-1 ring-primary'
                                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                                        }`}
                                    >
                                        <span className="font-semibold text-slate-900 text-sm">
                                            ☕ Elaboración con Recetas
                                        </span>
                                        <span className="text-xs text-slate-600 mt-1">
                                            Recetas de preparación con insumos que tienen control de caducidad.
                                        </span>
                                        <span className="text-[11px] text-sky-600 font-medium mt-2">
                                            Ej: Restaurante, cafetería, panadería, pastelería.
                                        </span>
                                    </button>
                                </div>

                                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                                        Ajuste fino de funciones activas
                                    </span>
                                    <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={usaStockDirecto}
                                            onChange={(e) => setUsaStockDirecto(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                        />
                                        Control de Stock Directo y Cantidad por Artículo
                                    </label>
                                    <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={usaVencimiento}
                                            onChange={(e) => setUsaVencimiento(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                        />
                                        Solicitar Fecha de Vencimiento en Artículos / Lotes
                                    </label>
                                    <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={usaRecetas}
                                            onChange={(e) => setUsaRecetas(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                        />
                                        Habilitar Recetas / Ensamblaje de Materiales (BOM)
                                    </label>
                                </div>

                                <div className="flex justify-end pt-2">
                                    <Button onClick={() => setPaso(2)}>
                                        Siguiente: Nombre de la Empresa →
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* PASO 2: NOMBRE DE LA EMPRESA */}
                        {paso === 2 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-800">
                                        Paso 2: Nombre de tu Empresa o Negocio
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Este nombre aparecerá en el encabezado del sistema y en los reportes de control.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">
                                        Nombre de la Empresa o Establecimiento:
                                    </label>
                                    <Input
                                        type="text"
                                        placeholder="Ej. Ferretería Central, Autopartes Norte, Minimarket El Sol..."
                                        value={nombreNegocio}
                                        onChange={(e) => setNombreNegocio(e.target.value)}
                                        className="h-11"
                                    />
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <Button variant="outline" onClick={() => setPaso(1)}>
                                        ← Volver al Paso 1
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            if (!nombreNegocio.trim()) {
                                                setError('Por favor ingresa el nombre de tu empresa.');
                                                return;
                                            }
                                            setError(null);
                                            setPaso(3);
                                        }}
                                    >
                                        Siguiente: Crear Super Admin →
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* PASO 3: CREAR EL PRIMER SUPER ADMIN */}
                        {paso === 3 && (
                            <form onSubmit={finalizarInstalacion} className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-800">
                                        Paso 3: Crear la Cuenta del Primer Super Admin
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        El <strong>Super Admin</strong> tiene el rango máximo: puede crear Administradores y Cajeros, auditar arqueos ciegos y cambiar contraseñas.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold text-slate-700">
                                            Nombre del Propietario / Super Admin:
                                        </label>
                                        <Input
                                            type="text"
                                            required
                                            placeholder="Ej. Carlos (Dueño)"
                                            value={adminNombre}
                                            onChange={(e) => setAdminNombre(e.target.value)}
                                            className="h-11"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold text-slate-700">
                                            PIN o Contraseña de Acceso:
                                        </label>
                                        <Input
                                            type="password"
                                            required
                                            placeholder="Crea tu PIN o contraseña secreta"
                                            value={adminPin}
                                            onChange={(e) => setAdminPin(e.target.value)}
                                            className="h-11"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold text-slate-700">
                                            Token de Instalación (SETUP_TOKEN):
                                        </label>
                                        <Input
                                            type="password"
                                            autoComplete="off"
                                            placeholder="Valor de SETUP_TOKEN configurado en el servidor"
                                            value={setupToken}
                                            onChange={(e) => setSetupToken(e.target.value)}
                                            className="h-11"
                                        />
                                        <p className="text-xs text-slate-500">
                                            Lo entrega el responsable técnico del despliegue. Obligatorio en entornos productivos.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <Button type="button" variant="outline" onClick={() => setPaso(2)}>
                                        ← Volver al Paso 2
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={guardando}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                    >
                                        {guardando ? 'Guardando configuración...' : '✅ Finalizar Configuración e Iniciar'}
                                    </Button>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </main>
        );
    }

    // PANTALLA NORMAL DE INICIO UNA VEZ CONFIGURADO EL SISTEMA
    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-xl shadow-xl border-slate-200 text-center">
                <CardHeader className="space-y-3 pb-4">
                    <div className="flex justify-center">
                        <Badge variant="secondary" className="bg-sky-50 text-sky-700 border-sky-200 font-semibold px-3 py-1">
                            {config.modalidad_nombre}
                        </Badge>
                    </div>
                    <CardTitle className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {config.nombre_negocio}
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-sm max-w-md mx-auto">
                        Sistema integral de Punto de Venta, Arqueo Ciego y Control de Inventario Adaptativo
                    </CardDescription>
                </CardHeader>

                <CardContent className="pt-4 pb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Button asChild size="lg" className="h-14 text-base font-semibold shadow-md">
                            <Link href="/caja">
                                🛒 Ir a Caja (Ventas)
                            </Link>
                        </Button>
                        <Button asChild size="lg" variant="secondary" className="h-14 text-base font-semibold shadow-sm bg-slate-800 text-white hover:bg-slate-900">
                            <Link href="/admin">
                                🛡️ Panel de Administración
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
