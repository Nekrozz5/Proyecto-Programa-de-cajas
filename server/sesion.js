const { SignJWT, jwtVerify } = require('jose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { obtenerUsuarioPorId } = require('./queries');

const NOMBRE_COOKIE_SESION = 'pos_session';

// Identificador único en memoria generado por cada arranque del servidor/proyecto.
// Si el servidor se detiene o reinicia (npm run dev), cualquier sesión previa
// de developer o administradores queda automáticamente invalidada.
const INSTANCE_BOOT_ID = crypto.randomUUID();

const ROLES_ADMINISTRATIVOS_O_TECNICOS = ['developer', 'superadmin', 'admin'];

const TTL_POR_ROL = {
    developer: 15 * 60,    // 15 minutos (rol técnico de diagnóstico puntual)
    superadmin: 30 * 60,   // 30 minutos
    admin: 30 * 60,        // 30 minutos
    user: 8 * 60 * 60      // 8 horas (turno normal de cajero)
};

const DURACION_SESION_SEGUNDOS = TTL_POR_ROL.user;

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
    const rol = String(usuario.rol || 'user');
    const esAdminODev = ROLES_ADMINISTRATIVOS_O_TECNICOS.includes(rol);
    const ttlSegundos = TTL_POR_ROL[rol] || TTL_POR_ROL.user;

    const payload = {
        id: Number(usuario.id),
        nombre: String(usuario.nombre),
        rol
    };

    // Para developer y administradores, vincular la sesión estrictamente a la ejecución actual del servidor.
    // Al reiniciar el proyecto (npm run dev), el bootId cambia y el token anterior queda invalidado.
    if (esAdminODev) {
        payload.bootId = INSTANCE_BOOT_ID;
    }

    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(String(usuario.id))
        .setIssuedAt()
        .setExpirationTime(`${ttlSegundos}s`)
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

        // Si es rol administrativo o developer, invalidar inmediatamente si el proyecto se reinició
        if (ROLES_ADMINISTRATIVOS_O_TECNICOS.includes(payload.rol)) {
            if (!payload.bootId || payload.bootId !== INSTANCE_BOOT_ID) {
                return null;
            }
        }

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

function obtenerOpcionesCookieSesion(rol = null, maxAge = null) {
    const esAdminODev = rol && ROLES_ADMINISTRATIVOS_O_TECNICOS.includes(rol);

    const opciones = {
        name: NOMBRE_COOKIE_SESION,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    };

    if (maxAge === 0) {
        opciones.maxAge = 0;
    } else if (!esAdminODev) {
        // Para cajeros (user), persiste durante su turno
        opciones.maxAge = maxAge !== null ? maxAge : TTL_POR_ROL.user;
    }
    // NOTA: Para developer y administradores NO se especifica maxAge.
    // Esto convierte la cookie en una 'Session Cookie' que el navegador destruye
    // automáticamente al cerrar la ventana o navegador.

    return opciones;
}

function adjuntarCookieSesion(response, token, rol = null) {
    const opciones = obtenerOpcionesCookieSesion(rol);
    response.cookies.set(opciones.name, token, opciones);
    return response;
}

function limpiarCookieSesion(response) {
    const opciones = obtenerOpcionesCookieSesion(null, 0);
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
    TTL_POR_ROL,
    ROLES_ADMINISTRATIVOS_O_TECNICOS,
    crearTokenSesion,
    verificarTokenSesion,
    obtenerUsuarioSesion,
    exigirUsuarioSesion,
    adjuntarCookieSesion,
    limpiarCookieSesion
};
