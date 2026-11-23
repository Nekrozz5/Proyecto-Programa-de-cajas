const { runQuery, getQuery, allQuery, enTransaccion } = require('./db');
const { obtenerUsuarioPorId, esRolAdministrativo } = require('./auth.repo');
const { cifrarPasswordSmtp, descifrarPasswordSmtp, obtenerClaveSmtp } = require('../lib/cifrado-smtp');

const PASSWORD_SMTP_MASCARA = '••••••••';

async function obtenerConfiguracionSmtp() {
    const config = await getQuery(`SELECT * FROM configuracion_smtp WHERE id = 1`);
    if (!config) return config;
    return { ...config, password: config.password ? PASSWORD_SMTP_MASCARA : '' };
}

async function obtenerPasswordSmtp() {
    const config = await getQuery(`SELECT password FROM configuracion_smtp WHERE id = 1`);
    return config?.password ? (obtenerClaveSmtp(), descifrarPasswordSmtp(config.password)) : '';
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

    return enTransaccion(async () => {
        obtenerClaveSmtp();
        await runQuery('LOCK TABLE configuracion_smtp IN SHARE ROW EXCLUSIVE MODE');
        const actual = await getQuery(`SELECT * FROM configuracion_smtp WHERE id = 1`);
        const host = datos.host !== undefined ? String(datos.host).trim() : (actual?.host || '');
        const puerto = datos.puerto !== undefined ? Number(datos.puerto) : (actual?.puerto || 587);
        const secure = datos.secure !== undefined ? (datos.secure ? 1 : 0) : (actual?.secure ?? 0);
        const usuario = datos.usuario !== undefined ? String(datos.usuario).trim() : (actual?.usuario || '');
        const passwordNueva = datos.password !== undefined ? String(datos.password).trim() : '';
        const conservar = !passwordNueva || passwordNueva === PASSWORD_SMTP_MASCARA;
        const password = conservar
            ? (actual?.password || '')
            : cifrarPasswordSmtp(passwordNueva);
        const remitenteNombre = datos.remitenteNombre !== undefined
            ? String(datos.remitenteNombre).trim()
            : (datos.remitente_nombre !== undefined ? String(datos.remitente_nombre).trim() : (actual?.remitente_nombre || 'Sistema POS'));
        const activo = datos.activo !== undefined ? (datos.activo ? 1 : 0) : (actual?.activo ?? 0);
        if (!password && (activo || usuario)) {
            throw new Error('SMTP_ENCRYPTION_KEY y una contraseña SMTP válida son obligatorias para activar el correo.');
        }
        const ahora = new Date().toISOString();

        if (actual) {
            await runQuery(
                `UPDATE configuracion_smtp
                 SET host = $1, puerto = $2, secure = $3, usuario = $4, password = $5, remitente_nombre = $6, activo = $7, actualizado_en = $8
                 WHERE id = 1`,
                [host, puerto, secure, usuario, password, remitenteNombre, activo, ahora]
            );
        } else {
            await runQuery(
                `INSERT INTO configuracion_smtp (id, host, puerto, secure, usuario, password, remitente_nombre, activo, actualizado_en)
                 VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)`,
                [host, puerto, secure, usuario, password, remitenteNombre, activo, ahora]
            );
        }
        return await obtenerConfiguracionSmtp();
    });
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

    return enTransaccion(async () => {
        await getQuery("SELECT pg_advisory_xact_lock(hashtext('notificacion_destinatarios'), hashtext($1))", [emailLimpio]);
        const existente = await getQuery(
            `SELECT id, verificado, activo FROM notificacion_destinatarios
             WHERE LOWER(email) = LOWER($1) FOR NO KEY UPDATE`,
            [emailLimpio]
        );

        if (existente) {
            if (Number(existente.verificado) === 1 && Number(existente.activo) === 1) {
                throw new Error('Este correo ya está registrado y verificado como destinatario.');
            }
            await runQuery(
                `UPDATE notificacion_destinatarios
                 SET nombre = $1,
                     verificado = 0,
                     codigo_verificacion = $2,
                     codigo_expira = $3,
                     intentos_fallidos = 0,
                     activo = 1,
                     creado_por = $4,
                     creado_en = $5
                 WHERE id = $6`,
                [nombreLimpio || emailLimpio, String(codigo || '').trim().toUpperCase(), expira || null, usuarioId || null, ahora, existente.id]
            );
            return await getQuery(`SELECT * FROM notificacion_destinatarios WHERE id = $1`, [existente.id]);
        }

        return getQuery(
            `INSERT INTO notificacion_destinatarios
             (email, nombre, verificado, codigo_verificacion, codigo_expira, intentos_fallidos, activo, creado_por, creado_en)
             VALUES ($1, $2, 0, $3, $4, 0, 1, $5, $6)
             RETURNING *`,
            [emailLimpio, nombreLimpio || emailLimpio, String(codigo || '').trim().toUpperCase(), expira || null, usuarioId || null, ahora]
        );
    });
}

async function validarCodigoDestinatario(id, codigo) {
    const resultado = await enTransaccion(async () => {
        const destinatario = await getQuery(`SELECT * FROM notificacion_destinatarios WHERE id = $1 FOR NO KEY UPDATE`, [id]);
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
                `UPDATE notificacion_destinatarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = $1`,
                [id]
            );
            return null;
        }

        const ahora = new Date().toISOString();
        await runQuery(
            `UPDATE notificacion_destinatarios
             SET verificado = 1,
                 codigo_verificacion = NULL,
                 codigo_expira = NULL,
                 intentos_fallidos = 0,
                 verificado_en = $1
             WHERE id = $2`,
            [ahora, id]
        );

        const actualizado = await getQuery(`SELECT * FROM notificacion_destinatarios WHERE id = $1`, [id]);
        return { ...actualizado, exito: true };
    });
    if (!resultado) throw new Error('Código de verificación incorrecto.');
    return resultado;
}

async function regenerarCodigoDestinatario(id, codigo, expira) {
    return enTransaccion(async () => {
        const destinatario = await getQuery(
            'SELECT email, verificado FROM notificacion_destinatarios WHERE id = $1 FOR NO KEY UPDATE',
            [id]
        );
        if (!destinatario) throw new Error('Destinatario no encontrado.');
        if (Number(destinatario.verificado) === 1) {
            throw new Error('Este destinatario ya ha sido verificado previamente.');
        }

        await runQuery(
            `UPDATE notificacion_destinatarios
             SET codigo_verificacion = $1, codigo_expira = $2, intentos_fallidos = 0
             WHERE id = $3`,
            [codigo, expira, id]
        );
        return destinatario;
    });
}

async function eliminarDestinatario(id) {
    const res = await runQuery(`DELETE FROM notificacion_destinatarios WHERE id = $1`, [id]);
    return res.changes > 0;
}

async function listarCorreosNotificacionVerificados() {
    const filas = await allQuery(
        'SELECT email FROM notificacion_destinatarios WHERE verificado = 1 AND activo = 1 ORDER BY id ASC'
    );
    return filas.map(({ email }) => String(email || '').trim()).filter(Boolean);
}

async function obtenerNombreNegocioNotificaciones() {
    const negocio = await getQuery('SELECT nombre_negocio FROM configuracion_negocio WHERE id = 1');
    return negocio?.nombre_negocio;
}

module.exports = {
    obtenerConfiguracionSmtp,
    obtenerPasswordSmtp,
    guardarConfiguracionSmtp,
    listarDestinatariosNotificaciones,
    crearDestinatarioPendiente,
    validarCodigoDestinatario,
    regenerarCodigoDestinatario,
    eliminarDestinatario,
    listarCorreosNotificacionVerificados,
    obtenerNombreNegocioNotificaciones
};
