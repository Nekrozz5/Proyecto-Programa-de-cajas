const { NextResponse } = require('next/server');
const {
    obtenerContextoTenantDesdeRequest,
    ejecutarConContextoTenant
} = require('./tenant-context');

/** Ejecuta toda la lógica de una Route Handler dentro del tenant resuelto. */
async function ejecutarRequestEnTenant(request, fn) {
    try {
        const contexto = await obtenerContextoTenantDesdeRequest(request);
        return await ejecutarConContextoTenant(contexto, () => fn(contexto));
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : 'Error al resolver el negocio.';
        const esHostInvalido = mensaje === 'El host no pertenece al dominio multi-negocio configurado.'
            || mensaje === 'No se pudo resolver un tenant válido desde el host.';

        return NextResponse.json(
            { ok: false, error: mensaje },
            {
                status: esHostInvalido ? 400 : (error?.status || 500),
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }
        );
    }
}

module.exports = { ejecutarRequestEnTenant };
