const db = require('../database/database');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 10;
const MAX_INTENTOS_LOGIN = 5;
const TIEMPO_BLOQUEO_LOGIN_MS = 15 * 60 * 1000; // 15 minutos
const intentosFallidosLogin = new Map();

function esHashBcrypt(valor) {
    return typeof valor === 'string' && /^\$2[aby]\$\d{2}\$/.test(valor);
}

function obtenerClaveRateLimitLogin(identificadorUsuario, ip = 'local') {
    const idNorm = String(identificadorUsuario || 'desconocido').trim().toLowerCase();
    const ipNorm = String(ip || 'local').trim().toLowerCase();
    return `${idNorm}|${ipNorm}`;
}

function verificarBloqueoLogin(clave) {
    const registro = intentosFallidosLogin.get(clave);
    if (!registro) return;

    const ahora = Date.now();
    if (registro.bloqueadoHasta && registro.bloqueadoHasta > ahora) {
        const segundosRestantes = Math.ceil((registro.bloqueadoHasta - ahora) / 1000);
        throw new Error(
            `Cuenta bloqueada temporalmente tras ${MAX_INTENTOS_LOGIN} intentos fallidos. Intenta nuevamente en ${segundosRestantes} segundos.`
        );
    }

    if (registro.bloqueadoHasta && registro.bloqueadoHasta <= ahora) {
        intentosFallidosLogin.delete(clave);
    }
}

function registrarIntentoFallidoLogin(clave) {
    const ahora = Date.now();
    const actual = intentosFallidosLogin.get(clave) || { intentos: 0, bloqueadoHasta: null };
    actual.intentos += 1;

    if (actual.intentos >= MAX_INTENTOS_LOGIN) {
        actual.bloqueadoHasta = ahora + TIEMPO_BLOQUEO_LOGIN_MS;
        intentosFallidosLogin.set(clave, actual);
        const minutos = Math.ceil(TIEMPO_BLOQUEO_LOGIN_MS / 60000);
        throw new Error(
            `Demasiados intentos fallidos (${MAX_INTENTOS_LOGIN}). El acceso se ha bloqueado temporalmente por ${minutos} minutos.`
        );
    }

    intentosFallidosLogin.set(clave, actual);
}

function limpiarIntentosLogin(clave) {
    intentosFallidosLogin.delete(clave);
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

    if (!candidato) {
        registrarIntentoFallidoLogin(claveRL);
        return undefined;
    }

    const coincide = await compararYActualizarPassword(pin, candidato.pin_o_password, candidato.id);
    if (!coincide) {
        registrarIntentoFallidoLogin(claveRL);
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

    if (!candidato) {
        registrarIntentoFallidoLogin(claveRL);
        throw new Error('Credenciales incorrectas o usuario inactivo.');
    }

    const coincide = await compararYActualizarPassword(pin, candidato.pin_o_password, candidato.id);
    if (!coincide) {
        registrarIntentoFallidoLogin(claveRL);
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

async function crearUsuario(nombre, pin, rol) {
    const nombreLimpio = String(nombre || '').trim();
    if (!nombreLimpio) {
        throw new Error('El nombre de usuario no puede estar vacío.');
    }
    if (pin === null || pin === undefined || String(pin).trim() === '') {
        throw new Error('La contraseña / PIN no puede estar vacía.');
    }
    const pinStr = String(pin).trim();
    const hashPin = esHashBcrypt(pinStr) ? pinStr : await bcrypt.hash(pinStr, BCRYPT_ROUNDS);

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

    const nuevoHash = await bcrypt.hash(String(nuevoPin).trim(), BCRYPT_ROUNDS);

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

async function inicializarSistemaPrimeraVez(datos) {
    const configActual = await obtenerConfiguracionNegocio();
    const usuariosExistentes = await obtenerUsuarios();

    if (Number(configActual.configurado) === 1 && usuariosExistentes.length > 0) {
        throw new Error('El sistema ya fue inicializado previamente.');
    }

    if (!datos.nombreNegocio || !datos.nombreNegocio.trim()) {
        throw new Error('Debes ingresar el nombre de la empresa o negocio.');
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
            datos.nombreNegocio.trim(),
            datos.modalidadNombre || 'Venta Directa No Perecedera',
            datos.usaStockDirecto ? 1 : 0,
            datos.usaVencimiento ? 1 : 0,
            datos.usaRecetasEnsamblaje ? 1 : 0
        ]
    );

    let superAdminId = null;
    if (usuariosExistentes.length === 0) {
        if (!datos.adminNombre || !datos.adminNombre.trim() || !datos.adminPin || !String(datos.adminPin).trim()) {
            throw new Error('Debes ingresar el nombre y PIN/contraseña para crear el primer Super Admin.');
        }
        superAdminId = await crearUsuario(datos.adminNombre.trim(), String(datos.adminPin).trim(), 'superadmin');
    } else {
        superAdminId = usuariosExistentes[0].id;
    }

    return {
        configuracionNegocio: await obtenerConfiguracionNegocio(),
        superAdminId
    };
}

// ==========================================
// 2. INSUMOS (MATERIA PRIMA) Y RECETAS (ESCANDALLO / BOM)
// ==========================================
async function crearInsumo(nombre, unidadMedida, stockInicial = 0, costoPorUnidad = 0, stockSeguridad = 0, tiempoEntregaDias = 1, fechaVencimiento = null) {
    const res = await runQuery(
        `INSERT INTO insumos (nombre, unidad_medida, stock_actual, costo_por_unidad, stock_seguridad, tiempo_entrega_dias, fecha_vencimiento)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [nombre, unidadMedida, stockInicial, costoPorUnidad, stockSeguridad, tiempoEntregaDias, fechaVencimiento || null]
    );
    const insumoId = res.lastID;

    if (stockInicial > 0) {
        await runQuery(
            `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
             VALUES (?, 'compra', ?, ?, 'Inventario inicial')`,
            [insumoId, stockInicial, costoPorUnidad]
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
    return costoActualizado;
}

// Compra de insumo con Costo Promedio Ponderado (CPP) y actualización en cascada de recetas
async function registrarCompraInsumo(insumoId, cantidadComprada, costoTotalCompra, motivo = 'Compra a proveedor') {
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

    await runQuery(
        `INSERT INTO movimientos_insumos (insumo_id, tipo, cantidad, costo_unitario, motivo)
         VALUES (?, 'compra', ?, ?, ?)`,
        [insumoId, cantValidada, Number((costoValidado / cantValidada).toFixed(4)), motivo]
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
// 3. PRODUCTOS DEL CATÁLOGO
// ==========================================
async function crearProducto(nombre, precio, costo = 0, categoria = 'General', stock = null, unidadMedida = 'unidades', stockMinimo = 0, fechaVencimiento = null) {
    const precioValidado = redondear2(numeroPositivo(precio, 'El precio del producto'));
    const costoValidado = redondear2(numeroNoNegativo(costo ?? 0, 'El costo del producto'));
    const tipoInventario = stock !== null ? 'directo' : 'libre';
    const res = await runQuery(
        `INSERT INTO productos (nombre, precio, costo, categoria, unidad_medida, tipo_inventario, stock, stock_minimo, fecha_vencimiento)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, precioValidado, costoValidado, categoria, unidadMedida || 'unidades', tipoInventario, stock, Number(stockMinimo || 0), fechaVencimiento || null]
    );
    return res.lastID;
}

// Reabastecimiento directo de artículos terminados con Costo Promedio Ponderado (NIC 2)
async function registrarCompraProductoDirecto(productoId, cantidadComprada, costoTotalCompra, fechaVencimiento = null) {
    const cantValidada = numeroPositivo(cantidadComprada, 'La cantidad comprada');
    const costoValidado = redondear2(numeroNoNegativo(costoTotalCompra, 'El costo total de compra'));

    const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [productoId]);
    if (!prod) throw new Error('Producto no encontrado.');

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

    return {
        productoId,
        nuevoStock: Number(nuevoStock.toFixed(4)),
        nuevoCostoUnitario: Number(nuevoCostoUnitario.toFixed(4))
    };
}

async function obtenerProductos() {
    const productos = await allQuery(`
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
    `);

    return productos.map((p) => {
        let unidadesDisponibles = null;
        let insumoLimitante = null;

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
        }

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
            insumo_limitante: insumoLimitante
        };
    });
}

// ==========================================
// 4. APERTURA DE CAJA, VENTAS Y ANULACIONES
// ==========================================
async function obtenerCajaAbierta() {
    return await getQuery(
        `SELECT c.*, u.nombre as usuario_nombre, u.rol as usuario_rol
         FROM cajas c
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         WHERE c.estado = 'abierta'
         LIMIT 1`
    );
}

async function obtenerHistorialCajas() {
    return await allQuery(
        `SELECT c.*, u.nombre as usuario_nombre, u.rol as usuario_rol
         FROM cajas c
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         ORDER BY c.id DESC`
    );
}

async function abrirCaja(usuarioId, montoInicial) {
    const montoInicialValidado = redondear2(numeroNoNegativo(montoInicial, 'El monto inicial'));

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que abre la caja es obligatorio.');
    }

    const usuario = await obtenerUsuarioPorId(usuarioId);
    if (!usuario) {
        throw new Error('Usuario no válido o inactivo.');
    }

    const cajaAbierta = await obtenerCajaAbierta();
    if (cajaAbierta) {
        throw new Error('Ya existe una caja abierta. Ciérrala antes de abrir un nuevo turno.');
    }

    const res = await runQuery(
        `INSERT INTO cajas (usuario_id, monto_inicial, estado) VALUES (?, ?, 'abierta')`,
        [usuario.id, montoInicialValidado]
    );
    return res.lastID;
}

async function reabrirCajaConPermiso(adminId, cajaId, motivo = 'Revisión administrativa') {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo el Administrador puede reabrir una caja cerrada.');
    }

    const cajaAbierta = await obtenerCajaAbierta();
    if (cajaAbierta) {
        throw new Error(`Ya está abierta la Caja #${cajaAbierta.id}. Ciérrala primero antes de reabrir otra.`);
    }

    const caja = await getQuery(`SELECT * FROM cajas WHERE id = ?`, [cajaId]);
    if (!caja) throw new Error('Caja no encontrada.');

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

    // 1. Validar cantidad positiva de cada ítem y agrupar por productoId sumando cantidades
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
        const acumulado = mapaItemsAgrupados.get(prodId) || 0;
        mapaItemsAgrupados.set(prodId, Number((acumulado + cant).toFixed(4)));
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

        for (const [prodId, cantidadTotal] of mapaItemsAgrupados.entries()) {
            const prod = await getQuery(`SELECT * FROM productos WHERE id = ? AND activo = 1`, [prodId]);
            if (!prod) throw new Error(`Producto con ID ${prodId} no existe.`);

            if (prod.tipo_inventario === 'receta') {
                const receta = await allQuery(
                    `SELECT r.insumo_id, r.cantidad_requerida, i.nombre, i.stock_actual, i.unidad_medida, i.costo_por_unidad
                     FROM recetas r
                     INNER JOIN insumos i ON r.insumo_id = i.id
                     WHERE r.producto_id = ?`,
                    [prod.id]
                );

                for (const ing of receta) {
                    const requeridoTotalItem = Number((ing.cantidad_requerida * cantidadTotal).toFixed(4));
                    if (!consumoAcumuladoInsumos[ing.insumo_id]) {
                        consumoAcumuladoInsumos[ing.insumo_id] = {
                            insumoId: ing.insumo_id,
                            nombre: ing.nombre,
                            unidad: ing.unidad_medida,
                            costoUnitario: ing.costo_por_unidad,
                            cantidadTotalRequerida: 0
                        };
                    }
                    consumoAcumuladoInsumos[ing.insumo_id].cantidadTotalRequerida = Number(
                        (consumoAcumuladoInsumos[ing.insumo_id].cantidadTotalRequerida + requeridoTotalItem).toFixed(4)
                    );
                }
            }

            const precioUnitario = redondear2(prod.precio);
            const subtotal = redondear2(precioUnitario * cantidadTotal);
            montoTotal = redondear2(montoTotal + subtotal);

            itemsProcesados.push({
                productoId: prod.id,
                nombre: prod.nombre,
                cantidad: cantidadTotal,
                precioUnitario,
                costoUnitario: Number(prod.costo || 0),
                subtotal,
                tipoInventario: prod.tipo_inventario
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

        // 4. Descuento atómico de stock directo en productos
        for (const det of itemsProcesados) {
            await runQuery(
                `INSERT INTO detalle_movimientos (movimiento_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [movimientoId, det.productoId, det.cantidad, det.precioUnitario, det.costoUnitario, det.subtotal]
            );

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

        // 5. Descuento atómico de stock_actual en insumos (recetas) y registro con movimiento_id
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
            cambio
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

async function anularMovimientoConPermiso(adminId, movimientoId, motivoAnulacion) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo el administrador puede anular movimientos.');
    }

    const motivoLimpio = (motivoAnulacion && String(motivoAnulacion).trim() !== '')
        ? String(motivoAnulacion).trim()
        : 'Error';

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
    const kpiVentas = await getQuery(
        `SELECT COUNT(id) as cantidad_tickets, COALESCE(SUM(monto), 0) as ventas_totales
         FROM movimientos WHERE caja_id = ? AND tipo = 'ingreso' AND estado = 'completado'`,
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
        `SELECT m.id, m.caja_id, m.fecha_hora, m.tipo, m.metodo_pago,
                m.monto, m.monto_recibido, m.cambio, m.estado, m.descripcion
         FROM movimientos m
         ${filtroCaja}
         ORDER BY m.fecha_hora DESC`,
        params
    );

    const cabeceras = [
        'ID_Movimiento', 'ID_Caja', 'Fecha_Hora', 'Tipo', 'Metodo_Pago',
        'Monto_Bs', 'Recibido_Bs', 'Cambio_Bs', 'Estado', 'Descripcion'
    ].join(';');

    const lineas = filas.map(r => [
        r.id,
        r.caja_id,
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
    crearProducto,
    registrarCompraProductoDirecto,
    obtenerProductos,
    obtenerCajaAbierta,
    obtenerHistorialCajas,
    abrirCaja,
    reabrirCajaConPermiso,
    registrarVentaCompleta,
    registrarEgreso,
    anularMovimientoConPermiso,
    obtenerMovimientosCaja,
    cerrarCaja,
    obtenerPrediccionComprasInsumos,
    obtenerEstadisticasCaja,
    obtenerDesgloseMetodosPago,
    obtenerTendenciasVentas,
    generarReporteCSV,
    sanitizarTextoCSV
};