'use client';

import { useAdminContext } from '../_context/AdminContext';
import TabKardex from '../_components/TabKardex';

export default function InsumosPage() {
    const {
        datos,
        cargarTodo,
        setMensaje,
        setError,
        limpiarAlertas
    } = useAdminContext();

    return (
        <TabKardex
            datos={datos}
            cargarTodo={cargarTodo}
            setMensaje={setMensaje}
            setError={setError}
            limpiarAlertas={limpiarAlertas}
        />
    );
}
