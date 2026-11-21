import { NextResponse } from 'next/server';
import { exigirUsuarioSesion } from '../../../../server/lib/sesion';
import { obtenerContextoTenantDesdeRequest, ejecutarConContextoTenant } from '../../../../server/tenancy/tenant-context';
import { crearDesafioEmparejamiento, consumirDesafioEmparejamiento } from '../../../../server/tenancy/device-auth';
import { emparejarDispositivo, obtenerEstadoDispositivo } from '../../../../server/repositories/dispositivos.repo';

export const dynamic = 'force-dynamic';

const HEADERS_SIN_CACHE = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

function respuesta(payload, status = 200) {
    return NextResponse.json(payload, { status, headers: HEADERS_SIN_CACHE });
}

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const accion = String(body.accion || '').trim().toLowerCase();
        const contexto = await obtenerContextoTenantDesdeRequest(request);

        if (accion === 'crear-desafio' || accion === 'desafio') {
            const usuario = await exigirUsuarioSesion(request, ['admin', 'propietario', 'developer']);
            if (usuario.tenantId !== contexto.tenantId) return respuesta({ ok: false, error: 'Tenant no válido.' }, 403);
            const desafio = crearDesafioEmparejamiento(contexto.tenantId, usuario.id);
            return respuesta({ ok: true, desafio });
        }

        if (accion === 'emparejar' || accion === 'activar') {
            const codigo = body.codigo || body.codigoEmparejamiento;
            const desafio = consumirDesafioEmparejamiento(codigo, contexto.tenantId);
            const dispositivo = await ejecutarConContextoTenant(contexto, () => emparejarDispositivo({
                tenantId: contexto.tenantId,
                administradorId: desafio.administradorId,
                nombre: body.nombre,
                clavePublica: body.clavePublica || body.clave_publica
            }));
            return respuesta({ ok: true, dispositivo });
        }

        return respuesta({ ok: false, error: 'Acción de dispositivo no válida.' }, 400);
    } catch (error) {
        return respuesta({ ok: false, error: error.message }, error.status || 400);
    }
}

export async function GET(request) {
    try {
        const contexto = await obtenerContextoTenantDesdeRequest(request);
        const clavePublica = new URL(request.url).searchParams.get('clavePublica');
        const dispositivo = await ejecutarConContextoTenant(contexto, () => obtenerEstadoDispositivo({
            tenantId: contexto.tenantId,
            clavePublica
        }));
        return respuesta({
            ok: true,
            activo: Boolean(dispositivo && dispositivo.estado === 'activo'),
            dispositivo: dispositivo && dispositivo.estado === 'activo' ? dispositivo : null
        });
    } catch (error) {
        return respuesta({ ok: false, error: error.message }, error.status || 400);
    }
}
