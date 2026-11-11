import { NextResponse } from 'next/server';
import {
    esRolAdministrativo,
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
import {
    crearTokenSesion,
    obtenerUsuarioSesion,
    exigirUsuarioSesion,
    adjuntarCookieSesion,
    limpiarCookieSesion
} from '../../../server/sesion';

const ROLES_ADMIN = ['admin', 'superadmin', 'developer'];

// GET /api/caja -> Devuelve configuración, sesión activa y datos según el estado de autenticación
export async function GET(request) {
    try {
        const [usuarioSesion, configuracionNegocio, usuarios] = await Promise.all([
            obtenerUsuarioSesion(request),
            obtenerConfiguracionNegocio(),
            obtenerUsuarios()
        ]);

        // Si no hay sesión autenticada, devolver únicamente lo necesario para el arranque / selector de login
        if (!usuarioSesion) {
            return NextResponse.json({
                usuarioSesion: null,
                configuracionNegocio,
                usuarios,
                cajaAbierta: null,
                cajaAuditada: null,
                historialCajas: [],
                estadisticas: null,
                movimientos: [],
                desglosePagos: [],
                productos: [],
                insumos: [],
                prediccionInsumos: []
            });
        }

        const esAdmin = esRolAdministrativo(usuarioSesion.rol);

        const [caja, historialCajas, productos, insumos, prediccionInsumos] = await Promise.all([
            obtenerCajaAbierta(),
            obtenerHistorialCajas(),
            obtenerProductos(),
            esAdmin ? obtenerInsumos() : Promise.resolve([]),
            esAdmin ? obtenerPrediccionComprasInsumos() : Promise.resolve([])
        ]);

        // Si no hay caja abierta, usamos la última caja cerrada para que el Admin pueda auditarla
        const cajaReferencia = caja || (historialCajas.length > 0 ? historialCajas[0] : null);

        if (!cajaReferencia) {
            return NextResponse.json({
                usuarioSesion,
                configuracionNegocio,
                cajaAbierta: null,
                cajaAuditada: null,
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
            esAdmin ? obtenerEstadisticasCaja(cajaReferencia.id) : Promise.resolve(null),
            obtenerMovimientosCaja(cajaReferencia.id),
            esAdmin ? obtenerDesgloseMetodosPago(cajaReferencia.id) : Promise.resolve([])
        ]);

        return NextResponse.json({
            usuarioSesion,
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
        return NextResponse.json({ error: error.message }, { status: error.status || 500 });
    }
}

// POST /api/caja -> Ejecuta acciones usando exclusivamente el usuario de la sesión del servidor
export async function POST(request) {
    try {
        const body = await request.json();
        const { accion } = body;

        if (accion === 'login') {
            const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                || request.headers.get('x-real-ip')
                || 'local';
            const usuario = await autenticarUsuarioPorId(
                Number(body.usuarioId || 0),
                String(body.pin || ''),
                body.nombreUsuario || null,
                ip
            );
            const token = await crearTokenSesion(usuario);
            const response = NextResponse.json({ ok: true, usuario });
            adjuntarCookieSesion(response, token);
            return response;
        }

        if (accion === 'logout') {
            const response = NextResponse.json({ ok: true });
            limpiarCookieSesion(response);
            return response;
        }

        if (accion === 'instalacion_inicial') {
            const resultado = await inicializarSistemaPrimeraVez(body);
            return NextResponse.json({ ok: true, ...resultado });
        }

        // A partir de aquí, todas las acciones requieren sesión válida en el servidor
        const usuarioSesion = await exigirUsuarioSesion(request);

        if (accion === 'abrir') {
            const id = await abrirCaja(usuarioSesion.id, body.montoInicial);
            return NextResponse.json({ ok: true, cajaId: id });
        }

        if (accion === 'reabrir') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            await reabrirCajaConPermiso(usuarioSesion.id, Number(body.cajaId), body.motivo);
            return NextResponse.json({ ok: true });
        }

        if (accion === 'vender') {
            const resultado = await registrarVentaCompleta(
                Number(body.cajaId),
                body.items,
                body.metodoPago,
                body.montoRecibido !== undefined && body.montoRecibido !== null && body.montoRecibido !== '' ? Number(body.montoRecibido) : null,
                body.descripcion,
                usuarioSesion.id,
                body.cambioEntregado !== undefined && body.cambioEntregado !== null && body.cambioEntregado !== '' ? Number(body.cambioEntregado) : null
            );
            return NextResponse.json({ ok: true, venta: resultado });
        }

        if (accion === 'egreso') {
            const id = await registrarEgreso(
                Number(body.cajaId),
                body.monto,
                body.descripcion,
                body.metodoPago || 'efectivo',
                usuarioSesion.id
            );
            return NextResponse.json({ ok: true, movimientoId: id });
        }

        if (accion === 'cerrar') {
            const arqueo = await cerrarCaja(Number(body.cajaId), body.efectivoReal, usuarioSesion.id);
            return NextResponse.json({ ok: true, arqueo });
        }

        if (accion === 'anular') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            await anularMovimientoConPermiso(usuarioSesion.id, Number(body.movimientoId), body.motivo);
            return NextResponse.json({ ok: true });
        }

        if (accion === 'crear_usuario') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const id = await crearUsuarioConPermiso(
                usuarioSesion.id,
                body.nombre,
                body.pin,
                body.rol
            );
            return NextResponse.json({ ok: true, usuarioId: id });
        }

        if (accion === 'borrar_usuario') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            await borrarUsuarioConPermiso(usuarioSesion.id, Number(body.usuarioABorrarId));
            return NextResponse.json({ ok: true });
        }

        if (accion === 'cambiar_password') {
            const objetivoId = body.usuarioObjetivoId ? Number(body.usuarioObjetivoId) : usuarioSesion.id;
            await cambiarPasswordConPermiso(
                usuarioSesion.id,
                objetivoId,
                body.nuevoPin,
                body.pinActual
            );
            return NextResponse.json({ ok: true });
        }

        if (accion === 'guardar_configuracion') {
            await exigirUsuarioSesion(request, ['developer']);
            const config = await guardarConfiguracionNegocio(usuarioSesion.id, body);
            return NextResponse.json({ ok: true, configuracionNegocio: config });
        }

        if (accion === 'crear_producto') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
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
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const res = await registrarCompraProductoDirecto(
                Number(body.productoId),
                Number(body.cantidadComprada),
                Number(body.costoTotalCompra),
                body.fechaVencimiento || null
            );
            return NextResponse.json({ ok: true, compraProducto: res });
        }

        if (accion === 'crear_insumo') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
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
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const res = await registrarCompraInsumo(
                Number(body.insumoId),
                Number(body.cantidadComprada),
                Number(body.costoTotalCompra),
                body.motivo
            );
            return NextResponse.json({ ok: true, compra: res });
        }

        if (accion === 'merma_insumo') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const res = await registrarMermaInsumo(
                Number(body.insumoId),
                Number(body.cantidadPerdida),
                body.motivo
            );
            return NextResponse.json({ ok: true, merma: res });
        }

        if (accion === 'asignar_receta') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
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
        return NextResponse.json({ error: error.message }, { status: error.status || 400 });
    }
}
