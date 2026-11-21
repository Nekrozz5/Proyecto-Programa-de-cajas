'use server';

import { revalidatePath } from 'next/cache';
import { ejecutarAction } from './_wrapper';
import {
    crearUsuarioConPermiso,
    borrarUsuarioConPermiso,
    cambiarPasswordConPermiso,
    actualizarPermisoFiscalUsuario
} from '../repositories/auth.repo';
import {
    guardarConfiguracionNegocio,
    guardarConfiguracionContable
} from '../repositories/configuracion.repo';
import {
    crearCajaFisica,
    desactivarCajaFisica,
    reactivarCajaFisica,
    actualizarPermisoFiscalCajaFisica
} from '../repositories/cajas.repo';
import {
    enviarEmailPrueba,
    enviarNotificacionCierreCaja
} from '../lib/mailer';
import {
    obtenerMetricasInteligencia
} from '../repositories/analiticas.repo';
import {
    listarDispositivos,
    revocarDispositivo
} from '../repositories/dispositivos.repo';
import { crearDesafioEmparejamiento } from '../tenancy/device-auth';

const ROLES_ADMIN = ['admin', 'propietario', 'developer'];
const ROLES_DEVELOPER = ['developer'];
const ROLES_CONFIG_NEGOCIO = ['developer', 'propietario'];

export async function listarDispositivosAction() {
    return ejecutarAction(ROLES_ADMIN, (usuario) =>
        listarDispositivos({ tenantId: usuario.tenantId })
    );
}

export async function generarCodigoEmparejamientoAction() {
    return ejecutarAction(ROLES_ADMIN, (usuario) => {
        const desafio = crearDesafioEmparejamiento(usuario.tenantId, usuario.id);
        return { desafio };
    });
}

export async function revocarDispositivoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const dispositivo = await revocarDispositivo({
            tenantId: usuario.tenantId,
            dispositivoId: datos && datos.dispositivoId,
            administradorId: usuario.id
        });
        revalidatePath('/admin');
        return { dispositivo };
    });
}

/**
 * Registra un nuevo usuario con PIN y rol.
 */
export async function crearUsuarioAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const id = await crearUsuarioConPermiso(
            usuario.id,
            datos.nombre,
            datos.pin,
            datos.rol
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { usuarioId: id };
    });
}

/**
 * Da de baja lógica a un usuario del sistema (activo = 0).
 */
export async function borrarUsuarioAction(param) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const id = typeof param === 'object' && param !== null ? param.usuarioABorrarId : param;
        await borrarUsuarioConPermiso(usuario.id, Number(id));
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { usuarioBorradoId: Number(id) };
    });
}

/**
 * Cambia la contraseña o PIN de un usuario (propia o de terceros según jerarquía).
 */
export async function cambiarPasswordAction(datos) {
    return ejecutarAction(null, async (usuario) => {
        const objetivoId = datos.usuarioObjetivoId ? Number(datos.usuarioObjetivoId) : usuario.id;
        await cambiarPasswordConPermiso(
            usuario.id,
            objetivoId,
            datos.nuevoPin,
            datos.pinActual
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { actualizado: true };
    });
}

/**
 * Guarda la configuración general y modalidad operativa del negocio (exclusivo developer y propietario).
 */
export async function guardarConfiguracionAction(datos) {
    return ejecutarAction(ROLES_CONFIG_NEGOCIO, async (usuario) => {
        const config = await guardarConfiguracionNegocio(usuario.id, datos);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { configuracionNegocio: config };
    });
}

/**
 * Guarda los parámetros contables y régimen tributario del negocio.
 */
export async function guardarConfiguracionContableAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const config = await guardarConfiguracionContable(usuario.id, datos);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { configuracionNegocio: config };
    });
}

/**
 * Habilita o deshabilita la emisión fiscal/comprobante en una estación física de caja.
 */
export async function actualizarPermisoFiscalCajaAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        await actualizarPermisoFiscalCajaFisica(
            Number(datos.cajaFisicaId),
            Boolean(datos.habilitado),
            usuario.id
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { actualizado: true };
    });
}

/**
 * Habilita o deshabilita la facultad de emitir respaldo fiscal a un usuario específico.
 */
export async function actualizarPermisoFiscalUsuarioAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        await actualizarPermisoFiscalUsuario(
            usuario.id,
            Number(datos.usuarioObjetivoId),
            Boolean(datos.habilitado)
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { actualizado: true };
    });
}

/**
 * Registra una nueva estación de caja física (terminal de cobro).
 */
export async function crearCajaFisicaAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const nombre = typeof datos === 'object' && datos !== null ? datos.nombre : datos;
        const id = await crearCajaFisica(nombre, usuario.id);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { cajaFisicaId: id };
    });
}

/**
 * Desactiva una estación de caja física (baja lógica, valida que no tenga turno abierto y que no sea la última).
 */
export async function desactivarCajaFisicaAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const id = typeof datos === 'object' && datos !== null ? datos.cajaFisicaId : datos;
        await desactivarCajaFisica(Number(id), usuario.id);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { desactivada: true };
    });
}

/**
 * Reactiva una estación de caja física previamente dada de baja.
 */
export async function reactivarCajaFisicaAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const id = typeof datos === 'object' && datos !== null ? datos.cajaFisicaId : datos;
        await reactivarCajaFisica(Number(id), usuario.id);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { reactivada: true };
    });
}

/**
 * Despacha un correo electrónico de prueba para verificar conectividad SMTP.
 */
export async function probarEmailAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async () => {
        const destinatario = typeof datos === 'object' && datos !== null ? datos.destinatario : datos;
        const resultado = await enviarEmailPrueba(destinatario);
        if (!resultado.enviado) {
            const err = new Error(resultado.error || 'No se pudo enviar el correo de prueba.');
            err.status = 400;
            throw err;
        }
        return { mensaje: `Correo de prueba enviado exitosamente a ${resultado.destino}` };
    });
}

/**
 * Reenvía manualmente por correo electrónico el arqueo y reporte Excel de un turno cerrado.
 */
export async function reenviarCierreEmailAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async () => {
        const cajaId = typeof datos === 'object' && datos !== null ? datos.cajaId : datos;
        const idNum = Number(cajaId);
        const resultado = await enviarNotificacionCierreCaja(idNum);
        if (!resultado.enviado) {
            const mensajeError = resultado.error || (resultado.motivo === 'no_configurado'
                ? 'El correo no está configurado en .env.local'
                : 'No se pudo enviar el correo.');
            const err = new Error(mensajeError);
            err.status = 400;
            throw err;
        }
        return { mensaje: `Reporte de Turno #${idNum} enviado por correo exitosamente.` };
    });
}

/**
 * Obtiene métricas avanzadas de inteligencia de negocio:
 * matriz de rendimiento (menú/producto engineering), semáforo de reposición de stock y radar de vencimientos.
 * Envuelta en el wrapper de acción con verificación de roles administrativos ('admin', 'propietario', 'developer').
 */
export async function obtenerMetricasInteligenciaAction(params = {}) {
    return ejecutarAction(ROLES_ADMIN, async () => {
        const dias = typeof params === 'number'
            ? params
            : (params && params.dias !== undefined ? Number(params.dias) : 30);
        return await obtenerMetricasInteligencia({ dias });
    });
}

