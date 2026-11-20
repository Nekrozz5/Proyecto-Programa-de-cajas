/**
 * server/repositories/configuracion.repo.js
 * Repositorio para la configuración del negocio y régimen tributario.
 * Gestiona la tabla singleton `configuracion_negocio`.
 */

const { runQuery, getQuery, allQuery, redondear2, numeroNoNegativo } = require('./db');
const { obtenerUsuarioPorId, esRolAdministrativo } = require('./auth.repo');
const { normalizarRegimen } = require('../domain/fiscal');

async function obtenerConfiguracionNegocio() {
    let config = await getQuery(`SELECT * FROM configuracion_negocio WHERE id = 1`);
    if (!config) {
        await runQuery(
            `INSERT INTO configuracion_negocio (id, nombre_negocio, modalidad_nombre, usa_stock_directo, usa_vencimiento, usa_recetas_ensamblaje, habilita_apps_comida, habilita_delivery, configurado)
             VALUES (1, 'Mi Negocio', 'Venta Directa No Perecedera', 1, 0, 0, 0, 0, 1)`
        );
        config = await getQuery(`SELECT * FROM configuracion_negocio WHERE id = 1`);
    }
    return config;
}

async function guardarConfiguracionNegocio(adminId, config) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || (ejecutor.rol !== 'developer' && ejecutor.rol !== 'propietario')) {
        throw new Error('Permiso denegado: solo el rol Developer o Propietario(a) puede modificar la modalidad del negocio.');
    }

    const regimen = normalizarRegimen(config.regimenTributario);
    const ivaPorc = config.ivaPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.ivaPorcentaje, 'El porcentaje de IVA')) : 13;
    const itPorc = config.itPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.itPorcentaje, 'El porcentaje de IT')) : 3;
    const itBase = config.itBase === 'solo_facturadas' ? 'solo_facturadas' : (config.itBase === 'todas_las_ventas' ? 'todas_las_ventas' : null);
    const emiteFacturaFinal = regimen === 'simplificado_control_interno'
        ? 0
        : (config.emiteFactura !== undefined ? (config.emiteFactura ? 1 : 0) : null);
    const habilitaDeliveryVal = config.habilitaDelivery !== undefined
        ? (config.habilitaDelivery ? 1 : 0)
        : (config.habilita_delivery !== undefined ? (config.habilita_delivery ? 1 : 0) : null);

    await runQuery(
        `UPDATE configuracion_negocio
         SET nombre_negocio = ?,
             modalidad_nombre = ?,
             usa_stock_directo = ?,
             usa_vencimiento = ?,
             usa_recetas_ensamblaje = ?,
             habilita_apps_comida = COALESCE(?, habilita_apps_comida, 0),
             habilita_delivery = COALESCE(?, habilita_delivery, 0),
             nit_negocio = COALESCE(?, nit_negocio, ''),
             regimen_tributario = COALESCE(?, regimen_tributario, 'simplificado_control_interno'),
             emite_factura = COALESCE(?, emite_factura, 0),
             iva_porcentaje = ?,
             it_porcentaje = ?,
             it_base = COALESCE(?, it_base, 'todas_las_ventas'),
             usa_respaldo_compras_egresos = COALESCE(?, usa_respaldo_compras_egresos, 1),
             configurado = 1
         WHERE id = 1`,
        [
            (config.nombreNegocio || 'Mi Negocio').trim(),
            config.modalidadNombre || 'Personalizado',
            config.usaStockDirecto ? 1 : 0,
            config.usaVencimiento ? 1 : 0,
            config.usaRecetasEnsamblaje ? 1 : 0,
            config.habilitaAppsComida !== undefined ? (config.habilitaAppsComida ? 1 : 0) : null,
            habilitaDeliveryVal,
            config.nitNegocio !== undefined ? String(config.nitNegocio).trim() : null,
            config.regimenTributario !== undefined ? regimen : null,
            emiteFacturaFinal,
            ivaPorc,
            itPorc,
            itBase,
            config.usaRespaldoComprasEgresos !== undefined ? (config.usaRespaldoComprasEgresos ? 1 : 0) : null
        ]
    );
    return await obtenerConfiguracionNegocio();
}

async function actualizarConfiguracionNegocio(config, adminId = null) {
    if (adminId) {
        const ejecutor = await obtenerUsuarioPorId(adminId);
        if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
            throw new Error('Permiso denegado: rol no autorizado para actualizar la configuración.');
        }
    }

    const habilitaDeliveryVal = config.habilita_delivery !== undefined
        ? (config.habilita_delivery ? 1 : 0)
        : (config.habilitaDelivery !== undefined ? (config.habilitaDelivery ? 1 : 0) : null);

    const habilitaAppsComidaVal = config.habilita_apps_comida !== undefined
        ? (config.habilita_apps_comida ? 1 : 0)
        : (config.habilitaAppsComida !== undefined ? (config.habilitaAppsComida ? 1 : 0) : null);

    const nombreNegocio = config.nombre_negocio !== undefined
        ? String(config.nombre_negocio).trim()
        : (config.nombreNegocio !== undefined ? String(config.nombreNegocio).trim() : null);

    const modalidadNombre = config.modalidad_nombre !== undefined
        ? config.modalidad_nombre
        : (config.modalidadNombre !== undefined ? config.modalidadNombre : null);

    const usaStockDirecto = config.usa_stock_directo !== undefined
        ? (config.usa_stock_directo ? 1 : 0)
        : (config.usaStockDirecto !== undefined ? (config.usaStockDirecto ? 1 : 0) : null);

    const usaVencimiento = config.usa_vencimiento !== undefined
        ? (config.usa_vencimiento ? 1 : 0)
        : (config.usaVencimiento !== undefined ? (config.usaVencimiento ? 1 : 0) : null);

    const usaRecetas = config.usa_recetas_ensamblaje !== undefined
        ? (config.usa_recetas_ensamblaje ? 1 : 0)
        : (config.usaRecetasEnsamblaje !== undefined ? (config.usaRecetasEnsamblaje ? 1 : 0) : null);

    const nitNegocio = config.nit_negocio !== undefined
        ? String(config.nit_negocio).trim()
        : (config.nitNegocio !== undefined ? String(config.nitNegocio).trim() : null);

    await runQuery(
        `UPDATE configuracion_negocio
         SET nombre_negocio = COALESCE(?, nombre_negocio),
             modalidad_nombre = COALESCE(?, modalidad_nombre),
             usa_stock_directo = COALESCE(?, usa_stock_directo),
             usa_vencimiento = COALESCE(?, usa_vencimiento),
             usa_recetas_ensamblaje = COALESCE(?, usa_recetas_ensamblaje),
             habilita_apps_comida = COALESCE(?, habilita_apps_comida),
             habilita_delivery = COALESCE(?, habilita_delivery),
             nit_negocio = COALESCE(?, nit_negocio)
         WHERE id = 1`,
        [
            nombreNegocio,
            modalidadNombre,
            usaStockDirecto,
            usaVencimiento,
            usaRecetas,
            habilitaAppsComidaVal,
            habilitaDeliveryVal,
            nitNegocio
        ]
    );

    return await obtenerConfiguracionNegocio();
}

async function guardarConfiguracionContable(adminId, config) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador o Propietario(a) puede modificar la configuración contable.');
    }

    const regimen = normalizarRegimen(config.regimenTributario);
    const emiteFactura = regimen === 'simplificado_control_interno'
        ? 0
        : (config.emiteFactura !== undefined ? (config.emiteFactura ? 1 : 0) : 1);
    const ivaPorc = config.ivaPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.ivaPorcentaje, 'El porcentaje de IVA')) : 13;
    const itPorc = config.itPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.itPorcentaje, 'El porcentaje de IT')) : 3;
    const itBase = config.itBase === 'solo_facturadas' ? 'solo_facturadas' : 'todas_las_ventas';
    const usaRespaldo = config.usaRespaldoComprasEgresos !== undefined ? (config.usaRespaldoComprasEgresos ? 1 : 0) : 1;

    await runQuery(
        `UPDATE configuracion_negocio
         SET nombre_negocio = COALESCE(?, nombre_negocio),
             nit_negocio = ?,
             regimen_tributario = ?,
             emite_factura = ?,
             iva_porcentaje = ?,
             it_porcentaje = ?,
             it_base = ?,
             usa_respaldo_compras_egresos = ?,
             configurado = 1
         WHERE id = 1`,
        [
            config.nombreNegocio ? String(config.nombreNegocio).trim() : null,
            String(config.nitNegocio || '').trim(),
            regimen,
            emiteFactura,
            ivaPorc,
            itPorc,
            itBase,
            usaRespaldo
        ]
    );
    return await obtenerConfiguracionNegocio();
}

// ==========================================
// CONFIGURACIÓN SMTP Y DESTINATARIOS
// ==========================================

async function obtenerConfiguracionSmtp() {
    return await getQuery(`SELECT * FROM configuracion_smtp WHERE id = 1`);
}

async function guardarConfiguracionSmtp(adminIdODatos, posibleDatos) {
    let adminId = null;
    let datos = {};
    if (typeof adminIdODatos === 'object' && adminIdODatos !== null) {
        datos = adminIdODatos;
        adminId = posibleDatos;
    } else {
        adminId = adminIdODatos;
        datos = posibleDatos || {};
    }

    if (adminId) {
        const ejecutor = await obtenerUsuarioPorId(adminId);
        if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
            throw new Error('Permiso denegado: solo un Administrador o Propietario(a) puede modificar la configuración SMTP.');
        }
    }

    const actual = await getQuery(`SELECT * FROM configuracion_smtp WHERE id = 1`);
    const host = datos.host !== undefined ? String(datos.host).trim() : (actual?.host || '');
    const puerto = datos.puerto !== undefined ? Number(datos.puerto) : (actual?.puerto || 587);
    const secure = datos.secure !== undefined ? (datos.secure ? 1 : 0) : (actual?.secure ?? 0);
    const usuario = datos.usuario !== undefined ? String(datos.usuario).trim() : (actual?.usuario || '');
    const password = (datos.password !== undefined && String(datos.password).trim() !== '')
        ? String(datos.password).trim()
        : (actual?.password || '');
    const remitenteNombre = datos.remitenteNombre !== undefined
        ? String(datos.remitenteNombre).trim()
        : (datos.remitente_nombre !== undefined ? String(datos.remitente_nombre).trim() : (actual?.remitente_nombre || 'Sistema POS'));
    const activo = datos.activo !== undefined ? (datos.activo ? 1 : 0) : (actual?.activo ?? 0);
    const ahora = new Date().toISOString();

    if (actual) {
        await runQuery(
            `UPDATE configuracion_smtp
             SET host = ?, puerto = ?, secure = ?, usuario = ?, password = ?, remitente_nombre = ?, activo = ?, actualizado_en = ?
             WHERE id = 1`,
            [host, puerto, secure, usuario, password, remitenteNombre, activo, ahora]
        );
    } else {
        await runQuery(
            `INSERT INTO configuracion_smtp (id, host, puerto, secure, usuario, password, remitente_nombre, activo, actualizado_en)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [host, puerto, secure, usuario, password, remitenteNombre, activo, ahora]
        );
    }
    return await obtenerConfiguracionSmtp();
}

async function listarDestinatariosNotificaciones(soloVerificados = false) {
    if (soloVerificados) {
        return await allQuery(
            `SELECT * FROM notificacion_destinatarios WHERE activo = 1 AND verificado = 1 ORDER BY id ASC`
        );
    }
    return await allQuery(
        `SELECT * FROM notificacion_destinatarios WHERE activo = 1 ORDER BY id ASC`
    );
}

async function crearDestinatarioPendiente({ email, nombre, codigo, expira, usuarioId }) {
    const emailLimpio = String(email || '').trim().toLowerCase();
    const nombreLimpio = String(nombre || '').trim();
    if (!emailLimpio || !emailLimpio.includes('@')) {
        throw new Error('Debe proporcionar un correo electrónico válido.');
    }
    const ahora = new Date().toISOString();

    const existente = await getQuery(
        `SELECT id, verificado, activo FROM notificacion_destinatarios WHERE LOWER(email) = LOWER(?)`,
        [emailLimpio]
    );

    if (existente) {
        if (Number(existente.verificado) === 1 && Number(existente.activo) === 1) {
            throw new Error('Este correo ya está registrado y verificado como destinatario.');
        }
        await runQuery(
            `UPDATE notificacion_destinatarios
             SET nombre = ?,
                 verificado = 0,
                 codigo_verificacion = ?,
                 codigo_expira = ?,
                 intentos_fallidos = 0,
                 activo = 1,
                 creado_por = ?,
                 creado_en = ?
             WHERE id = ?`,
            [nombreLimpio || emailLimpio, String(codigo || '').trim().toUpperCase(), expira || null, usuarioId || null, ahora, existente.id]
        );
        return await getQuery(`SELECT * FROM notificacion_destinatarios WHERE id = ?`, [existente.id]);
    }

    const res = await runQuery(
        `INSERT INTO notificacion_destinatarios 
         (email, nombre, verificado, codigo_verificacion, codigo_expira, intentos_fallidos, activo, creado_por, creado_en)
         VALUES (?, ?, 0, ?, ?, 0, 1, ?, ?)`,
        [emailLimpio, nombreLimpio || emailLimpio, String(codigo || '').trim().toUpperCase(), expira || null, usuarioId || null, ahora]
    );
    return await getQuery(`SELECT * FROM notificacion_destinatarios WHERE id = ?`, [res.lastID]);
}

async function validarCodigoDestinatario(id, codigo) {
    const destinatario = await getQuery(`SELECT * FROM notificacion_destinatarios WHERE id = ?`, [id]);
    if (!destinatario) {
        throw new Error('Destinatario no encontrado.');
    }

    if (Number(destinatario.verificado) === 1) {
        return { ...destinatario, verificado: 1, exito: true };
    }

    if (Number(destinatario.intentos_fallidos || 0) >= 5) {
        throw new Error('Demasiados intentos fallidos. Genera un nuevo código para continuar.');
    }

    if (destinatario.codigo_expira) {
        const fechaExpira = new Date(destinatario.codigo_expira);
        if (!isNaN(fechaExpira.getTime()) && Date.now() > fechaExpira.getTime()) {
            throw new Error('El código de verificación ha expirado.');
        }
    }

    const codIngresado = String(codigo || '').trim().toUpperCase();
    const codEsperado = String(destinatario.codigo_verificacion || '').trim().toUpperCase();

    if (!codIngresado || codIngresado !== codEsperado) {
        await runQuery(
            `UPDATE notificacion_destinatarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?`,
            [id]
        );
        throw new Error('Código de verificación incorrecto.');
    }

    const ahora = new Date().toISOString();
    await runQuery(
        `UPDATE notificacion_destinatarios
         SET verificado = 1,
             codigo_verificacion = NULL,
             codigo_expira = NULL,
             intentos_fallidos = 0,
             verificado_en = ?
         WHERE id = ?`,
        [ahora, id]
    );

    const actualizado = await getQuery(`SELECT * FROM notificacion_destinatarios WHERE id = ?`, [id]);
    return { ...actualizado, exito: true };
}

async function eliminarDestinatario(id) {
    const res = await runQuery(`DELETE FROM notificacion_destinatarios WHERE id = ?`, [id]);
    return res.changes > 0;
}

module.exports = {
    obtenerConfiguracionNegocio,
    guardarConfiguracionNegocio,
    actualizarConfiguracionNegocio,
    guardarConfiguracionContable,
    obtenerConfiguracionSmtp,
    guardarConfiguracionSmtp,
    listarDestinatariosNotificaciones,
    crearDestinatarioPendiente,
    validarCodigoDestinatario,
    eliminarDestinatario
};
