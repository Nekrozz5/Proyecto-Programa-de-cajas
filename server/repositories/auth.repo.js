/**
 * server/repositories/auth.repo.js
 * Repositorio de autenticación, usuarios, roles y seguridad.
 * Control de intentos fallidos, rate limiting persistente y hashing bcrypt.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { runQuery, getQuery, allQuery, enTransaccion } = require('./db');
const { obtenerContextoTenantActual, exigirContextoTenant, ejecutarConContextoTenant } = require('../tenancy/tenant-context');

const UUID_TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BCRYPT_ROUNDS = 10;
const MAX_INTENTOS_LOGIN = 5;
const TIEMPO_BLOQUEO_LOGIN_MS = 15 * 60 * 1000; // 15 minutos

// Segundo contador por cuenta (sin IP): evita que rotar la IP permita fuerza bruta ilimitada.
// 20 intentos fallidos dentro de una ventana de 15 minutos bloquean la cuenta 15 minutos.
const MAX_INTENTOS_CUENTA = 20;
const VENTANA_INTENTOS_CUENTA_MS = 15 * 60 * 1000;
const TIEMPO_BLOQUEO_CUENTA_MS = 15 * 60 * 1000;
const PRUEBA_DISPOSITIVO_TTL_MS = 5 * 60 * 1000;

function esHashBcrypt(valor) {
    return typeof valor === 'string' && /^\$2[aby]\$\d{2}\$/.test(valor);
}

function exigirTenantId(tenantId) {
    const valor = String(tenantId || '').trim();
    const contexto = obtenerContextoTenantActual();
    if (!UUID_TENANT.test(valor) || (contexto && valor !== contexto.tenantId)) {
        throw new Error('Contexto de tenant inválido o ausente.');
    }
    return valor;
}

function obtenerTenantId() {
    return exigirTenantId(exigirContextoTenant().tenantId);
}

function consultarConPoolTenant(pool, tenantId, sql, params) {
    const tenant = exigirTenantId(tenantId);
    const conexion = exigirPoolTenant(pool);
    const activo = obtenerContextoTenantActual();
    if (activo) return conexion.query(sql, params);
    return ejecutarConContextoTenant({ tenantId: tenant, tenant: { tenant_id: tenant }, pool: conexion },
        () => conexion.query(sql, params));
}

function exigirPoolTenant(pool) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('Conexión PostgreSQL del tenant requerida.');
    }
    return pool;
}

function normalizarDeviceId(deviceId) {
    const valor = Number(deviceId);
    return Number.isSafeInteger(valor) && valor > 0 ? valor : null;
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
    if (!id || desafio.length < 8 || desafio.length > 2048 || !firma) throw errorDispositivoNoAutorizado();

    const consultar = pool
        ? async (sql, params) => (await consultarConPoolTenant(pool, tenant, sql, params)).rows[0]
        : getQuery;
    let dispositivo;
    try {
        dispositivo = await consultar(`
            SELECT id, tenant_id, clave_publica, estado
            FROM dispositivos_pos
            WHERE tenant_id = $1 AND id = $2
        `, [tenant, id]);
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

    const hashDesafio = crypto.createHash('sha256').update(desafio).digest('hex');
    const limpiar = pool
        ? (sql, params) => consultarConPoolTenant(pool, tenant, sql, params)
        : async (sql, params) => ({ rowCount: (await runQuery(sql, params)).changes });
    await limpiar('DELETE FROM dispositivo_pruebas_usadas WHERE expira_en <= CURRENT_TIMESTAMP', []);
    const prueba = await limpiar(`
        INSERT INTO dispositivo_pruebas_usadas (tenant_id, device_id, hash_desafio, expira_en)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')
        ON CONFLICT DO NOTHING
    `, [tenant, id, hashDesafio]);
    if (!prueba.rowCount) throw errorDispositivoNoAutorizado();

    const sqlActualizacion = `
        UPDATE dispositivos_pos SET ultimo_acceso = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND id = $2 AND estado = 'activo' AND clave_publica = $3
    `;
    const parametros = [tenant, id, dispositivo.clave_publica];
    const cambios = pool
        ? (await consultarConPoolTenant(pool, tenant, sqlActualizacion, parametros)).rowCount
        : (await runQuery(sqlActualizacion, parametros)).changes;
    if (!cambios) throw errorDispositivoNoAutorizado();

    return { id, tenantId: tenant, estado: 'activo' };
}

async function obtenerEstadoDispositivoParaSesion(tenantId, deviceId, pool = null) {
    const tenant = exigirTenantId(tenantId);
    const id = normalizarDeviceId(deviceId);
    if (!id) return false;
    let dispositivo;
    try {
        const sql = `
            SELECT id, tenant_id, estado FROM dispositivos_pos
            WHERE tenant_id = $1 AND id = $2
        `;
        dispositivo = pool
            ? (await consultarConPoolTenant(pool, tenant, sql, [tenant, id])).rows[0]
            : await getQuery(sql, [tenant, id]);
    } catch (_) {
        return false;
    }
    return Boolean(dispositivo && dispositivo.estado === 'activo');
}

/**
 * Variante PostgreSQL. El tenantId y el pool deben provenir del contexto
 * autenticado del servidor; no deben construirse desde el body del request.
 */
async function verificarUsuarioEnTenant(pool, tenantId, nombreUsuario, pin, ip = 'local') {
    return verificarUsuarioPostgres(
        (sql, params) => consultarConPoolTenant(pool, tenantId, sql, params),
        exigirTenantId(tenantId), nombreUsuario, pin, ip
    );
}

async function verificarUsuarioPostgres(consultar, tenant, nombreUsuario, pin, ip) {
    const usuario = String(nombreUsuario || '').trim();
    const claveCuentaIntento = `cuenta:${tenant}:usuario:${usuario.toLowerCase()}`;
    const usaProxy = String(process.env.TRUST_PROXY || '').trim().toLowerCase() === 'true';
    const claveRL = usaProxy ? `ip:${String(ip || 'local').trim().toLowerCase()}` : null;
    if (claveRL) await verificarBloqueoPersistente(consultar, claveRL, MAX_INTENTOS_LOGIN, TIEMPO_BLOQUEO_LOGIN_MS, 'ip');

    const candidato = await consultar(`
        SELECT id, tenant_id, nombre AS nombre_visible, nombre_usuario, rol,
               pin_o_password, puede_registrar_respaldo_fiscal
        FROM usuarios
        WHERE tenant_id = $1
          AND LOWER(nombre_usuario) = LOWER($2)
          AND activo = 1
        LIMIT 1
    `, [tenant, usuario]).then((resultado) => resultado.rows[0]);
    const claveCuenta = claveCuentaIntento;
    await verificarBloqueoPersistente(consultar, claveCuenta, MAX_INTENTOS_CUENTA, TIEMPO_BLOQUEO_CUENTA_MS, 'cuenta', VENTANA_INTENTOS_CUENTA_MS);

    if (!candidato || !(await compararPassword(pin, candidato.pin_o_password))) {
        await registrarFalloPersistente(consultar, claveCuenta, claveRL);
        return undefined;
    }

    await limpiarIntentosPersistentes(consultar, claveCuenta, claveRL);
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
    return insertarUsuarioPostgres(
        async (sql, params) => (await consultarConPoolTenant(pool, tenantId, sql, params)).rows[0],
        exigirTenantId(tenantId), nombreVisible, nombreUsuario, pin, rol
    );
}

async function insertarUsuarioPostgres(consultar, tenant, nombreVisible, nombreUsuario, pin, rol) {
    const visible = String(nombreVisible || '').trim();
    const usuario = String(nombreUsuario || '').trim();
    if (!visible || !usuario) throw new Error('El nombre visible y el usuario son obligatorios.');
    const pinValido = validarPoliticaPin(pin, rol);
    const hashPin = await bcrypt.hash(pinValido, BCRYPT_ROUNDS);

    const creado = await consultar(`
        INSERT INTO usuarios (tenant_id, nombre, nombre_usuario, pin_o_password, rol)
        SELECT $1, $2, LOWER($3), $4, $5
        WHERE NOT EXISTS (
            SELECT 1 FROM usuarios WHERE tenant_id = $1 AND LOWER(nombre_usuario) = LOWER($3)
        )
        ON CONFLICT DO NOTHING
        RETURNING id
    `, [tenant, visible, usuario, hashPin, rol]);
    if (!creado) throw new Error(`Ya existe el usuario "${usuario}" en este negocio.`);
    return creado.id;
}

async function obtenerUsuarioPorIdEnTenant(pool, tenantId, usuarioId) {
    const tenant = exigirTenantId(tenantId);
    const resultado = await consultarConPoolTenant(pool, tenant, `
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

async function verificarBloqueoPersistente(consultar, clave, maxIntentos, bloqueoMs, tipo, ventanaMs = bloqueoMs) {
    const r = (await consultar('SELECT contador, primer_intento, bloqueado_hasta FROM login_intentos WHERE clave = $1', [clave])).rows[0];
    if (!r) return;
    const ahora = Date.now();
    const bloqueadoHasta = r.bloqueado_hasta ? new Date(r.bloqueado_hasta).getTime() : 0;
    const primer = new Date(r.primer_intento).getTime();
    if (bloqueadoHasta > ahora || (!bloqueadoHasta && ahora - primer <= ventanaMs && Number(r.contador) >= maxIntentos)) {
        const segundos = Math.ceil(((bloqueadoHasta || ahora + bloqueoMs) - ahora) / 1000);
        const texto = tipo === 'cuenta' ? 'exceso de intentos fallidos' : `${maxIntentos} intentos fallidos`;
        const error = new Error(`Acceso bloqueado temporalmente por ${texto}. Intenta nuevamente en ${formatearMinutosYSegundos(segundos)} (min:seg).`);
        error.status = 429;
        throw error;
    }
    if ((bloqueadoHasta && bloqueadoHasta <= ahora) || ahora - primer > ventanaMs) {
        await consultar('DELETE FROM login_intentos WHERE clave = $1', [clave]);
    }
}

async function registrarFalloPersistente(consultar, claveCuenta, claveIp) {
    const claves = [claveCuenta, claveIp].filter(Boolean);
    for (const clave of claves) {
        const max = clave.startsWith('ip:') ? MAX_INTENTOS_LOGIN : MAX_INTENTOS_CUENTA;
        const ventana = clave.startsWith('ip:') ? TIEMPO_BLOQUEO_LOGIN_MS : VENTANA_INTENTOS_CUENTA_MS;
        await consultar(`
            INSERT INTO login_intentos (clave, contador, primer_intento, bloqueado_hasta)
            VALUES ($1, 1, CURRENT_TIMESTAMP, NULL)
            ON CONFLICT (clave) DO UPDATE SET
                contador = CASE WHEN login_intentos.primer_intento < CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond') THEN 1 ELSE login_intentos.contador + 1 END,
                primer_intento = CASE WHEN login_intentos.primer_intento < CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond') THEN CURRENT_TIMESTAMP ELSE login_intentos.primer_intento END,
                bloqueado_hasta = CASE WHEN login_intentos.contador + 1 >= $3 THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes' ELSE login_intentos.bloqueado_hasta END
        `, [clave, ventana, max]);
    }
}

async function limpiarIntentosPersistentes(consultar, claveCuenta, claveIp) {
    for (const clave of [claveCuenta, claveIp].filter(Boolean)) await consultar('DELETE FROM login_intentos WHERE clave = $1', [clave]);
}

function obtenerClaveCuenta(candidato, identificadorIntentado) {
    if (candidato && candidato.id) {
        return candidato.tenant_id
            ? `cuenta:${candidato.tenant_id}:${candidato.id}`
            : `cuenta:${candidato.id}`;
    }
    return `intento:${String(identificadorIntentado || 'desconocido').trim().toLowerCase()}`;
}

async function compararPassword(pinPlano, passwordGuardado) {
    const pinStr = String(pinPlano ?? '');
    if (!pinStr || !passwordGuardado) return false;

    if (!esHashBcrypt(passwordGuardado)) return false;
    return await bcrypt.compare(pinStr, passwordGuardado);
}

async function verificarLimitePublicoIp(ip, limite = 60) {
    const clave = `publico:ip:${String(ip || 'local').trim().toLowerCase()}`;
    const r = await getQuery('SELECT contador, bloqueado_hasta FROM login_intentos WHERE clave = $1', [clave]);
    const ahora = Date.now();
    if (r?.bloqueado_hasta && new Date(r.bloqueado_hasta).getTime() > ahora) {
        const error = new Error('Demasiadas consultas públicas. Intenta nuevamente más tarde.');
        error.status = 429;
        throw error;
    }
    await runQuery(`
        INSERT INTO login_intentos (clave, contador, primer_intento, bloqueado_hasta)
        VALUES ($1, 1, CURRENT_TIMESTAMP, NULL)
        ON CONFLICT (clave) DO UPDATE SET
            contador = CASE WHEN login_intentos.primer_intento < CURRENT_TIMESTAMP - INTERVAL '1 minute' THEN 1 ELSE login_intentos.contador + 1 END,
            primer_intento = CASE WHEN login_intentos.primer_intento < CURRENT_TIMESTAMP - INTERVAL '1 minute' THEN CURRENT_TIMESTAMP ELSE login_intentos.primer_intento END,
            bloqueado_hasta = CASE WHEN login_intentos.contador + 1 >= $2 THEN CURRENT_TIMESTAMP + INTERVAL '1 minute' ELSE login_intentos.bloqueado_hasta END
    `, [clave, limite]);
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
    const consultar = async (sql, params) => {
        if (/^\s*SELECT/i.test(sql)) {
            const rows = await allQuery(sql, params);
            return { rows, rowCount: rows.length };
        }
        const resultado = await runQuery(sql, params);
        return { rows: [], rowCount: resultado.changes };
    };
    return verificarUsuarioPostgres(consultar, obtenerTenantId(), nombre, pin, ip);
}

async function autenticarUsuarioPorId(usuarioId, pin, nombreUsuario = null, ip = 'local') {
    const tenant = obtenerTenantId();
    if (String(nombreUsuario || '').trim()) {
        const usuario = await verificarUsuario(nombreUsuario, pin, ip);
        if (!usuario) throw new Error('Credenciales incorrectas o usuario inactivo.');
        return usuario;
    }

    const candidato = await getQuery(
        `SELECT id, nombre_usuario
         FROM usuarios WHERE id = $1 AND activo = 1 AND tenant_id = $2`,
        [usuarioId, tenant]
    );
    if (!candidato) throw new Error('Credenciales incorrectas o usuario inactivo.');
    const usuario = await verificarUsuario(candidato.nombre_usuario, pin, ip);
    if (!usuario || Number(usuario.id) !== Number(usuarioId)) throw new Error('Credenciales incorrectas o usuario inactivo.');
    return usuario;
}

async function obtenerUsuarioPorId(id) {
    const tenant = obtenerTenantId();
    return await getQuery(
        `SELECT id, nombre, rol, COALESCE(puede_registrar_respaldo_fiscal, 1) as puede_registrar_respaldo_fiscal
         FROM usuarios WHERE id = $1 AND activo = 1 AND tenant_id = $2`,
        [id, tenant]
    );
}

async function obtenerUsuarios() {
    const tenant = obtenerTenantId();
    // El rol 'developer' es estrictamente invisible para todos los roles en listados y selectores
    return await allQuery(
        `SELECT id, nombre, rol, COALESCE(puede_registrar_respaldo_fiscal, 1) as puede_registrar_respaldo_fiscal
         FROM usuarios WHERE activo = 1 AND rol != 'developer' AND tenant_id = $1
         ORDER BY CASE rol WHEN 'propietario' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, id ASC`,
        [tenant]
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
    await actualizarUsuario('puede_registrar_respaldo_fiscal', habilitado ? 1 : 0, idNum);
    return true;
}

// Lista pública mínima para el selector de login de /caja: solo cajeros activos, sin rol.
async function obtenerCajerosParaLogin() {
    return allQuery(
        `SELECT id, nombre, nombre_usuario AS "nombreUsuario"
         FROM usuarios WHERE activo = 1 AND rol = 'user' AND tenant_id = $1
         ORDER BY LOWER(nombre) ASC, id ASC`,
        [obtenerTenantId()]
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
    const tenant = obtenerTenantId();
    return enTransaccion(() => insertarUsuarioPostgres(getQuery, tenant, nombre, nombre, pin, rol));
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
    const res = await actualizarUsuario('activo', 0, usuarioABorrarId);
    return res.changes > 0;
}

async function actualizarUsuario(campo, valor, id) {
    const tenant = obtenerTenantId();
    return enTransaccion(() => runQuery(
        `UPDATE usuarios SET ${campo} = $1 WHERE id = $2 AND tenant_id = $3`,
        [valor, id, tenant]
    ));
}

async function cambiarPasswordConPermiso(ejecutorId, usuarioObjetivoId, nuevoPin, pinActual = null) {
    if (!nuevoPin || String(nuevoPin).trim() === '') {
        throw new Error('La nueva contraseña / PIN no puede estar vacía.');
    }

    const tenant = obtenerTenantId();
    const ejecutor = await getQuery(
        `SELECT id, nombre, rol, pin_o_password FROM usuarios
         WHERE id = $1 AND activo = 1 AND tenant_id = $2`,
        [ejecutorId, tenant]
    );
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
        await actualizarUsuario('pin_o_password', nuevoHash, usuarioObjetivoId);
        return true;
    }

    // Caso 2: Cambiar la contraseña/PIN a otro usuario (requiere ser superior jerárquico)
    if (!esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: un cajero no puede cambiar la contraseña de otros usuarios.');
    }

    if (NIVEL_ROL[ejecutor.rol] <= NIVEL_ROL[objetivo.rol]) {
        throw new Error(`Jerarquía insuficiente: un ${ejecutor.rol} no puede cambiar la contraseña de otro ${objetivo.rol} ni de un superior.`);
    }

    await actualizarUsuario('pin_o_password', nuevoHash, usuarioObjetivoId);
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
    verificarLimitePublicoIp,
    crearUsuarioEnTenant,
    obtenerUsuarioPorIdEnTenant
};
