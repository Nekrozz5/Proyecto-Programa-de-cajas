'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';
import { 
    AlertCircle, 
    Check, 
    ShoppingCart, 
    ShieldCheck, 
    Package, 
    Calendar, 
    Boxes, 
    Coffee, 
    ArrowLeft, 
    ArrowRight,
    Mail,
    Bike
} from 'lucide-react';

export default function HomePage() {
    const [cargando, setCargando] = useState(true);
    const [config, setConfig] = useState(null);
    const [sistemaInstalado, setSistemaInstalado] = useState(false);

    // Estado del Asistente de Primera Ejecución (4 pasos)
    const [paso, setPaso] = useState(1); // 1: Modalidad | 2: Configuración Empresa/Fiscal | 3: Crear Propietario(a) | 4: Notificaciones Correo
    const [modalidadNombre, setModalidadNombre] = useState('Venta Directa de Artículos No Perecederos');
    const [usaStockDirecto, setUsaStockDirecto] = useState(true);
    const [usaVencimiento, setUsaVencimiento] = useState(false);
    const [usaRecetas, setUsaRecetas] = useState(false);

    const [nombreNegocio, setNombreNegocio] = useState('');
    const [nombreCaja, setNombreCaja] = useState('Caja 1');
    const [regimenTributario, setRegimenTributario] = useState('simplificado_control_interno');
    const [nitNegocio, setNitNegocio] = useState('');
    const [habilitaDelivery, setHabilitaDelivery] = useState(false);

    const [adminNombre, setAdminNombre] = useState('');
    const [adminPin, setAdminPin] = useState('');
    const [setupToken, setSetupToken] = useState('');

    // Configuración opcional de correo (Paso 4) y prueba en vivo
    const [correoEmisor, setCorreoEmisor] = useState('');
    const [passwordApp, setPasswordApp] = useState('');
    const [correoDestinatario, setCorreoDestinatario] = useState('');
    const [probandoSmtp, setProbandoSmtp] = useState(false);
    const [smtpFeedback, setSmtpFeedback] = useState(null);

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

    async function probarConexionSmtp() {
        setError(null);
        setSmtpFeedback(null);
        const emisorLimpio = correoEmisor.trim();
        const passLimpio = passwordApp.trim();

        if (!emisorLimpio || !passLimpio) {
            setSmtpFeedback({
                tipo: 'error',
                mensaje: 'Ingresa el correo emisor y la contraseña de aplicación para realizar la prueba.'
            });
            return;
        }

        setProbandoSmtp(true);
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'probar_smtp_instalacion',
                    host: 'smtp.gmail.com',
                    puerto: 465,
                    secure: true,
                    usuario: emisorLimpio,
                    password: passLimpio
                })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSmtpFeedback({
                    tipo: 'exito',
                    mensaje: data.mensaje || 'Conexión SMTP exitosa.'
                });
            } else {
                setSmtpFeedback({
                    tipo: 'error',
                    mensaje: data.error || 'No se pudo conectar al servidor SMTP.'
                });
            }
        } catch (err) {
            setSmtpFeedback({
                tipo: 'error',
                mensaje: err.message || 'Error de red al probar conexión SMTP.'
            });
        } finally {
            setProbandoSmtp(false);
        }
    }

    async function finalizarInstalacion(e, omitirCorreo = false) {
        if (e && e.preventDefault) e.preventDefault();
        setError(null);
        setGuardando(true);
        try {
            const payload = {
                accion: 'instalacion_inicial',
                nombreNegocio,
                nombreCaja: nombreCaja.trim() || 'Caja 1',
                regimenTributario,
                nit: nitNegocio.trim() || null,
                modalidadNombre,
                usaStockDirecto,
                usaVencimiento,
                usaRecetasEnsamblaje: usaRecetas,
                habilitaDelivery,
                adminNombre,
                adminPin,
                setupToken
            };

            const emisorLimpio = correoEmisor.trim();
            const passLimpio = passwordApp.trim();
            const destLimpio = correoDestinatario.trim();

            if (!omitirCorreo && (emisorLimpio || passLimpio || destLimpio)) {
                if (emisorLimpio && !passLimpio) {
                    throw new Error('Debes ingresar la contraseña de aplicación para el correo emisor, o puedes omitir este paso.');
                }
                if (!emisorLimpio && passLimpio) {
                    throw new Error('Debes ingresar el correo emisor para la contraseña provista, o puedes omitir este paso.');
                }
                if (emisorLimpio && passLimpio) {
                    payload.smtp = {
                        usuario: emisorLimpio,
                        password: passLimpio,
                        host: 'smtp.gmail.com',
                        puerto: 465,
                        secure: true,
                        remitenteNombre: nombreNegocio || 'Sistema POS'
                    };
                }
                if (destLimpio) {
                    payload.destinatarioInicial = {
                        email: destLimpio,
                        nombre: adminNombre || 'Propietario(a)'
                    };
                }
            }

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
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
                                    Instalación Inicial • Paso {paso} de 4
                                </Badge>
                                <CardTitle className="text-2xl font-bold text-slate-900">
                                    Configuración de Primera Ejecución
                                </CardTitle>
                            </div>
                            <div className="flex items-center gap-2">
                                {[1, 2, 3, 4].map((num) => (
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
                                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
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
                                        <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                                            <Package className="w-4 h-4 text-slate-700" />
                                            <span>Artículos No Perecederos</span>
                                        </div>
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
                                        <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                                            <Calendar className="w-4 h-4 text-slate-700" />
                                            <span>Productos Perecederos</span>
                                        </div>
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
                                        <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                                            <Boxes className="w-4 h-4 text-slate-700" />
                                            <span>Ensamblaje / Fabricación</span>
                                        </div>
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
                                        <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                                            <Coffee className="w-4 h-4 text-slate-700" />
                                            <span>Elaboración con Recetas</span>
                                        </div>
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
                                        <span>Siguiente: Nombre de la Empresa</span>
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* PASO 2: NOMBRE DE LA EMPRESA, CAJA Y RÉGIMEN FISCAL */}
                        {paso === 2 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-800">
                                        Paso 2: Datos de la Empresa, Caja y Régimen Fiscal
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Configura el nombre del establecimiento, la estación física inicial y el esquema tributario.
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

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold text-slate-700">
                                            Nombre de la Caja Principal:
                                        </label>
                                        <Input
                                            type="text"
                                            placeholder="Ej. Caja 1"
                                            value={nombreCaja}
                                            onChange={(e) => setNombreCaja(e.target.value)}
                                            className="h-11"
                                        />
                                        <p className="text-[11px] text-slate-500">
                                            Identificador de la primera estación de cobro o terminal física.
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold text-slate-700">
                                            NIT del Negocio (Opcional):
                                        </label>
                                        <Input
                                            type="text"
                                            placeholder="Ej. 1023456789"
                                            value={nitNegocio}
                                            onChange={(e) => setNitNegocio(e.target.value)}
                                            className="h-11"
                                        />
                                        <p className="text-[11px] text-slate-500">
                                            Número de Identificación Tributaria para comprobantes.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">
                                        Régimen Tributario:
                                    </label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setRegimenTributario('simplificado_control_interno')}
                                            className={`flex flex-col text-left p-3.5 rounded-lg border transition-all ${
                                                regimenTributario === 'simplificado_control_interno'
                                                    ? 'border-primary bg-sky-50/50 shadow-sm ring-1 ring-primary'
                                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                                            }`}
                                        >
                                            <span className="font-semibold text-slate-900 text-sm">
                                                Régimen Simplificado / Control Interno
                                            </span>
                                            <span className="text-xs text-slate-500 mt-1">
                                                Ventas sin recargo fiscal (IVA 0% / IT 0%). Comprobantes y recibos internos.
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setRegimenTributario('regimen_general')}
                                            className={`flex flex-col text-left p-3.5 rounded-lg border transition-all ${
                                                regimenTributario === 'regimen_general'
                                                    ? 'border-primary bg-sky-50/50 shadow-sm ring-1 ring-primary'
                                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                                            }`}
                                        >
                                            <span className="font-semibold text-slate-900 text-sm">
                                                Régimen General
                                            </span>
                                            <span className="text-xs text-slate-500 mt-1">
                                                Cálculo y registro de débito/crédito fiscal (IVA e IT) con facturación formal.
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {/* Pregunta sobre Envíos / Mototaxis */}
                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-sky-100 text-sky-700 mt-0.5">
                                            <Bike className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-sm font-semibold text-slate-900">
                                                ¿Realizas envíos a domicilio o despachos por mototaxi?
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                                                Si activas esta opción, el punto de venta incluirá campos para registrar cliente, dirección de entrega y cobro directo al mototaxi.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setHabilitaDelivery(false)}
                                            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm transition-all ${
                                                !habilitaDelivery
                                                    ? 'border-slate-400 bg-white shadow-sm ring-1 ring-slate-400 text-slate-800 font-semibold'
                                                    : 'border-slate-200 bg-slate-100/60 text-slate-500 hover:bg-white'
                                            }`}
                                        >
                                            {!habilitaDelivery && <Check className="w-4 h-4 text-slate-700" />}
                                            <span>No</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHabilitaDelivery(true)}
                                            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm transition-all ${
                                                habilitaDelivery
                                                    ? 'border-primary bg-sky-50 shadow-sm ring-1 ring-primary text-sky-900 font-semibold'
                                                    : 'border-slate-200 bg-slate-100/60 text-slate-500 hover:bg-white'
                                            }`}
                                        >
                                            {habilitaDelivery && <Check className="w-4 h-4 text-primary" />}
                                            <span>Sí</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <Button variant="outline" onClick={() => setPaso(1)}>
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver al Paso 1
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
                                        <span>Siguiente: Crear Propietario(a)</span>
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* PASO 3: CREAR EL PRIMER PROPIETARIO(A) */}
                        {paso === 3 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-800">
                                        Paso 3: Crear la Cuenta de Propietario(a)
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        El o la <strong>Propietario(a)</strong> tiene el rango máximo del negocio: puede crear Administradores y Cajeros, auditar arqueos ciegos y cambiar contraseñas.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold text-slate-700">
                                            Nombre del o la Propietario(a):
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
                                        <PasswordInput
                                            required
                                            placeholder="Crea tu PIN o contraseña secreta (mín. 8 caracteres)"
                                            value={adminPin}
                                            onChange={(e) => setAdminPin(e.target.value)}
                                            className="h-11"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold text-slate-700">
                                            Clave de Activación del Producto:
                                        </label>
                                        <PasswordInput
                                            autoComplete="off"
                                            placeholder="Pega aquí la clave de activación (POS-ACT-...)"
                                            value={setupToken}
                                            onChange={(e) => setSetupToken(e.target.value)}
                                            className="h-11 font-mono text-xs"
                                        />
                                        <p className="text-xs text-slate-500">
                                            Clave criptográfica única provista por el desarrollador para activar y licenciar el sistema.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <Button type="button" variant="outline" onClick={() => setPaso(2)}>
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver al Paso 2
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            if (!adminNombre.trim()) {
                                                setError('Por favor ingresa el nombre de Propietario(a).');
                                                return;
                                            }
                                            if (!adminPin || adminPin.trim().length < 8) {
                                                setError('La contraseña de Propietario(a) debe tener al menos 8 caracteres.');
                                                return;
                                            }
                                            setError(null);
                                            setPaso(4);
                                        }}
                                    >
                                        <span>Siguiente: Notificaciones por Correo</span>
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* PASO 4: NOTIFICACIONES POR CORREO (OPCIONAL) */}
                        {paso === 4 && (
                            <form onSubmit={(e) => finalizarInstalacion(e, false)} className="space-y-6">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Mail className="w-5 h-5 text-primary" />
                                        <h2 className="text-lg font-semibold text-slate-800">
                                            Paso 4: Notificaciones por Correo (Opcional)
                                        </h2>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Envía automáticamente el reporte de arqueo y el archivo Excel adjunto cada vez que se cierre un turno de caja. Puedes configurarlo ahora o hacerlo más tarde desde el Panel de Administración.
                                    </p>
                                </div>

                                <div className="p-4 rounded-lg bg-sky-50/60 border border-sky-200/80 text-xs text-sky-800 space-y-1">
                                    <p className="font-semibold flex items-center gap-1.5">
                                        <span>💡 Recomendación para cuentas Gmail:</span>
                                    </p>
                                    <p>
                                        Usa una <strong>Contraseña de Aplicación de 16 caracteres</strong> generada desde tu Cuenta de Google (Seguridad &gt; Verificación en 2 pasos &gt; Contraseñas de aplicaciones).
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-semibold text-slate-700">
                                                Correo Emisor (Servidor de Envío):
                                            </label>
                                            <Input
                                                type="email"
                                                placeholder="ejemplo@gmail.com"
                                                value={correoEmisor}
                                                onChange={(e) => setCorreoEmisor(e.target.value)}
                                                className="h-11"
                                            />
                                            <p className="text-[11px] text-slate-500">
                                                Cuenta desde la cual el sistema enviará los correos.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-sm font-semibold text-slate-700">
                                                Contraseña de Aplicación:
                                            </label>
                                            <PasswordInput
                                                placeholder="Contraseña de 16 caracteres"
                                                value={passwordApp}
                                                onChange={(e) => setPasswordApp(e.target.value)}
                                                className="h-11 font-mono"
                                            />
                                            <p className="text-[11px] text-slate-500">
                                                Clave de aplicación o contraseña SMTP de tu proveedor.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 pt-1">
                                        <label className="text-sm font-semibold text-slate-700">
                                            Correo del Dueño / Destinatario Principal:
                                        </label>
                                        <Input
                                            type="email"
                                            placeholder="propietario@negocio.com"
                                            value={correoDestinatario}
                                            onChange={(e) => setCorreoDestinatario(e.target.value)}
                                            className="h-11"
                                        />
                                        <p className="text-[11px] text-slate-500">
                                            Bandeja donde recibirás los reportes de arqueo al cerrar caja (se enviará un código de verificación).
                                        </p>
                                    </div>

                                    <div className="pt-2 space-y-2">
                                        <div className="flex items-center gap-3">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                disabled={probandoSmtp || guardando}
                                                onClick={probarConexionSmtp}
                                                className="border border-slate-200"
                                            >
                                                {probandoSmtp ? (
                                                    <>
                                                        <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                                                        <span>Probando conexión...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Mail className="w-4 h-4 mr-2 text-primary" />
                                                        <span>Probar Conexión SMTP</span>
                                                    </>
                                                )}
                                            </Button>
                                            <span className="text-xs text-slate-500">
                                                Verifica la conexión y credenciales con el servidor en tiempo real.
                                            </span>
                                        </div>

                                        {smtpFeedback && (
                                            <div
                                                className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                                                    smtpFeedback.tipo === 'exito'
                                                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                                                        : 'bg-red-50 border border-red-200 text-red-700'
                                                }`}
                                            >
                                                {smtpFeedback.tipo === 'exito' ? (
                                                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                                                ) : (
                                                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                                                )}
                                                <span>{smtpFeedback.mensaje}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100 flex-wrap gap-2">
                                    <Button type="button" variant="outline" onClick={() => setPaso(3)}>
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver al Paso 3
                                    </Button>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            disabled={guardando}
                                            onClick={(e) => finalizarInstalacion(e, true)}
                                            className="text-slate-600 hover:text-slate-900"
                                        >
                                            Omitir por ahora y Finalizar
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={guardando}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                        >
                                            <Check className="w-4 h-4 mr-2" />
                                            {guardando ? 'Guardando configuración...' : 'Finalizar Instalación'}
                                        </Button>
                                    </div>
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
