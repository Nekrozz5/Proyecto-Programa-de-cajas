'use server';

import { revalidatePath } from 'next/cache';
import { ejecutarAction } from './_wrapper';
import {
    crearInsumo,
    actualizarInsumo,
    eliminarInsumo,
    registrarCompraProductoDirecto,
    registrarMermaProductoDirecto,
    registrarCompraInsumo,
    registrarMermaInsumo,
    verificarIntegridadKardexDirecto,
    verificarIntegridadKardexInsumos,
    validarFormatoFechaYYYYMMDD
} from '../repositories/inventario.repo';

const ROLES_ADMIN = ['admin', 'superadmin', 'developer'];

/**
 * Registra una compra de mercadería directa para reventa, aplicando Costo Promedio Ponderado (CPP).
 */
export async function comprarProductoDirectoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const fechaVencimientoValida = datos.fechaVencimiento
            ? validarFormatoFechaYYYYMMDD(datos.fechaVencimiento)
            : null;

        const res = await registrarCompraProductoDirecto(
            Number(datos.productoId),
            Number(datos.cantidadComprada),
            Number(datos.costoTotalCompra),
            fechaVencimientoValida,
            {
                proveedorNombre: datos.proveedorNombre || datos.distribuidora || null,
                proveedorNit: datos.proveedorNit || null,
                nroFacturaCompra: datos.nroFacturaCompra || null,
                conFactura: Boolean(datos.conFactura),
                usuarioId: usuario.id
            }
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { compraProducto: res };
    });
}

/**
 * Registra una merma o pérdida de stock de un producto directo de reventa.
 */
export async function mermaProductoDirectoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const res = await registrarMermaProductoDirecto(
            Number(datos.productoId),
            Number(datos.cantidadPerdida),
            datos.motivo,
            usuario.id
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { mermaProducto: res };
    });
}

/**
 * Registra una compra de insumo / materia prima con Costo Promedio Ponderado y actualización en cascada de recetas.
 */
export async function comprarInsumoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const res = await registrarCompraInsumo(
            Number(datos.insumoId),
            Number(datos.cantidadComprada),
            Number(datos.costoTotalCompra),
            datos.motivo,
            datos.distribuidora || null,
            {
                proveedorNombre: datos.distribuidora || datos.proveedorNombre || null,
                proveedorNit: datos.proveedorNit || null,
                nroFacturaCompra: datos.nroFacturaCompra || null,
                conFactura: Boolean(datos.conFactura),
                usuarioId: usuario.id
            }
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { compra: res };
    });
}

/**
 * Registra una merma o pérdida de insumo / materia prima.
 */
export async function mermaInsumoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const res = await registrarMermaInsumo(
            Number(datos.insumoId),
            Number(datos.cantidadPerdida),
            datos.motivo,
            usuario.id
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { merma: res };
    });
}

/**
 * Ejecuta una auditoría matemática de integridad entre el stock actual y el Kardex histórico dual.
 */
export async function verificarIntegridadKardexAction() {
    return ejecutarAction(ROLES_ADMIN, async () => {
        const [resDirectos, resInsumos] = await Promise.all([
            verificarIntegridadKardexDirecto(),
            verificarIntegridadKardexInsumos()
        ]);
        return {
            ...resDirectos,
            integridadInsumos: resInsumos
        };
    });
}

/**
 * Registra un nuevo insumo / materia prima en el inventario.
 */
export async function crearInsumoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const id = await crearInsumo(
            datos.nombre,
            datos.unidadMedida,
            Number(datos.stockInicial || 0),
            Number(datos.costoPorUnidad || 0),
            Number(datos.stockSeguridad || 0),
            Number(datos.tiempoEntregaDias || 1),
            datos.fechaVencimiento || null,
            datos.proveedor || null,
            usuario.id
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { insumoId: id };
    });
}

/**
 * Actualiza los datos de un insumo (nombre, unidad de medida, stock de seguridad, tiempo de entrega, ajustes de stock/costo).
 */
export async function actualizarInsumoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const insumoId = Number(datos.insumoId || datos.id);
        const resultado = await actualizarInsumo(insumoId, datos, usuario.id);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return resultado;
    });
}

/**
 * Da de baja lógica a un insumo con justificación obligatoria.
 */
export async function eliminarInsumoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const insumoId = Number(datos.insumoId || datos.id);
        const motivo = datos.motivo;
        const resultado = await eliminarInsumo(insumoId, motivo, usuario.id);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return resultado;
    });
}
