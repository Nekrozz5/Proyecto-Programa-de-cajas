'use client';

import { useAdminContext } from '../_context/AdminContext';
import TabInteligenciaNegocio from '../_components/TabInteligenciaNegocio';

export default function InteligenciaPage() {
    const {
        datos,
        metricasInteligencia,
        recargarMetricasInteligencia,
        setMensaje,
        setError
    } = useAdminContext();

    return (
        <TabInteligenciaNegocio
            metricas={metricasInteligencia}
            configuracionNegocio={datos?.configuracionNegocio}
            setMensaje={setMensaje}
            setError={setError}
            onRecargar={recargarMetricasInteligencia}
        />
    );
}
