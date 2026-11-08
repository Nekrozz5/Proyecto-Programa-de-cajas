import { NextResponse } from 'next/server';
import {
    obtenerCajaAbierta,
    abrirCaja,
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
    crearProducto,
    crearInsumo,
    registrarCompraInsumo,
    registrarMermaInsumo,
    asignarIngredienteReceta
} from '../../../server/queries';

// GET /api/caja -> Devuelve la caja abierta actual, catálogo, usuarios, insumos y estadísticas en vivo
export async function GET() {
    try {
        const [caja, productos, insumos, usuarios, prediccionInsumos] = await Promise.all([
            obtenerCajaAbierta(),
            obtenerProductos(),
            obtenerInsumos(),
            obtenerUsuarios(),
            obtenerPrediccionComprasInsumos()
        ]);

        if (!caja) {
            return NextResponse.json({
                cajaAbierta: null,
                productos,
                insumos,
                usuarios,
                prediccionInsumos
            });
        }

        const [estadisticas, movimientos, desglosePagos] = await Promise.all([
            obtenerEstadisticasCaja(caja.id),
            obtenerMovimientosCaja(caja.id),
            obtenerDesgloseMetodosPago(caja.id)
        ]);

        return NextResponse.json({
            cajaAbierta: caja,
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

        if (accion === 'abrir') {
            const id = await abrirCaja(Number(body.usuarioId), Number(body.montoInicial));
            return NextResponse.json({ ok: true, cajaId: id });
        }

        if (accion === 'vender') {
            const resultado = await registrarVentaCompleta(
                Number(body.cajaId),
                body.items,
                body.metodoPago,
                body.montoRecibido !== undefined && body.montoRecibido !== '' ? Number(body.montoRecibido) : null,
                body.descripcion
            );
            return NextResponse.json({ ok: true, venta: resultado });
        }

        if (accion === 'egreso') {
            const id = await registrarEgreso(
                Number(body.cajaId),
                Number(body.monto),
                body.descripcion,
                body.metodoPago || 'efectivo'
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

        if (accion === 'crear_producto') {
            const stock = body.stock !== undefined && body.stock !== '' && body.stock !== null
                ? Number(body.stock)
                : null;
            const id = await crearProducto(
                body.nombre,
                Number(body.precio),
                Number(body.costo || 0),
                body.categoria || 'General',
                stock
            );
            return NextResponse.json({ ok: true, productoId: id });
        }

        if (accion === 'crear_insumo') {
            const id = await crearInsumo(
                body.nombre,
                body.unidadMedida,
                Number(body.stockInicial || 0),
                Number(body.costoPorUnidad || 0),
                Number(body.stockSeguridad || 0),
                Number(body.tiempoEntregaDias || 1)
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
                Number(body.cantidadRequerida)
            );
            return NextResponse.json({ ok: true, receta: res });
        }

        return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
