const {
    obtenerContextoTenantDesdeRequest,
    obtenerModoTenancy,
    ejecutarConContextoTenant
} = require('./tenant-context');

/** Ejecuta toda la lógica de una Route Handler dentro del tenant resuelto. */
async function ejecutarRequestEnTenant(request, fn) {
    const contexto = await obtenerContextoTenantDesdeRequest(request);
    if (obtenerModoTenancy() !== 'AWS_MULTI_TENANT') return await fn(contexto);
    return await ejecutarConContextoTenant(contexto, () => fn(contexto));
}

module.exports = { ejecutarRequestEnTenant };
