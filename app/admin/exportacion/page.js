'use client';

import { useAdminContext } from '../_context/AdminContext';
import TabExportacion from '../_components/TabExportacion';

export default function ExportacionPage() {
    const {
        datos,
        adminAutenticado,
        turnoAuditadoId,
        setTurnoAuditadoId,
        cargarTodo
    } = useAdminContext();

    return (
        <TabExportacion
            datos={datos}
            adminAutenticado={adminAutenticado}
            turnoAuditadoId={turnoAuditadoId}
            setTurnoAuditadoId={setTurnoAuditadoId}
            cargarTodo={cargarTodo}
        />
    );
}
