'use client';

import { useRouter } from 'next/navigation';
import { useAdminContext } from '../_context/AdminContext';
import TabConfigFiscal from '../_components/TabConfigFiscal';

export default function ConfiguracionPage() {
    const router = useRouter();
    const {
        datos,
        cargarTodo,
        setMensaje,
        setError,
        limpiarAlertas
    } = useAdminContext();

    const configActual = datos?.configuracionNegocio;
    const esPrimeraEjecucion = !configActual?.configurado || Number(configActual?.configurado) === 0;

    return (
        <TabConfigFiscal
            datos={datos}
            esPrimeraEjecucion={esPrimeraEjecucion}
            onConfiguracionGuardada={() => router.push('/admin/catalogo')}
            cargarTodo={cargarTodo}
            setMensaje={setMensaje}
            setError={setError}
            limpiarAlertas={limpiarAlertas}
        />
    );
}
