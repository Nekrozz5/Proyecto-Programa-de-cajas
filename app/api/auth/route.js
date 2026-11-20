import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import {
    autenticarUsuarioPorId,
    inicializarSistemaPrimeraVez,
    sistemaEstaInstalado
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

        if (accion === 'probar_smtp_instalacion') {
            const instalado = await sistemaEstaInstalado();
            if (instalado) {
                return NextResponse.json(
                    { ok: false, error: 'El sistema ya se encuentra instalado.' },
                    { status: 403, headers: HEADERS_SIN_CACHE }
                );
            }

            const host = body.host || 'smtp.gmail.com';
            const port = Number(body.port || body.puerto || 465);
            const secure = body.secure !== undefined ? Boolean(body.secure) : (port === 465);
            const user = body.user || body.usuario || body.auth?.user;
            const pass = body.pass || body.password || body.auth?.pass;

            if (!user || !pass) {
                return NextResponse.json(
                    { ok: false, error: 'Debe ingresar el usuario/correo y la contraseña para probar la conexión SMTP.' },
                    { status: 400, headers: HEADERS_SIN_CACHE }
                );
            }

            try {
                const transporter = nodemailer.createTransport({
                    host: String(host).trim(),
                    port,
                    secure,
                    auth: {
                        user: String(user).trim(),
                        pass: String(pass).trim()
                    },
                    connectionTimeout: 10000
                });

                await transporter.verify();
                return NextResponse.json({ ok: true, mensaje: 'Conexión SMTP exitosa' }, { headers: HEADERS_SIN_CACHE });
            } catch (smtpErr) {
                return NextResponse.json(
                    { ok: false, error: smtpErr.message || 'Error de conexión o autenticación con el servidor SMTP.' },
                    { status: 400, headers: HEADERS_SIN_CACHE }
                );
            }
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
