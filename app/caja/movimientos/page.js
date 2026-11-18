'use client';

import { useCajaContext } from '../_context/CajaContext';
import HistorialTurno from '../_components/HistorialTurno';
import AperturaTurno from '../_components/AperturaTurno';

export default function MovimientosPage() {
    const {
        cajaAbierta,
        usuarioActual,
        cajasFisicas,
        movimientos,
        cargarDatos,
        setMensaje,
        setError,
        limpiarAlertas,
        handleTurnoAbierto
    } = useCajaContext();

    if (!cajaAbierta) {
        return (
            <AperturaTurno
                usuarioActual={usuarioActual}
                cajasFisicas={cajasFisicas}
                onTurnoAbierto={handleTurnoAbierto}
                onError={setError}
                onLimpiarAlertas={limpiarAlertas}
            />
        );
    }

    return (
        <HistorialTurno
            cajaAbierta={cajaAbierta}
            movimientos={movimientos}
            usuarioActual={usuarioActual}
            onActualizar={cargarDatos}
            onMovimientoAnulado={async (msg) => {
                setMensaje(msg);
                await cargarDatos();
            }}
            onError={setError}
            onLimpiarAlertas={limpiarAlertas}
        />
    );
}
