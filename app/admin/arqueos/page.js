'use client';

import { useAdminContext } from '../_context/AdminContext';
import TabTurnosArqueos from '../_components/TabTurnosArqueos';

export default function ArqueosPage() {
    const {
        datos,
        seleccionarTurnoParaAuditar,
        cargarTodo,
        setMensaje,
        setError,
        limpiarAlertas
    } = useAdminContext();

    return (
        <TabTurnosArqueos
            datos={datos}
            seleccionarTurnoParaAuditar={seleccionarTurnoParaAuditar}
            cargarTodo={cargarTodo}
            setMensaje={setMensaje}
            setError={setError}
            limpiarAlertas={limpiarAlertas}
        />
    );
}
