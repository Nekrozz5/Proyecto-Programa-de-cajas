'use server';

import { revalidatePath } from 'next/cache';
import { ejecutarAction } from './_wrapper';
import {
    crearCategoria,
    crearProductoConInsumos,
    asignarIngredienteReceta,
    crearGrupoModificadores,
    actualizarGrupoModificadores,
    eliminarGrupoModificadores,
    asignarModificadoresAProducto
} from '../repositories/catalogo.repo';

const ROLES_ADMIN = ['admin', 'superadmin', 'developer'];

/**
 * Registra una nueva categoría en el catálogo de productos.
 */
export async function crearCategoriaAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async () => {
        const nombre = typeof datos === 'object' && datos !== null ? datos.nombre : datos;
        const categoria = await crearCategoria(nombre);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { categoria };
    });
}

/**
 * Registra un nuevo producto (unitario directo, con receta/escandallo, libre o combo).
 */
export async function crearProductoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const resultado = await crearProductoConInsumos({ ...datos, usuarioId: usuario.id });
        revalidatePath('/admin');
        revalidatePath('/caja');
        return resultado;
    });
}

/**
 * Asocia un ingrediente o insumo a la receta de un producto con cantidad y unidad.
 */
export async function asignarRecetaAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async () => {
        const res = await asignarIngredienteReceta(
            Number(datos.productoId),
            Number(datos.insumoId),
            Number(datos.cantidadRequerida),
            datos.unidadReceta || null
        );
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { receta: res };
    });
}

/**
 * Crea un grupo de modificadores (ej. tipo de leche, toppings, salsas) para recetas.
 */
export async function crearGrupoModificadorAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const id = await crearGrupoModificadores(datos, usuario.id);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { grupoId: id };
    });
}

/**
 * Actualiza la definición y opciones de un grupo de modificadores existente.
 */
export async function actualizarGrupoModificadorAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        await actualizarGrupoModificadores(Number(datos.grupoId), datos, usuario.id);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { actualizado: true };
    });
}

/**
 * Da de baja lógica un grupo de modificadores.
 */
export async function eliminarGrupoModificadorAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        const id = typeof datos === 'object' && datos !== null ? datos.grupoId : datos;
        await eliminarGrupoModificadores(Number(id), usuario.id);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { eliminado: true };
    });
}

/**
 * Asigna múltiples grupos de modificadores a un producto determinado.
 */
export async function asignarModificadoresProductoAction(datos) {
    return ejecutarAction(ROLES_ADMIN, async (usuario) => {
        await asignarModificadoresAProducto(Number(datos.productoId), datos.grupoIds, usuario.id);
        revalidatePath('/admin');
        revalidatePath('/caja');
        return { asignado: true };
    });
}
