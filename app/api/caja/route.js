import { NextResponse } from 'next/server';
import {
    obtenerCajaAbierta,
    abrirCaja,
    registrarVentaCompleta,
    registrarEgreso,
    cerrarCaja,
    obtenerEstadisticasCaja
} from '../../../server/queries';

// GET /api/caja -> Devuelve la caja abierta actual y sus estadísticas en vivo
export async function GET() {
    try {
        const caja = await obtenerCajaAbierta();
        if (!caja) {
            return NextResponse.json({ cajaAbierta: null });
        }
        const estadisticas = await obtenerEstadisticasCaja(caja.id);
        return NextResponse.json({ cajaAbierta: caja, estadisticas });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/caja -> Ejecuta acciones según el campo "accion" enviado desde el frontend
export async function POST(request) {
    try {
        const body = await request.json();
        const { accion } = body;

        if (accion === 'abrir') {
            const id = await abrirCaja(body.usuarioId, body.montoInicial);
            return NextResponse.json({ ok: true, cajaId: id });
        }

        if (accion === 'vender') {
            const resultado = await registrarVentaCompleta(
                body.cajaId,
                body.items,
                body.metodoPago,
                body.montoRecibido,
                body.descripcion
            );
            return NextResponse.json({ ok: true, venta: resultado });
        }

        if (accion === 'egreso') {
            const id = await registrarEgreso(body.cajaId, body.monto, body.descripcion, body.metodoPago);
            return NextResponse.json({ ok: true, movimientoId: id });
        }

        if (accion === 'cerrar') {
            const arqueo = await cerrarCaja(body.cajaId, body.efectivoReal);
            return NextResponse.json({ ok: true, arqueo });
        }

        return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
