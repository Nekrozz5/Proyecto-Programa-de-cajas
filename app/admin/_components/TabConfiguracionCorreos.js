'use client';

import { useState, useEffect } from 'react';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';
import ModalVerificarEmail from './ModalVerificarEmail';
import {
    obtenerConfigSmtpAction,
    guardarConfigSmtpAction,
    listarDestinatariosAction,
    registrarDestinatarioAction,
    reenviarCodigoAction,
    eliminarDestinatarioAction
} from '../../../server/actions/notificaciones.actions';
import { probarEmailAction } from '../../../server/actions/admin.actions';
import {
    Server,
    Mail,
    Send,
    Plus,
    Trash2,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    Loader2,
    ShieldCheck,
    ShieldAlert,
    Lock,
    KeyRound,
    UserCheck,
    SendHorizonal
} from 'lucide-react';

export default function TabConfiguracionCorreos({
    adminAutenticado,
    setMensajeGlobal,
    setErrorGlobal
}) {
    // 1. Verificación de Roles: Exclusivo propietario y developer
    const esAutorizado = adminAutenticado && ['propietario', 'developer'].includes(adminAutenticado.rol);

    // Estados de Carga
    const [cargandoInicial, setCargandoInicial] = useState(true);
    const [guardandoSmtp, setGuardandoSmtp] = useState(false);
    const [probandoConexion, setProbandoConexion] = useState(false);
    const [registrandoDest, setRegistrandoDest] = useState(false);
    const [accionandoId, setAccionandoId] = useState(null);

    // Alertas Locales
    const [mensajeLocal, setMensajeLocal] = useState(null);
    const [errorLocal, setErrorLocal] = useState(null);

    // Estado Formulario SMTP (Tarjeta 1: Salida / Output)
    const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
    const [smtpPuerto, setSmtpPuerto] = useState('465');
    const [smtpSecure, setSmtpSecure] = useState(true);
    const [smtpUsuario, setSmtpUsuario] = useState('');
    const [smtpPassword, setSmtpPassword] = useState('');
    const [smtpRemitenteNombre, setSmtpRemitenteNombre] = useState('Sistema POS');
    const [smtpActivo, setSmtpActivo] = useState(true);
    const [emailPruebaManual, setEmailPruebaManual] = useState('');

    // Estado Destinatarios (Tarjeta 2: Entrada / Input)
    const [destinatarios, setDestinatarios] = useState([]);
    const [mostrarFormNuevoDest, setMostrarFormNuevoDest] = useState(false);
    const [nuevoDestEmail, setNuevoDestEmail] = useState('');
    const [nuevoDestNombre, setNuevoDestNombre] = useState('');

    // Estado Modal de Verificación de Código de 4 cifras
    const [modalVerificarAbierto, setModalVerificarAbierto] = useState(false);
    const [destinatarioParaVerificar, setDestinatarioParaVerificar] = useState(null);

    function limpiarAlertas() {
        setMensajeLocal(null);
        setErrorLocal(null);
        setErrorGlobal?.(null);
        setMensajeGlobal?.(null);
    }

    // Cargar datos iniciales de SMTP y lista de destinatarios
    async function recargarDatos() {
        try {
            setCargandoInicial(true);
            const [resSmtp, resDest] = await Promise.all([
                obtenerConfigSmtpAction(),
                listarDestinatariosAction(false)
            ]);

            if (resSmtp.ok && resSmtp.data) {
                const s = resSmtp.data;
                setSmtpHost(s.host || 'smtp.gmail.com');
                setSmtpPuerto(String(s.puerto || '465'));
                setSmtpSecure(Boolean(s.secure));
                setSmtpUsuario(s.usuario || '');
                setSmtpPassword('');
                setSmtpRemitenteNombre(s.remitente_nombre || 'Sistema POS');
                setSmtpActivo(s.activo !== 0);
            }

            if (resDest.ok && Array.isArray(resDest.data)) {
                setDestinatarios(resDest.data);
            }
        } catch (err) {
            setErrorLocal(err.message || 'Error al cargar la configuración de correos.');
        } finally {
            setCargandoInicial(false);
        }
    }

    useEffect(() => {
        if (esAutorizado) {
            recargarDatos();
        }
    }, [esAutorizado]);

    // Restricción visual si no tiene el rol permitido
    if (!esAutorizado) {
        return (
            <Card className="border-red-200 bg-red-50/50">
                <CardHeader>
                    <div className="flex items-center gap-2 text-red-700">
                        <Lock className="h-5 w-5" />
                        <CardTitle className="text-base font-bold">Módulo Restringido</CardTitle>
                    </div>
                    <CardDescription className="text-red-600 text-xs sm:text-sm">
                        La administración de servidores de salida SMTP y destinatarios de notificaciones está reservada exclusivamente para el Propietario (<strong>propietario</strong>) o Desarrollador (<strong>developer</strong>).
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    // Guardar Configuración SMTP
    async function handleGuardarSmtp(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            setGuardandoSmtp(true);
            const datos = {
                host: smtpHost.trim(),
                puerto: Number(smtpPuerto) || 465,
                secure: smtpSecure,
                usuario: smtpUsuario.trim(),
                remitenteNombre: smtpRemitenteNombre.trim(),
                activo: smtpActivo ? 1 : 0
            };
            if (smtpPassword.trim()) datos.password = smtpPassword.trim();
            const res = await guardarConfigSmtpAction(datos);

            if (!res.ok) throw new Error(res.error || 'No se pudo guardar la configuración SMTP.');

            setMensajeLocal('Parámetros del servidor SMTP guardados correctamente en base de datos.');
            setMensajeGlobal?.('Parámetros del servidor SMTP guardados correctamente.');
        } catch (err) {
            setErrorLocal(err.message);
            setErrorGlobal?.(err.message);
        } finally {
            setGuardandoSmtp(false);
        }
    }

    // Probar Conexión SMTP
    async function handleProbarConexion() {
        limpiarAlertas();
        try {
            setProbandoConexion(true);
            const destinatarioDestino = emailPruebaManual.trim() || smtpUsuario.trim() || undefined;

            const res = await probarEmailAction({
                destinatario: destinatarioDestino
            });

            if (!res.ok) throw new Error(res.error || 'Fallo en la prueba de conexión SMTP.');

            setMensajeLocal(res.data?.mensaje || '¡Conexión SMTP exitosa! El correo de prueba fue enviado.');
            setMensajeGlobal?.(res.data?.mensaje || 'Conexión SMTP verificada.');
        } catch (err) {
            setErrorLocal(`Error al probar conexión SMTP: ${err.message}`);
            setErrorGlobal?.(err.message);
        } finally {
            setProbandoConexion(false);
        }
    }

    // Registrar Nuevo Destinatario (envía código de 4 cifras automáticamente)
    async function handleRegistrarDestinatario(e) {
        e.preventDefault();
        limpiarAlertas();
        const emailLimpio = nuevoDestEmail.trim().toLowerCase();
        if (!emailLimpio || !emailLimpio.includes('@')) {
            setErrorLocal('Ingresa una dirección de correo válida.');
            return;
        }

        try {
            setRegistrandoDest(true);
            const res = await registrarDestinatarioAction({
                email: emailLimpio,
                nombre: nuevoDestNombre.trim() || emailLimpio
            });

            if (!res.ok) throw new Error(res.error || 'No se pudo registrar el destinatario.');

            setMensajeLocal(`Código de verificación de 4 cifras enviado a ${emailLimpio}.`);
            setNuevoDestEmail('');
            setNuevoDestNombre('');
            setMostrarFormNuevoDest(false);

            // Recargar lista y abrir de inmediato el modal de 4 dígitos para este destinatario
            await recargarDatos();
            setDestinatarioParaVerificar({
                id: res.data?.destinatarioId,
                email: res.data?.email || emailLimpio,
                nombre: nuevoDestNombre.trim() || emailLimpio
            });
            setModalVerificarAbierto(true);
        } catch (err) {
            setErrorLocal(err.message);
        } finally {
            setRegistrandoDest(false);
        }
    }

    // Reenviar Código de 4 cifras a un destinatario existente
    async function handleReenviarCodigo(dest) {
        limpiarAlertas();
        try {
            setAccionandoId(dest.id);
            const res = await reenviarCodigoAction({ id: dest.id });
            if (!res.ok) throw new Error(res.error || 'No se pudo reenviar el código.');

            setMensajeLocal(res.data?.mensaje || `Nuevo código de 4 cifras enviado a ${dest.email}.`);
            setDestinatarioParaVerificar(dest);
            setModalVerificarAbierto(true);
        } catch (err) {
            setErrorLocal(err.message);
        } finally {
            setAccionandoId(null);
        }
    }

    // Eliminar Destinatario
    async function handleEliminarDestinatario(dest) {
        if (!window.confirm(`¿Seguro que deseas eliminar a "${dest.email}" de las notificaciones?`)) {
            return;
        }
        limpiarAlertas();
        try {
            setAccionandoId(dest.id);
            const res = await eliminarDestinatarioAction({ id: dest.id });
            if (!res.ok) throw new Error(res.error || 'No se pudo eliminar el destinatario.');

            setMensajeLocal(`Destinatario ${dest.email} eliminado exitosamente.`);
            setDestinatarios(prev => prev.filter(d => d.id !== dest.id));
        } catch (err) {
            setErrorLocal(err.message);
        } finally {
            setAccionandoId(null);
        }
    }

    // Callback ejecutado al verificar exitosamente en el modal
    function handleDestinatarioVerificado(destActualizado) {
        setDestinatarios(prev =>
            prev.map(d => (d.id === destActualizado.id ? { ...d, verificado: 1 } : d))
        );
        setMensajeLocal(`El correo ${destActualizado.email} ha sido verificado y activado.`);
        setMensajeGlobal?.(`Correo ${destActualizado.email} verificado correctamente.`);
    }

    return (
        <div className="flex flex-col gap-6">
            {/* ALERTAS LOCALES DEL MÓDULO */}
            {errorLocal && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-800 flex items-start gap-2 shadow-xs">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <strong className="font-semibold">Atención:</strong> {errorLocal}
                    </div>
                </div>
            )}
            {mensajeLocal && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs sm:text-sm text-emerald-800 flex items-start gap-2 shadow-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>{mensajeLocal}</div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* ============================================================== */}
                {/* TARJETA 1: CONFIGURACIÓN SMTP (OUTPUT / SALIDA)                */}
                {/* ============================================================== */}
                <Card className="border border-slate-200 shadow-sm bg-white">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-sky-100 text-sky-700 rounded-lg">
                                    <Server className="h-5 w-5" />
                                </div>
                                <div>
                                    <CardTitle className="text-base sm:text-lg font-bold text-slate-900">
                                        Servidor SMTP (Salida)
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-500">
                                        Emisor de notificaciones y reportes de cierre de turno
                                    </CardDescription>
                                </div>
                            </div>
                            <Badge
                                variant="outline"
                                className={
                                    smtpActivo
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold'
                                        : 'bg-slate-100 text-slate-600 border-slate-300'
                                }
                            >
                                {smtpActivo ? 'Servicio Activo' : 'Desactivado'}
                            </Badge>
                        </div>
                    </CardHeader>

                    <form onSubmit={handleGuardarSmtp}>
                        <CardContent className="space-y-4 pt-0">
                            {cargandoInicial ? (
                                <div className="py-8 flex flex-col items-center justify-center text-slate-500 gap-2">
                                    <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                                    <span className="text-xs">Cargando credenciales SMTP...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="sm:col-span-2 space-y-1">
                                            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                                Servidor SMTP
                                            </label>
                                            <Input
                                                type="text"
                                                required
                                                placeholder="smtp.gmail.com"
                                                value={smtpHost}
                                                onChange={(e) => setSmtpHost(e.target.value)}
                                                className="bg-slate-50 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                                Puerto
                                            </label>
                                            <Input
                                                type="number"
                                                required
                                                placeholder="465"
                                                value={smtpPuerto}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setSmtpPuerto(val);
                                                    if (val === '465') setSmtpSecure(true);
                                                    if (val === '587') setSmtpSecure(false);
                                                }}
                                                className="bg-slate-50 text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                            Usuario Remitente (Correo)
                                        </label>
                                        <Input
                                            type="email"
                                            required
                                            placeholder="ejemplo@gmail.com"
                                            value={smtpUsuario}
                                            onChange={(e) => setSmtpUsuario(e.target.value)}
                                            className="bg-slate-50 text-sm"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                                            <span>Contraseña de Aplicación</span>
                                            <span className="text-[11px] font-normal text-slate-500 lowercase">
                                                (16 caracteres en Gmail)
                                            </span>
                                        </label>
                                        <PasswordInput
                                            required={!smtpPassword}
                                            placeholder="•••• •••• •••• ••••"
                                            value={smtpPassword}
                                            onChange={(e) => setSmtpPassword(e.target.value)}
                                            className="bg-slate-50 text-sm h-10"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                                Nombre Remitente
                                            </label>
                                            <Input
                                                type="text"
                                                placeholder="Nombre del Negocio"
                                                value={smtpRemitenteNombre}
                                                onChange={(e) => setSmtpRemitenteNombre(e.target.value)}
                                                className="bg-slate-50 text-sm"
                                            />
                                        </div>

                                        <div className="flex flex-col justify-end gap-2 pb-1">
                                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={smtpSecure}
                                                    onChange={(e) => setSmtpSecure(e.target.checked)}
                                                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                                />
                                                <span>Conexión Segura SSL/TLS</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={smtpActivo}
                                                    onChange={(e) => setSmtpActivo(e.target.checked)}
                                                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                                />
                                                <span>Habilitar notificaciones activas</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* SECCIÓN DE PRUEBA DE CONEXIÓN */}
                                    <div className="pt-3 border-t border-slate-200 mt-2 bg-slate-50 p-3 rounded-lg flex flex-col gap-2">
                                        <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                            <SendHorizonal className="h-4 w-4 text-sky-600" />
                                            Probar Conectividad SMTP
                                        </span>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <Input
                                                type="email"
                                                placeholder="Correo para recibir prueba (opcional)"
                                                value={emailPruebaManual}
                                                onChange={(e) => setEmailPruebaManual(e.target.value)}
                                                className="bg-white text-xs h-9 flex-1"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleProbarConexion}
                                                disabled={probandoConexion || guardandoSmtp}
                                                className="h-9 text-xs font-semibold border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 cursor-pointer shrink-0"
                                            >
                                                {probandoConexion ? (
                                                    <>
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                                        Probando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Send className="h-3.5 w-3.5 mr-1.5 text-sky-700" />
                                                        Probar Conexión
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>

                        <CardFooter className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                            <Button
                                type="submit"
                                disabled={guardandoSmtp || cargandoInicial}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm cursor-pointer shadow-sm"
                            >
                                {guardandoSmtp ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                        Guardando...
                                    </>
                                ) : (
                                    'Guardar Configuración SMTP'
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* ============================================================== */}
                {/* TARJETA 2: DESTINATARIOS (INPUT / ENTRADA)                     */}
                {/* ============================================================== */}
                <Card className="border border-slate-200 shadow-sm bg-white">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                                    <Mail className="h-5 w-5" />
                                </div>
                                <div>
                                    <CardTitle className="text-base sm:text-lg font-bold text-slate-900">
                                        Destinatarios de Notificaciones
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-500">
                                        Casillas autorizadas para recibir arqueos y reportes Excel
                                    </CardDescription>
                                </div>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => setMostrarFormNuevoDest(!mostrarFormNuevoDest)}
                                className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer h-8 shadow-xs"
                            >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Agregar Destinatario
                            </Button>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-4 pt-0">
                        {/* FORMULARIO DESPLEGABLE PARA AGREGAR NUEVO DESTINATARIO */}
                        {mostrarFormNuevoDest && (
                            <form
                                onSubmit={handleRegistrarDestinatario}
                                className="p-4 rounded-xl border border-sky-200 bg-sky-50/60 space-y-3 shadow-xs animate-in fade-in-50 duration-200"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                                        <Plus className="h-3.5 w-3.5 text-sky-600" />
                                        Nuevo Destinatario
                                    </span>
                                    <span className="text-[11px] text-sky-700">
                                        Se enviará un código de 4 cifras
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <Input
                                        type="email"
                                        required
                                        placeholder="correo@ejemplo.com"
                                        value={nuevoDestEmail}
                                        onChange={(e) => setNuevoDestEmail(e.target.value)}
                                        className="bg-white text-xs h-9"
                                    />
                                    <Input
                                        type="text"
                                        placeholder="Nombre o cargo (opcional)"
                                        value={nuevoDestNombre}
                                        onChange={(e) => setNuevoDestNombre(e.target.value)}
                                        className="bg-white text-xs h-9"
                                    />
                                </div>

                                <div className="flex justify-end gap-2 pt-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setMostrarFormNuevoDest(false)}
                                        className="text-xs h-8 border-slate-300"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={registrandoDest || !nuevoDestEmail.trim()}
                                        className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold h-8"
                                    >
                                        {registrandoDest ? (
                                            <>
                                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                Enviando código...
                                            </>
                                        ) : (
                                            <>
                                                <KeyRound className="h-3.5 w-3.5 mr-1" />
                                                Enviar Código y Registrar
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* LISTADO DE DESTINATARIOS */}
                        {cargandoInicial ? (
                            <div className="py-8 flex flex-col items-center justify-center text-slate-500 gap-2">
                                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                                <span className="text-xs">Cargando lista de destinatarios...</span>
                            </div>
                        ) : destinatarios.length === 0 ? (
                            <div className="py-8 px-4 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
                                <Mail className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                                <p className="text-xs sm:text-sm font-medium text-slate-700">
                                    No hay destinatarios registrados aún.
                                </p>
                                <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                                    Haz clic en &ldquo;Agregar Destinatario&rdquo; para vincular un correo que recibirá los resúmenes de turno y reportes Excel.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
                                {destinatarios.map((dest) => {
                                    const estaVerificado = Number(dest.verificado) === 1;
                                    const ocupado = accionandoId === dest.id;

                                    return (
                                        <div
                                            key={dest.id}
                                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                                                        {dest.email}
                                                    </span>
                                                    {estaVerificado ? (
                                                        <Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-semibold flex items-center gap-1">
                                                            <ShieldCheck className="h-3 w-3 text-emerald-700" />
                                                            Verificado
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-semibold flex items-center gap-1">
                                                            <ShieldAlert className="h-3 w-3 text-amber-700" />
                                                            Pendiente de Validación
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                                                    <span>{dest.nombre || 'Sin alias'}</span>
                                                    {dest.creado_en && (
                                                        <span className="text-slate-400">
                                                            &bull; Registrado: {new Date(dest.creado_en).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* BOTONES DE ACCIÓN */}
                                            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                                {!estaVerificado && (
                                                    <>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => {
                                                                setDestinatarioParaVerificar(dest);
                                                                setModalVerificarAbierto(true);
                                                            }}
                                                            disabled={ocupado}
                                                            className="h-7 text-[11px] px-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer"
                                                        >
                                                            <KeyRound className="h-3 w-3 mr-1" />
                                                            Ingresar Código
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleReenviarCodigo(dest)}
                                                            disabled={ocupado}
                                                            className="h-7 text-[11px] px-2 border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                                                            title="Reenviar nuevo código de 4 cifras"
                                                        >
                                                            <RefreshCw className={`h-3 w-3 mr-1 ${ocupado ? 'animate-spin' : ''}`} />
                                                            Reenviar Código
                                                        </Button>
                                                    </>
                                                )}

                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEliminarDestinatario(dest)}
                                                    disabled={ocupado}
                                                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                                    title="Eliminar destinatario"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* MODAL SHADCN PARA INTRODUCIR EL CÓDIGO DE 4 CIFRAS */}
            <ModalVerificarEmail
                abierto={modalVerificarAbierto}
                destinatario={destinatarioParaVerificar}
                onCerrar={() => {
                    setModalVerificarAbierto(false);
                    setDestinatarioParaVerificar(null);
                }}
                onVerificado={handleDestinatarioVerificado}
            />
        </div>
    );
}
