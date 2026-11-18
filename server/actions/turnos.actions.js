'use server';

import { revalidatePath } from 'next/cache';
import { ejecutarAction } from './_wrapper';
import {
    abrirCaja,
    cerrarCaja,
    reabrirCajaConPermiso
} from '../repositories/cajas.repo';
import { enviarNotificacionCierreCaja } from '../lib/mailer';
import { registrarEgresoAction as registrarEgresoActionVentas } from './ventas.actions';

const ROLES_OPERADORES = ['user', 'admin', 'propietario', 'developer'];
const ROLES_ADMIN = ['admin', 'propietario', 'developer'];

/**
 * Abre un nuevo turno de operación en una estación física de caja.
 */
export async function abrirTurnoAction(datos) {
    return ejecutarAction(ROLES_OPERADORES, async (usuario) => {
        const id = await abrirCaja(
            usuario.id,
            datos.montoInicial,
            datos.cajaFisicaId ? Number(datos.cajaFisicaId) : null
        );
        revalidatePath('/caja');
        revalidatePath('/admin');
        return { cajaId: id };
    });
}

/**
 * Cierra un turno de operación realizando el arqueo ciego y despachando notificación por correo en background.
 */
export async function cerrarTurnoAction(datos) {
    return ejecutarAction(ROLES_OPERADORES, async (usuario) => {
        const cajaIdNum = Number(datos.cajaId);
        const qrReal = datos.qrReal !== undefined && datos.qrReal !== null && datos.qrReal !== ''
            ? Number(datos.qrReal)
            : null;

        const arqueo = await cerrarCaja(
            cajaIdNum,
            datos.efectivoReal,
            usuario.id,
            qrReal,
            datos.observacionesCierre || ''
        );

        // Despacho asíncrono de correo en background sin bloquear la respuesta del arqueo
        try {
            enviarNotificacionCierreCaja(cajaIdNum).catch((errEmail) => {
                console.error('[Cierre] Error en despacho asíncrono de correo:', errEmail);
            });
        } catch (errReq) {
            console.error('[Cierre] Error al invocar módulo mailer:', errReq);
        }

        revalidatePath('/caja');
        revalidatePath('/admin');
        return { arqueo };
    });
}

/**
 * Reabre un turno previamente cerrado (operación restringida a roles administrativos).
 */
export async function reabrirTurnoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const cajaIdNum = Number(datos.cajaId);
        await reabrirCajaConPermiso(usuario.id, cajaIdNum, datos.motivo);
        revalidatePath('/caja');
        revalidatePath('/admin');
        return { reabierto: true, cajaId: cajaIdNum };
    });
}

/**
 * Registra un egreso de efectivo o QR vinculado al turno, con respaldo fiscal opcional (factura, CUF, código de control).
 */
export async function registrarEgresoAction(datos) {
    return registrarEgresoActionVentas(datos);
}
