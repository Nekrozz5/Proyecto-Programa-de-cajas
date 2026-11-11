import { NextResponse } from 'next/server';
import { generarReporteCSV, obtenerTendenciasVentas } from '../../../server/queries';
import { exigirUsuarioSesion } from '../../../server/sesion';

const ROLES_ADMIN = ['admin', 'superadmin', 'developer'];

export async function GET(request) {
    try {
        await exigirUsuarioSesion(request, ROLES_ADMIN);

        const { searchParams } = new URL(request.url);
        const formato = searchParams.get('formato');
        const cajaId = searchParams.get('cajaId');

        if (formato === 'csv') {
            const csv = await generarReporteCSV(cajaId ? Number(cajaId) : null);
            return new NextResponse(csv, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="reporte_caja.csv"'
                }
            });
        }

        const tendencias = await obtenerTendenciasVentas();
        return NextResponse.json(tendencias);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: error.status || 500 });
    }
}
