const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const {
    verificarPruebaDispositivo,
    obtenerEstadoDispositivoParaSesion,
    verificarUsuarioEnTenant
} = require('../server/repositories/auth.repo');
const { crearTokenSesion, verificarTokenSesion } = require('../server/lib/sesion');

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

function crearTerminal(nombre, tenantId, id, estado = 'activo') {
    const par = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    return {
        id,
        tenant_id: tenantId,
        nombre,
        estado,
        clave_publica: par.publicKey.export({ type: 'spki', format: 'pem' }),
        privada: par.privateKey
    };
}

class PoolDePrueba {
    constructor() {
        this.usuarios = [];
        this.dispositivos = [];
    }

    async query(sql, params = []) {
        const texto = String(sql).replace(/\s+/g, ' ').trim();

        if (texto.includes('FROM usuarios') && texto.includes('LOWER(nombre_usuario)')) {
            const [tenantId, nombreUsuario] = params;
            return {
                rows: this.usuarios.filter((u) => u.tenant_id === tenantId
                    && u.nombre_usuario.toLowerCase() === String(nombreUsuario).toLowerCase()
                    && u.activo === 1).slice(0, 1),
                rowCount: 1
            };
        }

        if (texto.includes('FROM dispositivos_pos') && texto.includes('WHERE tenant_id') && texto.includes('id')) {
            const [tenantId, deviceId] = params;
            const dispositivo = this.dispositivos.find((d) => d.tenant_id === tenantId && d.id === Number(deviceId));
            return { rows: dispositivo ? [{ ...dispositivo }] : [], rowCount: dispositivo ? 1 : 0 };
        }

        if (texto.startsWith('UPDATE dispositivos_pos SET ultimo_acceso')) {
            const [tenantId, deviceId] = params;
            const dispositivo = this.dispositivos.find((d) => d.tenant_id === tenantId && d.id === Number(deviceId));
            if (dispositivo && dispositivo.estado === 'activo') dispositivo.ultimo_acceso = new Date().toISOString();
            return { rows: [], rowCount: dispositivo ? 1 : 0 };
        }

        throw new Error(`Consulta no soportada por el pool de prueba: ${texto}`);
    }
}

async function prepararFixture() {
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'fase-9-secret-for-tests-01234567890123456789';

    const pool = new PoolDePrueba();
    const terminalA = crearTerminal('Caja principal', TENANT_A, 1);
    const terminalB = crearTerminal('Caja principal', TENANT_B, 1);
    const hash = await bcrypt.hash('1234', 10);

    pool.dispositivos.push(terminalA, terminalB);
    pool.usuarios.push(
        { id: 7, tenant_id: TENANT_A, nombre_visible: 'Ana A', nombre_usuario: 'cajera', rol: 'user', pin_o_password: hash, activo: 1 },
        { id: 7, tenant_id: TENANT_B, nombre_visible: 'Ana B', nombre_usuario: 'cajera', rol: 'user', pin_o_password: hash, activo: 1 }
    );

    return { pool, terminalA, terminalB };
}

function firmar(terminal, challenge) {
    return crypto.sign('sha256', Buffer.from(challenge, 'utf8'), terminal.privada).toString('base64url');
}

test('1. un cajero puede autenticarse desde su dispositivo autorizado', async () => {
    const { pool, terminalA } = await prepararFixture();
    const challenge = 'challenge-cajero-a-001';

    const resultado = await verificarPruebaDispositivo({
        tenantId: TENANT_A,
        deviceId: terminalA.id,
        challenge,
        signature: firmar(terminalA, challenge)
    }, pool);

    assert.deepEqual(resultado, { id: 1, tenantId: TENANT_A, estado: 'activo' });
});

test('2. un cajero no puede autenticarse desde un dispositivo revocado', async () => {
    const { pool, terminalA } = await prepararFixture();
    terminalA.estado = 'revocado';
    const challenge = 'challenge-cajero-revocado';

    await assert.rejects(
        verificarPruebaDispositivo({
            tenantId: TENANT_A,
            deviceId: terminalA.id,
            challenge,
            signature: firmar(terminalA, challenge)
        }, pool),
        (error) => error.status === 403
    );
});

test('3. un cajero no puede reutilizar credenciales o dispositivo en otro tenant', async () => {
    const { pool, terminalA } = await prepararFixture();
    const usuarioEnTenantCorrecto = await verificarUsuarioEnTenant(pool, TENANT_A, 'cajera', '1234');
    const usuarioEnTenantAjeno = await verificarUsuarioEnTenant(pool, TENANT_B, 'cajera', '1234');

    assert.equal(usuarioEnTenantCorrecto.tenantId, TENANT_A);
    assert.equal(usuarioEnTenantAjeno.tenantId, TENANT_B);
    assert.notEqual(usuarioEnTenantCorrecto.tenantId, usuarioEnTenantAjeno.tenantId);

    const challenge = 'challenge-cruzado-tenant';
    await assert.rejects(
        verificarPruebaDispositivo({
            tenantId: TENANT_B,
            deviceId: terminalA.id,
            challenge,
            signature: firmar(terminalA, challenge)
        }, pool),
        (error) => error.status === 403
    );
});

test('4. el propietario puede iniciar sesión sin dispositivo POS registrado', async () => {
    const { tenantId, id } = { tenantId: TENANT_A, id: 99 };
    const token = await crearTokenSesion({ id, nombre: 'Propietario A', rol: 'propietario', tenantId });
    const payload = await verificarTokenSesion(token);

    assert.equal(payload.id, id);
    assert.equal(payload.tenantId, tenantId);
    assert.equal(payload.deviceId, undefined);
});

test('5. revocar el dispositivo invalida una sesión de cajero previamente abierta', async () => {
    const { pool, terminalA } = await prepararFixture();
    const token = await crearTokenSesion({ id: 7, nombre: 'Ana A', rol: 'user', tenantId: TENANT_A, deviceId: terminalA.id });
    assert.ok(await verificarTokenSesion(token), 'el JWT sigue siendo criptográficamente válido');
    assert.equal(await obtenerEstadoDispositivoParaSesion(TENANT_A, terminalA.id, pool), true);

    terminalA.estado = 'revocado';

    assert.equal(await obtenerEstadoDispositivoParaSesion(TENANT_A, terminalA.id, pool), false);
});

test('6. dos tenants pueden tener usuarios y dispositivos con el mismo nombre sin mezclarse', async () => {
    const { pool, terminalA, terminalB } = await prepararFixture();
    const usuarioA = await verificarUsuarioEnTenant(pool, TENANT_A, 'CAJERA', '1234');
    const usuarioB = await verificarUsuarioEnTenant(pool, TENANT_B, 'cajera', '1234');

    assert.equal(terminalA.nombre, terminalB.nombre);
    assert.equal(usuarioA.nombreUsuario, usuarioB.nombreUsuario);
    assert.equal(usuarioA.tenantId, TENANT_A);
    assert.equal(usuarioB.tenantId, TENANT_B);
    assert.equal(await obtenerEstadoDispositivoParaSesion(TENANT_A, 1, pool), true);
    assert.equal(await obtenerEstadoDispositivoParaSesion(TENANT_B, 1, pool), true);
});
