'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminContext } from '../_context/AdminContext';
import TabConfigFiscal from '../_components/TabConfigFiscal';
import TabConfiguracionCorreos from '../_components/TabConfiguracionCorreos';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Settings, Mail } from 'lucide-react';

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

    return (
        <div className="space-y-6">
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
                </TabsList>

                {/* CONTENIDO 1: MODALIDAD DE NEGOCIO Y RÉGIMEN FISCAL */}
                <TabsContent value="modalidad" className="outline-none focus:outline-none">
                    <TabConfigFiscal
                        datos={datos}
                        adminAutenticado={adminAutenticado}
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
            </Tabs>
        </div>
    );
}
