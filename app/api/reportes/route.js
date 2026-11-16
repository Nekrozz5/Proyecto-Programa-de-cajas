import { NextResponse } from 'next/server';
import { generarReporteCSV, generarReporteExcel, obtenerTendenciasVentas } from '../../../server/queries';
import { exigirUsuarioSesion } from '../../../server/sesion';

const ROLES_ADMIN = ['admin', 'superadmin', 'developer'];

export async function GET(request) {
    try {
        await exigirUsuarioSesion(request, ROLES_ADMIN);

        const { searchParams } = new URL(request.url);
        const formato = searchParams.get('formato');
        const cajaId = searchParams.get('cajaId');
        const desde = searchParams.get('desde');
        const hasta = searchParams.get('hasta');
        const filtros = {
            desde: desde || null,
            hasta: hasta || null
        };

        if (formato === 'xlsx') {
            const buffer = await generarReporteExcel(cajaId ? Number(cajaId) : null, filtros);
            const sufijo = cajaId
                ? `turno_${Number(cajaId)}`
                : (desde || hasta ? `${desde || 'inicio'}_a_${hasta || 'hoy'}` : 'completo');
            const nombreArchivo = `reporte_contable_${sufijo}.xlsx`;
            return new NextResponse(buffer, {
                status: 200,
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="${nombreArchivo}"`
                }
            });
        }

        if (formato === 'csv') {
            const csv = await generarReporteCSV(cajaId ? Number(cajaId) : null, filtros);
            const sufijo = cajaId
                ? `turno_${Number(cajaId)}`
                : (desde || hasta ? `${desde || 'inicio'}_a_${hasta || 'hoy'}` : 'completo');
            return new NextResponse(csv, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="reporte_contable_${sufijo}.csv"`
                }
            });
        }

        const tendencias = await obtenerTendenciasVentas();
        return NextResponse.json(tendencias);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: error.status || 500 });
    }
}
