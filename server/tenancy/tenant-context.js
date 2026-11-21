/**
 * Resolución de tenant exclusivamente en servidor.
 *
 * LOCAL_SINGLE_TENANT fija el tenant por configuración de la instalación.
 * AWS_MULTI_TENANT deriva el slug del host validado por el servidor y consulta
 * el registro central; nunca usa tenant_id enviado en JSON por el cliente.
 */
const { obtenerTenantPorSlug, obtenerTenantPorId } = require('./tenant-registry');
const { AsyncLocalStorage } = require('async_hooks');

const almacenamientoTenant = new AsyncLocalStorage();

const TENANT_ID_LOCAL_POR_DEFECTO = '00000000-0000-4000-8000-000000000001';

function obtenerModoTenancy() {
    return String(process.env.TENANCY_MODE || 'LOCAL_SINGLE_TENANT').trim().toUpperCase();
}

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
    const modo = obtenerModoTenancy();

    if (modo === 'LOCAL_SINGLE_TENANT') {
        const tenantId = String(process.env.LOCAL_TENANT_ID || TENANT_ID_LOCAL_POR_DEFECTO).trim();
        const tenant = process.env.CONTROL_DATABASE_URL
            ? await obtenerTenantPorId(tenantId)
            : { tenant_id: tenantId, slug: process.env.LOCAL_TENANT_SLUG || 'local' };
        if (!tenant) throw new Error('El tenant local no existe o está inactivo.');
        return { modo, tenantId: tenant.tenant_id, tenant };
    }

    if (modo !== 'AWS_MULTI_TENANT') {
        throw new Error(`TENANCY_MODE no soportado: ${modo}.`);
    }

    const slug = obtenerSlugDesdeHost(obtenerHost(request));
    const tenant = await obtenerTenantPorSlug(slug);
    if (!tenant) throw new Error('Negocio no encontrado o inactivo.');
    return { modo, tenantId: tenant.tenant_id, tenant };
}

function tenantDelPayload(payload) {
    const tenantId = String(payload && (payload.tenantId || payload.tenant_id) || '').trim();
    if (!tenantId) return null;
    return tenantId;
}

function ejecutarConContextoTenant(contexto, fn) {
    if (!contexto || !contexto.tenantId) {
        throw new Error('No se puede ejecutar una operación sin contexto de tenant.');
    }
    return almacenamientoTenant.run(contexto, fn);
}

function obtenerContextoTenantActual() {
    return almacenamientoTenant.getStore() || null;
}

module.exports = {
    TENANT_ID_LOCAL_POR_DEFECTO,
    obtenerModoTenancy,
    obtenerSlugDesdeHost,
    obtenerContextoTenantDesdeRequest,
    tenantDelPayload,
    ejecutarConContextoTenant,
    obtenerContextoTenantActual
};
