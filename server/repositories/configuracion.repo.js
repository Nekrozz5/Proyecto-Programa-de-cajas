/**
 * server/repositories/configuracion.repo.js
 * Repositorio para la configuración del negocio, régimen tributario y setup inicial.
 * Gestiona la tabla singleton `configuracion_negocio`.
 */

const crypto = require('crypto');
const { runQuery, getQuery, allQuery, enTransaccion, redondear2, numeroNoNegativo } = require('./db');
const { obtenerUsuarioPorId, obtenerUsuarios, crearUsuario, esRolAdministrativo } = require('./auth.repo');
const { obtenerSetupTokenValido } = require('../secretos');
const { normalizarRegimen } = require('../domain/fiscal');
const { verificarClaveActivacion, PREFIJO_CLAVE } = require('../lib/licencia');

async function obtenerConfiguracionNegocio() {
    let config = await getQuery(`SELECT * FROM configuracion_negocio WHERE id = 1`);
    if (!config) {
        await runQuery(
            `INSERT INTO configuracion_negocio (id, nombre_negocio, modalidad_nombre, usa_stock_directo, usa_vencimiento, usa_recetas_ensamblaje, habilita_apps_comida, habilita_delivery, configurado)
             VALUES (1, 'Mi Negocio', 'Venta Directa No Perecedera', 1, 0, 0, 0, 0, 0)`
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

function validarTokenInstalacion(tokenRecibido, nombreNegocio = null) {
    const recibido = String(tokenRecibido || '').trim();

    // 1. Verificación de Clave Criptográfica de Activación de Producto (Ed25519)
    if (recibido.startsWith(PREFIJO_CLAVE)) {
        const resultado = verificarClaveActivacion(recibido, { nombreNegocioEsperado: nombreNegocio });
        if (!resultado.valida) {
            const err = new Error(`Clave de activación inválida: ${resultado.motivo}`);
            err.status = 403;
            throw err;
        }
        return resultado.payload;
    }

    // 2. Compatibilidad con SETUP_TOKEN configurado en .env
    const esperado = obtenerSetupTokenValido();

    if (!esperado) {
        if (process.env.NODE_ENV === 'production') {
            const err = new Error('Instalación deshabilitada: ingresa una clave de activación válida del producto o define SETUP_TOKEN en .env.');
            err.status = 403;
            throw err;
        }
        console.warn('[Seguridad] Sin clave ni SETUP_TOKEN definido: instalación inicial permitida (solo en desarrollo).');
        return null;
    }

    const hashEsperado = crypto.createHash('sha256').update(esperado, 'utf8').digest();
    const hashRecibido = crypto.createHash('sha256').update(recibido, 'utf8').digest();
    if (!recibido || !crypto.timingSafeEqual(hashEsperado, hashRecibido)) {
        const err = new Error('Clave de activación o token de instalación inválido.');
        err.status = 403;
        throw err;
    }
    return null;
}

async function sistemaEstaInstalado(configuracion = null) {
    const config = configuracion || await obtenerConfiguracionNegocio();
    if (!config || Number(config.configurado) !== 1) return false;
    const fila = await getQuery(`SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1 AND rol != 'developer'`);
    return Number(fila?.total || 0) > 0;
}

async function inicializarSistemaPrimeraVez(datos = {}) {
    const payloadLicencia = validarTokenInstalacion(datos.setupToken, datos.nombreNegocio);

    if (!datos.nombreNegocio || !String(datos.nombreNegocio).trim()) {
        throw new Error('Debes ingresar el nombre de la empresa o negocio.');
    }

    // Asegura que exista la fila singleton antes de abrir la transacción
    await obtenerConfiguracionNegocio();

    const licenciaClave = payloadLicencia ? String(datos.setupToken || '').trim() : '';
    const licenciaId = payloadLicencia?.id ? String(payloadLicencia.id).trim() : '';
    const licenciaPlan = payloadLicencia?.plan === 'estandar' ? 'estandar' : 'completo';
    const licenciaMaxCajas = payloadLicencia && payloadLicencia.cajas !== undefined && payloadLicencia.cajas !== null && Number.isFinite(Number(payloadLicencia.cajas))
        ? Math.max(0, Math.floor(Number(payloadLicencia.cajas)))
        : 10;
    const licenciaExpira = payloadLicencia?.expira ? String(payloadLicencia.expira) : null;
    const licenciaMachineId = '';

    const esPlanEstandar = licenciaPlan === 'estandar';
    const usaVencimientoFinal = esPlanEstandar ? 0 : (datos.usaVencimiento ? 1 : 0);
    const usaRecetasFinal = esPlanEstandar ? 0 : (datos.usaRecetasEnsamblaje ? 1 : 0);
    const habilitaDeliveryFinal = datos.habilitaDelivery !== undefined
        ? (datos.habilitaDelivery ? 1 : 0)
        : (datos.habilita_delivery !== undefined ? (datos.habilita_delivery ? 1 : 0) : 0);
    const nitNegocio = datos.nitNegocio !== undefined ? String(datos.nitNegocio || '').trim() : '';
    const regimenTributario = datos.regimenTributario
        ? normalizarRegimen(datos.regimenTributario)
        : 'simplificado_control_interno';
    const emiteFactura = regimenTributario === 'simplificado_control_interno'
        ? 0
        : (datos.emiteFactura !== undefined ? (datos.emiteFactura ? 1 : 0) : 1);

    let infoEmail = null;

    const propietarioId = await enTransaccion(async () => {
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
                 habilita_apps_comida = ?,
                 habilita_delivery = ?,
                 nit_negocio = ?,
                 regimen_tributario = ?,
                 emite_factura = ?,
                 licencia_clave = ?,
                 licencia_id = ?,
                 licencia_plan = ?,
                 licencia_max_cajas = ?,
                 licencia_expira = ?,
                 licencia_machine_id = ?,
                 configurado = 1
             WHERE id = 1`,
            [
                String(datos.nombreNegocio).trim(),
                datos.modalidadNombre || 'Venta Directa No Perecedera',
                datos.usaStockDirecto ? 1 : 0,
                usaVencimientoFinal,
                usaRecetasFinal,
                datos.habilitaAppsComida ? 1 : 0,
                habilitaDeliveryFinal,
                nitNegocio,
                regimenTributario,
                emiteFactura,
                licenciaClave,
                licenciaId,
                licenciaPlan,
                licenciaMaxCajas,
                licenciaExpira,
                licenciaMachineId
            ]
        );

        if (datos.nombreCajaInicial && String(datos.nombreCajaInicial).trim().length >= 2) {
            const nombreCaja = String(datos.nombreCajaInicial).trim();
            const primeraCaja = await getQuery(`SELECT id FROM cajas_fisicas ORDER BY id ASC LIMIT 1`);
            if (primeraCaja) {
                await runQuery(`UPDATE cajas_fisicas SET nombre = ? WHERE id = ?`, [nombreCaja, primeraCaja.id]);
            } else {
                await runQuery(`INSERT INTO cajas_fisicas (nombre, activa) VALUES (?, 1)`, [nombreCaja]);
            }
        }

        let adminId;
        if (usuariosExistentes.length > 0) {
            adminId = usuariosExistentes[0].id;
        } else {
            if (!datos.adminNombre || !String(datos.adminNombre).trim() || !datos.adminPin || !String(datos.adminPin).trim()) {
                throw new Error('Debes ingresar el nombre y PIN/contraseña para crear el primer Propietario(a).');
            }
            adminId = await crearUsuario(String(datos.adminNombre).trim(), String(datos.adminPin).trim(), 'propietario');
        }

        // ==========================================
        // CONFIGURACIÓN OPCIONAL DE CORREO SMTP Y DESTINATARIO
        // ==========================================
        const smtpData = datos.smtp || (datos.correoEmisor ? {
            usuario: datos.correoEmisor,
            password: datos.passwordApp,
            host: datos.smtpHost || 'smtp.gmail.com',
            puerto: datos.smtpPuerto || 465,
            secure: datos.smtpSecure !== undefined ? datos.smtpSecure : (Number(datos.smtpPuerto || 465) === 465),
            remitenteNombre: datos.remitenteNombre || datos.nombreNegocio || 'Sistema POS'
        } : null);

        let smtpGuardado = null;
        if (smtpData && (smtpData.usuario || smtpData.password)) {
            const host = String(smtpData.host || 'smtp.gmail.com').trim();
            const puerto = Number(smtpData.puerto) || 465;
            const secure = smtpData.secure !== undefined ? (smtpData.secure ? 1 : 0) : (puerto === 465 ? 1 : 0);
            const usuario = String(smtpData.usuario || '').trim();
            const password = String(smtpData.password || '').trim();
            const remitenteNombre = String(smtpData.remitenteNombre || datos.nombreNegocio || 'Sistema POS').trim();
            const activo = (usuario && password) ? 1 : 0;
            const ahora = new Date().toISOString();

            const actualSmtp = await getQuery(`SELECT id FROM configuracion_smtp WHERE id = 1`);
            if (actualSmtp) {
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
            smtpGuardado = { host, puerto, secure, usuario, remitenteNombre, activo };
        }

        // Destinatario Inicial
        const destInput = datos.destinatarioInicial || datos.correoDestinatario || datos.destinatarioEmail;
        const destEmail = typeof destInput === 'object' && destInput !== null ? destInput.email : destInput;
        const destNombre = typeof destInput === 'object' && destInput !== null ? destInput.nombre : (datos.destinatarioNombre || datos.adminNombre || 'Propietario(a)');

        let destinatarioCreado = null;
        if (destEmail && String(destEmail).trim().includes('@')) {
            const emailLimpio = String(destEmail).trim().toLowerCase();
            const nombreLimpio = String(destNombre || emailLimpio).trim();
            const codigo = String(Math.floor(1000 + Math.random() * 9000));
            const expira = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            const ahora = new Date().toISOString();

            const existente = await getQuery(
                `SELECT id, verificado FROM notificacion_destinatarios WHERE LOWER(email) = LOWER(?)`,
                [emailLimpio]
            );

            let destId;
            if (existente) {
                await runQuery(
                    `UPDATE notificacion_destinatarios
                     SET nombre = ?, verificado = 0, codigo_verificacion = ?, codigo_expira = ?, intentos_fallidos = 0, activo = 1, creado_por = ?, creado_en = ?
                     WHERE id = ?`,
                    [nombreLimpio, codigo, expira, adminId, ahora, existente.id]
                );
                destId = existente.id;
            } else {
                const resDest = await runQuery(
                    `INSERT INTO notificacion_destinatarios 
                     (email, nombre, verificado, codigo_verificacion, codigo_expira, intentos_fallidos, activo, creado_por, creado_en)
                     VALUES (?, ?, 0, ?, ?, 0, 1, ?, ?)`,
                    [emailLimpio, nombreLimpio, codigo, expira, adminId, ahora]
                );
                destId = resDest.lastID;
            }

            destinatarioCreado = {
                id: destId,
                email: emailLimpio,
                nombre: nombreLimpio,
                codigo
            };
        }

        infoEmail = { smtpGuardado, destinatarioCreado };
        return adminId;
    });

    // Fuera de la transacción de base de datos, despachar el correo de verificación si se configuró
    if (infoEmail?.destinatarioCreado && infoEmail?.smtpGuardado?.activo) {
        try {
            const { enviarCodigoVerificacionEmail } = require('../lib/mailer');
            await enviarCodigoVerificacionEmail({
                email: infoEmail.destinatarioCreado.email,
                codigo: infoEmail.destinatarioCreado.codigo,
                nombreNegocio: datos.nombreNegocio || 'Sistema POS'
            });
        } catch (e) {
            console.error('[Inicializacion] No se pudo enviar el correo de verificación inicial:', e.message);
        }
    }

    return {
        configuracionNegocio: await obtenerConfiguracionNegocio(),
        propietarioId,
        smtpConfigurado: Boolean(infoEmail?.smtpGuardado),
        destinatarioRegistrado: Boolean(infoEmail?.destinatarioCreado)
    };
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

function parsearFechaUtcSqlite(valor) {
    if (!valor) return null;
    const str = String(valor).trim();
    if (!str) return null;
    if (str.includes('T') || str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
        const ms = Date.parse(str);
        return Number.isFinite(ms) ? ms : null;
    }
    const ms = Date.parse(`${str.replace(' ', 'T')}Z`);
    return Number.isFinite(ms) ? ms : null;
}

async function verificarVigenciaLicenciaYReloj() {
    const config = await obtenerConfiguracionNegocio();

    // (a) Validar expiración de la licencia persistida
    if (config?.licencia_expira) {
        const expiraMs = Date.parse(config.licencia_expira);
        if (Number.isFinite(expiraMs) && Date.now() > expiraMs) {
            const err = new Error(
                `Tu licencia venció el ${new Date(expiraMs).toLocaleDateString('es-ES')}. Contacta al proveedor para renovarla.`
            );
            err.status = 403;
            throw err;
        }
    }

    // (b) Protección anti-retroceso de reloj (tolerancia de 15 minutos frente a la última actividad de cajas)
    const ultimaActividad = await getQuery(
        `SELECT MAX(fecha_apertura) AS max_apertura, MAX(fecha_cierre) AS max_cierre FROM cajas`
    );
    const maxAperturaMs = parsearFechaUtcSqlite(ultimaActividad?.max_apertura) || 0;
    const maxCierreMs = parsearFechaUtcSqlite(ultimaActividad?.max_cierre) || 0;
    const maxMarcaMs = Math.max(maxAperturaMs, maxCierreMs);
    const TOLERANCIA_RELOJ_MS = 15 * 60 * 1000;

    if (maxMarcaMs > 0 && Date.now() < maxMarcaMs - TOLERANCIA_RELOJ_MS) {
        const err = new Error(
            'Se detectó un retroceso en el reloj del sistema respecto a los turnos registrados. Corrige la fecha y hora del equipo para continuar.'
        );
        err.status = 403;
        throw err;
    }

    return {
        valida: true,
        plan: config?.licencia_plan || 'completo',
        maxCajas: config?.licencia_max_cajas ?? 10,
        expira: config?.licencia_expira || null
    };
}

module.exports = {
    obtenerConfiguracionNegocio,
    guardarConfiguracionNegocio,
    actualizarConfiguracionNegocio,
    guardarConfiguracionContable,
    validarTokenInstalacion,
    sistemaEstaInstalado,
    inicializarSistemaPrimeraVez,
    verificarVigenciaLicenciaYReloj,
    obtenerConfiguracionSmtp,
    guardarConfiguracionSmtp,
    listarDestinatariosNotificaciones,
    crearDestinatarioPendiente,
    validarCodigoDestinatario,
    eliminarDestinatario
};
