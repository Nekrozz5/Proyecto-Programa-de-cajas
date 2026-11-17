'use server';

import { revalidatePath } from 'next/cache';
import { ejecutarAction } from './_wrapper';
import {
    registrarVentaCompleta,
    anularMovimientoConPermiso,
    registrarEgreso,
    registrarIngresoEfectivo
} from '../repositories/ventas.repo';

const ROLES_OPERADORES = ['user', 'admin', 'superadmin', 'developer'];
const ROLES_ADMIN = ['admin', 'superadmin', 'developer'];

/**
 * Registra una venta completa con descuento atómico de inventario, soporte mixto (efectivo/QR) y snapshot fiscal.
 */
export async function registrarVentaAction(datos) {
    return ejecutarAction(ROLES_OPERADORES, async (usuario) => {
        const montoRecibido = datos.montoRecibido !== undefined && datos.montoRecibido !== null && datos.montoRecibido !== ''
            ? Number(datos.montoRecibido)
            : null;
        const cambioEntregado = datos.cambioEntregado !== undefined && datos.cambioEntregado !== null && datos.cambioEntregado !== ''
            ? Number(datos.cambioEntregado)
            : null;

        const opcionesExtra = {
            montoEfectivo: datos.montoEfectivo !== undefined && datos.montoEfectivo !== null && datos.montoEfectivo !== ''
                ? Number(datos.montoEfectivo)
                : null,
            montoQr: datos.montoQr !== undefined && datos.montoQr !== null && datos.montoQr !== ''
                ? Number(datos.montoQr)
                : null,
            referenciaQr: datos.referenciaQr || null,
            descuento: datos.descuento !== undefined && datos.descuento !== null && datos.descuento !== ''
                ? Number(datos.descuento)
                : 0,
            conFactura: Boolean(datos.conFactura),
            tipoComprobante: datos.tipoComprobante || (datos.conFactura ? 'factura' : 'recibo'),
            nroFactura: datos.nroFactura || null,
            cufAutorizacion: datos.cufAutorizacion || null,
            clienteNitCi: datos.clienteNitCi || null,
            clienteRazonSocial: datos.clienteRazonSocial || null
        };

        const resultado = await registrarVentaCompleta(
            Number(datos.cajaId),
            datos.items,
            datos.metodoPago,
            montoRecibido,
            datos.descripcion,
            usuario.id,
            cambioEntregado,
            opcionesExtra
        );

        revalidatePath('/caja');
        revalidatePath('/admin');
        return { venta: resultado };
    });
}

/**
 * Anula una venta o movimiento restituyendo stock y congelando auditoría (operación restringida a roles administrativos).
 */
export async function anularVentaAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const movimientoIdNum = Number(datos.movimientoId);
        await anularMovimientoConPermiso(usuario.id, movimientoIdNum, datos.motivo);
        revalidatePath('/caja');
        revalidatePath('/admin');
        return { anulado: true, movimientoId: movimientoIdNum };
    });
}

/**
 * Registra un egreso de efectivo o QR con categoría contable y snapshot tributario.
 */
export async function registrarEgresoAction(datos) {
    return ejecutarAction(ROLES_OPERADORES, async (usuario) => {
        const opcionesFiscales = {
            categoriaContable: datos.categoriaContable || 'gasto_operativo',
            conFactura: Boolean(datos.conFactura),
            tipoComprobante: datos.tipoComprobante || (datos.conFactura ? 'factura' : 'recibo'),
            nroFactura: datos.nroFactura || null,
            proveedorNit: datos.proveedorNit || null,
            proveedorNombre: datos.proveedorNombre || null,
            referenciaQr: datos.referenciaQr || null
        };

        const id = await registrarEgreso(
            Number(datos.cajaId),
            datos.monto,
            datos.descripcion,
            datos.metodoPago || 'efectivo',
            usuario.id,
            opcionesFiscales
        );

        revalidatePath('/caja');
        revalidatePath('/admin');
        return { movimientoId: id };
    });
}

/**
 * Registra una inyección o aporte de sencillo/cambio en efectivo para el cajón.
 */
export async function registrarIngresoEfectivoAction(datos) {
    return ejecutarAction(ROLES_OPERADORES, async (usuario) => {
        const id = await registrarIngresoEfectivo(
            Number(datos.cajaId),
            datos.monto,
            datos.motivo,
            usuario.id
        );

        revalidatePath('/caja');
        revalidatePath('/admin');
        return { movimientoId: id };
    });
}
