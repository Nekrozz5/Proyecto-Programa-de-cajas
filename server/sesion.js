const { SignJWT, jwtVerify } = require('jose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { obtenerUsuarioPorId } = require('./queries');

const NOMBRE_COOKIE_SESION = 'pos_session';
const DURACION_SESION_SEGUNDOS = 60 * 60 * 12; // 12 horas

let secretoCache = null;

function obtenerSecretoSesion() {
    if (secretoCache) return secretoCache;

    if (process.env.SESSION_SECRET && String(process.env.SESSION_SECRET).trim().length >= 32) {
        secretoCache = new TextEncoder().encode(String(process.env.SESSION_SECRET).trim());
        return secretoCache;
    }

    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    try {
        if (fs.existsSync(envLocalPath)) {
            const contenido = fs.readFileSync(envLocalPath, 'utf8');
            for (const linea of contenido.split(/\r?\n/)) {
                const limpia = linea.trim();
                if (!limpia || limpia.startsWith('#')) continue;
                const match = limpia.match(/^SESSION_SECRET\s*=\s*(.+)$/);
                if (match) {
                    const valor = match[1].trim().replace(/^['"]|['"]$/g, '');
                    if (valor.length >= 32) {
                        process.env.SESSION_SECRET = valor;
                        secretoCache = new TextEncoder().encode(valor);
                        return secretoCache;
                    }
                }
            }
        }

        // Si no existe SESSION_SECRET, generar uno aleatorio seguro y persistirlo en .env.local (ignorado en git)
        const nuevoSecreto = crypto.randomBytes(32).toString('hex');
        const prefijo = fs.existsSync(envLocalPath) && !fs.readFileSync(envLocalPath, 'utf8').endsWith('\n') ? '\n' : '';
        fs.appendFileSync(envLocalPath, `${prefijo}SESSION_SECRET=${nuevoSecreto}\n`, 'utf8');
        process.env.SESSION_SECRET = nuevoSecreto;
        secretoCache = new TextEncoder().encode(nuevoSecreto);
        return secretoCache;
    } catch (err) {
        // Respaldo en memoria si el sistema de archivos fuera de solo lectura
        const secretoMemoria = crypto.randomBytes(32).toString('hex');
        secretoCache = new TextEncoder().encode(secretoMemoria);
        return secretoCache;
    }
}

async function crearTokenSesion(usuario) {
    const secreto = obtenerSecretoSesion();
    return await new SignJWT({
        id: Number(usuario.id),
        nombre: String(usuario.nombre),
        rol: String(usuario.rol)
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(String(usuario.id))
        .setIssuedAt()
        .setExpirationTime(`${DURACION_SESION_SEGUNDOS}s`)
        .sign(secreto);
}

async function verificarTokenSesion(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        const secreto = obtenerSecretoSesion();
        const { payload } = await jwtVerify(token, secreto, {
            algorithms: ['HS256']
        });
        if (!payload || !payload.id) return null;
        return payload;
    } catch (err) {
        // Token inválido, expirado o con firma alterada
        return null;
    }
}

function extraerTokenDeRequest(request) {
    if (!request) return null;

    if (request.cookies && typeof request.cookies.get === 'function') {
        const cookieObj = request.cookies.get(NOMBRE_COOKIE_SESION);
        if (cookieObj && cookieObj.value) return cookieObj.value;
    }

    const cookieHeader = request.headers && typeof request.headers.get === 'function'
        ? request.headers.get('cookie')
        : null;

    if (!cookieHeader) return null;

    const partes = cookieHeader.split(';');
    for (const parte of partes) {
        const [nombre, ...resto] = parte.trim().split('=');
        if (nombre === NOMBRE_COOKIE_SESION) {
            return decodeURIComponent(resto.join('='));
        }
    }
    return null;
}

function obtenerOpcionesCookieSesion(maxAge = DURACION_SESION_SEGUNDOS) {
    return {
        name: NOMBRE_COOKIE_SESION,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge
    };
}

function adjuntarCookieSesion(response, token) {
    const opciones = obtenerOpcionesCookieSesion(DURACION_SESION_SEGUNDOS);
    response.cookies.set(opciones.name, token, opciones);
    return response;
}

function limpiarCookieSesion(response) {
    const opciones = obtenerOpcionesCookieSesion(0);
    response.cookies.set(opciones.name, '', opciones);
    return response;
}

async function obtenerUsuarioSesion(request) {
    const token = extraerTokenDeRequest(request);
    if (!token) return null;

    const payload = await verificarTokenSesion(token);
    if (!payload || !payload.id) return null;

    // Verificar en tiempo real que el usuario exista y siga activo en la base de datos
    const usuarioActivo = await obtenerUsuarioPorId(Number(payload.id));
    if (!usuarioActivo) return null;

    return {
        id: usuarioActivo.id,
        nombre: usuarioActivo.nombre,
        rol: usuarioActivo.rol
    };
}

async function exigirUsuarioSesion(request, rolesPermitidos = null) {
    const usuario = await obtenerUsuarioSesion(request);
    if (!usuario) {
        const err = new Error('No autenticado. Debes iniciar sesión para realizar esta operación.');
        err.status = 401;
        throw err;
    }

    if (Array.isArray(rolesPermitidos) && rolesPermitidos.length > 0) {
        if (!rolesPermitidos.includes(usuario.rol)) {
            const err = new Error('Permiso denegado: tu rol no tiene autorización para esta operación.');
            err.status = 403;
            throw err;
        }
    }

    return usuario;
}

module.exports = {
    NOMBRE_COOKIE_SESION,
    DURACION_SESION_SEGUNDOS,
    crearTokenSesion,
    verificarTokenSesion,
    obtenerUsuarioSesion,
    exigirUsuarioSesion,
    adjuntarCookieSesion,
    limpiarCookieSesion
};
