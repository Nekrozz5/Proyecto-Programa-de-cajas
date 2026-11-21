import { NextResponse } from 'next/server';
import {
    autenticarUsuarioPorId,
    verificarUsuarioEnTenant,
    verificarPruebaDispositivo
} from '../../../server/queries';
import {
    obtenerContextoTenantDesdeRequest
} from '../../../server/tenancy/tenant-context';
import { obtenerPoolTenant } from '../../../server/tenancy/tenant-registry';
import {
    crearTokenSesion,
    obtenerUsuarioSesion,
    adjuntarCookieSesion,
    limpiarCookieSesion
} from '../../../server/lib/sesion';

export const dynamic = 'force-dynamic';

const HEADERS_SIN_CACHE = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

// IP del cliente para el límite de intentos de login.
// Solo se confía en x-forwarded-for / x-real-ip (AWS ALB / CloudFront / Nginx) o cf-connecting-ip
// cuando TRUST_PROXY=true. En cualquier otro caso se usa 'default'.
function obtenerIpCliente(request) {
    if (String(process.env.TRUST_PROXY || '').trim().toLowerCase() !== 'true') {
        return 'default';
    }
    const forwardedFor = String(request.headers.get('x-forwarded-for') || '').trim();
    if (forwardedFor) {
        const firstIp = forwardedFor.split(',')[0].trim();
        if (firstIp) return firstIp.slice(0, 64);
    }

    const realIp = String(request.headers.get('x-real-ip') || '').trim();
    if (realIp) return realIp.slice(0, 64);

    const cfIp = String(request.headers.get('cf-connecting-ip') || '').trim();
    return cfIp ? cfIp.slice(0, 64) : 'default';
}

// GET /api/auth -> Consulta rápida del usuario en sesión activa
export async function GET(request) {
    try {
        const usuarioSesion = await obtenerUsuarioSesion(request);
        return NextResponse.json({ ok: true, usuarioSesion }, { headers: HEADERS_SIN_CACHE });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: error.status || 500, headers: HEADERS_SIN_CACHE }
        );
    }
}

// POST /api/auth -> Manejo de autenticación y logout
export async function POST(request) {
    try {
        const body = await request.json();
        const { accion } = body;

        if (accion === 'login') {
            const ip = obtenerIpCliente(request);
            const contexto = await obtenerContextoTenantDesdeRequest(request);
            let usuario;

            if (contexto.modo === 'AWS_MULTI_TENANT') {
                const nombreUsuario = String(body.nombreUsuario || '').trim();
                if (!nombreUsuario) {
                    throw new Error('El nombre de usuario es obligatorio para el acceso multi-negocio.');
                }
                usuario = await verificarUsuarioEnTenant(
                    await obtenerPoolTenant(contexto.tenant),
                    contexto.tenantId,
                    nombreUsuario,
                    String(body.pin || ''),
                    ip
                );
                if (!usuario) throw new Error('Credenciales incorrectas o usuario inactivo.');
            } else {
                usuario = await autenticarUsuarioPorId(
                    Number(body.usuarioId || 0),
                    String(body.pin || ''),
                    body.nombreUsuario || null,
                    ip
                );
                if (!usuario) throw new Error('Credenciales incorrectas o usuario inactivo.');
            }

            // El tenant proviene del host/configuración del servidor, nunca del body.
            usuario.tenantId = contexto.tenantId;
            if (usuario.rol === 'user') {
                const deviceId = body.device_id ?? body.deviceId;
                const challenge = body.device_challenge ?? body.deviceChallenge ?? body.challenge;
                const signature = body.device_signature ?? body.deviceSignature ?? body.signature;
                const dispositivo = await verificarPruebaDispositivo({
                    tenantId: contexto.tenantId,
                    deviceId,
                    challenge,
                    signature
                }, contexto.modo === 'AWS_MULTI_TENANT' ? await obtenerPoolTenant(contexto.tenant) : null);
                usuario.deviceId = dispositivo.id;
            }
            const token = await crearTokenSesion(usuario);
            const response = NextResponse.json({ ok: true, usuario }, { headers: HEADERS_SIN_CACHE });
            adjuntarCookieSesion(response, token, usuario.rol, request);
            return response;
        }

        if (accion === 'logout') {
            const response = NextResponse.json({ ok: true }, { headers: HEADERS_SIN_CACHE });
            limpiarCookieSesion(response, request);
            return response;
        }

        return NextResponse.json(
            { ok: false, error: 'Acción de autenticación no válida.' },
            { status: 400, headers: HEADERS_SIN_CACHE }
        );
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: error.status || 500, headers: HEADERS_SIN_CACHE }
        );
    }
}
