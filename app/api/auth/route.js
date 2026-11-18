import { NextResponse } from 'next/server';
import {
    autenticarUsuarioPorId,
    inicializarSistemaPrimeraVez
} from '../../../server/queries';
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
// Solo se confía en cf-connecting-ip (Cloudflare Tunnel) o x-real-ip (Proxy inverso)
// cuando TRUST_PROXY=true. En cualquier otro caso se usa 'local'.
function obtenerIpCliente(request) {
    if (String(process.env.TRUST_PROXY || '').trim().toLowerCase() !== 'true') {
        return 'local';
    }
    const cfIp = String(request.headers.get('cf-connecting-ip') || '').trim();
    if (cfIp) return cfIp.slice(0, 64);

    const realIp = String(request.headers.get('x-real-ip') || '').trim();
    return realIp ? realIp.slice(0, 64) : 'local';
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

// POST /api/auth -> Manejo de autenticación, logout e inicialización del sistema
export async function POST(request) {
    try {
        const body = await request.json();
        const { accion } = body;

        if (accion === 'login') {
            const ip = obtenerIpCliente(request);
            const usuario = await autenticarUsuarioPorId(
                Number(body.usuarioId || 0),
                String(body.pin || ''),
                body.nombreUsuario || null,
                ip
            );
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

        if (accion === 'instalacion_inicial') {
            const resultado = await inicializarSistemaPrimeraVez({
                ...body,
                setupToken: typeof body.setupToken === 'string' ? body.setupToken : '',
                smtp: body.smtp || null,
                destinatarioInicial: body.destinatarioInicial || null
            });
            return NextResponse.json({ ok: true, ...resultado }, { headers: HEADERS_SIN_CACHE });
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
