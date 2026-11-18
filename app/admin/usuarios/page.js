'use client';

import { useAdminContext } from '../_context/AdminContext';
import TabUsuariosCajas from '../_components/TabUsuariosCajas';

export default function UsuariosPage() {
    const {
        datos,
        adminAutenticado,
        cargarTodo,
        setMensaje,
        setError,
        limpiarAlertas
    } = useAdminContext();

    return (
        <TabUsuariosCajas
            datos={datos}
            adminAutenticado={adminAutenticado}
            cargarTodo={cargarTodo}
            setMensaje={setMensaje}
            setError={setError}
            limpiarAlertas={limpiarAlertas}
        />
    );
}
