import { NextResponse } from 'next/server';
import {
    esRolAdministrativo,
    obtenerConfiguracionNegocio,
    obtenerCategorias,
    obtenerCajerosParaLogin,
    obtenerUsuarios,
    obtenerUsuarioPorId,
    obtenerCajaAbierta,
    obtenerCajasAbiertas,
    obtenerCajasFisicas,
    obtenerHistorialCajas,
    obtenerProductos,
    obtenerInsumos,
    obtenerPrediccionComprasInsumos,
    obtenerGruposModificadores,
    obtenerKardexDetallado,
    obtenerEstadisticasCaja,
    obtenerMovimientosCaja,
    obtenerDesgloseMetodosPago,
    obtenerSiguienteNumeroFactura
} from '../../../server/queries';
import {
    NOMBRE_COOKIE_SESION,
    obtenerUsuarioSesion,
    limpiarCookieSesion,
    crearTokenSesion,
    verificarTokenSesion,
    tokenRequiereRenovacion,
    extraerTokenDeRequest,
    adjuntarCookieSesion
} from '../../../server/lib/sesion';
import { verificarEstadoEmail } from '../../../server/lib/mailer';
import { verificarLimitePublicoIp } from '../../../server/repositories/auth.repo';
import { ejecutarRequestEnTenant } from '../../../server/tenancy/request-context';

export const dynamic = 'force-dynamic';

const HEADERS_SIN_CACHE = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

// GET /api/caja -> Devuelve configuración, sesión activa y datos según el estado de autenticación (lectura / polling)
export async function GET(request) {
    return ejecutarRequestEnTenant(request, async () => {
      try {
        const [usuarioSesion, configuracionNegocio, categorias] = await Promise.all([
            obtenerUsuarioSesion(request),
            obtenerConfiguracionNegocio(),
            obtenerCategorias()
        ]);

        // Si no hay sesión autenticada, devolver únicamente lo necesario para el arranque / selector de login:
        // solo cajeros (id y nombre, sin rol). Las cuentas privilegiadas no se exponen.
        if (!usuarioSesion) {
            const ip = String(process.env.TRUST_PROXY || '').trim().toLowerCase() === 'true'
                ? String(request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim()
                : 'local';
            await verificarLimitePublicoIp(ip);
            const usuarios = await obtenerCajerosParaLogin();
            const respuestaSinSesion = NextResponse.json({
                usuarioSesion: null,
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

        const { searchParams } = new URL(request.url);
        const cajaAuditadaParam = searchParams.get('cajaAuditadaId');

        const [usuarioFresco, cajaUsuario, cajasAbiertas, cajasFisicas, historialCajas, productos, insumos, prediccionInsumos, gruposModificadores, kardexDetallado] = await Promise.all([
            obtenerUsuarioPorId(usuarioSesion.id),
            obtenerCajaAbierta(usuarioSesion.id),
            obtenerCajasAbiertas(),
            obtenerCajasFisicas(!esAdmin),
            esAdmin ? obtenerHistorialCajas() : Promise.resolve([]),
            obtenerProductos(),
            esAdmin ? obtenerInsumos() : Promise.resolve([]),
            esAdmin ? obtenerPrediccionComprasInsumos() : Promise.resolve([]),
            obtenerGruposModificadores(!esAdmin),
            esAdmin ? obtenerKardexDetallado({ limite: 150 }) : Promise.resolve({ kardexProductosDirectos: [], kardexInsumos: [] })
        ]);

        const usuarioSesionEnriquecido = usuarioFresco ? { ...usuarioSesion, ...usuarioFresco } : usuarioSesion;

        const cajaActiva = cajaUsuario || (cajasAbiertas.length > 0 ? cajasAbiertas[0] : null);
        const cajaElegidaHist = cajaAuditadaParam
            ? historialCajas.find((c) => Number(c.id) === Number(cajaAuditadaParam))
            : null;
        const cajaReferencia = cajaElegidaHist || cajaActiva || (historialCajas.length > 0 ? historialCajas[0] : null);

        if (!cajaReferencia) {
            return NextResponse.json({
                usuarioSesion: usuarioSesionEnriquecido,
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
                prediccionInsumos,
                kardexDetallado,
                estadoEmail: esAdmin ? await verificarEstadoEmail() : null
            }, { headers: HEADERS_SIN_CACHE });
        }

        const [estadisticas, movimientos, desglosePagos, siguienteNumeroFactura] = await Promise.all([
            esAdmin ? obtenerEstadisticasCaja(cajaReferencia.id) : Promise.resolve(null),
            obtenerMovimientosCaja(cajaReferencia.id),
            esAdmin ? obtenerDesgloseMetodosPago(cajaReferencia.id) : Promise.resolve([]),
            obtenerSiguienteNumeroFactura()
        ]);

        const estadoEmail = esAdmin ? await verificarEstadoEmail() : null;

        const respuesta = NextResponse.json({
            usuarioSesion: usuarioSesionEnriquecido,
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
            kardexDetallado,
            estadoEmail,
            siguienteNumeroFactura
        }, { headers: HEADERS_SIN_CACHE });

        // Si el usuario mantiene actividad en la caja y su token superó la mitad de su vida útil,
        // renovar la cookie de forma transparente para evitar cortes o expiraciones en medio del turno.
        const tokenActual = extraerTokenDeRequest(request);
        if (tokenActual) {
            const payloadToken = await verificarTokenSesion(tokenActual);
            if (payloadToken && tokenRequiereRenovacion(payloadToken)) {
                const nuevoToken = await crearTokenSesion(usuarioSesion);
                adjuntarCookieSesion(respuesta, nuevoToken, usuarioSesion.rol, request);
            }
        }

        return respuesta;
      } catch (error) {
        return NextResponse.json({ error: error.message }, { status: error.status || 500, headers: HEADERS_SIN_CACHE });
      }
    });
}
