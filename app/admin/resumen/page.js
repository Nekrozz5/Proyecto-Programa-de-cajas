'use client';

import { useAdminContext } from '../_context/AdminContext';
import TabResumen from '../_components/TabResumen';

export default function ResumenPage() {
    const {
        datos,
        tendencias,
        cargarTodo,
        setMensaje,
        setError,
        limpiarAlertas
    } = useAdminContext();

    return (
        <TabResumen
            datos={datos}
            tendencias={tendencias}
            cargarTodo={cargarTodo}
            setMensaje={setMensaje}
            setError={setError}
            limpiarAlertas={limpiarAlertas}
        />
    );
}
