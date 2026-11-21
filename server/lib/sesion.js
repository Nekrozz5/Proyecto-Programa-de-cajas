const { SignJWT, jwtVerify } = require('jose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { obtenerUsuarioPorIdEnTenant, obtenerEstadoDispositivoParaSesion } = require('../repositories/auth.repo');
const { obtenerPoolTenant, obtenerTenantPorId } = require('../tenancy/tenant-registry');
const {
    obtenerContextoTenantDesdeRequest,
    tenantDelPayload
} = require('../tenancy/tenant-context');
const { esProduccion, exigirSecretoSesionProduccion } = require('./secretos');

const NOMBRE_COOKIE_SESION = 'pos_session';
const UUID_TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Identificador único en memoria generado por cada arranque del servidor/proyecto.
// Si el servidor se detiene o reinicia (npm run dev), cualquier sesión previa
// de developer o administradores queda automáticamente invalidada.
// Se preserva en globalThis para garantizar consistencia absoluta entre todos los bundles
// de Next.js (Route Handlers, Server Actions, Server Components) durante la vida del proceso.
if (!globalThis.__POS_INSTANCE_BOOT_ID__) {
    globalThis.__POS_INSTANCE_BOOT_ID__ = crypto.randomUUID();
}
const INSTANCE_BOOT_ID = globalThis.__POS_INSTANCE_BOOT_ID__;

const ROLES_ADMINISTRATIVOS_O_TECNICOS = ['developer', 'propietario', 'admin'];

const TTL_POR_ROL = {
    developer: 15 * 60,    // 15 minutos (rol técnico de diagnóstico puntual)
    propietario: 30 * 60,  // 30 minutos
    admin: 30 * 60,        // 30 minutos
    user: 8 * 60 * 60      // 8 horas (turno normal de cajero)
};

const DURACION_SESION_SEGUNDOS = TTL_POR_ROL.user;

// Validación perezosa: se ejecuta en el primer uso real (crear/verificar token), nunca al importar
// el módulo, para no romper `next build` (que también corre con NODE_ENV=production).
function obtenerSecretoSesion() {
    if (globalThis.__POS_SECRETO_CACHE__) return globalThis.__POS_SECRETO_CACHE__;

    // Producción: el secreto debe venir del entorno y ser apto. Nunca se genera ni se escribe .env.local.
    if (esProduccion()) {
        globalThis.__POS_SECRETO_CACHE__ = new TextEncoder().encode(exigirSecretoSesionProduccion());
        return globalThis.__POS_SECRETO_CACHE__;
    }

    if (process.env.SESSION_SECRET && String(process.env.SESSION_SECRET).trim().length >= 32) {
        globalThis.__POS_SECRETO_CACHE__ = new TextEncoder().encode(String(process.env.SESSION_SECRET).trim());
        return globalThis.__POS_SECRETO_CACHE__;
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
                        globalThis.__POS_SECRETO_CACHE__ = new TextEncoder().encode(valor);
                        return globalThis.__POS_SECRETO_CACHE__;
                    }
                }
            }
        }

        // Si no existe SESSION_SECRET, generar uno aleatorio seguro y persistirlo en .env.local (ignorado en git)
        const nuevoSecreto = crypto.randomBytes(32).toString('hex');
        const prefijo = fs.existsSync(envLocalPath) && !fs.readFileSync(envLocalPath, 'utf8').endsWith('\n') ? '\n' : '';
        fs.appendFileSync(envLocalPath, `${prefijo}SESSION_SECRET=${nuevoSecreto}\n`, 'utf8');
        process.env.SESSION_SECRET = nuevoSecreto;
        globalThis.__POS_SECRETO_CACHE__ = new TextEncoder().encode(nuevoSecreto);
        return globalThis.__POS_SECRETO_CACHE__;
    } catch (err) {
        // Respaldo en memoria si el sistema de archivos fuera de solo lectura
        const secretoMemoria = crypto.randomBytes(32).toString('hex');
        globalThis.__POS_SECRETO_CACHE__ = new TextEncoder().encode(secretoMemoria);
        return globalThis.__POS_SECRETO_CACHE__;
    }
}

async function crearTokenSesion(usuario) {
    const secreto = obtenerSecretoSesion();
    const rol = String(usuario.rol || 'user');
    const esAdminODev = ROLES_ADMINISTRATIVOS_O_TECNICOS.includes(rol);
    const ttlSegundos = TTL_POR_ROL[rol] || TTL_POR_ROL.user;
    const tenantId = tenantDelPayload(usuario);
    if (!UUID_TENANT.test(tenantId)) {
        throw new Error('No se puede crear una sesión sin un tenant válido.');
    }

    // Lista explícita de claims: nunca se serializan PIN, contraseña, hash ni el objeto usuario completo.
    const payload = {
        id: Number(usuario.id),
        nombre: String(usuario.nombre),
        rol,
        tenantId
    };

    if (rol === 'user') {
        const deviceId = Number(usuario.deviceId ?? usuario.device_id);
        if (!Number.isSafeInteger(deviceId) || deviceId <= 0) {
            throw new Error('No se puede crear una sesión de cajero sin dispositivo válido.');
        }
        payload.deviceId = deviceId;
    }

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
    // Fuera del try: un error de configuración del secreto debe propagarse, no confundirse con un token inválido
    const secreto = obtenerSecretoSesion();
    try {
        const { payload } = await jwtVerify(token, secreto, {
            algorithms: ['HS256']
        });
        if (!payload || !payload.id || !payload.tenantId || !UUID_TENANT.test(String(payload.tenantId))) return null;

        // Si es rol administrativo o developer, invalidar inmediatamente si el proceso del servidor se reinició
        if (ROLES_ADMINISTRATIVOS_O_TECNICOS.includes(payload.rol)) {
            if (!payload.bootId || payload.bootId !== INSTANCE_BOOT_ID) {
                console.warn(`[Sesión] Token administrativo invalidado por reinicio de proceso (usuario ${payload.nombre || payload.id}).`);
                return null;
            }
        }

        if (payload.rol === 'user' && (!Number.isSafeInteger(Number(payload.deviceId)) || Number(payload.deviceId) <= 0)) {
            return null;
        }

        return payload;
    } catch (err) {
        console.warn('[Sesión] Token inválido o expirado:', err && err.message ? err.message : err);
        return null;
    }
}

/**
 * Determina si un token válido ha superado el 50% de su TTL para renovarlo de forma transparente
 * mientras el operador mantenga actividad en el sistema.
 */
function tokenRequiereRenovacion(payload) {
    if (!payload || !payload.exp || !payload.iat) return false;
    const ahora = Math.floor(Date.now() / 1000);
    const vidaTotal = payload.exp - payload.iat;
    const tiempoRestante = payload.exp - ahora;
    return tiempoRestante < (vidaTotal * 0.5);
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

function esConexionSegura(request = null) {
    if (process.env.NODE_ENV !== 'production') return false;
    if (!request) return true;

    const protoHeader = request.headers && typeof request.headers.get === 'function'
        ? String(request.headers.get('x-forwarded-proto') || '').trim().toLowerCase()
        : '';
    if (protoHeader) {
        return protoHeader.split(',')[0].trim() === 'https';
    }

    if (typeof request.url === 'string') {
        return request.url.startsWith('https://');
    }

    return true;
}

function obtenerOpcionesCookieSesion(rol = null, maxAge = null, request = null) {
    const esAdminODev = rol && ROLES_ADMINISTRATIVOS_O_TECNICOS.includes(rol);

    const opciones = {
        name: NOMBRE_COOKIE_SESION,
        httpOnly: true,
        sameSite: 'lax',
        secure: esConexionSegura(request),
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

function adjuntarCookieSesion(response, token, rol = null, request = null) {
    const opciones = obtenerOpcionesCookieSesion(rol, null, request);
    response.cookies.set(opciones.name, token, opciones);
    return response;
}

function limpiarCookieSesion(response, request = null) {
    const opciones = obtenerOpcionesCookieSesion(null, 0, request);
    response.cookies.set(opciones.name, '', opciones);
    return response;
}

async function obtenerUsuarioSesion(request) {
    const token = extraerTokenDeRequest(request);
    if (!token) return null;

    const payload = await verificarTokenSesion(token);
    if (!payload || !payload.id || !tenantDelPayload(payload)) return null;

    const contexto = await obtenerContextoTenantDesdeRequest(request);
    if (contexto.tenantId !== tenantDelPayload(payload)) return null;

    // Verificar en tiempo real que el usuario exista y siga activo en la base de datos
    const pool = await obtenerPoolTenant(contexto.tenant);
    const usuarioActivo = await obtenerUsuarioPorIdEnTenant(pool, contexto.tenantId, Number(payload.id));
    if (!usuarioActivo) return null;
    if (usuarioActivo.rol === 'user' && !await obtenerEstadoDispositivoParaSesion(
        contexto.tenantId,
        payload.deviceId,
        pool
    )) return null;

    return {
        id: usuarioActivo.id,
        nombre: usuarioActivo.nombre,
        rol: usuarioActivo.rol,
        tenantId: contexto.tenantId,
        nombreUsuario: usuarioActivo.nombreUsuario,
        ...(usuarioActivo.rol === 'user' ? { deviceId: Number(payload.deviceId) } : {})
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

/**
 * Valida la sesión del usuario en Server Actions usando cookies() de next/headers.
 * Revalida el usuario y el dispositivo en PostgreSQL.
 * 
 * @param {Array<string>|null} rolesPermitidos - Opcional. Lista de roles permitidos ('admin', 'user', etc.)
 * @returns {Promise<{ id: number, nombre: string, rol: string }>}
 */
async function exigirUsuarioSesionAction(rolesPermitidos = null) {
    const { cookies } = require('next/headers');
    const cookieStore = await cookies();
    const cookie = cookieStore.get(NOMBRE_COOKIE_SESION);
    const token = cookie ? cookie.value : null;

    if (!token) {
        const err = new Error('No autenticado. Debes iniciar sesión para realizar esta operación.');
        err.status = 401;
        throw err;
    }

    const payload = await verificarTokenSesion(token);
    if (!payload || !payload.id || !tenantDelPayload(payload)) {
        const err = new Error('Sesión inválida o expirada. Por favor, inicia sesión nuevamente.');
        err.status = 401;
        throw err;
    }

    const tenantId = tenantDelPayload(payload);
    const tenant = await obtenerTenantPorId(tenantId);
    const pool = tenant ? await obtenerPoolTenant(tenant) : null;
    const usuarioActivo = pool ? await obtenerUsuarioPorIdEnTenant(pool, tenantId, Number(payload.id)) : null;
    if (!usuarioActivo) {
        const err = new Error('Usuario no encontrado o inactivo.');
        err.status = 401;
        throw err;
    }

    if (usuarioActivo.rol === 'user' && !await obtenerEstadoDispositivoParaSesion(
        tenantId,
        payload.deviceId,
        pool
    )) {
        const err = new Error('La sesión del cajero fue invalidada porque su dispositivo ya no está activo.');
        err.status = 401;
        throw err;
    }

    const usuario = {
        id: usuarioActivo.id,
        nombre: usuarioActivo.nombre,
        rol: usuarioActivo.rol,
        tenantId,
        nombreUsuario: usuarioActivo.nombreUsuario,
        ...(usuarioActivo.rol === 'user' ? { deviceId: Number(payload.deviceId) } : {})
    };

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
    tokenRequiereRenovacion,
    extraerTokenDeRequest,
    obtenerUsuarioSesion,
    exigirUsuarioSesion,
    exigirUsuarioSesionAction,
    adjuntarCookieSesion,
    limpiarCookieSesion
};
