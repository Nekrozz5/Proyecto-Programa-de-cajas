/**
 * server/repositories/auth.repo.js
 * Repositorio de autenticación, usuarios, roles y seguridad.
 * Control de intentos fallidos, rate limiting dual en memoria y hashing bcrypt.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { runQuery, getQuery, allQuery } = require('./db');

const UUID_TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BCRYPT_ROUNDS = 10;
const MAX_INTENTOS_LOGIN = 5;
const TIEMPO_BLOQUEO_LOGIN_MS = 15 * 60 * 1000; // 15 minutos
const intentosFallidosLogin = new Map();

// Segundo contador por cuenta (sin IP): evita que rotar la IP permita fuerza bruta ilimitada.
// 20 intentos fallidos dentro de una ventana de 15 minutos bloquean la cuenta 15 minutos.
const MAX_INTENTOS_CUENTA = 20;
const VENTANA_INTENTOS_CUENTA_MS = 15 * 60 * 1000;
const TIEMPO_BLOQUEO_CUENTA_MS = 15 * 60 * 1000;
const intentosFallidosCuenta = new Map();
const pruebasDispositivoUsadas = new Map();
const PRUEBA_DISPOSITIVO_TTL_MS = 5 * 60 * 1000;

// Límite de entradas en memoria para que nombres aleatorios no hagan crecer los mapas sin control
const MAX_ENTRADAS_RATE_LIMIT = 10000;

function purgarEntradasExpiradas(mapa, ventanaMs) {
    if (mapa.size < MAX_ENTRADAS_RATE_LIMIT) return;
    const ahora = Date.now();
    for (const [clave, reg] of mapa) {
        const bloqueoVencido = !reg.bloqueadoHasta || reg.bloqueadoHasta <= ahora;
        const ventanaVencida = !reg.primerIntento || ahora - reg.primerIntento > ventanaMs;
        if (bloqueoVencido && ventanaVencida) mapa.delete(clave);
    }
}

function esHashBcrypt(valor) {
    return typeof valor === 'string' && /^\$2[aby]\$\d{2}\$/.test(valor);
}

function exigirTenantId(tenantId) {
    const valor = String(tenantId || '').trim();
    if (!UUID_TENANT.test(valor)) {
        throw new Error('Contexto de tenant inválido o ausente.');
    }
    return valor;
}

function exigirPoolTenant(pool) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('Conexión PostgreSQL del tenant requerida.');
    }
    return pool;
}

function normalizarDeviceId(deviceId) {
    const valor = Number(deviceId);
    if (!Number.isSafeInteger(valor) || valor <= 0) {
        throw new Error('El identificador del dispositivo no es válido.');
    }
    return valor;
}

function decodificarFirma(firma) {
    const valor = String(firma || '').trim();
    if (!valor || valor.length > 8192) return null;
    try {
        const buffer = /^[0-9a-f]+$/i.test(valor) && valor.length % 2 === 0
            ? Buffer.from(valor, 'hex')
            : Buffer.from(valor.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        return buffer.length > 0 ? buffer : null;
    } catch (_) {
        return null;
    }
}

function purgarPruebasDispositivo() {
    const ahora = Date.now();
    for (const [clave, expiraEn] of pruebasDispositivoUsadas) {
        if (expiraEn <= ahora) pruebasDispositivoUsadas.delete(clave);
    }
}

function errorDispositivoNoAutorizado() {
    const error = new Error('El dispositivo no está activo o la prueba criptográfica no es válida.');
    error.status = 403;
    return error;
}

/**
 * Comprueba posesión de la clave privada del terminal y su estado en el tenant.
 * El cliente firma exactamente el texto de `challenge` con la clave privada
 * correspondiente a `clave_publica` usando SHA-256.
 */
async function verificarPruebaDispositivo({ tenantId, deviceId, challenge, signature }, pool = null) {
    const tenant = exigirTenantId(tenantId);
    const id = normalizarDeviceId(deviceId);
    const desafio = String(challenge || '').trim();
    const firma = decodificarFirma(signature);
    if (desafio.length < 8 || desafio.length > 2048 || !firma) throw errorDispositivoNoAutorizado();

    let dispositivo;
    try {
        if (pool) {
            const conexion = exigirPoolTenant(pool);
            const resultado = await conexion.query(`
                SELECT id, tenant_id, clave_publica, estado
                FROM dispositivos_pos
                WHERE tenant_id = $1 AND id = $2
                LIMIT 1
            `, [tenant, id]);
            dispositivo = resultado.rows[0];
        } else {
            dispositivo = await getQuery(`
                SELECT id, tenant_id, clave_publica, estado
                FROM dispositivos_pos
                WHERE tenant_id = ? AND id = ?
                LIMIT 1
            `, [tenant, id]);
        }
    } catch (_) {
        throw errorDispositivoNoAutorizado();
    }

    if (!dispositivo || dispositivo.estado !== 'activo') throw errorDispositivoNoAutorizado();

    let válida = false;
    try {
        const clave = crypto.createPublicKey(dispositivo.clave_publica);
        const datos = Buffer.from(desafio, 'utf8');
        válida = crypto.verify('sha256', datos, clave, firma);
        // WebCrypto entrega firmas ECDSA en formato IEEE-P1363; Node acepta DER
        // por defecto, así que se prueba también el formato interoperable.
        if (!válida) válida = crypto.verify('sha256', datos, { key: clave, dsaEncoding: 'ieee-p1363' }, firma);
    } catch (_) {
        válida = false;
    }
    if (!válida) throw errorDispositivoNoAutorizado();

    purgarPruebasDispositivo();
    const clavePrueba = `${tenant}:${id}:${crypto.createHash('sha256').update(desafio).digest('hex')}`;
    if (pruebasDispositivoUsadas.has(clavePrueba)) throw errorDispositivoNoAutorizado();
    pruebasDispositivoUsadas.set(clavePrueba, Date.now() + PRUEBA_DISPOSITIVO_TTL_MS);

    if (pool) {
        await pool.query(`
            UPDATE dispositivos_pos SET ultimo_acceso = CURRENT_TIMESTAMP
            WHERE tenant_id = $1 AND id = $2 AND estado = 'activo'
        `, [tenant, id]);
    } else {
        await runQuery(`
            UPDATE dispositivos_pos SET ultimo_acceso = CURRENT_TIMESTAMP
            WHERE tenant_id = ? AND id = ? AND estado = 'activo'
        `, [tenant, id]);
    }

    return { id, tenantId: tenant, estado: 'activo' };
}

async function obtenerEstadoDispositivoParaSesion(tenantId, deviceId, pool = null) {
    const tenant = exigirTenantId(tenantId);
    const id = normalizarDeviceId(deviceId);
    let dispositivo;
    try {
        dispositivo = pool
            ? (await exigirPoolTenant(pool).query(`
                SELECT id, tenant_id, estado FROM dispositivos_pos
                WHERE tenant_id = $1 AND id = $2 LIMIT 1
            `, [tenant, id])).rows[0]
            : await getQuery(`
                SELECT id, tenant_id, estado FROM dispositivos_pos
                WHERE tenant_id = ? AND id = ? LIMIT 1
            `, [tenant, id]);
    } catch (_) {
        return false;
    }
    return Boolean(dispositivo && dispositivo.estado === 'activo');
}

async function compararPasswordPostgres(pinPlano, passwordGuardado) {
    const pinStr = String(pinPlano ?? '');
    if (!pinStr || !passwordGuardado || !esHashBcrypt(passwordGuardado)) return false;
    return await bcrypt.compare(pinStr, passwordGuardado);
}

/**
 * Variante PostgreSQL. El tenantId y el pool deben provenir del contexto
 * autenticado del servidor; no deben construirse desde el body del request.
 */
async function verificarUsuarioEnTenant(pool, tenantId, nombreUsuario, pin, ip = 'local') {
    const conexion = exigirPoolTenant(pool);
    const tenant = exigirTenantId(tenantId);
    const usuario = String(nombreUsuario || '').trim();
    const claveRL = obtenerClaveRateLimitLogin(`tenant:${tenant}:usuario:${usuario}`, ip);
    verificarBloqueoLogin(claveRL);

    const resultado = await conexion.query(`
        SELECT id, tenant_id, nombre AS nombre_visible, nombre_usuario, rol,
               pin_o_password, puede_registrar_respaldo_fiscal
        FROM usuarios
        WHERE tenant_id = $1
          AND LOWER(nombre_usuario) = LOWER($2)
          AND activo = 1
        LIMIT 1
    `, [tenant, usuario]);
    const candidato = resultado.rows[0];
    const claveCuenta = obtenerClaveCuenta(candidato, `tenant:${tenant}:usuario:${usuario}`);
    verificarBloqueoCuenta(claveCuenta);

    if (!candidato || !(await compararPasswordPostgres(pin, candidato.pin_o_password))) {
        registrarFalloLogin(claveRL, claveCuenta);
        return undefined;
    }

    limpiarIntentosLogin(claveRL);
    return {
        id: candidato.id,
        tenantId: candidato.tenant_id,
        nombre: candidato.nombre_visible,
        nombreUsuario: candidato.nombre_usuario,
        rol: candidato.rol,
        puedeRegistrarRespaldoFiscal: candidato.puede_registrar_respaldo_fiscal
    };
}

async function crearUsuarioEnTenant(pool, tenantId, nombreVisible, nombreUsuario, pin, rol) {
    const conexion = exigirPoolTenant(pool);
    const tenant = exigirTenantId(tenantId);
    const visible = String(nombreVisible || '').trim();
    const usuario = String(nombreUsuario || '').trim().toLowerCase();
    if (!visible || !usuario) throw new Error('El nombre visible y el usuario son obligatorios.');
    const pinValido = validarPoliticaPin(pin, rol);
    const hashPin = await bcrypt.hash(pinValido, BCRYPT_ROUNDS);

    try {
        const resultado = await conexion.query(`
            INSERT INTO usuarios
                (tenant_id, nombre, nombre_usuario, pin_o_password, rol)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [tenant, visible, usuario, hashPin, rol]);
        return resultado.rows[0].id;
    } catch (err) {
        if (err && err.code === '23505') {
            throw new Error(`Ya existe el usuario "${usuario}" en este negocio.`);
        }
        throw err;
    }
}

async function obtenerUsuarioPorIdEnTenant(pool, tenantId, usuarioId) {
    const conexion = exigirPoolTenant(pool);
    const tenant = exigirTenantId(tenantId);
    const resultado = await conexion.query(`
        SELECT id, tenant_id, nombre AS nombre_visible, nombre_usuario, rol,
               puede_registrar_respaldo_fiscal
        FROM usuarios
        WHERE tenant_id = $1 AND id = $2 AND activo = 1
        LIMIT 1
    `, [tenant, usuarioId]);
    const usuario = resultado.rows[0];
    if (!usuario) return null;
    return {
        id: usuario.id,
        tenantId: usuario.tenant_id,
        nombre: usuario.nombre_visible,
        nombreUsuario: usuario.nombre_usuario,
        rol: usuario.rol,
        puedeRegistrarRespaldoFiscal: usuario.puede_registrar_respaldo_fiscal
    };
}

function obtenerClaveRateLimitLogin(identificadorUsuario, ip = 'local') {
    const idNorm = String(identificadorUsuario || 'desconocido').trim().toLowerCase();
    const ipNorm = String(ip || 'local').trim().toLowerCase();
    return `${idNorm}|${ipNorm}`;
}

function formatearMinutosYSegundos(segundosTotales) {
    const mins = Math.floor(segundosTotales / 60);
    const segs = segundosTotales % 60;
    return `${mins}:${segs < 10 ? '0' : ''}${segs}`;
}

function verificarBloqueoLogin(clave) {
    const registro = intentosFallidosLogin.get(clave);
    if (!registro) return;

    const ahora = Date.now();
    if (registro.bloqueadoHasta && registro.bloqueadoHasta > ahora) {
        const segundosRestantes = Math.ceil((registro.bloqueadoHasta - ahora) / 1000);
        const reloj = formatearMinutosYSegundos(segundosRestantes);
        throw new Error(
            `Cuenta bloqueada temporalmente tras ${MAX_INTENTOS_LOGIN} intentos fallidos. Intenta nuevamente en ${reloj} (min:seg).`
        );
    }

    if (registro.bloqueadoHasta && registro.bloqueadoHasta <= ahora) {
        intentosFallidosLogin.delete(clave);
    }
}

function registrarIntentoFallidoLogin(clave) {
    const ahora = Date.now();
    purgarEntradasExpiradas(intentosFallidosLogin, TIEMPO_BLOQUEO_LOGIN_MS);
    const actual = intentosFallidosLogin.get(clave) || { intentos: 0, bloqueadoHasta: null, primerIntento: ahora };
    actual.intentos += 1;

    if (actual.intentos >= MAX_INTENTOS_LOGIN) {
        actual.bloqueadoHasta = ahora + TIEMPO_BLOQUEO_LOGIN_MS;
        intentosFallidosLogin.set(clave, actual);
        const segundosRestantes = Math.ceil(TIEMPO_BLOQUEO_LOGIN_MS / 1000);
        const reloj = formatearMinutosYSegundos(segundosRestantes);
        throw new Error(
            `Demasiados intentos fallidos (${MAX_INTENTOS_LOGIN}). El acceso se ha bloqueado temporalmente por ${reloj} (min:seg).`
        );
    }

    intentosFallidosLogin.set(clave, actual);
}

function limpiarIntentosLogin(clave) {
    intentosFallidosLogin.delete(clave);
}

function obtenerClaveCuenta(candidato, identificadorIntentado) {
    if (candidato && candidato.id) return `cuenta:${Number(candidato.id)}`;
    return `intento:${String(identificadorIntentado || 'desconocido').trim().toLowerCase()}`;
}

function verificarBloqueoCuenta(claveCuenta) {
    const registro = intentosFallidosCuenta.get(claveCuenta);
    if (!registro) return;
    const ahora = Date.now();

    if (registro.bloqueadoHasta && registro.bloqueadoHasta > ahora) {
        const reloj = formatearMinutosYSegundos(Math.ceil((registro.bloqueadoHasta - ahora) / 1000));
        throw new Error(
            `Cuenta bloqueada temporalmente por exceso de intentos fallidos (${MAX_INTENTOS_CUENTA}) desde distintos orígenes. Intenta nuevamente en ${reloj} (min:seg).`
        );
    }

    const bloqueoVencido = registro.bloqueadoHasta && registro.bloqueadoHasta <= ahora;
    const ventanaVencida = !registro.bloqueadoHasta && ahora - registro.primerIntento > VENTANA_INTENTOS_CUENTA_MS;
    if (bloqueoVencido || ventanaVencida) {
        intentosFallidosCuenta.delete(claveCuenta);
    }
}

function registrarIntentoFallidoCuenta(claveCuenta) {
    const ahora = Date.now();
    purgarEntradasExpiradas(intentosFallidosCuenta, VENTANA_INTENTOS_CUENTA_MS);
    let actual = intentosFallidosCuenta.get(claveCuenta);
    if (!actual || (!actual.bloqueadoHasta && ahora - actual.primerIntento > VENTANA_INTENTOS_CUENTA_MS)) {
        actual = { intentos: 0, primerIntento: ahora, bloqueadoHasta: null };
    }
    actual.intentos += 1;
    if (actual.intentos >= MAX_INTENTOS_CUENTA && !actual.bloqueadoHasta) {
        actual.bloqueadoHasta = ahora + TIEMPO_BLOQUEO_CUENTA_MS;
    }
    intentosFallidosCuenta.set(claveCuenta, actual);
}

function registrarFalloLogin(claveIp, claveCuenta) {
    registrarIntentoFallidoCuenta(claveCuenta);
    registrarIntentoFallidoLogin(claveIp);
}

async function compararPassword(pinPlano, passwordGuardado) {
    const pinStr = String(pinPlano ?? '');
    if (!pinStr || !passwordGuardado) return false;

    if (!esHashBcrypt(passwordGuardado)) return false;
    return await bcrypt.compare(pinStr, passwordGuardado);

    // Respaldo de transición por si algún registro aún estuviera en texto plano
}

const NIVEL_ROL = {
    user: 1,
    admin: 2,
    propietario: 3,
    developer: 4
};

function esRolAdministrativo(rol) {
    return rol === 'admin' || rol === 'propietario' || rol === 'developer';
}

async function verificarUsuario(nombre, pin, ip = 'local') {
    const nombreLimpio = String(nombre || '').trim();
    const claveRL = obtenerClaveRateLimitLogin(`nombre:${nombreLimpio}`, ip);
    verificarBloqueoLogin(claveRL);

    const candidato = await getQuery(
        `SELECT id, nombre, rol, pin_o_password FROM usuarios WHERE LOWER(nombre) = LOWER(?) AND activo = 1`,
        [nombreLimpio]
    );

    const claveCuenta = obtenerClaveCuenta(candidato, `nombre:${nombreLimpio}`);
    verificarBloqueoCuenta(claveCuenta);

    if (!candidato) {
        registrarFalloLogin(claveRL, claveCuenta);
        return undefined;
    }

    const coincide = await compararPassword(pin, candidato.pin_o_password);
    if (!coincide) {
        registrarFalloLogin(claveRL, claveCuenta);
        return undefined;
    }

    limpiarIntentosLogin(claveRL);
    return { id: candidato.id, nombre: candidato.nombre, rol: candidato.rol };
}

async function autenticarUsuarioPorId(usuarioId, pin, nombreUsuario = null, ip = 'local') {
    const usaNombre = nombreUsuario && String(nombreUsuario).trim() !== '';
    const identificadorRL = usaNombre ? `nombre:${String(nombreUsuario).trim()}` : `id:${Number(usuarioId || 0)}`;
    const claveRL = obtenerClaveRateLimitLogin(identificadorRL, ip);
    verificarBloqueoLogin(claveRL);

    let candidato = null;
    if (usaNombre) {
        candidato = await getQuery(
            `SELECT id, nombre, rol, pin_o_password FROM usuarios WHERE LOWER(nombre) = LOWER(?) AND activo = 1`,
            [String(nombreUsuario).trim()]
        );
    } else {
        candidato = await getQuery(
            `SELECT id, nombre, rol, pin_o_password FROM usuarios WHERE id = ? AND activo = 1`,
            [usuarioId]
        );
    }

    const claveCuenta = obtenerClaveCuenta(candidato, identificadorRL);
    verificarBloqueoCuenta(claveCuenta);

    if (!candidato) {
        registrarFalloLogin(claveRL, claveCuenta);
        throw new Error('Credenciales incorrectas o usuario inactivo.');
    }

    const coincide = await compararPassword(pin, candidato.pin_o_password);
    if (!coincide) {
        registrarFalloLogin(claveRL, claveCuenta);
        throw new Error('Credenciales incorrectas o usuario inactivo.');
    }

    limpiarIntentosLogin(claveRL);
    return { id: candidato.id, nombre: candidato.nombre, rol: candidato.rol };
}

async function obtenerUsuarioPorId(id) {
    return await getQuery(
        `SELECT id, nombre, rol, COALESCE(puede_registrar_respaldo_fiscal, 1) as puede_registrar_respaldo_fiscal
         FROM usuarios WHERE id = ? AND activo = 1`,
        [id]
    );
}

async function obtenerUsuarios() {
    // El rol 'developer' es estrictamente invisible para todos los roles en listados y selectores
    return await allQuery(
        `SELECT id, nombre, rol, COALESCE(puede_registrar_respaldo_fiscal, 1) as puede_registrar_respaldo_fiscal
         FROM usuarios WHERE activo = 1 AND rol != 'developer'
         ORDER BY CASE rol WHEN 'propietario' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, id ASC`
    );
}

async function actualizarPermisoFiscalUsuario(adminId, usuarioObjetivoId, habilitado) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede modificar permisos de registro fiscal.');
    }
    const idNum = Number(usuarioObjetivoId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
        throw new Error('ID de usuario inválido.');
    }
    await runQuery(
        `UPDATE usuarios SET puede_registrar_respaldo_fiscal = ? WHERE id = ?`,
        [habilitado ? 1 : 0, idNum]
    );
    return true;
}

// Lista pública mínima para el selector de login de /caja: solo cajeros activos, sin rol.
async function obtenerCajerosParaLogin() {
    return await allQuery(
        `SELECT id, nombre FROM usuarios WHERE activo = 1 AND rol = 'user' ORDER BY nombre COLLATE NOCASE ASC, id ASC`
    );
}

const LONGITUD_MINIMA_PIN_POR_ROL = {
    user: 4,
    admin: 8,
    propietario: 8,
    developer: 8
};

const ROLES_VALIDOS_CREDENCIALES = ['user', 'admin', 'propietario', 'developer'];

function validarPoliticaPin(pin, rol) {
    const pinStr = String(pin ?? '').trim();
    if (!ROLES_VALIDOS_CREDENCIALES.includes(rol)) {
        throw new Error('Rol inválido para crear credenciales.');
    }
    const minimo = LONGITUD_MINIMA_PIN_POR_ROL[rol] || 8;
    if (pinStr.length < minimo) {
        const etiqueta = rol === 'user'
            ? 'el PIN de un Cajero'
            : `la contraseña de un perfil ${rol === 'propietario' ? 'Propietario(a)' : rol === 'developer' ? 'Desarrollador' : 'Administrador'}`;
        throw new Error(`Contraseña / PIN demasiado corto: ${etiqueta} debe tener al menos ${minimo} caracteres.`);
    }
    if (rol === 'user' && !/^\d+$/.test(pinStr)) {
        throw new Error('El PIN de un Cajero debe contener únicamente dígitos.');
    }
    if (rol !== 'user' && (/^\d+$/.test(pinStr) || !/[A-Za-z]/.test(pinStr) || !/[0-9]/.test(pinStr))) {
        throw new Error('La contraseña administrativa debe tener al menos una letra y un número.');
    }
    return pinStr;
}

async function crearUsuario(nombre, pin, rol) {
    const nombreLimpio = String(nombre || '').trim();
    if (!nombreLimpio) {
        throw new Error('El nombre de usuario no puede estar vacío.');
    }
    if (pin === null || pin === undefined || String(pin).trim() === '') {
        throw new Error('La contraseña / PIN no puede estar vacía.');
    }
    const pinStr = validarPoliticaPin(pin, rol);
    const hashPin = await bcrypt.hash(pinStr, BCRYPT_ROUNDS);

    try {
        const res = await runQuery(
            `INSERT INTO usuarios (nombre, pin_o_password, rol) VALUES (?, ?, ?)`,
            [nombreLimpio, hashPin, rol]
        );
        return res.lastID;
    } catch (err) {
        if (err && err.message && err.message.includes('UNIQUE constraint failed')) {
            throw new Error(`Ya existe un usuario con el nombre "${nombreLimpio}".`);
        }
        throw err;
    }
}

async function crearUsuarioConPermiso(adminId, nuevoNombre, pin, nuevoRol) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador, Propietario(a) o Developer puede registrar usuarios.');
    }
    const rolNormalizado = nuevoRol === 'superadmin' ? 'propietario' : nuevoRol;
    if (!['propietario', 'admin', 'user'].includes(rolNormalizado)) {
        throw new Error("Rol inválido. Debe ser 'user', 'admin' o 'propietario'.");
    }
    if (NIVEL_ROL[ejecutor.rol] <= NIVEL_ROL[rolNormalizado]) {
        if (rolNormalizado === 'propietario') {
            throw new Error('Permiso denegado: solo el rol Developer puede crear cuentas de Propietario(a).');
        }
        if (ejecutor.rol === 'admin') {
            throw new Error("Permiso denegado: un Administrador solo puede crear usuarios de rango inferior (Cajeros). Solo el o la Propietario(a) o Developer puede crear otros Administradores.");
        }
        throw new Error(`Permiso denegado: tu rol (${ejecutor.rol}) solo puede crear usuarios de rango estrictamente inferior.`);
    }
    return await crearUsuario(nuevoNombre, pin, rolNormalizado);
}

async function borrarUsuarioConPermiso(adminId, usuarioABorrarId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador o Propietario(a) puede eliminar usuarios.');
    }
    if (Number(adminId) === Number(usuarioABorrarId)) {
        throw new Error('Operación no permitida: no puedes eliminar tu propio usuario.');
    }
    const objetivo = await obtenerUsuarioPorId(usuarioABorrarId);
    if (!objetivo) {
        throw new Error('El usuario que intentas dar de baja no existe o ya está inactivo.');
    }
    if (NIVEL_ROL[ejecutor.rol] <= NIVEL_ROL[objetivo.rol]) {
        throw new Error(`Jerarquía insuficiente: como ${ejecutor.rol} no puedes borrar a un usuario de tu mismo rango (${objetivo.rol}) o superior.`);
    }
    const res = await runQuery(`UPDATE usuarios SET activo = 0 WHERE id = ?`, [usuarioABorrarId]);
    return res.changes > 0;
}

async function cambiarPasswordConPermiso(ejecutorId, usuarioObjetivoId, nuevoPin, pinActual = null) {
    if (!nuevoPin || String(nuevoPin).trim() === '') {
        throw new Error('La nueva contraseña / PIN no puede estar vacía.');
    }

    const ejecutor = await getQuery(`SELECT id, nombre, rol, pin_o_password FROM usuarios WHERE id = ? AND activo = 1`, [ejecutorId]);
    if (!ejecutor) {
        throw new Error('Usuario ejecutor no válido.');
    }

    const objetivo = await obtenerUsuarioPorId(usuarioObjetivoId);
    if (!objetivo) {
        throw new Error('Usuario objetivo no encontrado.');
    }

    const nuevoPinValido = validarPoliticaPin(nuevoPin, objetivo.rol);
    const nuevoHash = await bcrypt.hash(nuevoPinValido, BCRYPT_ROUNDS);

    // Caso 1: El usuario cambia su propia contraseña/PIN (pinActual es OBLIGATORIO)
    if (Number(ejecutorId) === Number(usuarioObjetivoId)) {
        if (pinActual === null || pinActual === undefined || String(pinActual).trim() === '') {
            throw new Error('Debes ingresar tu contraseña / PIN actual para cambiar tu propia clave.');
        }
        const coincide = await compararPassword(String(pinActual), ejecutor.pin_o_password);
        if (!coincide) {
            throw new Error('Tu contraseña / PIN actual es incorrecto.');
        }
        await runQuery(`UPDATE usuarios SET pin_o_password = ? WHERE id = ?`, [nuevoHash, usuarioObjetivoId]);
        return true;
    }

    // Caso 2: Cambiar la contraseña/PIN a otro usuario (requiere ser superior jerárquico)
    if (!esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: un cajero no puede cambiar la contraseña de otros usuarios.');
    }

    if (NIVEL_ROL[ejecutor.rol] <= NIVEL_ROL[objetivo.rol]) {
        throw new Error(`Jerarquía insuficiente: un ${ejecutor.rol} no puede cambiar la contraseña de otro ${objetivo.rol} ni de un superior.`);
    }

    await runQuery(`UPDATE usuarios SET pin_o_password = ? WHERE id = ?`, [nuevoHash, usuarioObjetivoId]);
    return true;
}

module.exports = {
    BCRYPT_ROUNDS,
    NIVEL_ROL,
    LONGITUD_MINIMA_PIN_POR_ROL,
    esRolAdministrativo,
    validarPoliticaPin,
    verificarUsuario,
    autenticarUsuarioPorId,
    obtenerUsuarioPorId,
    obtenerUsuarios,
    actualizarPermisoFiscalUsuario,
    obtenerCajerosParaLogin,
    crearUsuario,
    crearUsuarioConPermiso,
    borrarUsuarioConPermiso,
    cambiarPasswordConPermiso,
    verificarPruebaDispositivo,
    obtenerEstadoDispositivoParaSesion,
    verificarUsuarioEnTenant,
    crearUsuarioEnTenant,
    obtenerUsuarioPorIdEnTenant
};
