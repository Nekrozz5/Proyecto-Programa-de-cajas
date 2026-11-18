'use client';

import { useRouter } from 'next/navigation';
import { useAdminContext } from '../_context/AdminContext';
import TabCatalogo from '../_components/TabCatalogo';

export default function CatalogoPage() {
    const router = useRouter();
    const {
        datos,
        cargarTodo,
        setMensaje,
        setError,
        limpiarAlertas
    } = useAdminContext();

    return (
        <TabCatalogo
            datos={datos}
            cargarTodo={cargarTodo}
            setMensaje={setMensaje}
            setError={setError}
            limpiarAlertas={limpiarAlertas}
            setSeccionActiva={(seccion) => router.push(`/admin/${seccion}`)}
        />
    );
}
