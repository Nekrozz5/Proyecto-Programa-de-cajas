import { NextResponse } from 'next/server';
import {
    obtenerConfiguracionNegocio,
    guardarConfiguracionNegocio,
    inicializarSistemaPrimeraVez,
    autenticarUsuarioPorId,
    obtenerCajaAbierta,
    obtenerHistorialCajas,
    abrirCaja,
    reabrirCajaConPermiso,
    registrarVentaCompleta,
    registrarEgreso,
    cerrarCaja,
    obtenerEstadisticasCaja,
    obtenerMovimientosCaja,
    obtenerDesgloseMetodosPago,
    obtenerProductos,
    obtenerInsumos,
    obtenerUsuarios,
    obtenerPrediccionComprasInsumos,
    anularMovimientoConPermiso,
    crearUsuarioConPermiso,
    borrarUsuarioConPermiso,
    cambiarPasswordConPermiso,
    crearProducto,
    registrarCompraProductoDirecto,
    crearInsumo,
    registrarCompraInsumo,
    registrarMermaInsumo,
    asignarIngredienteReceta
} from '../../../server/queries';

// GET /api/caja -> Devuelve configuración, caja abierta, historial de cierres, catálogo, usuarios, insumos y estadísticas
export async function GET() {
    try {
        const [configuracionNegocio, caja, historialCajas, productos, insumos, usuarios, prediccionInsumos] = await Promise.all([
            obtenerConfiguracionNegocio(),
            obtenerCajaAbierta(),
            obtenerHistorialCajas(),
            obtenerProductos(),
            obtenerInsumos(),
            obtenerUsuarios(),
            obtenerPrediccionComprasInsumos()
        ]);

        // Si no hay caja abierta, usamos la última caja cerrada para que el Admin pueda auditarla
        const cajaReferencia = caja || (historialCajas.length > 0 ? historialCajas[0] : null);

        if (!cajaReferencia) {
            return NextResponse.json({
                configuracionNegocio,
                cajaAbierta: null,
                historialCajas,
                estadisticas: null,
                movimientos: [],
                desglosePagos: [],
                productos,
                insumos,
                usuarios,
                prediccionInsumos
            });
        }

        const [estadisticas, movimientos, desglosePagos] = await Promise.all([
            obtenerEstadisticasCaja(cajaReferencia.id),
            obtenerMovimientosCaja(cajaReferencia.id),
            obtenerDesgloseMetodosPago(cajaReferencia.id)
        ]);

        return NextResponse.json({
            configuracionNegocio,
            cajaAbierta: caja,
            cajaAuditada: cajaReferencia,
            historialCajas,
            estadisticas,
            movimientos,
            desglosePagos,
            productos,
            insumos,
            usuarios,
            prediccionInsumos
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/caja -> Ejecuta acciones según el campo "accion" enviado desde el frontend
export async function POST(request) {
    try {
        const body = await request.json();
        const { accion } = body;

        if (accion === 'login') {
            const usuario = await autenticarUsuarioPorId(
                Number(body.usuarioId || 0),
                String(body.pin || ''),
                body.nombreUsuario || null
            );
            return NextResponse.json({ ok: true, usuario });
        }

        if (accion === 'abrir') {
            const id = await abrirCaja(Number(body.usuarioId), Number(body.montoInicial));
            return NextResponse.json({ ok: true, cajaId: id });
        }

        if (accion === 'reabrir') {
            await reabrirCajaConPermiso(Number(body.adminId), Number(body.cajaId), body.motivo);
            return NextResponse.json({ ok: true });
        }

        if (accion === 'vender') {
            const resultado = await registrarVentaCompleta(
                Number(body.cajaId),
                body.items,
                body.metodoPago,
                body.montoRecibido !== undefined && body.montoRecibido !== '' ? Number(body.montoRecibido) : null,
                body.descripcion,
                body.usuarioId ? Number(body.usuarioId) : null,
                body.cambioEntregado !== undefined && body.cambioEntregado !== '' ? Number(body.cambioEntregado) : null
            );
            return NextResponse.json({ ok: true, venta: resultado });
        }

        if (accion === 'egreso') {
            const id = await registrarEgreso(
                Number(body.cajaId),
                Number(body.monto),
                body.descripcion,
                body.metodoPago || 'efectivo',
                body.usuarioId ? Number(body.usuarioId) : null
            );
            return NextResponse.json({ ok: true, movimientoId: id });
        }

        if (accion === 'cerrar') {
            const arqueo = await cerrarCaja(Number(body.cajaId), Number(body.efectivoReal));
            return NextResponse.json({ ok: true, arqueo });
        }

        if (accion === 'anular') {
            await anularMovimientoConPermiso(Number(body.adminId), Number(body.movimientoId), body.motivo);
            return NextResponse.json({ ok: true });
        }

        if (accion === 'crear_usuario') {
            const id = await crearUsuarioConPermiso(
                Number(body.adminId),
                body.nombre,
                body.pin,
                body.rol
            );
            return NextResponse.json({ ok: true, usuarioId: id });
        }

        if (accion === 'borrar_usuario') {
            await borrarUsuarioConPermiso(Number(body.adminId), Number(body.usuarioABorrarId));
            return NextResponse.json({ ok: true });
        }

        if (accion === 'cambiar_password') {
            await cambiarPasswordConPermiso(
                Number(body.ejecutorId),
                Number(body.usuarioObjetivoId),
                body.nuevoPin,
                body.pinActual
            );
            return NextResponse.json({ ok: true });
        }

        if (accion === 'instalacion_inicial') {
            const resultado = await inicializarSistemaPrimeraVez(body);
            return NextResponse.json({ ok: true, ...resultado });
        }

        if (accion === 'guardar_configuracion') {
            const config = await guardarConfiguracionNegocio(Number(body.adminId), body);
            return NextResponse.json({ ok: true, configuracionNegocio: config });
        }

        if (accion === 'crear_producto') {
            const stock = body.stock !== undefined && body.stock !== '' && body.stock !== null
                ? Number(body.stock)
                : null;
            const id = await crearProducto(
                body.nombre,
                Number(body.precio),
                Number(body.costo || 0),
                body.categoria || 'General',
                stock,
                body.unidadMedida || 'unidades',
                Number(body.stockMinimo || 0),
                body.fechaVencimiento || null
            );
            return NextResponse.json({ ok: true, productoId: id });
        }

        if (accion === 'comprar_producto_directo') {
            const res = await registrarCompraProductoDirecto(
                Number(body.productoId),
                Number(body.cantidadComprada),
                Number(body.costoTotalCompra),
                body.fechaVencimiento || null
            );
            return NextResponse.json({ ok: true, compraProducto: res });
        }

        if (accion === 'crear_insumo') {
            const id = await crearInsumo(
                body.nombre,
                body.unidadMedida,
                Number(body.stockInicial || 0),
                Number(body.costoPorUnidad || 0),
                Number(body.stockSeguridad || 0),
                Number(body.tiempoEntregaDias || 1),
                body.fechaVencimiento || null
            );
            return NextResponse.json({ ok: true, insumoId: id });
        }

        if (accion === 'comprar_insumo') {
            const res = await registrarCompraInsumo(
                Number(body.insumoId),
                Number(body.cantidadComprada),
                Number(body.costoTotalCompra),
                body.motivo
            );
            return NextResponse.json({ ok: true, compra: res });
        }

        if (accion === 'merma_insumo') {
            const res = await registrarMermaInsumo(
                Number(body.insumoId),
                Number(body.cantidadPerdida),
                body.motivo
            );
            return NextResponse.json({ ok: true, merma: res });
        }

        if (accion === 'asignar_receta') {
            const res = await asignarIngredienteReceta(
                Number(body.productoId),
                Number(body.insumoId),
                Number(body.cantidadRequerida),
                body.unidadReceta || null
            );
            return NextResponse.json({ ok: true, receta: res });
        }

        return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
