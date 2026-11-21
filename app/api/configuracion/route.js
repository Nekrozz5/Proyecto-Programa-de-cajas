import { NextResponse } from 'next/server';
import {
    obtenerConfiguracionNegocio,
    actualizarConfiguracionNegocio
} from '../../../server/queries';
import {
    obtenerUsuarioSesion
} from '../../../server/lib/sesion';
import { ejecutarRequestEnTenant } from '../../../server/tenancy/request-context';

export const dynamic = 'force-dynamic';

const HEADERS_SIN_CACHE = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

// GET /api/configuracion -> Devuelve la configuración general del negocio
export async function GET(request) {
    return ejecutarRequestEnTenant(request, async () => {
      try {
        const sesion = await obtenerUsuarioSesion(request);
        const configuracion = await obtenerConfiguracionNegocio();
        return NextResponse.json({
            ok: true,
            configuracion,
            configuracionNegocio: configuracion,
            sesion: sesion ? { id: sesion.id, nombre: sesion.nombre, rol: sesion.rol } : null
        }, { headers: HEADERS_SIN_CACHE });
      } catch (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: error.status || 500, headers: HEADERS_SIN_CACHE }
        );
      }
    });
}

// Manejador central de mutaciones de configuración
async function manejarMutacion(request) {
    return ejecutarRequestEnTenant(request, async () => {
      try {
        const sesion = await obtenerUsuarioSesion(request);
        if (!sesion) {
            return NextResponse.json(
                { ok: false, error: 'No autorizado. Se requiere iniciar sesión.' },
                { status: 401, headers: HEADERS_SIN_CACHE }
            );
        }

        const body = await request.json().catch(() => ({}));
        const datos = body.config && typeof body.config === 'object' ? { ...body, ...body.config } : body;

        // Comprobar si la mutación incluye habilita_delivery o habilitaDelivery
        const incluyeDelivery = datos.habilita_delivery !== undefined || datos.habilitaDelivery !== undefined;

        if (incluyeDelivery) {
            const esAutorizado = sesion.rol === 'propietario' || sesion.rol === 'developer';
            if (!esAutorizado) {
                return NextResponse.json(
                    { ok: false, error: 'Solo el Propietario(a) del negocio puede activar o desactivar el servicio de envíos/delivery' },
                    { status: 403, headers: HEADERS_SIN_CACHE }
                );
            }
        }

        // Roles no administrativos (cajero/user) no pueden modificar la configuración general
        if (sesion.rol !== 'propietario' && sesion.rol !== 'developer' && sesion.rol !== 'admin') {
            return NextResponse.json(
                { ok: false, error: 'Permiso denegado: se requieren permisos administrativos para modificar la configuración.' },
                { status: 403, headers: HEADERS_SIN_CACHE }
            );
        }

        const configuracion = await actualizarConfiguracionNegocio(datos, sesion.id);

        return NextResponse.json({
            ok: true,
            mensaje: 'Configuración actualizada correctamente.',
            configuracion,
            configuracionNegocio: configuracion
        }, { headers: HEADERS_SIN_CACHE });
      } catch (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: error.status || 500, headers: HEADERS_SIN_CACHE }
        );
      }
    });
}

// POST /api/configuracion
export async function POST(request) {
    return manejarMutacion(request);
}

// PUT /api/configuracion
export async function PUT(request) {
    return manejarMutacion(request);
}

// PATCH /api/configuracion
export async function PATCH(request) {
    return manejarMutacion(request);
}
