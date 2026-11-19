'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminContext } from '../_context/AdminContext';
import TabConfigFiscal from '../_components/TabConfigFiscal';
import TabConfiguracionCorreos from '../_components/TabConfiguracionCorreos';
import TabActualizaciones from '../_components/TabActualizaciones';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
    Settings, 
    Mail, 
    Sparkles, 
    RefreshCw, 
    Cpu, 
    CheckCircle2, 
    DownloadCloud, 
    HardDrive, 
    FileText, 
    ShieldCheck 
} from 'lucide-react';
import packageInfo from '../../../package.json';

function formatearBytes(bytes) {
    if (!bytes || Number.isNaN(bytes)) return null;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
}

export default function ConfiguracionPage() {
    const router = useRouter();
    const {
        datos,
        cargarTodo,
        setMensaje,
        setError,
        limpiarAlertas,
        adminAutenticado
    } = useAdminContext();

    const [pestanaActiva, setPestanaActiva] = useState('modalidad');
    const [buscandoActualizacion, setBuscandoActualizacion] = useState(false);
    const [modalActualizacionAbierto, setModalActualizacionAbierto] = useState(false);
    const [datosActualizacion, setDatosActualizacion] = useState(null);
    const [mensajeAlDia, setMensajeAlDia] = useState(null);

    const configActual = datos?.configuracionNegocio;
    const esPrimeraEjecucion = !configActual?.configurado || Number(configActual?.configurado) === 0;
    const versionActual = packageInfo?.version || '1.3.1';

    // Función del botón "Buscar actualización"
    const handleBuscarActualizacion = async () => {
        setBuscandoActualizacion(true);
        setMensajeAlDia(null);
        limpiarAlertas();
        try {
            const res = await fetch('/api/actualizaciones', {
                method: 'GET',
                cache: 'no-store'
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'No se pudo contactar con el servidor de actualizaciones.');
            }

            if (data.hayActualizacion) {
                setDatosActualizacion(data);
                setModalActualizacionAbierto(true);
            } else {
                setMensajeAlDia(
                    data.offline
                        ? 'Modo sin conexión: no se pudo verificar en línea.'
                        : `El sistema está al día con la versión v${data.versionActual}`
                );
                setTimeout(() => setMensajeAlDia(null), 6000);
            }
        } catch (err) {
            setError(err.message || 'Error al buscar actualizaciones.');
        } finally {
            setBuscandoActualizacion(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* BARRA SUPERIOR: PESTAÑA EN EL COSTADO CON LA VERSIÓN Y BOTÓN BUSCAR ACTUALIZACIÓN */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Pestaña / Chip en el costado que muestra en qué versión estás */}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs">
                        <Cpu className="w-3.5 h-3.5 text-sky-600" />
                        <span>Versión actual:</span>
                        <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-300">
                            v{versionActual}
                        </span>
                    </div>

                    {/* Mensaje temporal si ya está al día */}
                    {mensajeAlDia && (
                        <span className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            {mensajeAlDia}
                        </span>
                    )}
                </div>

                {/* Botón que cumple la función de buscar actualización */}
                <Button
                    type="button"
                    onClick={handleBuscarActualizacion}
                    disabled={buscandoActualizacion}
                    className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer shrink-0"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${buscandoActualizacion ? 'animate-spin' : ''}`} />
                    <span>{buscandoActualizacion ? 'Buscando...' : 'Buscar actualización'}</span>
                </Button>
            </div>

            {/* PESTAÑAS PRINCIPALES DE CONFIGURACIÓN */}
            <Tabs
                value={pestanaActiva}
                onValueChange={setPestanaActiva}
                className="w-full"
            >
                <TabsList className="bg-slate-200/80 p-1 rounded-xl h-11 border border-slate-300 shadow-xs mb-6">
                    <TabsTrigger
                        value="modalidad"
                        className="rounded-lg text-xs sm:text-sm font-semibold px-4 py-2 flex items-center gap-2 data-[selected]:bg-white data-[selected]:text-slate-900 data-[selected]:shadow-sm text-slate-600 transition-all cursor-pointer"
                    >
                        <Settings className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>Modalidad y Régimen Fiscal</span>
                    </TabsTrigger>

                    <TabsTrigger
                        value="correos"
                        className="rounded-lg text-xs sm:text-sm font-semibold px-4 py-2 flex items-center gap-2 data-[selected]:bg-white data-[selected]:text-slate-900 data-[selected]:shadow-sm text-slate-600 transition-all cursor-pointer"
                    >
                        <Mail className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Servidor SMTP y Notificaciones</span>
                    </TabsTrigger>

                    <TabsTrigger
                        value="actualizaciones"
                        className="rounded-lg text-xs sm:text-sm font-semibold px-4 py-2 flex items-center gap-2 data-[selected]:bg-white data-[selected]:text-slate-900 data-[selected]:shadow-sm text-slate-600 transition-all cursor-pointer"
                    >
                        <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>Centro de Versiones</span>
                    </TabsTrigger>
                </TabsList>

                {/* CONTENIDO 1: MODALIDAD DE NEGOCIO Y RÉGIMEN FISCAL */}
                <TabsContent value="modalidad" className="outline-none focus:outline-none">
                    <TabConfigFiscal
                        datos={datos}
                        esPrimeraEjecucion={esPrimeraEjecucion}
                        onConfiguracionGuardada={() => router.push('/admin/catalogo')}
                        cargarTodo={cargarTodo}
                        setMensaje={setMensaje}
                        setError={setError}
                        limpiarAlertas={limpiarAlertas}
                    />
                </TabsContent>

                {/* CONTENIDO 2: CONFIGURACIÓN SMTP Y DESTINATARIOS CON VERIFICACIÓN */}
                <TabsContent value="correos" className="outline-none focus:outline-none">
                    <TabConfiguracionCorreos
                        adminAutenticado={adminAutenticado}
                        setMensajeGlobal={setMensaje}
                        setErrorGlobal={setError}
                    />
                </TabsContent>

                {/* CONTENIDO 3: ACTUALIZACIONES DEL SISTEMA */}
                <TabsContent value="actualizaciones" className="outline-none focus:outline-none">
                    <TabActualizaciones />
                </TabsContent>
            </Tabs>

            {/* MODAL DE CONFIRMACIÓN CUANDO SE DETECTA ACTUALIZACIÓN */}
            <Dialog open={modalActualizacionAbierto} onOpenChange={setModalActualizacionAbierto}>
                <DialogContent className="max-w-md p-6 bg-white rounded-2xl shadow-2xl border border-slate-200">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
                                <Sparkles className="w-5 h-5 animate-pulse" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-bold text-slate-900 leading-snug">
                                    ¿Quieres actualizar a la versión: {datosActualizacion?.versionNueva}?
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                                    {datosActualizacion?.titulo || 'Nueva actualización disponible en el servidor'}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-3 my-2 text-xs text-slate-600">
                        {/* Tarjeta de versiones */}
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
                            <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-500">Versión actual: <strong className="text-slate-800">v{datosActualizacion?.versionActual}</strong></span>
                                <span className="text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-200">
                                    Nueva: v{datosActualizacion?.versionNueva}
                                </span>
                            </div>

                            {datosActualizacion?.instalador && (
                                <div className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-1.5 border-t border-slate-200/80">
                                    <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span className="truncate">
                                        Instalador: <strong>{datosActualizacion.instalador.nombre}</strong>
                                        {datosActualizacion.instalador.tamanoBytes && ` (${formatearBytes(datosActualizacion.instalador.tamanoBytes)})`}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Novedades o changelog */}
                        {datosActualizacion?.notas && (
                            <div className="rounded-xl bg-slate-50/70 border border-slate-200 p-3 text-[11px] max-h-36 overflow-y-auto space-y-1">
                                <div className="font-semibold text-slate-800 flex items-center gap-1">
                                    <FileText className="w-3 h-3 text-slate-500" />
                                    <span>Novedades incluidas:</span>
                                </div>
                                <div className="text-slate-600 whitespace-pre-wrap leading-relaxed">
                                    {datosActualizacion.notas}
                                </div>
                            </div>
                        )}

                        {/* Garantía de datos intactos */}
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 text-emerald-900 text-[11px] border border-emerald-200">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Tus ventas, catálogo y base de datos (caja.db) permanecerán 100% intactos.</span>
                        </div>
                    </div>

                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setModalActualizacionAbierto(false)}
                            className="text-xs cursor-pointer"
                        >
                            Más tarde
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                if (datosActualizacion?.instalador?.urlDescarga) {
                                    window.open(datosActualizacion.instalador.urlDescarga, '_blank');
                                }
                                setModalActualizacionAbierto(false);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 cursor-pointer shadow-xs"
                        >
                            <DownloadCloud className="w-4 h-4" />
                            <span>Sí, actualizar ahora</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
