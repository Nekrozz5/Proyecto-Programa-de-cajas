'use server';

import { revalidatePath } from 'next/cache';
import { validarSesionAccion } from './_wrapper';
import {
    obtenerConfiguracionSmtp,
    guardarConfiguracionSmtp,
    listarDestinatariosNotificaciones,
    crearDestinatarioPendiente,
    validarCodigoDestinatario,
    eliminarDestinatario,
    obtenerConfiguracionNegocio
} from '../repositories/configuracion.repo';
import { runQuery, getQuery } from '../repositories/db';
import { enviarCodigoVerificacionEmail } from '../lib/mailer';

const ROLES_PERMITIDOS = ['superadmin', 'developer'];

/**
 * Guarda o actualiza los parámetros del servidor SMTP en base de datos.
 * Restringido exclusivamente a superadmin y developer.
 */
export async function guardarConfigSmtpAction(datos) {
    return validarSesionAccion(ROLES_PERMITIDOS, async (usuario) => {
        const configActualizada = await guardarConfiguracionSmtp(usuario.id, datos);
        revalidatePath('/admin');
        return { guardado: true, config: configActualizada };
    });
}

/**
 * Registra un destinatario pendiente de verificación:
 * Genera código aleatorio de 4 dígitos (1000-9999), fija vigencia de 15 minutos
 * y despacha el correo de verificación.
 */
export async function registrarDestinatarioAction(datos) {
    return validarSesionAccion(ROLES_PERMITIDOS, async (usuario) => {
        const email = String(datos?.email || '').trim().toLowerCase();
        const nombre = String(datos?.nombre || '').trim();

        if (!email || !email.includes('@')) {
            throw new Error('Debe proporcionar un correo electrónico válido.');
        }

        // Generar código aleatorio de 4 dígitos (1000-9999) y expiración de 15 minutos
        const codigo = String(Math.floor(1000 + Math.random() * 9000));
        const expira = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        // Guardar registro pendiente en BD
        const destinatario = await crearDestinatarioPendiente({
            email,
            nombre: nombre || email,
            codigo,
            expira,
            usuarioId: usuario.id
        });

        // Obtener nombre del negocio para la plantilla
        const configNeg = await obtenerConfiguracionNegocio();
        const nombreNegocio = configNeg?.nombre_negocio || 'Sistema POS';

        // Despachar el correo de verificación
        const resultadoEmail = await enviarCodigoVerificacionEmail({
            email,
            codigo,
            nombreNegocio
        });

        if (!resultadoEmail.enviado) {
            const err = new Error(resultadoEmail.error || 'No se pudo enviar el correo de verificación. Verifica los datos SMTP.');
            err.status = 400;
            throw err;
        }

        revalidatePath('/admin');
        return {
            registrado: true,
            destinatarioId: destinatario.id,
            email: destinatario.email,
            mensaje: 'Código de verificación de 4 cifras enviado con éxito al correo.'
        };
    });
}

/**
 * Valida el código de 4 cifras ingresado por el usuario:
 * Verifica coincidencia y que no haya expirado (máx 15 min), marcándolo verificado = 1.
 */
export async function verificarCodigoDestinatarioAction(datos) {
    return validarSesionAccion(ROLES_PERMITIDOS, async () => {
        const id = Number(datos?.id);
        const codigo = String(datos?.codigo || '').trim();

        if (!id) {
            throw new Error('ID de destinatario inválido.');
        }
        if (!codigo) {
            throw new Error('Debe ingresar el código de verificación.');
        }

        const destinatarioVerificado = await validarCodigoDestinatario(id, codigo);
        revalidatePath('/admin');
        return {
            verificado: true,
            destinatario: destinatarioVerificado,
            mensaje: 'Correo verificado y activado exitosamente para recibir notificaciones.'
        };
    });
}

/**
 * Regenera un nuevo código de 4 cifras y reenvía el correo de verificación.
 */
export async function reenviarCodigoAction(datos) {
    return validarSesionAccion(ROLES_PERMITIDOS, async () => {
        const id = Number(typeof datos === 'object' && datos !== null ? datos.id : datos);
        if (!id) {
            throw new Error('ID de destinatario inválido.');
        }

        const destinatario = await getQuery(`SELECT * FROM notificacion_destinatarios WHERE id = ?`, [id]);
        if (!destinatario) {
            throw new Error('Destinatario no encontrado.');
        }
        if (Number(destinatario.verificado) === 1) {
            throw new Error('Este destinatario ya ha sido verificado previamente.');
        }

        // Generar nuevo código de 4 dígitos (1000-9999) y expiración de 15 minutos
        const codigo = String(Math.floor(1000 + Math.random() * 9000));
        const expira = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        await runQuery(
            `UPDATE notificacion_destinatarios
             SET codigo_verificacion = ?,
                 codigo_expira = ?,
                 intentos_fallidos = 0
             WHERE id = ?`,
            [codigo, expira, id]
        );

        const configNeg = await obtenerConfiguracionNegocio();
        const nombreNegocio = configNeg?.nombre_negocio || 'Sistema POS';

        const resultadoEmail = await enviarCodigoVerificacionEmail({
            email: destinatario.email,
            codigo,
            nombreNegocio
        });

        if (!resultadoEmail.enviado) {
            const err = new Error(resultadoEmail.error || 'No se pudo reenviar el correo de verificación.');
            err.status = 400;
            throw err;
        }

        revalidatePath('/admin');
        return {
            reenviado: true,
            mensaje: 'Nuevo código de verificación de 4 cifras enviado con éxito.'
        };
    });
}

/**
 * Elimina un destinatario de las notificaciones.
 */
export async function eliminarDestinatarioAction(datos) {
    return validarSesionAccion(ROLES_PERMITIDOS, async () => {
        const id = Number(typeof datos === 'object' && datos !== null ? datos.id : datos);
        if (!id) {
            throw new Error('ID de destinatario inválido.');
        }

        await eliminarDestinatario(id);
        revalidatePath('/admin');
        return { eliminado: true, id };
    });
}

/**
 * Obtiene la configuración SMTP actual guardada en base de datos.
 */
export async function obtenerConfigSmtpAction() {
    return validarSesionAccion(ROLES_PERMITIDOS, async () => {
        return await obtenerConfiguracionSmtp();
    });
}

/**
 * Lista los destinatarios registrados en el sistema.
 */
export async function listarDestinatariosAction(soloVerificados = false) {
    return validarSesionAccion(ROLES_PERMITIDOS, async () => {
        return await listarDestinatariosNotificaciones(Boolean(soloVerificados));
    });
}
