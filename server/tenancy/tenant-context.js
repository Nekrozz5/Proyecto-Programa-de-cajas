/**
 * Resolución de tenant exclusivamente en servidor.
 *
 * AWS_MULTI_TENANT deriva el slug del host validado por el servidor y consulta
 * el registro central; nunca usa tenant_id enviado en JSON por el cliente.
 */
const { obtenerTenantPorSlug } = require('./tenant-registry');
const { AsyncLocalStorage } = require('async_hooks');

const almacenamientoTenant = new AsyncLocalStorage();

function obtenerHost(request) {
    const host = request && request.headers && typeof request.headers.get === 'function'
        ? request.headers.get('host')
        : null;
    return String(host || '').trim().toLowerCase().split(':')[0];
}

function obtenerSlugDesdeHost(host) {
    const sufijo = String(process.env.TENANT_HOST_SUFFIX || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!sufijo) throw new Error('TENANT_HOST_SUFFIX no está configurado para AWS_MULTI_TENANT.');

    const final = `.${sufijo}`;
    if (!host.endsWith(final)) {
        throw new Error('El host no pertenece al dominio multi-negocio configurado.');
    }

    const subdominio = host.slice(0, -final.length);
    if (!subdominio || subdominio.includes('.')) {
        throw new Error('No se pudo resolver un tenant válido desde el host.');
    }
    return subdominio;
}

async function obtenerContextoTenantDesdeRequest(request) {
    if (String(process.env.TENANCY_MODE || '').trim().toUpperCase() !== 'AWS_MULTI_TENANT') {
        throw new Error('TENANCY_MODE debe ser AWS_MULTI_TENANT.');
    }

    const slug = obtenerSlugDesdeHost(obtenerHost(request));
    const tenant = await obtenerTenantPorSlug(slug);
    if (!tenant) throw new Error('Negocio no encontrado o inactivo.');
    return { tenantId: tenant.tenant_id, tenant };
}

function tenantDelPayload(payload) {
    const tenantId = String(payload && (payload.tenantId || payload.tenant_id) || '').trim();
    if (!tenantId) return null;
    return tenantId;
}

function validarContextoTenant(contexto) {
    if (!contexto?.tenantId || contexto.tenantId !== contexto.tenant?.tenant_id) {
        throw new Error('Contexto de tenant obligatorio para acceder a PostgreSQL.');
    }
    return contexto;
}

function ejecutarConContextoTenant(contexto, fn) {
    validarContextoTenant(contexto);
    return almacenamientoTenant.run(contexto, fn);
}

function obtenerContextoTenantActual() {
    return almacenamientoTenant.getStore() || null;
}

function exigirContextoTenant() {
    return validarContextoTenant(obtenerContextoTenantActual());
}

module.exports = {
    obtenerSlugDesdeHost,
    obtenerContextoTenantDesdeRequest,
    tenantDelPayload,
    ejecutarConContextoTenant,
    obtenerContextoTenantActual,
    exigirContextoTenant
};
