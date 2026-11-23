const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const usuario = { id: 7, nombre: 'Administrador de prueba', rol: 'admin', tenantId: TENANT_ID };
let tenantDisponible = true;
let poolDisponible = true;
let registro = { activo: true };

const pool = {
    async query() {
        if (!registro.activo) return { rows: [] };
        return { rows: [registro] };
    }
};

const secretos = {
    esProduccion: () => false,
    exigirSecretoSesion: () => 'no usado en pruebas'
};
const tenantContext = {
    obtenerContextoTenantDesdeRequest: async () => ({ tenantId: TENANT_ID, tenant: { tenant_id: TENANT_ID } }),
    obtenerContextoTenantActual: () => null,
    tenantDelPayload: (payload) => String(payload?.tenantId || payload?.tenant_id || '')
};
const tenantRegistry = {
    obtenerTenantPorId: async () => tenantDisponible ? { tenant_id: TENANT_ID } : null,
    obtenerPoolTenant: async () => poolDisponible ? pool : null
};
const authRepo = {
    obtenerUsuarioPorIdEnTenant: async () => usuario,
    obtenerEstadoDispositivoParaSesion: async () => true
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request.endsWith('/repositories/auth.repo')) return authRepo;
    if (request.endsWith('/tenancy/tenant-registry')) return tenantRegistry;
    if (request.endsWith('/tenancy/tenant-context')) return tenantContext;
    if (request.endsWith('/lib/secretos')) return secretos;
    return originalLoad.call(this, request, parent, isMain);
};
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const { crearTokenSesion, verificarTokenSesion } = require('../server/lib/sesion');
Module._load = originalLoad;

test.afterEach(() => {
    tenantDisponible = true;
    poolDisponible = true;
    registro = { activo: true };
});

test('sesión administrativa con registro activo se acepta', async () => {
    const token = await crearTokenSesion(usuario);
    assert.equal((await verificarTokenSesion(token)).id, usuario.id);
});

test('sesión administrativa inexistente, revocada o expirada se rechaza', async () => {
    const token = await crearTokenSesion(usuario);
    registro = { activo: false };
    assert.equal(await verificarTokenSesion(token), null);
    registro = { activo: true };
    const tokenRevocado = await crearTokenSesion(usuario);
    registro = { activo: false };
    assert.equal(await verificarTokenSesion(tokenRevocado), null);
});

test('tenant inexistente o pool ausente produce fail-closed', async () => {
    const token = await crearTokenSesion(usuario);
    tenantDisponible = false;
    assert.equal(await verificarTokenSesion(token), null);
    tenantDisponible = true;
    poolDisponible = false;
    assert.equal(await verificarTokenSesion(token), null);
});

test('crear sesión administrativa sin pool lanza error y no emite token', async () => {
    poolDisponible = false;
    await assert.rejects(crearTokenSesion(usuario), /sin acceso al tenant/);
});

test('sesión de cajero con deviceId conserva su comportamiento', async () => {
    const cajero = { ...usuario, id: 8, rol: 'user', deviceId: 3 };
    const token = await crearTokenSesion(cajero);
    const payload = await verificarTokenSesion(token);
    assert.equal(payload.id, cajero.id);
    assert.equal(payload.deviceId, 3);
});
