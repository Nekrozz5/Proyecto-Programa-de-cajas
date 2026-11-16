import { NextResponse } from 'next/server';
import {
    esRolAdministrativo,
    obtenerConfiguracionNegocio,
    guardarConfiguracionNegocio,
    inicializarSistemaPrimeraVez,
    autenticarUsuarioPorId,
    obtenerCajasFisicas,
    crearCajaFisica,
    desactivarCajaFisica,
    reactivarCajaFisica,
    obtenerCajasAbiertas,
    obtenerCajaAbierta,
    obtenerHistorialCajas,
    abrirCaja,
    reabrirCajaConPermiso,
    registrarVentaCompleta,
    registrarEgreso,
    registrarIngresoEfectivo,
    cerrarCaja,
    obtenerEstadisticasCaja,
    obtenerMovimientosCaja,
    obtenerDesgloseMetodosPago,
    obtenerProductos,
    obtenerInsumos,
    obtenerUsuarios,
    obtenerCajerosParaLogin,
    sistemaEstaInstalado,
    obtenerPrediccionComprasInsumos,
    anularMovimientoConPermiso,
    crearUsuarioConPermiso,
    borrarUsuarioConPermiso,
    cambiarPasswordConPermiso,
    obtenerCategorias,
    crearCategoria,
    crearProductoConInsumos,
    crearProducto,
    registrarCompraProductoDirecto,
    crearInsumo,
    registrarCompraInsumo,
    registrarMermaInsumo,
    asignarIngredienteReceta,
    obtenerGruposModificadores,
    crearGrupoModificadores,
    actualizarGrupoModificadores,
    eliminarGrupoModificadores,
    asignarModificadoresAProducto
} from '../../../server/queries';
import {
    NOMBRE_COOKIE_SESION,
    crearTokenSesion,
    obtenerUsuarioSesion,
    exigirUsuarioSesion,
    adjuntarCookieSesion,
    limpiarCookieSesion
} from '../../../server/sesion';

const ROLES_ADMIN = ['admin', 'superadmin', 'developer'];

export const dynamic = 'force-dynamic';

const HEADERS_SIN_CACHE = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

// IP del cliente para el límite de intentos de login.
// Solo se confía en cf-connecting-ip (Cloudflare Tunnel) o x-real-ip (Proxy inverso)
// cuando TRUST_PROXY=true. En cualquier otro caso se usa 'local'.
function obtenerIpCliente(request) {
    if (String(process.env.TRUST_PROXY || '').trim().toLowerCase() !== 'true') {
        return 'local';
    }
    const cfIp = String(request.headers.get('cf-connecting-ip') || '').trim();
    if (cfIp) return cfIp.slice(0, 64);

    const realIp = String(request.headers.get('x-real-ip') || '').trim();
    return realIp ? realIp.slice(0, 64) : 'local';
}

// GET /api/caja -> Devuelve configuración, sesión activa y datos según el estado de autenticación
export async function GET(request) {
    try {
        const [usuarioSesion, configuracionNegocio, categorias] = await Promise.all([
            obtenerUsuarioSesion(request),
            obtenerConfiguracionNegocio(),
            obtenerCategorias()
        ]);
        const sistemaInstalado = await sistemaEstaInstalado(configuracionNegocio);

        // Si no hay sesión autenticada, devolver únicamente lo necesario para el arranque / selector de login:
        // estado de instalación y solo cajeros (id y nombre, sin rol). Las cuentas privilegiadas no se exponen.
        if (!usuarioSesion) {
            const usuarios = await obtenerCajerosParaLogin();
            const respuestaSinSesion = NextResponse.json({
                usuarioSesion: null,
                sistemaInstalado,
                configuracionNegocio,
                usuarios,
                categorias,
                cajasFisicas: [],
                cajasAbiertas: [],
                cajaAbierta: null,
                cajaAuditada: null,
                historialCajas: [],
                estadisticas: null,
                movimientos: [],
                desglosePagos: [],
                productos: [],
                gruposModificadores: [],
                insumos: [],
                prediccionInsumos: []
            }, { headers: HEADERS_SIN_CACHE });

            // Si el cliente traía una cookie de sesión previa que ya fue invalidada (p. ej. por reinicio del servidor o expiración),
            // limpiamos la cookie de inmediato en el navegador para no dejar sesiones residuales
            const teniaCookie = request.cookies?.get?.(NOMBRE_COOKIE_SESION)
                || (request.headers.get('cookie') && request.headers.get('cookie').includes(NOMBRE_COOKIE_SESION));
            if (teniaCookie) {
                limpiarCookieSesion(respuestaSinSesion, request);
            }

            return respuestaSinSesion;
        }

        const esAdmin = esRolAdministrativo(usuarioSesion.rol);
        // Listado completo de usuarios solo para roles administrativos; un cajero recibe la misma lista mínima pública
        const usuarios = esAdmin ? await obtenerUsuarios() : await obtenerCajerosParaLogin();

        const [cajaUsuario, cajasAbiertas, cajasFisicas, historialCajas, productos, insumos, prediccionInsumos, gruposModificadores] = await Promise.all([
            obtenerCajaAbierta(usuarioSesion.id),
            obtenerCajasAbiertas(),
            obtenerCajasFisicas(!esAdmin),
            obtenerHistorialCajas(),
            obtenerProductos(),
            esAdmin ? obtenerInsumos() : Promise.resolve([]),
            esAdmin ? obtenerPrediccionComprasInsumos() : Promise.resolve([]),
            obtenerGruposModificadores(!esAdmin)
        ]);

        const cajaActiva = cajaUsuario || (cajasAbiertas.length > 0 ? cajasAbiertas[0] : null);
        const cajaReferencia = cajaActiva || (historialCajas.length > 0 ? historialCajas[0] : null);

        if (!cajaReferencia) {
            return NextResponse.json({
                usuarioSesion,
                sistemaInstalado,
                configuracionNegocio,
                cajasFisicas,
                cajasAbiertas,
                cajaAbierta: null,
                cajaAuditada: null,
                historialCajas,
                estadisticas: null,
                movimientos: [],
                desglosePagos: [],
                productos,
                gruposModificadores,
                insumos,
                usuarios,
                categorias,
                prediccionInsumos
            }, { headers: HEADERS_SIN_CACHE });
        }

        const [estadisticas, movimientos, desglosePagos] = await Promise.all([
            esAdmin ? obtenerEstadisticasCaja(cajaReferencia.id) : Promise.resolve(null),
            obtenerMovimientosCaja(cajaReferencia.id),
            esAdmin ? obtenerDesgloseMetodosPago(cajaReferencia.id) : Promise.resolve([])
        ]);

        const { verificarEstadoEmail } = require('../../../server/mailer');
        const estadoEmail = esAdmin ? verificarEstadoEmail() : null;

        return NextResponse.json({
            usuarioSesion,
            sistemaInstalado,
            configuracionNegocio,
            cajasFisicas,
            cajasAbiertas,
            cajaAbierta: cajaActiva,
            cajaAuditada: cajaReferencia,
            historialCajas,
            estadisticas,
            movimientos,
            desglosePagos,
            productos,
            gruposModificadores,
            insumos,
            usuarios,
            categorias,
            prediccionInsumos,
            estadoEmail
        }, { headers: HEADERS_SIN_CACHE });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: error.status || 500, headers: HEADERS_SIN_CACHE });
    }
}

// POST /api/caja -> Ejecuta acciones usando exclusivamente el usuario de la sesión del servidor
export async function POST(request) {
    try {
        const body = await request.json();
        const { accion } = body;

        if (accion === 'login') {
            const ip = obtenerIpCliente(request);
            const usuario = await autenticarUsuarioPorId(
                Number(body.usuarioId || 0),
                String(body.pin || ''),
                body.nombreUsuario || null,
                ip
            );
            const token = await crearTokenSesion(usuario);
            const response = NextResponse.json({ ok: true, usuario });
            adjuntarCookieSesion(response, token, usuario.rol, request);
            return response;
        }

        if (accion === 'logout') {
            const response = NextResponse.json({ ok: true });
            limpiarCookieSesion(response, request);
            return response;
        }

        if (accion === 'instalacion_inicial') {
            const resultado = await inicializarSistemaPrimeraVez({
                ...body,
                setupToken: typeof body.setupToken === 'string' ? body.setupToken : ''
            });
            return NextResponse.json({ ok: true, ...resultado });
        }

        // A partir de aquí, todas las acciones requieren sesión válida en el servidor
        const usuarioSesion = await exigirUsuarioSesion(request);

        if (accion === 'abrir') {
            const id = await abrirCaja(
                usuarioSesion.id,
                body.montoInicial,
                body.cajaFisicaId ? Number(body.cajaFisicaId) : null
            );
            return NextResponse.json({ ok: true, cajaId: id });
        }

        if (accion === 'crear_caja_fisica') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const id = await crearCajaFisica(body.nombre, usuarioSesion.id);
            return NextResponse.json({ ok: true, cajaFisicaId: id });
        }

        if (accion === 'desactivar_caja_fisica') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            await desactivarCajaFisica(Number(body.cajaFisicaId), usuarioSesion.id);
            return NextResponse.json({ ok: true });
        }

        if (accion === 'reactivar_caja_fisica') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            await reactivarCajaFisica(Number(body.cajaFisicaId), usuarioSesion.id);
            return NextResponse.json({ ok: true });
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

        if (accion === 'ingreso_efectivo') {
            const id = await registrarIngresoEfectivo(
                Number(body.cajaId),
                body.monto,
                body.motivo,
                usuarioSesion.id
            );
            return NextResponse.json({ ok: true, movimientoId: id });
        }

        if (accion === 'cerrar') {
            const arqueo = await cerrarCaja(Number(body.cajaId), body.efectivoReal, usuarioSesion.id);
            try {
                const { enviarNotificacionCierreCaja } = require('../../../server/mailer');
                enviarNotificacionCierreCaja(Number(body.cajaId)).catch((errEmail) => {
                    console.error('[Cierre] Error en despacho asíncrono de correo:', errEmail);
                });
            } catch (errReq) {
                console.error('[Cierre] Error al invocar módulo mailer:', errReq);
            }
            return NextResponse.json({ ok: true, arqueo });
        }

        if (accion === 'probar_email') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const { enviarEmailPrueba } = require('../../../server/mailer');
            const resultado = await enviarEmailPrueba(body.destinatario);
            if (!resultado.enviado) {
                return NextResponse.json({ ok: false, error: resultado.error || 'No se pudo enviar el correo de prueba.' }, { status: 400 });
            }
            return NextResponse.json({ ok: true, mensaje: `Correo de prueba enviado exitosamente a ${resultado.destino}` });
        }

        if (accion === 'reenviar_cierre_email') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const { enviarNotificacionCierreCaja } = require('../../../server/mailer');
            const resultado = await enviarNotificacionCierreCaja(Number(body.cajaId));
            if (!resultado.enviado) {
                const mensajeError = resultado.error || (resultado.motivo === 'no_configurado' ? 'El correo no está configurado en .env.local' : 'No se pudo enviar el correo.');
                return NextResponse.json({ ok: false, error: mensajeError }, { status: 400 });
            }
            return NextResponse.json({ ok: true, mensaje: `Reporte de Turno #${body.cajaId} enviado por correo exitosamente.` });
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

        if (accion === 'crear_categoria') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const cat = await crearCategoria(body.nombre);
            return NextResponse.json({ ok: true, categoria: cat });
        }

        if (accion === 'crear_producto') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const resultado = await crearProductoConInsumos(body);
            return NextResponse.json({ ok: true, ...resultado });
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
                body.fechaVencimiento || null,
                body.proveedor || null
            );
            return NextResponse.json({ ok: true, insumoId: id });
        }

        if (accion === 'comprar_insumo') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const res = await registrarCompraInsumo(
                Number(body.insumoId),
                Number(body.cantidadComprada),
                Number(body.costoTotalCompra),
                body.motivo,
                body.distribuidora || null
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

        if (accion === 'crear_grupo_modificador') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            const id = await crearGrupoModificadores(body, usuarioSesion.id);
            return NextResponse.json({ ok: true, grupoId: id });
        }

        if (accion === 'actualizar_grupo_modificador') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            await actualizarGrupoModificadores(Number(body.grupoId), body, usuarioSesion.id);
            return NextResponse.json({ ok: true });
        }

        if (accion === 'eliminar_grupo_modificador') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            await eliminarGrupoModificadores(Number(body.grupoId), usuarioSesion.id);
            return NextResponse.json({ ok: true });
        }

        if (accion === 'asignar_modificadores_producto') {
            await exigirUsuarioSesion(request, ROLES_ADMIN);
            await asignarModificadoresAProducto(Number(body.productoId), body.grupoIds, usuarioSesion.id);
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: error.status || 400 });
    }
}
