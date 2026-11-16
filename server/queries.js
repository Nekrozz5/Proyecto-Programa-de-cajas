const db = require('../database/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { obtenerSetupTokenValido } = require('./secretos');

const BCRYPT_ROUNDS = 10;
const MAX_INTENTOS_LOGIN = 5;
const TIEMPO_BLOQUEO_LOGIN_MS = 15 * 60 * 1000; // 15 minutos
const intentosFallidosLogin = new Map();

// Segundo contador por cuenta (sin IP): evita que rotar la IP permita fuerza bruta ilimitada.
// 20 intentos fallidos dentro de una ventana de 15 minutos bloquean la cuenta 15 minutos.
// El bloqueo expira solo (no se reinicia con un login correcto mientras dure la ventana).
const MAX_INTENTOS_CUENTA = 20;
const VENTANA_INTENTOS_CUENTA_MS = 15 * 60 * 1000;
const TIEMPO_BLOQUEO_CUENTA_MS = 15 * 60 * 1000;
const intentosFallidosCuenta = new Map();

// Límite de entradas en memoria para que nombres de usuario aleatorios no hagan crecer los mapas sin control
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

// Clave del contador por cuenta: la cuenta real si existe (unifica login por id y por nombre);
// si no existe, el identificador intentado normalizado.
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

    // Bloqueo vencido o ventana de conteo vencida: el registro expira solo
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

// Registra el fallo en ambos contadores. El contador por cuenta se actualiza primero
// porque el de IP lanza la excepción de bloqueo al alcanzar su límite.
function registrarFalloLogin(claveIp, claveCuenta) {
    registrarIntentoFallidoCuenta(claveCuenta);
    registrarIntentoFallidoLogin(claveIp);
}

async function compararYActualizarPassword(pinPlano, passwordGuardado, usuarioId = null) {
    const pinStr = String(pinPlano ?? '');
    if (!pinStr || !passwordGuardado) return false;

    if (esHashBcrypt(passwordGuardado)) {
        return await bcrypt.compare(pinStr, passwordGuardado);
    }

    // Respaldo de transición por si algún registro aún estuviera en texto plano
    if (pinStr === String(passwordGuardado)) {
        if (usuarioId) {
            const nuevoHash = await bcrypt.hash(pinStr, BCRYPT_ROUNDS);
            await runQuery(`UPDATE usuarios SET pin_o_password = ? WHERE id = ?`, [nuevoHash, usuarioId]);
        }
        return true;
    }
    return false;
}

// ==========================================
// HELPERS INTERNOS PARA ASYNC / AWAIT
// ==========================================
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// ==========================================
// HELPERS DE VALIDACIÓN Y REDONDEO FINANCIERO
// ==========================================
function redondear2(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

function numeroPositivo(valor, nombreCampo = 'El valor') {
    if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') {
        throw new Error(`${nombreCampo} debe ser un número finito mayor a 0.`);
    }
    const num = Number(valor);
    if (!Number.isFinite(num) || num <= 0) {
        throw new Error(`${nombreCampo} debe ser un número finito mayor a 0.`);
    }
    return num;
}

function numeroNoNegativo(valor, nombreCampo = 'El valor') {
    if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') {
        throw new Error(`${nombreCampo} debe ser un número finito mayor o igual a 0.`);
    }
    const num = Number(valor);
    if (!Number.isFinite(num) || num < 0) {
        throw new Error(`${nombreCampo} debe ser un número finito mayor o igual a 0.`);
    }
    return num;
}

// Helper para serializar transacciones en la conexión única de SQLite
let colaTransaccion = Promise.resolve();
async function enTransaccion(fn) {
    const anterior = colaTransaccion;
    let liberar;
    colaTransaccion = new Promise((resolve) => { liberar = resolve; });
    await anterior;
    await runQuery('BEGIN IMMEDIATE');
    try {
        const resultado = await fn();
        await runQuery('COMMIT');
        return resultado;
    } catch (err) {
        await runQuery('ROLLBACK').catch((rollbackErr) => {
            console.error('Error durante ROLLBACK de transacción:', rollbackErr.message);
        });
        throw err;
    } finally {
        liberar();
    }
}

// ==========================================
// 1. USUARIOS, ROLES JERÁRQUICOS Y PERMISOS
// ==========================================
const NIVEL_ROL = {
    user: 1,
    admin: 2,
    superadmin: 3,
    developer: 4
};

function esRolAdministrativo(rol) {
    return rol === 'admin' || rol === 'superadmin' || rol === 'developer';
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

    const coincide = await compararYActualizarPassword(pin, candidato.pin_o_password, candidato.id);
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

    const coincide = await compararYActualizarPassword(pin, candidato.pin_o_password, candidato.id);
    if (!coincide) {
        registrarFalloLogin(claveRL, claveCuenta);
        throw new Error('Credenciales incorrectas o usuario inactivo.');
    }

    limpiarIntentosLogin(claveRL);
    return { id: candidato.id, nombre: candidato.nombre, rol: candidato.rol };
}

async function obtenerUsuarioPorId(id) {
    return await getQuery(`SELECT id, nombre, rol FROM usuarios WHERE id = ? AND activo = 1`, [id]);
}

async function obtenerUsuarios() {
    // El rol 'developer' es estrictamente invisible para todos los roles en listados y selectores
    return await allQuery(
        `SELECT id, nombre, rol FROM usuarios WHERE activo = 1 AND rol != 'developer'
         ORDER BY CASE rol WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, id ASC`
    );
}

// Lista pública mínima para el selector de login de /caja: solo cajeros activos, sin rol.
// Las cuentas privilegiadas (admin/superadmin/developer) nunca se exponen sin sesión.
async function obtenerCajerosParaLogin() {
    return await allQuery(
        `SELECT id, nombre FROM usuarios WHERE activo = 1 AND rol = 'user' ORDER BY nombre COLLATE NOCASE ASC, id ASC`
    );
}

// El sistema está instalado cuando la configuración está marcada y existe al menos un usuario de negocio activo
async function sistemaEstaInstalado(configuracion = null) {
    const config = configuracion || await obtenerConfiguracionNegocio();
    if (!config || Number(config.configurado) !== 1) return false;
    const fila = await getQuery(`SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1 AND rol != 'developer'`);
    return Number(fila?.total || 0) > 0;
}

// Política mínima de contraseña / PIN según rol.
// Solo se aplica al crear usuarios o cambiar claves; no afecta hashes existentes ni el login.
const LONGITUD_MINIMA_PIN_POR_ROL = {
    user: 4,
    admin: 8,
    superadmin: 8,
    developer: 8
};

function validarPoliticaPin(pin, rol) {
    const pinStr = String(pin ?? '').trim();
    const minimo = LONGITUD_MINIMA_PIN_POR_ROL[rol] || 8;
    if (pinStr.length < minimo) {
        const etiqueta = rol === 'user'
            ? 'el PIN de un Cajero'
            : `la contraseña de un perfil ${rol === 'superadmin' ? 'Super Admin' : rol === 'developer' ? 'Developer' : 'Administrador'}`;
        throw new Error(`Contraseña / PIN demasiado corto: ${etiqueta} debe tener al menos ${minimo} caracteres.`);
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
    // Siempre se hashea el valor recibido: no se aceptan hashes bcrypt pre-armados como PIN
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
        throw new Error('Permiso denegado: solo un Administrador, Super Admin o Developer puede registrar usuarios.');
    }
    if (!['superadmin', 'admin', 'user'].includes(nuevoRol)) {
        throw new Error("Rol inválido. Debe ser 'user', 'admin' o 'superadmin'.");
    }
    if (NIVEL_ROL[ejecutor.rol] <= NIVEL_ROL[nuevoRol]) {
        if (nuevoRol === 'superadmin') {
            throw new Error('Permiso denegado: solo el rol Developer puede crear cuentas de Super Admin.');
        }
        if (ejecutor.rol === 'admin') {
            throw new Error("Permiso denegado: un Administrador solo puede crear usuarios de rango inferior (Cajeros). Solo el Super Admin o Developer puede crear otros Administradores.");
        }
        throw new Error(`Permiso denegado: tu rol (${ejecutor.rol}) solo puede crear usuarios de rango estrictamente inferior.`);
    }
    return await crearUsuario(nuevoNombre, pin, nuevoRol);
}

async function borrarUsuarioConPermiso(adminId, usuarioABorrarId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador o Super Admin puede eliminar usuarios.');
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

    // La política se evalúa según el rol del usuario cuya clave se cambia
    const nuevoPinValido = validarPoliticaPin(nuevoPin, objetivo.rol);
    const nuevoHash = await bcrypt.hash(nuevoPinValido, BCRYPT_ROUNDS);

    // Caso 1: El usuario cambia su propia contraseña/PIN (pinActual es OBLIGATORIO)
    if (Number(ejecutorId) === Number(usuarioObjetivoId)) {
        if (pinActual === null || pinActual === undefined || String(pinActual).trim() === '') {
            throw new Error('Debes ingresar tu contraseña / PIN actual para cambiar tu propia clave.');
        }
        const coincide = await compararYActualizarPassword(String(pinActual), ejecutor.pin_o_password, ejecutor.id);
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

// ==========================================
// 1.5 CONFIGURACIÓN DE MODALIDAD DEL NEGOCIO (PRIMERA EJECUCIÓN)
// ==========================================
async function obtenerConfiguracionNegocio() {
    let config = await getQuery(`SELECT * FROM configuracion_negocio WHERE id = 1`);
    if (!config) {
        await runQuery(
            `INSERT INTO configuracion_negocio (id, nombre_negocio, modalidad_nombre, usa_stock_directo, usa_vencimiento, usa_recetas_ensamblaje, configurado)
             VALUES (1, 'Mi Negocio', 'Venta Directa No Perecedera', 1, 0, 0, 0)`
        );
        config = await getQuery(`SELECT * FROM configuracion_negocio WHERE id = 1`);
    }
    return config;
}

async function guardarConfiguracionNegocio(adminId, config) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || ejecutor.rol !== 'developer') {
        throw new Error('Permiso denegado: solo el rol Developer puede modificar la modalidad del negocio.');
    }

    await runQuery(
        `UPDATE configuracion_negocio
         SET nombre_negocio = ?,
             modalidad_nombre = ?,
             usa_stock_directo = ?,
             usa_vencimiento = ?,
             usa_recetas_ensamblaje = ?,
             configurado = 1
         WHERE id = 1`,
        [
            (config.nombreNegocio || 'Mi Negocio').trim(),
            config.modalidadNombre || 'Personalizado',
            config.usaStockDirecto ? 1 : 0,
            config.usaVencimiento ? 1 : 0,
            config.usaRecetasEnsamblaje ? 1 : 0
        ]
    );
    return await obtenerConfiguracionNegocio();
}

// Valida el token de instalación (SETUP_TOKEN) con comparación en tiempo constante.
// - Producción: SETUP_TOKEN es obligatorio; si no está definido, la instalación se rechaza.
// - Desarrollo: si SETUP_TOKEN está definido se exige; si no, se permite con aviso en consola.
function validarTokenInstalacion(tokenRecibido) {
    // Un SETUP_TOKEN con el valor de ejemplo de .env.production.example se trata como no definido
    const esperado = obtenerSetupTokenValido();

    if (!esperado) {
        if (process.env.NODE_ENV === 'production') {
            const err = new Error('Instalación deshabilitada: el servidor no tiene definida la variable SETUP_TOKEN (o conserva el valor de ejemplo). Configúrala en el archivo .env de producción y reinicia el servicio.');
            err.status = 403;
            throw err;
        }
        console.warn('[Seguridad] SETUP_TOKEN no está definido: instalación inicial permitida sin token (solo en desarrollo).');
        return;
    }

    const recibido = String(tokenRecibido || '').trim();
    // Se comparan los resúmenes SHA-256 para que ambos buffers tengan la misma longitud
    // (timingSafeEqual exige longitudes iguales) sin filtrar el largo del token real.
    const hashEsperado = crypto.createHash('sha256').update(esperado, 'utf8').digest();
    const hashRecibido = crypto.createHash('sha256').update(recibido, 'utf8').digest();
    if (!recibido || !crypto.timingSafeEqual(hashEsperado, hashRecibido)) {
        const err = new Error('Token de instalación inválido o ausente.');
        err.status = 403;
        throw err;
    }
}

async function inicializarSistemaPrimeraVez(datos = {}) {
    validarTokenInstalacion(datos.setupToken);

    if (!datos.nombreNegocio || !String(datos.nombreNegocio).trim()) {
        throw new Error('Debes ingresar el nombre de la empresa o negocio.');
    }

    // Asegura que exista la fila singleton antes de abrir la transacción
    await obtenerConfiguracionNegocio();

    // Comprobación de estado, marcado como configurado y creación del Super Admin en una sola transacción
    const superAdminId = await enTransaccion(async () => {
        const configActual = await getQuery(`SELECT configurado FROM configuracion_negocio WHERE id = 1`);
        const usuariosExistentes = await obtenerUsuarios();

        if (Number(configActual.configurado) === 1 && usuariosExistentes.length > 0) {
            throw new Error('El sistema ya fue inicializado previamente.');
        }

        await runQuery(
            `UPDATE configuracion_negocio
             SET nombre_negocio = ?,
                 modalidad_nombre = ?,
                 usa_stock_directo = ?,
                 usa_vencimiento = ?,
                 usa_recetas_ensamblaje = ?,
                 configurado = 1
             WHERE id = 1`,
            [
                String(datos.nombreNegocio).trim(),
                datos.modalidadNombre || 'Venta Directa No Perecedera',
                datos.usaStockDirecto ? 1 : 0,
                datos.usaVencimiento ? 1 : 0,
                datos.usaRecetasEnsamblaje ? 1 : 0
            ]
        );

        if (usuariosExistentes.length > 0) {
            return usuariosExistentes[0].id;
        }

        if (!datos.adminNombre || !String(datos.adminNombre).trim() || !datos.adminPin || !String(datos.adminPin).trim()) {
            throw new Error('Debes ingresar el nombre y PIN/contraseña para crear el primer Super Admin.');
        }
        return await crearUsuario(String(datos.adminNombre).trim(), String(datos.adminPin).trim(), 'superadmin');
    });

    return {
        configuracionNegocio: await obtenerConfiguracionNegocio(),
        superAdminId
    };
}

// ==========================================
// 2. INSUMOS (MATERIA PRIMA) Y RECETAS (ESCANDALLO / BOM)
// ==========================================
async function crearInsumo(nombre, unidadMedida, stockInicial = 0, costoPorUnidad = 0, stockSeguridad = 0, tiempoEntregaDias = 1, fechaVencimiento = null, proveedor = null) {
    if (!nombre || String(nombre).trim() === '') {
        throw new Error('El nombre del insumo es obligatorio.');
    }
    const stockInicialValidado = redondear2(numeroNoNegativo(stockInicial ?? 0, 'El stock inicial del insumo'));
    const costoPorUnidadValidado = redondear2(numeroNoNegativo(costoPorUnidad ?? 0, 'El costo por unidad del insumo'));
    const stockSeguridadValidado = redondear2(numeroNoNegativo(stockSeguridad ?? 0, 'El stock de seguridad'));
    const tiempoEntregaValidado = numeroNoNegativo(tiempoEntregaDias ?? 1, 'El tiempo de entrega en días');

    const res = await runQuery(
        `INSERT INTO insumos (nombre, unidad_medida, stock_actual, costo_por_unidad, stock_seguridad, tiempo_entrega_dias, fecha_vencimiento)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [nombre.trim(), unidadMedida || 'unidades', stockInicialValidado, costoPorUnidadValidado, stockSeguridadValidado, tiempoEntregaValidado, fechaVencimiento || null]
    );
    const insumoId = res.lastID;

    if (stockInicialValidado > 0) {
        const motivoInicial = proveedor && String(proveedor).trim() !== ''
            ? `Inventario inicial (Proveedor: ${String(proveedor).trim()})`
            : 'Inventario inicial';
        await runQuery(
            `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
             VALUES (?, 'compra', ?, ?, ?)`,
            [insumoId, stockInicialValidado, costoPorUnidadValidado, motivoInicial]
        );
    }
    return insumoId;
}

async function obtenerInsumos() {
    return await allQuery(`SELECT * FROM insumos WHERE activo = 1 ORDER BY nombre`);
}

// Recalcula el costo de un producto sumando el costo de todos los ingredientes de su receta
async function recalcularCostoProductoPorReceta(productoId) {
    const calculo = await getQuery(
        `SELECT COALESCE(SUM(r.cantidad_requerida * i.costo_por_unidad), 0) as nuevo_costo
         FROM recetas r
         INNER JOIN insumos i ON r.insumo_id = i.id
         WHERE r.producto_id = ?`,
        [productoId]
    );
    const costoActualizado = Number((calculo.nuevo_costo || 0).toFixed(4));
    await runQuery(`UPDATE productos SET costo = ? WHERE id = ?`, [costoActualizado, productoId]);
    await recalcularCostoCombosQueContienenProducto(productoId);
    return costoActualizado;
}

// Recalcula el costo de un combo sumando el costo de sus componentes
async function recalcularCostoCombo(comboId) {
    const calculo = await getQuery(
        `SELECT COALESCE(SUM(cc.cantidad * p.costo), 0) as nuevo_costo
         FROM combo_componentes cc
         INNER JOIN productos p ON cc.componente_producto_id = p.id
         WHERE cc.combo_producto_id = ?`,
        [comboId]
    );
    const costoActualizado = Number((calculo.nuevo_costo || 0).toFixed(4));
    await runQuery(`UPDATE productos SET costo = ? WHERE id = ?`, [costoActualizado, comboId]);
    return costoActualizado;
}

async function recalcularCostoCombosQueContienenProducto(productoId) {
    const combosAfectados = await allQuery(
        `SELECT DISTINCT combo_producto_id FROM combo_componentes WHERE componente_producto_id = ?`,
        [productoId]
    );
    for (const c of combosAfectados) {
        await recalcularCostoCombo(c.combo_producto_id);
    }
}

// Compra de insumo con Costo Promedio Ponderado (CPP) y actualización en cascada de recetas
async function registrarCompraInsumo(insumoId, cantidadComprada, costoTotalCompra, motivo = 'Compra a proveedor', distribuidora = null) {
    const cantValidada = numeroPositivo(cantidadComprada, 'La cantidad comprada');
    const costoValidado = redondear2(numeroNoNegativo(costoTotalCompra, 'El costo total de compra'));

    const insumo = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
    if (!insumo) throw new Error('Insumo no encontrado.');

    const stockAnterior = Math.max(0, insumo.stock_actual);
    const valorAnterior = stockAnterior * insumo.costo_por_unidad;
    const nuevoStock = insumo.stock_actual + cantValidada;

    // Fórmula de Costo Promedio Ponderado (NIC 2)
    const nuevoCostoUnitario = nuevoStock > 0
        ? (valorAnterior + costoValidado) / (stockAnterior + cantValidada)
        : (costoValidado / cantValidada);

    await runQuery(
        `UPDATE insumos SET stock_actual = ?, costo_por_unidad = ? WHERE id = ?`,
        [Number(nuevoStock.toFixed(4)), Number(nuevoCostoUnitario.toFixed(4)), insumoId]
    );

    const motivoFinal = distribuidora && String(distribuidora).trim() !== ''
        ? `Compra a distribuidora: ${String(distribuidora).trim()}`
        : (motivo || 'Compra a proveedor');

    await runQuery(
        `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
         VALUES (?, 'compra', ?, ?, ?)`,
        [insumoId, cantValidada, Number((costoValidado / cantValidada).toFixed(4)), motivoFinal]
    );

    // Actualizar en cascada el costo de todos los productos que usan este insumo
    const productosAfectados = await allQuery(`SELECT DISTINCT producto_id FROM recetas WHERE insumo_id = ?`, [insumoId]);
    for (const prod of productosAfectados) {
        await recalcularCostoProductoPorReceta(prod.producto_id);
    }

    return {
        insumoId,
        nuevoStock: Number(nuevoStock.toFixed(4)),
        nuevoCostoUnitario: Number(nuevoCostoUnitario.toFixed(4))
    };
}

// Registrar merma o desperdicio físico (leche cortada, recorte de madera dañado, etc.)
async function registrarMermaInsumo(insumoId, cantidadPerdida, motivo) {
    const cantValidada = numeroPositivo(cantidadPerdida, 'La cantidad de merma');
    if (!motivo || motivo.trim() === '') {
        throw new Error('Debes especificar el motivo de la merma (ej. Leche derramada, corte defectuoso).');
    }

    return await enTransaccion(async () => {
        const insumo = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
        if (!insumo) throw new Error('Insumo no encontrado.');

        const r = await runQuery(
            `UPDATE insumos SET stock_actual = ROUND(stock_actual - ?, 4) WHERE id = ? AND stock_actual >= ?`,
            [cantValidada, insumoId, cantValidada]
        );
        if (r.changes === 0) {
            throw new Error(`Stock insuficiente para descontar ${cantValidada} ${insumo.unidad_medida} de ${insumo.nombre}. Stock actual: ${insumo.stock_actual}`);
        }

        const insumoActualizado = await getQuery(`SELECT stock_actual FROM insumos WHERE id = ?`, [insumoId]);
        const nuevoStock = insumoActualizado ? insumoActualizado.stock_actual : Number((insumo.stock_actual - cantValidada).toFixed(4));

        await runQuery(
            `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
             VALUES (?, 'merma', ?, ?, ?)`,
            [insumoId, cantValidada, insumo.costo_por_unidad, motivo.trim()]
        );

        return {
            insumoId,
            stockRestante: nuevoStock,
            costoPerdida: redondear2(cantValidada * insumo.costo_por_unidad)
        };
    });
}

// Tabla de factores de conversión métrica para recetas y almacén
const FACTORES_CONVERSION_METRICA = {
    // Masa (base: gramos)
    kilos: { familia: 'masa', factorBase: 1000 },
    kg: { familia: 'masa', factorBase: 1000 },
    gramos: { familia: 'masa', factorBase: 1 },
    g: { familia: 'masa', factorBase: 1 },
    miligramos: { familia: 'masa', factorBase: 0.001 },
    mg: { familia: 'masa', factorBase: 0.001 },
    // Volumen (base: mililitros)
    litros: { familia: 'volumen', factorBase: 1000 },
    l: { familia: 'volumen', factorBase: 1000 },
    mililitros: { familia: 'volumen', factorBase: 1 },
    ml: { familia: 'volumen', factorBase: 1 },
    // Longitud (base: centímetros)
    metros: { familia: 'longitud', factorBase: 100 },
    m: { familia: 'longitud', factorBase: 100 },
    centimetros: { familia: 'longitud', factorBase: 1 },
    cm: { familia: 'longitud', factorBase: 1 },
    // Conteo directo
    unidades: { familia: 'conteo', factorBase: 1 }
};

function convertirCantidadMedida(cantidad, unidadOrigen, unidadDestino) {
    const num = Number(cantidad);
    if (!unidadOrigen || !unidadDestino) return num;
    const uOrig = String(unidadOrigen).trim().toLowerCase();
    const uDest = String(unidadDestino).trim().toLowerCase();
    if (uOrig === uDest) return num;

    const infoOrig = FACTORES_CONVERSION_METRICA[uOrig];
    const infoDest = FACTORES_CONVERSION_METRICA[uDest];

    if (!infoOrig || !infoDest || infoOrig.familia !== infoDest.familia) {
        throw new Error(`No se puede convertir de "${unidadOrigen}" a "${unidadDestino}" porque pertenecen a sistemas de medida distintos.`);
    }

    const cantidadEnBase = num * infoOrig.factorBase;
    const cantidadConvertida = cantidadEnBase / infoDest.factorBase;
    return Number(cantidadConvertida.toFixed(6));
}

// Asignar un insumo a la receta de un producto (con conversión automática a la unidad del almacén, ej. 300 gramos -> 0.3 kilos)
async function asignarIngredienteReceta(productoId, insumoId, cantidadRequerida, unidadReceta = null) {
    const cantValidada = numeroPositivo(cantidadRequerida, 'La cantidad en la receta');

    const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [productoId]);
    if (!prod) throw new Error('Producto no encontrado o inactivo.');

    if (prod.tipo_inventario === 'directo' && Number(prod.stock) > 0) {
        throw new Error(
            `No se puede convertir el producto "${prod.nombre}" a modalidad de receta porque es de inventario directo y aún tiene ${prod.stock} ${prod.unidad_medida || 'unidades'} en stock. Primero debe quedar con stock en 0 o debes crear un producto nuevo para manejarlo por receta.`
        );
    }

    const insumo = await getQuery(`SELECT * FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
    if (!insumo) throw new Error('Insumo no encontrado.');

    const cantidadConvertidaAlmacen = unidadReceta
        ? convertirCantidadMedida(cantValidada, unidadReceta, insumo.unidad_medida)
        : cantValidada;

    await runQuery(
        `INSERT INTO recetas (producto_id, insumo_id, cantidad_requerida)
         VALUES (?, ?, ?)
         ON CONFLICT(producto_id, insumo_id) DO UPDATE SET cantidad_requerida = excluded.cantidad_requerida`,
        [productoId, insumoId, cantidadConvertidaAlmacen]
    );

    // Cambiar automáticamente el producto a modalidad 'receta'
    await runQuery(`UPDATE productos SET tipo_inventario = 'receta', stock = NULL WHERE id = ?`, [productoId]);

    // Actualizar el costo del producto según su nueva receta
    const nuevoCosto = await recalcularCostoProductoPorReceta(productoId);
    return {
        productoId,
        insumoId,
        cantidadRequerida: cantidadConvertidaAlmacen,
        unidadAlmacen: insumo.unidad_medida,
        nuevoCostoProducto: nuevoCosto
    };
}

// Calcula cuántos productos se pueden fabricar hoy según el insumo más escaso (Cuello de botella)
async function calcularDisponibilidadProducto(productoId) {
    const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [productoId]);
    if (!prod) throw new Error('Producto no encontrado.');

    if (prod.tipo_inventario === 'libre') {
        return { producto: prod.nombre, tipo: 'libre', disponibles: Infinity };
    }
    if (prod.tipo_inventario === 'directo') {
        return { producto: prod.nombre, tipo: 'directo', disponibles: Math.floor(prod.stock || 0) };
    }

    const ingredientes = await allQuery(
        `SELECT r.cantidad_requerida, i.nombre as insumo_nombre, i.stock_actual, i.unidad_medida
         FROM recetas r
         INNER JOIN insumos i ON r.insumo_id = i.id
         WHERE r.producto_id = ?`,
        [productoId]
    );

    if (ingredientes.length === 0) {
        return { producto: prod.nombre, tipo: 'receta_vacia', disponibles: 0 };
    }

    let maximoPosible = Infinity;
    let insumoLimitante = null;

    for (const ing of ingredientes) {
        const alcanzables = Math.floor(ing.stock_actual / ing.cantidad_requerida);
        if (alcanzables < maximoPosible) {
            maximoPosible = alcanzables;
            insumoLimitante = `${ing.insumo_nombre} (${ing.stock_actual} ${ing.unidad_medida} disponibles)`;
        }
    }

    return {
        producto: prod.nombre,
        tipo: 'receta',
        disponibles: Math.max(0, maximoPosible),
        insumoLimitante
    };
}

// ==========================================
// 3. PRODUCTOS DEL CATÁLOGO Y CATEGORÍAS
// ==========================================
async function obtenerCategorias() {
    return await allQuery(`SELECT id, nombre FROM categorias WHERE activo = 1 ORDER BY nombre ASC`);
}

async function crearCategoria(nombre) {
    if (!nombre || String(nombre).trim() === '') {
        throw new Error('El nombre de la categoría es obligatorio.');
    }
    const nombreLimpio = String(nombre).trim();
    if (nombreLimpio.toLowerCase() === 'todas') {
        throw new Error('"Todas" es una vista general del sistema y no puede usarse como nombre de categoría.');
    }
    await runQuery(`INSERT OR IGNORE INTO categorias (nombre, activo) VALUES (?, 1)`, [nombreLimpio]);
    const cat = await getQuery(`SELECT id, nombre FROM categorias WHERE LOWER(nombre) = LOWER(?) AND activo = 1`, [nombreLimpio]);
    return cat || { id: null, nombre: nombreLimpio };
}

async function crearProductoConInsumos({
    nombre,
    precio,
    categoria = '',
    categorias = [],
    tipoComposicion = 'unitario',
    insumoUnitarioId = null,
    insumosReceta = []
}) {
    if (!nombre || String(nombre).trim() === '') {
        throw new Error('El nombre del producto es obligatorio.');
    }
    const precioValidado = redondear2(numeroPositivo(precio, 'El precio del producto'));

    // Normalizar categorías múltiples: puede venir como array o string separado por comas
    let listaCategorias = [];
    if (Array.isArray(categorias) && categorias.length > 0) {
        listaCategorias = categorias;
    } else if (Array.isArray(categoria)) {
        listaCategorias = categoria;
    } else if (typeof categoria === 'string' && categoria.trim() !== '') {
        listaCategorias = categoria.split(',').map((c) => c.trim()).filter(Boolean);
    }

    // Filtrar vacíos y la palabra reservada 'todas'
    listaCategorias = listaCategorias
        .map((c) => String(c).trim())
        .filter((c) => c !== '' && c.toLowerCase() !== 'todas');

    // Desduplicar manteniendo el primer case encontrado
    const catsUnicas = [];
    const seenCats = new Set();
    for (const c of listaCategorias) {
        if (!seenCats.has(c.toLowerCase())) {
            seenCats.add(c.toLowerCase());
            catsUnicas.push(c);
        }
    }

    const catFinal = catsUnicas.join(', ');

    return await enTransaccion(async () => {
        // Asegurar que cada categoría seleccionada exista en la tabla categorias
        for (const c of catsUnicas) {
            await runQuery(`INSERT OR IGNORE INTO categorias (nombre, activo) VALUES (?, 1)`, [c]);
        }

        if (tipoComposicion === 'unitario') {
            if (!insumoUnitarioId) {
                throw new Error('Debes seleccionar el insumo del inventario para la venta unitaria.');
            }
            const insumo = await getQuery(`SELECT id, nombre, costo_por_unidad, unidad_medida FROM insumos WHERE id = ? AND activo = 1`, [insumoUnitarioId]);
            if (!insumo) {
                throw new Error('El insumo seleccionado para el producto unitario no existe o está inactivo.');
            }
            const costoInicial = Number(insumo.costo_por_unidad || 0);

            const resProd = await runQuery(
                `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
                 VALUES (?, ?, ?, ?, 'unidades', 'receta', NULL, 0, NULL)`,
                [nombre.trim(), precioValidado, costoInicial, catFinal]
            );
            const productoId = resProd.lastID;

            // Relación 1 a 1: 1 unidad del insumo
            await runQuery(
                `INSERT INTO recetas (producto_id, insumo_id, cantidad_requerida) VALUES (?, ?, 1)`,
                [productoId, insumo.id]
            );

            await recalcularCostoProductoPorReceta(productoId);
            return { id: productoId, nombre: nombre.trim(), precio: precioValidado, costo: costoInicial, categoria: catFinal };

        } else if (tipoComposicion === 'receta') {
            if (!Array.isArray(insumosReceta) || insumosReceta.length === 0) {
                throw new Error('Debes agregar al menos un insumo para la receta o ensamblaje.');
            }
            if (insumosReceta.length > 30) {
                throw new Error('Límite excedido: No se pueden agregar más de 30 insumos en una sola receta.');
            }

            const resProd = await runQuery(
                `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
                 VALUES (?, ?, 0, ?, 'unidades', 'receta', NULL, 0, NULL)`,
                [nombre.trim(), precioValidado, catFinal]
            );
            const productoId = resProd.lastID;

            const insumosUnicos = new Set();
            for (const ing of insumosReceta) {
                if (!ing || !ing.insumoId) continue;
                const insumoId = Number(ing.insumoId);
                if (insumosUnicos.has(insumoId)) {
                    throw new Error(`El insumo ID ${insumoId} está duplicado en la receta.`);
                }
                insumosUnicos.add(insumoId);

                const insumo = await getQuery(`SELECT id, nombre, unidad_medida FROM insumos WHERE id = ? AND activo = 1`, [insumoId]);
                if (!insumo) throw new Error(`El insumo con ID ${insumoId} no existe.`);

                const cantVal = numeroPositivo(ing.cantidad, `La cantidad del insumo ${insumo.nombre}`);
                const cantidadConvertidaAlmacen = ing.unidadReceta
                    ? convertirCantidadMedida(cantVal, ing.unidadReceta, insumo.unidad_medida)
                    : cantVal;

                await runQuery(
                    `INSERT INTO recetas (producto_id, insumo_id, cantidad_requerida) VALUES (?, ?, ?)`,
                    [productoId, insumoId, cantidadConvertidaAlmacen]
                );
            }

            const costoFinal = await recalcularCostoProductoPorReceta(productoId);
            return { id: productoId, nombre: nombre.trim(), precio: precioValidado, costo: costoFinal, categoria: catFinal };

        } else if (tipoComposicion === 'combo') {
            const componentes = Array.isArray(arguments[0].componentesCombo) ? arguments[0].componentesCombo : [];
            const componentesLimpios = componentes.filter((c) => c && c.productoId && Number(c.cantidad) > 0);
            if (componentesLimpios.length === 0) {
                throw new Error('Debes agregar al menos un producto componente con cantidad mayor a 0 para el combo.');
            }
            if (componentesLimpios.length > 20) {
                throw new Error('Límite excedido: No se pueden agregar más de 20 componentes en un solo combo.');
            }

            const limiteActivo = arguments[0].limiteMaximoActivo ? 1 : 0;
            let limiteTotal = null;
            let limiteRestante = null;
            if (limiteActivo) {
                limiteTotal = Math.floor(numeroPositivo(arguments[0].limiteUnidadesTotal, 'La cantidad máxima de venta del combo'));
                limiteRestante = limiteTotal;
            }

            const fechaInicio = arguments[0].fechaInicioVigencia && String(arguments[0].fechaInicioVigencia).trim() !== ''
                ? String(arguments[0].fechaInicioVigencia).trim()
                : null;
            const fechaFin = arguments[0].fechaFinVigencia && String(arguments[0].fechaFinVigencia).trim() !== ''
                ? String(arguments[0].fechaFinVigencia).trim()
                : null;

            if (fechaInicio && fechaFin && new Date(fechaInicio) > new Date(fechaFin)) {
                throw new Error('La fecha y hora de inicio de vigencia no puede ser posterior a la fecha y hora final.');
            }

            const resProd = await runQuery(
                `INSERT INTO productos (
                    nombre, precio, costo, categoria, unidad_medida, tipo_inventario,
                    stock, stock_minimo, fecha_vencimiento,
                    limite_maximo_activo, limite_unidades_total, limite_unidades_restante,
                    fecha_inicio_vigencia, fecha_fin_vigencia
                ) VALUES (?, ?, 0, ?, 'unidades', 'combo', NULL, 0, NULL, ?, ?, ?, ?, ?)`,
                [
                    nombre.trim(),
                    precioValidado,
                    catFinal,
                    limiteActivo,
                    limiteTotal,
                    limiteRestante,
                    fechaInicio,
                    fechaFin
                ]
            );
            const comboId = resProd.lastID;

            const componentesUnicos = new Set();
            for (const comp of componentesLimpios) {
                const compProdId = Number(comp.productoId);
                if (compProdId === comboId) {
                    throw new Error('Un combo no puede contenerse a sí mismo.');
                }
                if (componentesUnicos.has(compProdId)) {
                    throw new Error(`El producto ID ${compProdId} está duplicado en los componentes del combo.`);
                }
                componentesUnicos.add(compProdId);

                const productoComp = await getQuery(`SELECT id, nombre, tipo_inventario, costo FROM productos WHERE id = ? AND activo = 1`, [compProdId]);
                if (!productoComp) {
                    throw new Error(`El producto componente con ID ${compProdId} no existe o está inactivo.`);
                }
                if (productoComp.tipo_inventario === 'combo') {
                    throw new Error(`El producto "${productoComp.nombre}" es un combo. No se permiten combos anidados.`);
                }

                const cantVal = numeroPositivo(comp.cantidad, `La cantidad del componente ${productoComp.nombre}`);
                await runQuery(
                    `INSERT INTO combo_componentes (combo_producto_id, componente_producto_id, cantidad)
                     VALUES (?, ?, ?)`,
                    [comboId, compProdId, cantVal]
                );
            }

            const costoFinal = await recalcularCostoCombo(comboId);
            return {
                id: comboId,
                nombre: nombre.trim(),
                precio: precioValidado,
                costo: costoFinal,
                categoria: catFinal,
                tipo_inventario: 'combo'
            };

        } else {
            // Venta libre / servicio sin insumo
            const resProd = await runQuery(
                `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
                 VALUES (?, ?, 0, ?, 'unidades', 'libre', NULL, 0, NULL)`,
                [nombre.trim(), precioValidado, catFinal]
            );
            return { id: resProd.lastID, nombre: nombre.trim(), precio: precioValidado, costo: 0, categoria: catFinal };
        }
    });
}

async function crearProducto(nombre, precio, costo = 0, categoria = '', stock = null, unidadMedida = 'unidades', stockMinimo = 0, fechaVencimiento = null) {
    if (!nombre || String(nombre).trim() === '') {
        throw new Error('El nombre del producto es obligatorio.');
    }
    const precioValidado = redondear2(numeroPositivo(precio, 'El precio del producto'));
    const costoValidado = redondear2(numeroNoNegativo(costo ?? 0, 'El costo del producto'));
    const stockValidado = (stock !== null && stock !== undefined && stock !== '')
        ? redondear2(numeroNoNegativo(stock, 'El stock inicial del producto'))
        : null;
    const stockMinimoValidado = redondear2(numeroNoNegativo(stockMinimo ?? 0, 'El stock mínimo de alerta'));
    const tipoInventario = stockValidado !== null ? 'directo' : 'libre';

    const res = await runQuery(
        `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre.trim(), precioValidado, costoValidado, categoria ? String(categoria).trim() : '', unidadMedida || 'unidades', tipoInventario, stockValidado, stockMinimoValidado, fechaVencimiento || null]
    );
    return res.lastID;
}

// Reabastecimiento directo de artículos terminados con Costo Promedio Ponderado (NIC 2)
async function registrarCompraProductoDirecto(productoId, cantidadComprada, costoTotalCompra, fechaVencimiento = null) {
    const cantValidada = numeroPositivo(cantidadComprada, 'La cantidad comprada');
    const costoValidado = redondear2(numeroNoNegativo(costoTotalCompra, 'El costo total de compra'));

    return await enTransaccion(async () => {
        const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [productoId]);
        if (!prod) throw new Error('Producto no encontrado.');

        if (prod.tipo_inventario === 'receta') {
            throw new Error('El artículo seleccionado es de elaboración por Receta. Su stock y costo se gestionan reabasteciendo sus Insumos.');
        }

        const stockAnterior = Math.max(0, Number(prod.stock || 0));
        const valorAnterior = stockAnterior * Number(prod.costo || 0);
        const nuevoStock = stockAnterior + cantValidada;

        // Fórmula de Costo Promedio Ponderado (NIC 2) aplicada directamente al artículo
        const nuevoCostoUnitario = nuevoStock > 0
            ? (valorAnterior + costoValidado) / nuevoStock
            : (costoValidado / cantValidada);

        const vencimientoActualizado = fechaVencimiento && String(fechaVencimiento).trim() !== ''
            ? String(fechaVencimiento).trim()
            : prod.fecha_vencimiento;

        await runQuery(
            `UPDATE productos
             SET tipo_inventario = 'directo',
                 stock = ?,
                 costo = ?,
                 fecha_vencimiento = ?
             WHERE id = ?`,
            [Number(nuevoStock.toFixed(4)), Number(nuevoCostoUnitario.toFixed(4)), vencimientoActualizado, productoId]
        );

        await recalcularCostoCombosQueContienenProducto(productoId);

        return {
            productoId,
            nuevoStock: Number(nuevoStock.toFixed(4)),
            nuevoCostoUnitario: Number(nuevoCostoUnitario.toFixed(4))
        };
    });
}

// ==========================================
// 3.5 GESTIÓN DE MODIFICADORES, REEMPLAZOS Y COMPLEMENTOS
// ==========================================
async function obtenerGruposModificadores(soloActivos = true) {
    const filtro = soloActivos ? 'WHERE g.activo = 1' : '';
    const grupos = await allQuery(`
        SELECT g.*
        FROM grupos_modificadores g
        ${filtro}
        ORDER BY g.id ASC
    `);

    if (grupos.length === 0) return [];

    const opciones = await allQuery(`
        SELECT o.*,
               i.nombre as insumo_nombre, i.unidad_medida as insumo_unidad, i.costo_por_unidad as insumo_costo, i.stock_actual as insumo_stock,
               ir.nombre as insumo_reemplazado_nombre, ir.unidad_medida as insumo_reemplazado_unidad
        FROM modificadores_opciones o
        LEFT JOIN insumos i ON o.insumo_id = i.id
        LEFT JOIN insumos ir ON o.insumo_reemplazado_id = ir.id
        WHERE o.activo = 1
        ORDER BY o.es_default DESC, o.id ASC
    `);

    const mapaOpciones = {};
    for (const op of opciones) {
        if (!mapaOpciones[op.grupo_id]) mapaOpciones[op.grupo_id] = [];
        mapaOpciones[op.grupo_id].push({
            id: op.id,
            grupo_id: op.grupo_id,
            nombre: op.nombre,
            insumo_id: op.insumo_id,
            cantidad_insumo: Number(op.cantidad_insumo || 0),
            precio_adicional: Number(op.precio_adicional || 0),
            insumo_reemplazado_id: op.insumo_reemplazado_id,
            es_default: Number(op.es_default) === 1,
            insumo_nombre: op.insumo_nombre || null,
            insumo_unidad: op.insumo_unidad || null,
            insumo_costo: Number(op.insumo_costo || 0),
            insumo_stock: op.insumo_stock !== null ? Number(op.insumo_stock) : null,
            insumo_reemplazado_nombre: op.insumo_reemplazado_nombre || null,
            insumo_reemplazado_unidad: op.insumo_reemplazado_unidad || null
        });
    }

    return grupos.map((g) => ({
        id: g.id,
        nombre: g.nombre,
        tipo_seleccion: g.tipo_seleccion,
        es_obligatorio: Number(g.es_obligatorio) === 1,
        activo: Number(g.activo) === 1,
        opciones: mapaOpciones[g.id] || []
    }));
}

async function crearGrupoModificadores(datos, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede crear grupos de complementos.');
    }

    const nombreLimpio = String(datos.nombre || '').trim();
    if (!nombreLimpio || nombreLimpio.length < 2) {
        throw new Error('Debes ingresar un nombre válido para el grupo de complementos (mínimo 2 caracteres).');
    }

    const tipoSeleccion = datos.tipoSeleccion === 'multiple' ? 'multiple' : 'unica';
    const esObligatorio = datos.esObligatorio ? 1 : 0;
    const opciones = Array.isArray(datos.opciones) ? datos.opciones : [];

    return await enTransaccion(async () => {
        const res = await runQuery(
            `INSERT INTO grupos_modificadores (nombre, tipo_seleccion, es_obligatorio, activo)
             VALUES (?, ?, ?, 1)`,
            [nombreLimpio, tipoSeleccion, esObligatorio]
        );
        const grupoId = res.lastID;

        for (const op of opciones) {
            if (!op || !String(op.nombre || '').trim()) continue;
            const opNombre = String(op.nombre).trim();
            const precioAdicional = redondear2(numeroNoNegativo(op.precioAdicional ?? 0, 'El precio adicional'));
            const cantidadInsumo = redondear2(numeroNoNegativo(op.cantidadInsumo ?? 0, 'La cantidad de insumo'));
            const insumoId = op.insumoId ? Number(op.insumoId) : null;
            const insumoReemplazadoId = op.insumoReemplazadoId ? Number(op.insumoReemplazadoId) : null;
            const esDefault = op.esDefault ? 1 : 0;

            await runQuery(
                `INSERT INTO modificadores_opciones (grupo_id, nombre, insumo_id, cantidad_insumo, precio_adicional, insumo_reemplazado_id, es_default, activo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                [grupoId, opNombre, insumoId, cantidadInsumo, precioAdicional, insumoReemplazadoId, esDefault]
            );
        }

        return grupoId;
    });
}

async function actualizarGrupoModificadores(grupoId, datos, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede modificar grupos de complementos.');
    }

    const idNum = Number(grupoId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
        throw new Error('ID de grupo de modificador inválido.');
    }

    const nombreLimpio = String(datos.nombre || '').trim();
    if (!nombreLimpio || nombreLimpio.length < 2) {
        throw new Error('Debes ingresar un nombre válido para el grupo (mínimo 2 caracteres).');
    }

    const tipoSeleccion = datos.tipoSeleccion === 'multiple' ? 'multiple' : 'unica';
    const esObligatorio = datos.esObligatorio ? 1 : 0;
    const opciones = Array.isArray(datos.opciones) ? datos.opciones : [];

    return await enTransaccion(async () => {
        await runQuery(
            `UPDATE grupos_modificadores
             SET nombre = ?, tipo_seleccion = ?, es_obligatorio = ?
             WHERE id = ?`,
            [nombreLimpio, tipoSeleccion, esObligatorio, idNum]
        );

        // Desactivar opciones anteriores del grupo
        await runQuery(`UPDATE modificadores_opciones SET activo = 0 WHERE grupo_id = ?`, [idNum]);

        for (const op of opciones) {
            if (!op || !String(op.nombre || '').trim()) continue;
            const opNombre = String(op.nombre).trim();
            const precioAdicional = redondear2(numeroNoNegativo(op.precioAdicional ?? 0, 'El precio adicional'));
            const cantidadInsumo = redondear2(numeroNoNegativo(op.cantidadInsumo ?? 0, 'La cantidad de insumo'));
            const insumoId = op.insumoId ? Number(op.insumoId) : null;
            const insumoReemplazadoId = op.insumoReemplazadoId ? Number(op.insumoReemplazadoId) : null;
            const esDefault = op.esDefault ? 1 : 0;

            if (op.id) {
                await runQuery(
                    `UPDATE modificadores_opciones
                     SET nombre = ?, insumo_id = ?, cantidad_insumo = ?, precio_adicional = ?,
                         insumo_reemplazado_id = ?, es_default = ?, activo = 1
                     WHERE id = ? AND grupo_id = ?`,
                    [opNombre, insumoId, cantidadInsumo, precioAdicional, insumoReemplazadoId, esDefault, op.id, idNum]
                );
            } else {
                await runQuery(
                    `INSERT INTO modificadores_opciones (grupo_id, nombre, insumo_id, cantidad_insumo, precio_adicional, insumo_reemplazado_id, es_default, activo)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                    [idNum, opNombre, insumoId, cantidadInsumo, precioAdicional, insumoReemplazadoId, esDefault]
                );
            }
        }

        return true;
    });
}

async function eliminarGrupoModificadores(grupoId, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede eliminar grupos de complementos.');
    }
    const idNum = Number(grupoId);
    return await enTransaccion(async () => {
        await runQuery(`UPDATE grupos_modificadores SET activo = 0 WHERE id = ?`, [idNum]);
        await runQuery(`UPDATE modificadores_opciones SET activo = 0 WHERE grupo_id = ?`, [idNum]);
        await runQuery(`DELETE FROM producto_grupos_modificadores WHERE grupo_id = ?`, [idNum]);
        return true;
    });
}

async function asignarModificadoresAProducto(productoId, grupoIds, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede asignar modificadores.');
    }
    const prodId = Number(productoId);
    if (!Number.isFinite(prodId) || prodId <= 0) {
        throw new Error('ID de producto inválido.');
    }
    const idsValidados = Array.isArray(grupoIds)
        ? grupoIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
        : [];

    return await enTransaccion(async () => {
        await runQuery(`DELETE FROM producto_grupos_modificadores WHERE producto_id = ?`, [prodId]);
        for (const gId of idsValidados) {
            await runQuery(
                `INSERT OR IGNORE INTO producto_grupos_modificadores (producto_id, grupo_id) VALUES (?, ?)`,
                [prodId, gId]
            );
        }
        return true;
    });
}

async function obtenerProductos() {
    const [productos, gruposModificadores, enlaces, todosInsumos, recetasTodas, componentesCombos] = await Promise.all([
        allQuery(`
            SELECT p.*,
                   COUNT(r.id) as num_ingredientes,
                   MIN(i.stock_actual / NULLIF(r.cantidad_requerida, 0)) as min_disponible,
                   i.nombre as limitante_nombre,
                   i.stock_actual as limitante_stock,
                   i.unidad_medida as limitante_unidad
            FROM productos p
            LEFT JOIN recetas r ON p.id = r.producto_id
            LEFT JOIN insumos i ON r.insumo_id = i.id
            WHERE p.activo = 1
            GROUP BY p.id
            ORDER BY p.categoria, p.nombre
        `),
        obtenerGruposModificadores(true),
        allQuery(`SELECT producto_id, grupo_id FROM producto_grupos_modificadores`),
        allQuery(`SELECT id, nombre, unidad_medida, stock_actual, costo_por_unidad FROM insumos WHERE activo = 1`),
        allQuery(`SELECT producto_id, insumo_id, cantidad_requerida FROM recetas`),
        allQuery(`
            SELECT cc.combo_producto_id, cc.componente_producto_id, cc.cantidad,
                   p.nombre as componente_nombre, p.tipo_inventario as componente_tipo,
                   p.stock as componente_stock, p.costo as componente_costo
            FROM combo_componentes cc
            INNER JOIN productos p ON cc.componente_producto_id = p.id
            WHERE p.activo = 1
        `)
    ]);

    const mapaGrupos = new Map(gruposModificadores.map((g) => [g.id, g]));
    const gruposPorProducto = {};
    for (const e of enlaces) {
        if (!gruposPorProducto[e.producto_id]) gruposPorProducto[e.producto_id] = [];
        gruposPorProducto[e.producto_id].push(e.grupo_id);
    }

    const mapaInsumos = new Map(todosInsumos.map((i) => [i.id, i]));
    const recetasPorProducto = {};
    for (const r of recetasTodas) {
        if (!recetasPorProducto[r.producto_id]) recetasPorProducto[r.producto_id] = [];
        recetasPorProducto[r.producto_id].push(r);
    }

    const componentesPorCombo = {};
    for (const cc of componentesCombos) {
        if (!componentesPorCombo[cc.combo_producto_id]) componentesPorCombo[cc.combo_producto_id] = [];
        componentesPorCombo[cc.combo_producto_id].push(cc);
    }

    // Mapa base de productos indexados por ID
    const mapaProductosBase = new Map(productos.map((p) => [p.id, p]));

    const ahora = new Date();

    return productos.map((p) => {
        let unidadesDisponibles = null;
        let insumoLimitante = null;
        let estaVigente = true;
        let motivoNoVigente = null;

        if (p.tipo_inventario === 'libre') {
            unidadesDisponibles = Infinity;
        } else if (p.tipo_inventario === 'directo') {
            unidadesDisponibles = Math.floor(p.stock || 0);
        } else if (p.tipo_inventario === 'receta') {
            if (p.num_ingredientes === 0) {
                unidadesDisponibles = 0;
            } else {
                unidadesDisponibles = p.min_disponible !== null ? Math.max(0, Math.floor(p.min_disponible)) : 0;
                insumoLimitante = p.limitante_nombre
                    ? `${p.limitante_nombre} (${p.limitante_stock} ${p.limitante_unidad} disponibles)`
                    : null;
            }
        } else if (p.tipo_inventario === 'combo') {
            // Validar vigencia temporal si tiene fechas configuradas
            if (p.fecha_inicio_vigencia) {
                const fInicio = new Date(p.fecha_inicio_vigencia);
                if (!isNaN(fInicio.getTime()) && ahora < fInicio) {
                    estaVigente = false;
                    motivoNoVigente = `Promoción inicia el ${fInicio.toLocaleString()}`;
                }
            }
            if (p.fecha_fin_vigencia) {
                const fFin = new Date(p.fecha_fin_vigencia);
                if (!isNaN(fFin.getTime()) && ahora > fFin) {
                    estaVigente = false;
                    motivoNoVigente = `Promoción finalizó el ${fFin.toLocaleString()}`;
                }
            }

            const componentes = componentesPorCombo[p.id] || [];
            if (componentes.length === 0) {
                unidadesDisponibles = 0;
                insumoLimitante = 'Sin componentes definidos';
            } else {
                // Sumar consumo total de insumos y stock directo requeridos por 1 unidad de combo
                const insumosRequeridosCombo = {};
                const productosDirectosRequeridosCombo = {};

                for (const comp of componentes) {
                    const prodComp = mapaProductosBase.get(comp.componente_producto_id);
                    const cantComp = Number(comp.cantidad || 0);
                    if (!prodComp) continue;

                    if (prodComp.tipo_inventario === 'directo') {
                        productosDirectosRequeridosCombo[prodComp.id] = {
                            productoId: prodComp.id,
                            nombre: prodComp.nombre,
                            stock: Number(prodComp.stock || 0),
                            requerido: Number(((productosDirectosRequeridosCombo[prodComp.id]?.requerido || 0) + cantComp).toFixed(4))
                        };
                    } else if (prodComp.tipo_inventario === 'receta') {
                        const recs = recetasPorProducto[prodComp.id] || [];
                        for (const r of recs) {
                            const insumo = mapaInsumos.get(r.insumo_id);
                            if (!insumo) continue;
                            const cantTotalInsumo = Number((cantComp * r.cantidad_requerida).toFixed(4));
                            if (!insumosRequeridosCombo[r.insumo_id]) {
                                insumosRequeridosCombo[r.insumo_id] = {
                                    insumoId: r.insumo_id,
                                    nombre: insumo.nombre,
                                    unidad: insumo.unidad_medida,
                                    stock: Number(insumo.stock_actual || 0),
                                    requerido: 0
                                };
                            }
                            insumosRequeridosCombo[r.insumo_id].requerido = Number(
                                (insumosRequeridosCombo[r.insumo_id].requerido + cantTotalInsumo).toFixed(4)
                            );
                        }
                    }
                }

                let maxPorInventario = Infinity;
                let limitanteDetectado = null;

                // Evaluar limitantes directos
                for (const pId in productosDirectosRequeridosCombo) {
                    const info = productosDirectosRequeridosCombo[pId];
                    if (info.requerido > 0) {
                        const posible = Math.max(0, Math.floor(info.stock / info.requerido));
                        if (posible < maxPorInventario) {
                            maxPorInventario = posible;
                            limitanteDetectado = `${info.nombre} (${info.stock} disponibles)`;
                        }
                    }
                }

                // Evaluar limitantes de insumos
                for (const iId in insumosRequeridosCombo) {
                    const info = insumosRequeridosCombo[iId];
                    if (info.requerido > 0) {
                        const posible = Math.max(0, Math.floor(info.stock / info.requerido));
                        if (posible < maxPorInventario) {
                            maxPorInventario = posible;
                            limitanteDetectado = `${info.nombre} (${info.stock} ${info.unidad} disponibles)`;
                        }
                    }
                }

                if (maxPorInventario === Infinity) maxPorInventario = 0;

                // Aplicar restricción de límite máximo si está activo
                if (Number(p.limite_maximo_activo) === 1) {
                    const restante = Math.max(0, Math.floor(p.limite_unidades_restante ?? 0));
                    unidadesDisponibles = Math.min(maxPorInventario, restante);
                    if (restante <= 0) {
                        insumoLimitante = 'Límite de venta alcanzado (0 combos restantes)';
                    } else if (restante < maxPorInventario) {
                        insumoLimitante = `Límite configurado (${restante} restantes)`;
                    } else {
                        insumoLimitante = limitanteDetectado;
                    }
                } else {
                    unidadesDisponibles = maxPorInventario;
                    insumoLimitante = limitanteDetectado;
                }
            }
        }

        const idsGrupos = gruposPorProducto[p.id] || [];
        const gruposAsignados = idsGrupos
            .map((id) => mapaGrupos.get(id))
            .filter(Boolean);

        const {
            num_ingredientes,
            min_disponible,
            limitante_nombre,
            limitante_stock,
            limitante_unidad,
            ...productoLimpio
        } = p;

        return {
            ...productoLimpio,
            unidades_disponibles: unidadesDisponibles,
            insumo_limitante: insumoLimitante,
            esta_vigente: estaVigente,
            motivo_no_vigente: motivoNoVigente,
            componentes_combo: componentesPorCombo[p.id] || [],
            grupos_modificadores_ids: idsGrupos,
            grupos_modificadores: gruposAsignados
        };
    });
}

// ==========================================
// 4. GESTIÓN DE CAJAS FÍSICAS (TERMINALES / ESTACIONES)
// ==========================================
async function obtenerCajasFisicas(soloActivas = false) {
    return await allQuery(
        `SELECT cf.*,
                (SELECT c.id FROM cajas c WHERE c.caja_fisica_id = cf.id AND c.estado = 'abierta' LIMIT 1) as turno_abierto_id,
                (SELECT u.nombre FROM cajas c LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.caja_fisica_id = cf.id AND c.estado = 'abierta' LIMIT 1) as operador_abierto
         FROM cajas_fisicas cf
         ${soloActivas ? 'WHERE cf.activa = 1' : ''}
         ORDER BY cf.id ASC`
    );
}

async function crearCajaFisica(nombre, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede registrar estaciones de caja.');
    }
    const nombreLimpio = String(nombre || '').trim();
    if (!nombreLimpio || nombreLimpio.length < 2) {
        throw new Error('Debes ingresar un nombre válido para la caja física (mínimo 2 caracteres).');
    }
    const existente = await getQuery(`SELECT id FROM cajas_fisicas WHERE LOWER(nombre) = LOWER(?)`, [nombreLimpio]);
    if (existente) {
        throw new Error(`Ya existe una caja física registrada con el nombre "${nombreLimpio}".`);
    }
    const res = await runQuery(`INSERT INTO cajas_fisicas (nombre, activa) VALUES (?, 1)`, [nombreLimpio]);
    return res.lastID;
}

async function desactivarCajaFisica(cajaFisicaId, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede desactivar estaciones de caja.');
    }
    const idNum = Number(cajaFisicaId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
        throw new Error('ID de caja física inválido.');
    }
    const caja = await getQuery(`SELECT * FROM cajas_fisicas WHERE id = ?`, [idNum]);
    if (!caja) {
        throw new Error('La caja física indicada no existe.');
    }
    if (Number(caja.activa) === 0) {
        throw new Error('Esta caja física ya se encuentra inactiva.');
    }

    // Regla obligatoria: Mínimo 1 caja física activa en el sistema
    const conteoActivas = await getQuery(`SELECT COUNT(*) as total FROM cajas_fisicas WHERE activa = 1`);
    if (!conteoActivas || Number(conteoActivas.total) <= 1) {
        throw new Error('Operación denegada: El sistema debe mantener al menos una caja física activa disponible.');
    }

    // Validar que no tenga turno abierto en curso
    const turnoAbierto = await getQuery(
        `SELECT id FROM cajas WHERE caja_fisica_id = ? AND estado = 'abierta'`,
        [idNum]
    );
    if (turnoAbierto) {
        throw new Error(`No puedes desactivar "${caja.nombre}" porque tiene el Turno #${turnoAbierto.id} actualmente abierto. Debes cerrarlo primero.`);
    }

    await runQuery(`UPDATE cajas_fisicas SET activa = 0 WHERE id = ?`, [idNum]);
    return true;
}

async function reactivarCajaFisica(cajaFisicaId, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede reactivar estaciones de caja.');
    }
    const idNum = Number(cajaFisicaId);
    await runQuery(`UPDATE cajas_fisicas SET activa = 1 WHERE id = ?`, [idNum]);
    return true;
}

// ==========================================
// 5. APERTURA DE TURNOS, MULTICAJA Y ARQUEOS
// ==========================================
async function obtenerCajasAbiertas() {
    return await allQuery(
        `SELECT c.*, cf.nombre as caja_fisica_nombre, u.nombre as usuario_nombre, u.rol as usuario_rol
         FROM cajas c
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         WHERE c.estado = 'abierta'
         ORDER BY c.id ASC`
    );
}

async function obtenerCajaAbierta(usuarioId = null, cajaFisicaId = null) {
    let sql = `
        SELECT c.*, cf.nombre as caja_fisica_nombre, u.nombre as usuario_nombre, u.rol as usuario_rol
        FROM cajas c
        LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.estado = 'abierta'
    `;
    const params = [];
    if (cajaFisicaId) {
        sql += ` AND c.caja_fisica_id = ?`;
        params.push(cajaFisicaId);
    } else if (usuarioId) {
        sql += ` AND c.usuario_id = ?`;
        params.push(usuarioId);
    }
    sql += ` ORDER BY c.id DESC LIMIT 1`;
    return await getQuery(sql, params);
}

async function obtenerHistorialCajas(cajaFisicaId = null) {
    let sql = `
        SELECT c.*, cf.nombre as caja_fisica_nombre, u.nombre as usuario_nombre, u.rol as usuario_rol
        FROM cajas c
        LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
        LEFT JOIN usuarios u ON c.usuario_id = u.id
    `;
    const params = [];
    if (cajaFisicaId) {
        sql += ` WHERE c.caja_fisica_id = ?`;
        params.push(cajaFisicaId);
    }
    sql += ` ORDER BY c.id DESC`;
    return await allQuery(sql, params);
}

async function abrirCaja(usuarioId, montoInicial, cajaFisicaId = null) {
    const montoInicialValidado = redondear2(numeroNoNegativo(montoInicial, 'El monto inicial'));

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que abre la caja es obligatorio.');
    }

    const usuario = await obtenerUsuarioPorId(usuarioId);
    if (!usuario) {
        throw new Error('Usuario no válido o inactivo.');
    }

    // Resolver caja física asignada
    let cajaFisica = null;
    if (cajaFisicaId) {
        cajaFisica = await getQuery(`SELECT * FROM cajas_fisicas WHERE id = ? AND activa = 1`, [cajaFisicaId]);
        if (!cajaFisica) {
            throw new Error('La caja física seleccionada no existe o está inactiva.');
        }
    } else {
        cajaFisica = await getQuery(`SELECT * FROM cajas_fisicas WHERE activa = 1 ORDER BY id ASC LIMIT 1`);
        if (!cajaFisica) {
            throw new Error('No hay ninguna caja física activa en el sistema para abrir turno.');
        }
    }

    // Validar que la estación física no tenga ya un turno abierto
    const turnoAbiertoEstacion = await getQuery(
        `SELECT c.id, u.nombre as operador
         FROM cajas c
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         WHERE c.caja_fisica_id = ? AND c.estado = 'abierta'`,
        [cajaFisica.id]
    );
    if (turnoAbiertoEstacion) {
        throw new Error(
            `La ${cajaFisica.nombre} ya tiene un turno abierto (Turno #${turnoAbiertoEstacion.id} a cargo de ${turnoAbiertoEstacion.operador || 'otro cajero'}). Debe cerrarse antes de iniciar uno nuevo en esta misma estación.`
        );
    }

    // Validar que el usuario no tenga otro turno abierto en otra caja simultáneamente
    const turnoAbiertoUsuario = await getQuery(
        `SELECT c.id, cf.nombre as caja_nombre
         FROM cajas c
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         WHERE c.usuario_id = ? AND c.estado = 'abierta'`,
        [usuario.id]
    );
    if (turnoAbiertoUsuario) {
        throw new Error(
            `El usuario ${usuario.nombre} ya tiene activo el Turno #${turnoAbiertoUsuario.id} en ${turnoAbiertoUsuario.caja_nombre || 'otra caja'}. Debe cerrar su turno anterior antes de abrir uno nuevo.`
        );
    }

    const res = await runQuery(
        `INSERT INTO cajas (caja_fisica_id, usuario_id, monto_inicial, estado) VALUES (?, ?, ?, 'abierta')`,
        [cajaFisica.id, usuario.id, montoInicialValidado]
    );
    return res.lastID;
}

async function reabrirCajaConPermiso(adminId, cajaId, motivo = 'Revisión administrativa') {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo el Administrador puede reabrir un turno cerrado.');
    }

    const caja = await getQuery(`SELECT * FROM cajas WHERE id = ?`, [cajaId]);
    if (!caja) throw new Error('Turno de caja no encontrado.');

    // Verificar si la caja física correspondiente ya tiene otro turno abierto
    const turnoAbierto = await getQuery(
        `SELECT c.id, cf.nombre as caja_nombre
         FROM cajas c
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         WHERE c.caja_fisica_id = ? AND c.estado = 'abierta'`,
        [caja.caja_fisica_id]
    );
    if (turnoAbierto) {
        throw new Error(
            `No se puede reabrir el Turno #${cajaId}: la estación "${turnoAbierto.caja_nombre || 'Caja'}" ya tiene el Turno #${turnoAbierto.id} abierto actualmente.`
        );
    }

    const numReapertura = (Number(caja.veces_reabierta) || 0) + 1;
    const notaPrevia = `Reapertura #${numReapertura} por ${ejecutor.nombre} (${motivo || 'Sin motivo'}) — Arqueo previo: Esperado Bs ${Number(caja.efectivo_esperado || 0).toFixed(2)}, Real Bs ${Number(caja.efectivo_real || 0).toFixed(2)}, Dif: Bs ${Number(caja.diferencia_efectivo || 0).toFixed(2)}`;
    const nuevoHistorial = caja.historial_reaperturas
        ? `${caja.historial_reaperturas} | ${notaPrevia}`
        : notaPrevia;

    await runQuery(
        `UPDATE cajas
         SET estado = 'abierta',
             veces_reabierta = ?,
             historial_reaperturas = ?,
             efectivo_esperado = NULL,
             efectivo_real = NULL,
             diferencia_efectivo = NULL,
             fecha_cierre = NULL
         WHERE id = ?`,
        [numReapertura, nuevoHistorial, cajaId]
    );
    return true;
}

async function registrarVentaCompleta(cajaId, items, metodoPago, montoRecibido = null, descripcion = 'Venta en mostrador', usuarioId = null, cambioEntregado = null) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('La venta debe incluir al menos un producto.');
    }

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que registra la venta es obligatorio.');
    }

    // 1. Validar ítems y agrupar por (productoId + modificadores) sumando cantidades
    const mapaItemsAgrupados = new Map();
    for (const item of items) {
        if (!item || item.productoId === undefined || item.productoId === null) {
            throw new Error('Cada ítem debe especificar un productoId válido.');
        }
        const prodId = Number(item.productoId);
        if (!Number.isFinite(prodId) || prodId <= 0) {
            throw new Error('ID de producto inválido.');
        }
        const cant = numeroPositivo(item.cantidad, `La cantidad del producto ID ${prodId}`);

        // Normalizar modificadores ordenados numéricamente
        const modsNormalizados = Array.isArray(item.modificadores)
            ? item.modificadores
                .map((m) => (typeof m === 'object' && m !== null ? Number(m.id || m.opcionId) : Number(m)))
                .filter((id) => Number.isFinite(id) && id > 0)
                .sort((a, b) => a - b)
            : [];

        const claveAgrupacion = `${prodId}__${modsNormalizados.join('_')}`;
        if (!mapaItemsAgrupados.has(claveAgrupacion)) {
            mapaItemsAgrupados.set(claveAgrupacion, {
                productoId: prodId,
                modificadoresIds: modsNormalizados,
                cantidadTotal: 0
            });
        }
        const agrupado = mapaItemsAgrupados.get(claveAgrupacion);
        agrupado.cantidadTotal = Number((agrupado.cantidadTotal + cant).toFixed(4));
    }

    return await enTransaccion(async () => {
        const operador = await obtenerUsuarioPorId(usuarioId);
        if (!operador) {
            throw new Error('El usuario que intenta registrar la venta no existe o está inactivo.');
        }

        // 2. Verificar que la caja exista, esté abierta y quien vende sea el dueño de la caja o un administrador
        const caja = await getQuery(`SELECT id, usuario_id, estado FROM cajas WHERE id = ?`, [cajaId]);
        if (!caja) {
            throw new Error('La caja indicada no existe.');
        }
        if (caja.estado !== 'abierta') {
            throw new Error('No se puede registrar una venta porque la caja no está abierta.');
        }
        if (Number(caja.usuario_id) !== Number(operador.id) && !esRolAdministrativo(operador.rol)) {
            throw new Error('Permiso denegado: solo el cajero titular de la caja abierta o un Administrador puede registrar ventas en este turno.');
        }

        let montoTotal = 0;
        const itemsProcesados = [];
        const consumoAcumuladoInsumos = {};
        const consumoAcumuladoDirecto = {};

        for (const itemAgrupado of mapaItemsAgrupados.values()) {
            const { productoId: prodId, modificadoresIds, cantidadTotal } = itemAgrupado;
            const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [prodId]);
            if (!prod) throw new Error(`Producto con ID ${prodId} no existe.`);

            // Validar vigencia temporal en caso de combos
            if (prod.tipo_inventario === 'combo') {
                const ahora = new Date();
                if (prod.fecha_inicio_vigencia) {
                    const fInicio = new Date(prod.fecha_inicio_vigencia);
                    if (!isNaN(fInicio.getTime()) && ahora < fInicio) {
                        throw new Error(`La promoción "${prod.nombre}" aún no está vigente (inicia el ${fInicio.toLocaleString()}).`);
                    }
                }
                if (prod.fecha_fin_vigencia) {
                    const fFin = new Date(prod.fecha_fin_vigencia);
                    if (!isNaN(fFin.getTime()) && ahora > fFin) {
                        throw new Error(`La promoción "${prod.nombre}" ha finalizado (expiró el ${fFin.toLocaleString()}).`);
                    }
                }
            }

            // Cargar componentes si es combo
            let componentesCombo = [];
            if (prod.tipo_inventario === 'combo') {
                componentesCombo = await allQuery(
                    `SELECT cc.componente_producto_id, cc.cantidad,
                            p.nombre as componente_nombre, p.tipo_inventario as componente_tipo,
                            p.costo as componente_costo, p.stock as componente_stock
                     FROM combo_componentes cc
                     INNER JOIN productos p ON cc.componente_producto_id = p.id
                     WHERE cc.combo_producto_id = ? AND p.activo = 1`,
                    [prod.id]
                );
                if (componentesCombo.length === 0) {
                    throw new Error(`El combo "${prod.nombre}" no tiene componentes válidos configurados.`);
                }
            }

            // Cargar receta base si corresponde
            let recetaBase = [];
            if (prod.tipo_inventario === 'receta') {
                recetaBase = await allQuery(
                    `SELECT r.insumo_id, r.cantidad_requerida, i.nombre, i.stock_actual, i.unidad_medida, i.costo_por_unidad
                     FROM recetas r
                     INNER JOIN insumos i ON r.insumo_id = i.id
                     WHERE r.producto_id = ?`,
                    [prod.id]
                );
            }

            // Validar y cargar modificadores
            let opcionesModificadores = [];
            if (modificadoresIds.length > 0) {
                const placeholders = modificadoresIds.map(() => '?').join(',');
                opcionesModificadores = await allQuery(
                    `SELECT o.*, g.nombre as grupo_nombre, g.tipo_seleccion, g.es_obligatorio,
                            i.nombre as insumo_nombre, i.stock_actual as insumo_stock, i.costo_por_unidad as insumo_costo, i.unidad_medida as insumo_unidad,
                            ir.costo_por_unidad as insumo_reemplazado_costo, ir.nombre as insumo_reemplazado_nombre
                     FROM modificadores_opciones o
                     INNER JOIN grupos_modificadores g ON o.grupo_id = g.id
                     LEFT JOIN insumos i ON o.insumo_id = i.id
                     LEFT JOIN insumos ir ON o.insumo_reemplazado_id = ir.id
                     WHERE o.id IN (${placeholders}) AND o.activo = 1 AND g.activo = 1`,
                    modificadoresIds
                );
            }

            // Insumos efectivos por unidad de producto
            const mapaInsumosPorUnidad = new Map();
            for (const ing of recetaBase) {
                mapaInsumosPorUnidad.set(ing.insumo_id, {
                    insumoId: ing.insumo_id,
                    cantidad: ing.cantidad_requerida,
                    nombre: ing.nombre,
                    unidad: ing.unidad_medida,
                    costoUnitario: Number(ing.costo_por_unidad || 0)
                });
            }

            let precioUnitario = redondear2(prod.precio);
            let costoUnitario = Number(prod.costo || 0);
            const modificadoresDetalle = [];
            const textoModificadores = [];

            for (const modOp of opcionesModificadores) {
                const recargo = redondear2(modOp.precio_adicional || 0);
                precioUnitario = redondear2(precioUnitario + recargo);
                textoModificadores.push(
                    recargo > 0 ? `${modOp.nombre} (+Bs ${recargo.toFixed(2)})` : modOp.nombre
                );

                let costoDelta = 0;
                if (modOp.insumo_id) {
                    const cantMod = Number(modOp.cantidad_insumo || 0);
                    const costoInsumoMod = Number(modOp.insumo_costo || 0);

                    if (modOp.insumo_reemplazado_id) {
                        // Reemplazo: quitar o sustituir el insumo base
                        const cantReemplazada = mapaInsumosPorUnidad.has(modOp.insumo_reemplazado_id)
                            ? mapaInsumosPorUnidad.get(modOp.insumo_reemplazado_id).cantidad
                            : cantMod;
                        const costoReemplazado = Number(modOp.insumo_reemplazado_costo || 0);

                        mapaInsumosPorUnidad.delete(modOp.insumo_reemplazado_id);
                        const cantEfectiva = cantMod > 0 ? cantMod : cantReemplazada;
                        mapaInsumosPorUnidad.set(modOp.insumo_id, {
                            insumoId: modOp.insumo_id,
                            cantidad: cantEfectiva,
                            nombre: modOp.insumo_nombre,
                            unidad: modOp.insumo_unidad,
                            costoUnitario: costoInsumoMod
                        });
                        costoDelta = Number((cantEfectiva * costoInsumoMod - cantReemplazada * costoReemplazado).toFixed(4));
                    } else {
                        // Extra / Adición
                        const actual = mapaInsumosPorUnidad.get(modOp.insumo_id);
                        if (actual) {
                            actual.cantidad = Number((actual.cantidad + cantMod).toFixed(4));
                        } else {
                            mapaInsumosPorUnidad.set(modOp.insumo_id, {
                                insumoId: modOp.insumo_id,
                                cantidad: cantMod,
                                nombre: modOp.insumo_nombre,
                                unidad: modOp.insumo_unidad,
                                costoUnitario: costoInsumoMod
                            });
                        }
                        costoDelta = Number((cantMod * costoInsumoMod).toFixed(4));
                    }
                }

                modificadoresDetalle.push({
                    modificadorOpcionId: modOp.id,
                    nombre: modOp.nombre,
                    precioAdicional: recargo,
                    costoAdicional: costoDelta,
                    insumoId: modOp.insumo_id,
                    cantidadInsumo: modOp.cantidad_insumo,
                    insumoReemplazadoId: modOp.insumo_reemplazado_id
                });
            }

            let componentesDetalleCombo = [];
            // Si el producto es combo, descomponer recursivamente sus componentes en insumos y stock directo
            if (prod.tipo_inventario === 'combo') {
                let costoCalculadoCombo = 0;
                for (const comp of componentesCombo) {
                    const cantTotalComp = Number((comp.cantidad * cantidadTotal).toFixed(4));
                    componentesDetalleCombo.push({
                        componenteProductoId: comp.componente_producto_id,
                        cantidadUnitaria: comp.cantidad,
                        cantidadTotal: cantTotalComp,
                        costoUnitario: Number(comp.componente_costo || 0)
                    });
                    costoCalculadoCombo += comp.cantidad * Number(comp.componente_costo || 0);

                    if (comp.componente_tipo === 'directo') {
                        // Acumular consumo de stock directo por componente
                        if (!consumoAcumuladoDirecto[comp.componente_producto_id]) {
                            consumoAcumuladoDirecto[comp.componente_producto_id] = {
                                productoId: comp.componente_producto_id,
                                nombre: comp.componente_nombre,
                                cantidadTotalRequerida: 0
                            };
                        }
                        consumoAcumuladoDirecto[comp.componente_producto_id].cantidadTotalRequerida = Number(
                            (consumoAcumuladoDirecto[comp.componente_producto_id].cantidadTotalRequerida + cantTotalComp).toFixed(4)
                        );
                    } else if (comp.componente_tipo === 'receta') {
                        // Descomponer en sus insumos
                        const recComp = await allQuery(
                            `SELECT r.insumo_id, r.cantidad_requerida, i.nombre, i.unidad_medida, i.costo_por_unidad
                             FROM recetas r
                             INNER JOIN insumos i ON r.insumo_id = i.id
                             WHERE r.producto_id = ?`,
                            [comp.componente_producto_id]
                        );
                        for (const ing of recComp) {
                            const cantInsumoTotal = Number((ing.cantidad_requerida * cantTotalComp).toFixed(4));
                            if (!consumoAcumuladoInsumos[ing.insumo_id]) {
                                consumoAcumuladoInsumos[ing.insumo_id] = {
                                    insumoId: ing.insumo_id,
                                    nombre: ing.nombre,
                                    unidad: ing.unidad_medida,
                                    costoUnitario: Number(ing.costo_por_unidad || 0),
                                    cantidadTotalRequerida: 0
                                };
                            }
                            consumoAcumuladoInsumos[ing.insumo_id].cantidadTotalRequerida = Number(
                                (consumoAcumuladoInsumos[ing.insumo_id].cantidadTotalRequerida + cantInsumoTotal).toFixed(4)
                            );
                        }
                    }
                }
                costoUnitario = redondear2(costoCalculadoCombo);
            }

            // Si el producto es receta, su costo unitario exacto es la suma de los insumos efectivos
            if (prod.tipo_inventario === 'receta') {
                let costoCalculado = 0;
                for (const ins of mapaInsumosPorUnidad.values()) {
                    costoCalculado += ins.cantidad * ins.costoUnitario;
                }
                costoUnitario = redondear2(costoCalculado);
            }

            // Acumular consumo total de insumos para este producto (multiplicado por cantidadTotal)
            for (const ins of mapaInsumosPorUnidad.values()) {
                const requeridoTotalItem = Number((ins.cantidad * cantidadTotal).toFixed(4));
                if (!consumoAcumuladoInsumos[ins.insumoId]) {
                    consumoAcumuladoInsumos[ins.insumoId] = {
                        insumoId: ins.insumoId,
                        nombre: ins.nombre,
                        unidad: ins.unidad,
                        costoUnitario: ins.costoUnitario,
                        cantidadTotalRequerida: 0
                    };
                }
                consumoAcumuladoInsumos[ins.insumoId].cantidadTotalRequerida = Number(
                    (consumoAcumuladoInsumos[ins.insumoId].cantidadTotalRequerida + requeridoTotalItem).toFixed(4)
                );
            }

            const subtotal = redondear2(precioUnitario * cantidadTotal);
            montoTotal = redondear2(montoTotal + subtotal);

            itemsProcesados.push({
                productoId: prod.id,
                nombre: prod.nombre,
                cantidad: cantidadTotal,
                precioUnitario,
                costoUnitario,
                subtotal,
                tipoInventario: prod.tipo_inventario,
                modificadores: modificadoresDetalle,
                modificadoresTexto: textoModificadores,
                componentesCombo: componentesDetalleCombo,
                limiteMaximoActivo: Number(prod.limite_maximo_activo) === 1
            });
        }

        // 3. Validar montos recibidos y cambio entregado con redondear2 y tolerancia 0.01
        let cambio = 0;
        let recibidoFinal = montoTotal;
        if (metodoPago === 'efectivo') {
            const tieneMontoRecibido = montoRecibido !== null && montoRecibido !== undefined && montoRecibido !== '';
            const tieneCambioEntregado = cambioEntregado !== null && cambioEntregado !== undefined && cambioEntregado !== '';

            if (tieneMontoRecibido) {
                recibidoFinal = redondear2(numeroNoNegativo(montoRecibido, 'El monto recibido'));
                if (recibidoFinal < montoTotal) {
                    throw new Error(`El monto recibido (${recibidoFinal}) es menor al total a cobrar (${montoTotal}).`);
                }
            } else {
                recibidoFinal = montoTotal;
            }

            if (tieneCambioEntregado) {
                cambio = redondear2(numeroNoNegativo(cambioEntregado, 'El monto de cambio entregado'));
                if (Math.abs((recibidoFinal - cambio) - montoTotal) > 0.01) {
                    throw new Error(
                        `El cambio entregado (${cambio}) no cuadra con el monto recibido (${recibidoFinal}) y el total a cobrar (${montoTotal}).`
                    );
                }
            } else {
                cambio = redondear2(recibidoFinal - montoTotal);
            }
        }

        const movRes = await runQuery(
            `INSERT INTO movimientos (caja_id, usuario_id, tipo, monto, metodo_pago, monto_recibido, cambio, descripcion, estado)
             VALUES (?, ?, 'ingreso', ?, ?, ?, ?, ?, 'completado')`,
            [cajaId, operador.id, montoTotal, metodoPago, recibidoFinal, cambio, descripcion]
        );
        const movimientoId = movRes.lastID;

        // 4. Descuento atómico de stock directo en productos y registro de detalle con modificadores y combos
        for (const det of itemsProcesados) {
            const rDet = await runQuery(
                `INSERT INTO detalle_movimientos (movimiento_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [movimientoId, det.productoId, det.cantidad, det.precioUnitario, det.costoUnitario, det.subtotal]
            );
            const detalleMovimientoId = rDet.lastID;

            for (const mod of det.modificadores) {
                await runQuery(
                    `INSERT INTO detalle_movimientos_modificadores (
                        detalle_movimiento_id, modificador_opcion_id, nombre, precio_adicional, costo_adicional, insumo_id, cantidad_insumo, insumo_reemplazado_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        detalleMovimientoId,
                        mod.modificadorOpcionId,
                        mod.nombre,
                        mod.precioAdicional,
                        mod.costoAdicional,
                        mod.insumoId,
                        mod.cantidadInsumo,
                        mod.insumoReemplazadoId
                    ]
                );
            }

            // Si es combo, registrar auditoría histórica y descontar su límite si está activo
            if (det.tipoInventario === 'combo') {
                for (const comp of det.componentesCombo) {
                    await runQuery(
                        `INSERT INTO detalle_movimientos_combos (
                            detalle_movimiento_id, componente_producto_id, cantidad_unitaria, cantidad_total, costo_unitario_congelado
                        ) VALUES (?, ?, ?, ?, ?)`,
                        [
                            detalleMovimientoId,
                            comp.componenteProductoId,
                            comp.cantidadUnitaria,
                            comp.cantidadTotal,
                            comp.costoUnitario
                        ]
                    );
                }

                if (det.limiteMaximoActivo) {
                    const rLim = await runQuery(
                        `UPDATE productos
                         SET limite_unidades_restante = ROUND(limite_unidades_restante - ?, 4)
                         WHERE id = ? AND limite_unidades_restante >= ?`,
                        [det.cantidad, det.productoId, det.cantidad]
                    );
                    if (rLim.changes === 0) {
                        throw new Error(`Se ha agotado el límite de venta disponible para la promoción "${det.nombre}".`);
                    }
                }
            }

            if (det.tipoInventario === 'directo') {
                const r = await runQuery(
                    `UPDATE productos SET stock = ROUND(stock - ?, 4) WHERE id = ? AND stock >= ?`,
                    [det.cantidad, det.productoId, det.cantidad]
                );
                if (r.changes === 0) {
                    throw new Error(`Stock insuficiente para ${det.nombre}`);
                }
            }
        }

        // 4.1 Descuento atómico de stock directo consumido por componentes de combos
        for (const pId in consumoAcumuladoDirecto) {
            const info = consumoAcumuladoDirecto[pId];
            const r = await runQuery(
                `UPDATE productos SET stock = ROUND(stock - ?, 4) WHERE id = ? AND stock >= ?`,
                [info.cantidadTotalRequerida, info.productoId, info.cantidadTotalRequerida]
            );
            if (r.changes === 0) {
                throw new Error(
                    `Stock insuficiente del componente "${info.nombre}" para armar el combo (se requieren ${info.cantidadTotalRequerida} unidades).`
                );
            }
        }

        // 5. Descuento atómico de stock_actual en insumos (recetas y modificadores) y registro con movimiento_id
        for (const insumoId in consumoAcumuladoInsumos) {
            const info = consumoAcumuladoInsumos[insumoId];
            const r = await runQuery(
                `UPDATE insumos SET stock_actual = ROUND(stock_actual - ?, 4) WHERE id = ? AND stock_actual >= ?`,
                [info.cantidadTotalRequerida, info.insumoId, info.cantidadTotalRequerida]
            );
            if (r.changes === 0) {
                throw new Error(
                    `Insumo insuficiente (${info.nombre}): el pedido requiere ${info.cantidadTotalRequerida} ${info.unidad}.`
                );
            }
            await runQuery(
                `INSERT INTO movimientos_insumos (insumo_id, movimiento_id, tipo, cantidad, costo_unitario, motivo)
                 VALUES (?, ?, 'consumo_venta', ?, ?, ?)`,
                [info.insumoId, movimientoId, info.cantidadTotalRequerida, info.costoUnitario, `Venta Ticket #${movimientoId}`]
            );
        }

        return {
            movimientoId,
            montoTotal,
            metodoPago,
            montoRecibido: recibidoFinal,
            cambio,
            items: itemsProcesados.map((it) => ({
                productoId: it.productoId,
                nombre: it.nombre,
                cantidad: it.cantidad,
                precioUnitario: it.precioUnitario,
                subtotal: it.subtotal,
                modificadoresTexto: it.modificadoresTexto
            }))
        };
    });
}

async function registrarEgreso(cajaId, monto, descripcion, metodoPago = 'efectivo', usuarioId = null) {
    const montoValidado = redondear2(numeroPositivo(monto, 'El monto del egreso'));

    if (!descripcion || descripcion.trim() === '') {
        throw new Error('Debes indicar el motivo del egreso.');
    }

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que registra el egreso es obligatorio.');
    }

    const ejecutor = await obtenerUsuarioPorId(usuarioId);
    if (!ejecutor) {
        throw new Error('El usuario que intenta registrar el egreso no existe o está inactivo.');
    }

    if (!esRolAdministrativo(ejecutor.rol) && metodoPago !== 'efectivo') {
        throw new Error('Permiso denegado: un cajero solo puede registrar egresos de efectivo físico del cajón.');
    }

    const caja = await getQuery(`SELECT id, usuario_id, estado FROM cajas WHERE id = ?`, [cajaId]);
    if (!caja) {
        throw new Error('La caja indicada no existe.');
    }
    if (caja.estado !== 'abierta') {
        throw new Error('No se puede registrar un egreso porque la caja no está abierta.');
    }
    if (Number(caja.usuario_id) !== Number(ejecutor.id) && !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo el cajero titular de la caja abierta o un Administrador puede registrar egresos en este turno.');
    }

    const res = await runQuery(
        `INSERT INTO movimientos (caja_id, usuario_id, tipo, monto, metodo_pago, descripcion, estado)
         VALUES (?, ?, 'egreso', ?, ?, ?, 'completado')`,
        [cajaId, ejecutor.id, montoValidado, metodoPago, descripcion.trim()]
    );
    return res.lastID;
}

// Inyección / Reposición de efectivo a la caja (ej. cambio o sencillo provisto por administrador o dueño)
async function registrarIngresoEfectivo(cajaId, monto, motivo, usuarioId = null) {
    const montoValidado = redondear2(numeroPositivo(monto, 'El monto a ingresar'));

    if (!motivo || String(motivo).trim() === '') {
        throw new Error('Debes indicar el motivo de la reposición de efectivo (ej. Aporte de sencillo para cambio).');
    }

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que registra el ingreso de efectivo es obligatorio.');
    }

    const ejecutor = await obtenerUsuarioPorId(usuarioId);
    if (!ejecutor) {
        throw new Error('El usuario que intenta registrar el ingreso no existe o está inactivo.');
    }

    const caja = await getQuery(`SELECT id, usuario_id, estado FROM cajas WHERE id = ?`, [cajaId]);
    if (!caja) {
        throw new Error('La caja indicada no existe.');
    }
    if (caja.estado !== 'abierta') {
        throw new Error('No se puede ingresar efectivo porque la caja no está abierta.');
    }
    if (Number(caja.usuario_id) !== Number(ejecutor.id) && !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo el cajero titular o un Administrador puede ingresar efectivo en este turno.');
    }

    const descripcionFinal = `[REPOSICIÓN DE EFECTIVO] ${String(motivo).trim()}`;
    const res = await runQuery(
        `INSERT INTO movimientos (caja_id, usuario_id, tipo, monto, metodo_pago, monto_recibido, cambio, descripcion, estado)
         VALUES (?, ?, 'ingreso', ?, 'efectivo', ?, 0, ?, 'completado')`,
        [cajaId, ejecutor.id, montoValidado, montoValidado, descripcionFinal]
    );
    return res.lastID;
}

async function anularMovimientoConPermiso(adminId, movimientoId, motivoAnulacion) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo el administrador puede anular movimientos.');
    }

    if (!motivoAnulacion || String(motivoAnulacion).trim().length < 3) {
        throw new Error('Debes ingresar un motivo descriptivo y justificado para realizar la anulación.');
    }

    const motivoLimpio = String(motivoAnulacion).trim();

    return await enTransaccion(async () => {
        const mov = await getQuery(`SELECT * FROM movimientos WHERE id = ?`, [movimientoId]);
        if (!mov) throw new Error('Movimiento no encontrado.');
        if (mov.estado === 'anulado') throw new Error('Este movimiento ya fue anulado.');

        const caja = await getQuery(`SELECT id, estado FROM cajas WHERE id = ?`, [mov.caja_id]);
        if (!caja) {
            throw new Error('La caja asociada al movimiento no existe.');
        }
        if (caja.estado !== 'abierta') {
            throw new Error('No se puede anular un movimiento de una caja cerrada. Reabre la caja primero.');
        }

        const detalles = await allQuery(
            `SELECT d.*, p.tipo_inventario
             FROM detalle_movimientos d
             INNER JOIN productos p ON d.producto_id = p.id
             WHERE d.movimiento_id = ?`,
            [movimientoId]
        );

        for (const det of detalles) {
            if (det.tipo_inventario === 'directo') {
                await runQuery(`UPDATE productos SET stock = ROUND(stock + ?, 4) WHERE id = ?`, [det.cantidad, det.producto_id]);
            } else if (det.tipo_inventario === 'combo') {
                // Si tenía límite activo, restituir el contador restante
                await runQuery(
                    `UPDATE productos
                     SET limite_unidades_restante = ROUND(limite_unidades_restante + ?, 4)
                     WHERE id = ? AND limite_maximo_activo = 1`,
                    [det.cantidad, det.producto_id]
                );

                // Revertir stock de los componentes que eran directos leyendo detalle_movimientos_combos
                const componentesCombosVendidos = await allQuery(
                    `SELECT dmc.*, p.tipo_inventario
                     FROM detalle_movimientos_combos dmc
                     INNER JOIN productos p ON dmc.componente_producto_id = p.id
                     WHERE dmc.detalle_movimiento_id = ?`,
                    [det.id]
                );
                for (const comp of componentesCombosVendidos) {
                    if (comp.tipo_inventario === 'directo') {
                        await runQuery(
                            `UPDATE productos SET stock = ROUND(stock + ?, 4) WHERE id = ?`,
                            [comp.cantidad_total, comp.componente_producto_id]
                        );
                    }
                }
            }
        }

        // Revertir EXACTAMENTE lo consumido en esa venta leyendo movimientos_insumos (cantidades y costos originales)
        let consumosInsumos = await allQuery(
            `SELECT id, insumo_id, cantidad, costo_unitario
             FROM movimientos_insumos
             WHERE movimiento_id = ? AND tipo = 'consumo_venta'`,
            [movimientoId]
        );

        // Respaldo para ventas antiguas sin movimiento_id en movimientos_insumos
        if (consumosInsumos.length === 0) {
            const motivoRespaldo = `Venta Ticket #${movimientoId}`;
            consumosInsumos = await allQuery(
                `SELECT id, insumo_id, cantidad, costo_unitario
                 FROM movimientos_insumos
                 WHERE movimiento_id IS NULL AND tipo = 'consumo_venta' AND motivo = ?`,
                [motivoRespaldo]
            );
            if (consumosInsumos.length > 0) {
                console.warn(
                    `[AVISO AUDITORÍA] Anulación Ticket #${movimientoId}: se utilizó el respaldo por motivo ("${motivoRespaldo}") para revertir ${consumosInsumos.length} movimiento(s) de insumos antiguos sin movimiento_id.`
                );
            }
        }

        for (const cons of consumosInsumos) {
            const cantidadDevolver = Number(Number(cons.cantidad).toFixed(4));
            const costoOriginal = Number(cons.costo_unitario ?? 0);
            await runQuery(
                `UPDATE insumos SET stock_actual = ROUND(stock_actual + ?, 4) WHERE id = ?`,
                [cantidadDevolver, cons.insumo_id]
            );
            await runQuery(
                `INSERT INTO movimientos_insumos (insumo_id, movimiento_id, tipo, cantidad, costo_unitario, motivo)
                 VALUES (?, ?, 'reingreso_anulacion', ?, ?, ?)`,
                [cons.insumo_id, movimientoId, cantidadDevolver, costoOriginal, `Anulación Ticket #${movimientoId}`]
            );
        }

        const nuevaDesc = `${mov.descripcion} [ANULADO: ${motivoLimpio}]`;
        await runQuery(
            `UPDATE movimientos
             SET estado = 'anulado',
                 descripcion = ?,
                 anulado_por = ?,
                 fecha_anulacion = CURRENT_TIMESTAMP,
                 motivo_anulacion = ?
             WHERE id = ?`,
            [nuevaDesc, ejecutor.id, motivoLimpio, movimientoId]
        );
        return true;
    });
}

async function obtenerMovimientosCaja(cajaId) {
    return await allQuery(
        `SELECT m.*, u.nombre as usuario_nombre
         FROM movimientos m
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.caja_id = ?
         ORDER BY m.fecha_hora DESC`,
        [cajaId]
    );
}

// ==========================================
// 5. ARQUEO DE CAJA Y ESTADÍSTICAS PREDICTIVAS
// ==========================================
async function cerrarCaja(cajaId, efectivoRealFisico, usuarioId = null) {
    const efectivoRealValidado = redondear2(numeroNoNegativo(efectivoRealFisico, 'El efectivo real físico'));

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que cierra la caja es obligatorio.');
    }

    return await enTransaccion(async () => {
        const ejecutor = await obtenerUsuarioPorId(usuarioId);
        if (!ejecutor) {
            throw new Error('El usuario que intenta cerrar la caja no existe o está inactivo.');
        }

        const caja = await getQuery(`SELECT * FROM cajas WHERE id = ?`, [cajaId]);
        if (!caja) throw new Error('Caja no encontrada.');
        if (caja.estado !== 'abierta') throw new Error('Esta caja ya fue cerrada.');

        if (Number(caja.usuario_id) !== Number(ejecutor.id) && !esRolAdministrativo(ejecutor.rol)) {
            throw new Error('Permiso denegado: solo el cajero titular de la caja o un Administrador puede cerrarla.');
        }

        const resumen = await allQuery(
            `SELECT tipo, metodo_pago, COALESCE(SUM(monto), 0) as total
             FROM movimientos
             WHERE caja_id = ? AND estado = 'completado'
             GROUP BY tipo, metodo_pago`,
            [cajaId]
        );

        let ingresosEfectivo = 0, egresosEfectivo = 0, ingresosQR = 0, egresosQR = 0;
        for (const fila of resumen) {
            if (fila.tipo === 'ingreso' && fila.metodo_pago === 'efectivo') ingresosEfectivo = redondear2(fila.total);
            if (fila.tipo === 'egreso' && fila.metodo_pago === 'efectivo') egresosEfectivo = redondear2(fila.total);
            if (fila.tipo === 'ingreso' && fila.metodo_pago === 'qr') ingresosQR = redondear2(fila.total);
            if (fila.tipo === 'egreso' && fila.metodo_pago === 'qr') egresosQR = redondear2(fila.total);
        }

        const fondoInicial = redondear2(caja.monto_inicial);
        const efectivoEsperado = redondear2(fondoInicial + ingresosEfectivo - egresosEfectivo);
        const qrEsperado = redondear2(ingresosQR - egresosQR);
        const diferenciaEfectivo = redondear2(efectivoRealValidado - efectivoEsperado);

        await runQuery(
            `UPDATE cajas
             SET estado = 'cerrada',
                 efectivo_esperado = ?,
                 efectivo_real = ?,
                 qr_esperado = ?,
                 diferencia_efectivo = ?,
                 fecha_cierre = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [efectivoEsperado, efectivoRealValidado, qrEsperado, diferenciaEfectivo, cajaId]
        );

        return {
            cajaId,
            fondoInicial,
            ingresosEfectivo,
            egresosEfectivo,
            efectivoEsperado,
            efectivoReal: efectivoRealValidado,
            diferenciaEfectivo,
            ingresosQR,
            egresosQR,
            qrEsperado,
            ventasTotalesTurno: redondear2(ingresosEfectivo + ingresosQR)
        };
    });
}

async function obtenerDatosCierreParaNotificacion(cajaId) {
    const caja = await getQuery(
        `SELECT c.id, c.monto_inicial, c.efectivo_esperado, c.efectivo_real,
                c.diferencia_efectivo, c.qr_esperado, c.veces_reabierta,
                datetime(c.fecha_apertura, 'localtime') as fecha_apertura,
                datetime(c.fecha_cierre, 'localtime') as fecha_cierre,
                c.estado,
                COALESCE(cf.nombre, 'Caja Principal') as caja_nombre,
                COALESCE(u.nombre, '—') as cajero_nombre,
                COALESCE(u.usuario, '—') as cajero_usuario
         FROM cajas c
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         WHERE c.id = ?`,
        [cajaId]
    );
    if (!caja) return null;

    const negocio = await obtenerConfiguracionNegocio();

    const movimientos = await allQuery(
        `SELECT id, tipo, metodo_pago, monto, descripcion, datetime(fecha_hora, 'localtime') as fecha_hora
         FROM movimientos
         WHERE caja_id = ? AND estado = 'completado'
         ORDER BY id ASC`,
        [cajaId]
    );

    let totalVentasEfectivo = 0;
    let totalVentasQR = 0;
    let totalInyeccionSencillo = 0;
    let totalEgresos = 0;
    let cantidadVentas = 0;
    let cantidadEgresos = 0;

    for (const m of movimientos) {
        const monto = Number(m.monto || 0);
        if (m.tipo === 'ingreso') {
            const desc = (m.descripcion || '').toLowerCase();
            if (desc.startsWith('inyección')) {
                totalInyeccionSencillo += monto;
            } else {
                cantidadVentas++;
                if (m.metodo_pago === 'efectivo') {
                    totalVentasEfectivo += monto;
                } else if (m.metodo_pago === 'qr') {
                    totalVentasQR += monto;
                }
            }
        } else if (m.tipo === 'egreso') {
            cantidadEgresos++;
            totalEgresos += monto;
        }
    }

    return {
        caja,
        negocio,
        metricas: {
            fondoInicial: Number(caja.monto_inicial || 0),
            totalVentas: redondear2(totalVentasEfectivo + totalVentasQR),
            totalVentasEfectivo: redondear2(totalVentasEfectivo),
            totalVentasQR: redondear2(totalVentasQR),
            totalInyeccionSencillo: redondear2(totalInyeccionSencillo),
            totalEgresos: redondear2(totalEgresos),
            efectivoEsperado: caja.efectivo_esperado !== null ? Number(caja.efectivo_esperado) : 0,
            efectivoReal: caja.efectivo_real !== null ? Number(caja.efectivo_real) : 0,
            diferenciaEfectivo: caja.diferencia_efectivo !== null ? Number(caja.diferencia_efectivo) : 0,
            qrEsperado: Number(caja.qr_esperado || 0),
            cantidadVentas,
            cantidadEgresos
        }
    };
}

async function obtenerPrediccionComprasInsumos(diasAnalisis = 30, diasCobertura = 7) {
    const insumos = await obtenerInsumos();
    const reporte = [];

    for (const ins of insumos) {
        const consumo = await getQuery(
            `SELECT COALESCE(SUM(
                CASE
                    WHEN tipo IN ('consumo_venta', 'merma') THEN cantidad
                    WHEN tipo = 'reingreso_anulacion' THEN -cantidad
                    ELSE 0
                END
             ), 0) as total_consumido
             FROM movimientos_insumos
             WHERE insumo_id = ?
               AND tipo IN ('consumo_venta', 'merma', 'reingreso_anulacion')
               AND date(fecha_hora, 'localtime') >= date('now', 'localtime', ?)`,
            [ins.id, `-${diasAnalisis} days`]
        );

        const totalConsumidoNeto = Math.max(0, Number(consumo.total_consumido || 0));
        const promedioDiario = totalConsumidoNeto / Math.max(1, diasAnalisis);
        const puntoReorden = (promedioDiario * ins.tiempo_entrega_dias) + ins.stock_seguridad;
        const stockObjetivo = (promedioDiario * diasCobertura) + ins.stock_seguridad;
        const cantidadSugeridaCompra = Math.max(0, stockObjetivo - ins.stock_actual);

        let estadoAlerta = 'OK';
        if (ins.stock_actual <= ins.stock_seguridad) {
            estadoAlerta = 'CRÍTICO (Bajo Stock de Seguridad)';
        } else if (ins.stock_actual <= puntoReorden) {
            estadoAlerta = 'COMPRAR AHORA (En Punto de Reorden)';
        }

        reporte.push({
            insumoId: ins.id,
            nombre: ins.nombre,
            unidad: ins.unidad_medida,
            stockActual: ins.stock_actual,
            consumoTotalPeriodo: Number(totalConsumidoNeto.toFixed(3)),
            consumoPromedioDiario: Number(promedioDiario.toFixed(3)),
            puntoReordenROP: Number(puntoReorden.toFixed(3)),
            cantidadSugeridaCompra: redondear2(cantidadSugeridaCompra),
            costoEstimadoCompra: redondear2(cantidadSugeridaCompra * ins.costo_por_unidad),
            estadoAlerta
        });
    }

    return reporte;
}

// ==========================================
// 6. ESTADÍSTICAS Y CONTABILIDAD (PANEL ADMIN)
// ==========================================
async function obtenerEstadisticasCaja(cajaId) {
    // Solo contamos ventas comerciales de productos para no distorsionar ingresos con reposiciones de efectivo
    const kpiVentas = await getQuery(
        `SELECT COUNT(DISTINCT m.id) as cantidad_tickets, COALESCE(SUM(d.subtotal), 0) as ventas_totales
         FROM movimientos m
         INNER JOIN detalle_movimientos d ON m.id = d.movimiento_id
         WHERE m.caja_id = ? AND m.tipo = 'ingreso' AND m.estado = 'completado'`,
        [cajaId]
    );

    const kpiCostos = await getQuery(
        `SELECT COALESCE(SUM(d.cantidad * d.costo_unitario), 0) as costo_total_ventas
         FROM detalle_movimientos d
         INNER JOIN movimientos m ON d.movimiento_id = m.id
         WHERE m.caja_id = ? AND m.estado = 'completado'`,
        [cajaId]
    );

    const kpiEgresos = await getQuery(
        `SELECT COALESCE(SUM(monto), 0) as total_egresos
         FROM movimientos WHERE caja_id = ? AND tipo = 'egreso' AND estado = 'completado'`,
        [cajaId]
    );

    const kpiReposiciones = await getQuery(
        `SELECT COALESCE(SUM(monto), 0) as total_reposiciones
         FROM movimientos m
         WHERE m.caja_id = ? AND m.tipo = 'ingreso' AND m.estado = 'completado'
           AND NOT EXISTS (SELECT 1 FROM detalle_movimientos d WHERE d.movimiento_id = m.id)`,
        [cajaId]
    );

    const rendimientoProductos = await allQuery(
        `SELECT 
            p.id,
            p.nombre,
            p.categoria,
            COALESCE(SUM(CASE WHEN m.caja_id = ? AND m.estado = 'completado' THEN d.cantidad ELSE 0 END), 0) as unidades_vendidas,
            COALESCE(SUM(CASE WHEN m.caja_id = ? AND m.estado = 'completado' THEN d.subtotal ELSE 0 END), 0) as ingresos_generados,
            COALESCE(SUM(CASE WHEN m.caja_id = ? AND m.estado = 'completado' THEN (d.subtotal - (d.cantidad * d.costo_unitario)) ELSE 0 END), 0) as ganancia_generada
         FROM productos p
         LEFT JOIN detalle_movimientos d ON p.id = d.producto_id
         LEFT JOIN movimientos m ON d.movimiento_id = m.id
         WHERE p.activo = 1
         GROUP BY p.id
         ORDER BY unidades_vendidas DESC`,
        [cajaId, cajaId, cajaId]
    );

    const ventasTotales = redondear2(kpiVentas.ventas_totales);
    const costoTotalVentas = redondear2(kpiCostos.costo_total_ventas);
    const totalEgresos = redondear2(kpiEgresos.total_egresos);
    const totalReposiciones = redondear2(kpiReposiciones.total_reposiciones);

    const ticketPromedio = kpiVentas.cantidad_tickets > 0
        ? ventasTotales / kpiVentas.cantidad_tickets
        : 0;

    const gananciaBruta = redondear2(ventasTotales - costoTotalVentas);
    const flujoNetoOperativo = redondear2(gananciaBruta - totalEgresos);

    return {
        ventasTotales,
        cantidadTickets: kpiVentas.cantidad_tickets,
        ticketPromedio: redondear2(ticketPromedio),
        costoTotalVentas,
        gananciaBruta,
        totalEgresos,
        totalReposiciones,
        flujoNetoOperativo,
        productosMasVendidos: rendimientoProductos.filter(p => p.unidades_vendidas > 0),
        productosSinRotacion: rendimientoProductos.filter(p => p.unidades_vendidas === 0)
    };
} // <-- AQUÍ FALTABA CERRAR LA FUNCIÓN ANTES DE LA SECCIÓN 7

// ==========================================
// 7. TENDENCIAS HORARIAS, MÉTODOS DE PAGO Y EXPORTACIÓN EXCEL (CSV)
// ==========================================
async function obtenerDesgloseMetodosPago(cajaId) {
    const filas = await allQuery(
        `SELECT metodo_pago, COUNT(id) as transacciones, COALESCE(SUM(monto), 0) as total
         FROM movimientos
         WHERE caja_id = ? AND tipo = 'ingreso' AND estado = 'completado'
         GROUP BY metodo_pago`,
        [cajaId]
    );

    const sumaTotal = filas.reduce((acc, f) => acc + f.total, 0);

    return filas.map(f => ({
        metodoPago: f.metodo_pago,
        transacciones: f.transacciones,
        montoTotal: redondear2(f.total),
        porcentaje: sumaTotal > 0 ? Number(((f.total / sumaTotal) * 100).toFixed(1)) : 0
    }));
}

async function obtenerTendenciasVentas() {
    const ventasPorHora = await allQuery(
        `SELECT strftime('%H:00', fecha_hora, 'localtime') as hora,
                COUNT(id) as cantidad_tickets,
                ROUND(SUM(monto), 2) as total_vendido
         FROM movimientos
         WHERE tipo = 'ingreso' AND estado = 'completado'
           AND date(fecha_hora, 'localtime') = date('now', 'localtime')
         GROUP BY hora
         ORDER BY hora ASC`
    );

    const comparativaSemanal = await allQuery(
        `SELECT date(fecha_hora, 'localtime') as fecha,
                COUNT(id) as cantidad_tickets,
                ROUND(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 2) as ingresos,
                ROUND(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 2) as egresos
         FROM movimientos
         WHERE estado = 'completado'
           AND date(fecha_hora, 'localtime') >= date('now', 'localtime', '-7 days')
         GROUP BY fecha
         ORDER BY fecha ASC`
    );

    return { ventasPorHora, comparativaSemanal };
}

function sanitizarTextoCSV(valor) {
    const str = String(valor ?? '');
    // Evitar inyección de fórmulas en Excel si empieza con =, +, - o @
    const protegido = /^[=+\-@]/.test(str.trimStart()) ? `'${str}` : str;
    return `"${protegido.replace(/"/g, '""')}"`;
}

async function generarReporteCSV(cajaId = null) {
    const filtroCaja = cajaId ? `WHERE m.caja_id = ?` : ``;
    const params = cajaId ? [cajaId] : [];

    const filas = await allQuery(
        `SELECT m.id, m.caja_id, cf.nombre as caja_nombre, m.fecha_hora, m.tipo, m.metodo_pago,
                m.monto, m.monto_recibido, m.cambio, m.estado, m.descripcion
         FROM movimientos m
         LEFT JOIN cajas c ON m.caja_id = c.id
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         ${filtroCaja}
         ORDER BY m.fecha_hora DESC`,
        params
    );

    const cabeceras = [
        'ID_Movimiento', 'Nro_Turno', 'Caja_Estacion', 'Fecha_Hora', 'Tipo', 'Metodo_Pago',
        'Monto_Bs', 'Recibido_Bs', 'Cambio_Bs', 'Estado', 'Descripcion'
    ].join(';');

    const lineas = filas.map(r => [
        r.id,
        r.caja_id,
        sanitizarTextoCSV(r.caja_nombre || 'Caja Principal'),
        r.fecha_hora,
        r.tipo,
        r.metodo_pago,
        r.monto,
        r.monto_recibido ?? 0,
        r.cambio ?? 0,
        r.estado,
        sanitizarTextoCSV(r.descripcion || '')
    ].join(';'));

    return [cabeceras, ...lineas].join('\n');
}

async function generarReporteExcel(cajaId = null) {
    const ExcelJS = require('exceljs');
    const filtroCaja = cajaId ? `WHERE m.caja_id = ?` : ``;
    const params = cajaId ? [cajaId] : [];

    const movimientos = await allQuery(
        `SELECT m.id, m.caja_id, cf.nombre as caja_nombre, datetime(m.fecha_hora, 'localtime') as fecha_hora,
                COALESCE(u.nombre, '—') as operador, m.tipo, m.metodo_pago,
                m.monto, m.monto_recibido, m.cambio, m.estado, m.descripcion
         FROM movimientos m
         LEFT JOIN cajas c ON m.caja_id = c.id
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         ${filtroCaja}
         ORDER BY m.fecha_hora DESC`,
        params
    );

    const cajas = await allQuery(
        `SELECT c.id, cf.nombre as caja_nombre, COALESCE(u.nombre, '—') as cajero,
                datetime(c.fecha_apertura, 'localtime') as fecha_apertura,
                datetime(c.fecha_cierre, 'localtime') as fecha_cierre,
                c.estado, c.monto_inicial, c.efectivo_esperado, c.efectivo_real,
                c.diferencia_efectivo, c.qr_esperado, c.veces_reabierta
         FROM cajas c
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         ${cajaId ? 'WHERE c.id = ?' : ''}
         ORDER BY c.id DESC`,
        params
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema POS Híbrido';
    workbook.created = new Date();

    const hojaMov = workbook.addWorksheet('Movimientos');
    hojaMov.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'N° Turno', key: 'caja_id', width: 12 },
        { header: 'Estación / Caja', key: 'caja_nombre', width: 20 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Operador', key: 'operador', width: 18 },
        { header: 'Tipo', key: 'tipo', width: 12 },
        { header: 'Método Pago', key: 'metodo_pago', width: 14 },
        { header: 'Monto (Bs)', key: 'monto', width: 14 },
        { header: 'Recibido (Bs)', key: 'monto_recibido', width: 14 },
        { header: 'Cambio (Bs)', key: 'cambio', width: 14 },
        { header: 'Estado', key: 'estado', width: 13 },
        { header: 'Descripción', key: 'descripcion', width: 34 }
    ];

    const estiloCabecera = (fila) => {
        fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        fila.alignment = { vertical: 'middle', horizontal: 'center' };
    };
    estiloCabecera(hojaMov.getRow(1));

    for (const m of movimientos) {
        hojaMov.addRow({
            ...m,
            monto: Number(m.monto || 0),
            monto_recibido: Number(m.monto_recibido || 0),
            cambio: Number(m.cambio || 0)
        });
    }
    ['H', 'I', 'J'].forEach((col) => {
        hojaMov.getColumn(col).numFmt = '#,##0.00';
    });

    const hojaCajas = workbook.addWorksheet('Arqueos de Caja');
    hojaCajas.columns = [
        { header: 'N° Turno', key: 'id', width: 12 },
        { header: 'Estación / Caja', key: 'caja_nombre', width: 20 },
        { header: 'Cajero', key: 'cajero', width: 18 },
        { header: 'Apertura', key: 'fecha_apertura', width: 20 },
        { header: 'Cierre', key: 'fecha_cierre', width: 20 },
        { header: 'Estado', key: 'estado', width: 12 },
        { header: 'Monto Inicial (Bs)', key: 'monto_inicial', width: 18 },
        { header: 'Efectivo Esperado (Bs)', key: 'efectivo_esperado', width: 22 },
        { header: 'Efectivo Real (Bs)', key: 'efectivo_real', width: 18 },
        { header: 'Diferencia (Bs)', key: 'diferencia_efectivo', width: 16 },
        { header: 'QR Esperado (Bs)', key: 'qr_esperado', width: 17 },
        { header: 'Reaperturas', key: 'veces_reabierta', width: 13 }
    ];
    estiloCabecera(hojaCajas.getRow(1));

    for (const c of cajas) {
        hojaCajas.addRow({
            ...c,
            fecha_cierre: c.fecha_cierre || 'En curso',
            monto_inicial: Number(c.monto_inicial || 0),
            efectivo_esperado: c.efectivo_esperado !== null ? Number(c.efectivo_esperado) : null,
            efectivo_real: c.efectivo_real !== null ? Number(c.efectivo_real) : null,
            diferencia_efectivo: c.diferencia_efectivo !== null ? Number(c.diferencia_efectivo) : null,
            qr_esperado: Number(c.qr_esperado || 0),
            veces_reabierta: Number(c.veces_reabierta || 0)
        });
    }
    ['G', 'H', 'I', 'J', 'K'].forEach((col) => {
        hojaCajas.getColumn(col).numFmt = '#,##0.00';
    });

    return await workbook.xlsx.writeBuffer();
}

module.exports = {
    redondear2,
    numeroPositivo,
    numeroNoNegativo,
    esRolAdministrativo,
    obtenerConfiguracionNegocio,
    guardarConfiguracionNegocio,
    inicializarSistemaPrimeraVez,
    verificarUsuario,
    autenticarUsuarioPorId,
    obtenerUsuarioPorId,
    obtenerUsuarios,
    obtenerCajerosParaLogin,
    sistemaEstaInstalado,
    crearUsuario,
    crearUsuarioConPermiso,
    borrarUsuarioConPermiso,
    cambiarPasswordConPermiso,
    crearInsumo,
    obtenerInsumos,
    registrarCompraInsumo,
    registrarMermaInsumo,
    asignarIngredienteReceta,
    calcularDisponibilidadProducto,
    obtenerCategorias,
    crearCategoria,
    crearProductoConInsumos,
    crearProducto,
    registrarCompraProductoDirecto,
    obtenerProductos,
    obtenerCajasFisicas,
    crearCajaFisica,
    desactivarCajaFisica,
    reactivarCajaFisica,
    obtenerCajasAbiertas,
    obtenerCajaAbierta,
    obtenerHistorialCajas,
    abrirCaja,
    reabrirCajaConPermiso,
    registrarVentaCompleta,
    registrarEgreso,
    registrarIngresoEfectivo,
    anularMovimientoConPermiso,
    obtenerMovimientosCaja,
    cerrarCaja,
    obtenerPrediccionComprasInsumos,
    obtenerEstadisticasCaja,
    obtenerDesgloseMetodosPago,
    obtenerTendenciasVentas,
    generarReporteCSV,
    generarReporteExcel,
    sanitizarTextoCSV,
    obtenerDatosCierreParaNotificacion,
    obtenerGruposModificadores,
    crearGrupoModificadores,
    actualizarGrupoModificadores,
    eliminarGrupoModificadores,
    asignarModificadoresAProducto
};