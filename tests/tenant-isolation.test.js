const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { setTimeout: esperar } = require('node:timers/promises');
const { conBasesPostgres } = require('./postgres-fixture');
const { ejecutarMigracionesEnPool } = require('../database/migraciones-tenant');

const {
    verificarPruebaDispositivo,
    obtenerEstadoDispositivoParaSesion,
    verificarUsuarioEnTenant
} = require('../server/repositories/auth.repo');
const { crearTokenSesion, verificarTokenSesion } = require('../server/lib/sesion');

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const PIN_A = String(crypto.randomInt(1000, 5000));
const PIN_B = String(crypto.randomInt(5000, 10000));

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

function prueba(nombre, ejecutar) {
    test(nombre, { timeout: 30_000 }, () => conBasesPostgres(['a', 'b'], async ({ a, b }) => {
        process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
        const terminalA = crearTerminal('Caja principal', TENANT_A, 1);
        const terminalB = crearTerminal('Caja principal', TENANT_B, 1);
        await Promise.all([[a, terminalA, PIN_A], [b, terminalB, PIN_B]].map(async ([pool, terminal, pin]) => {
            await ejecutarMigracionesEnPool(pool);
            const hash = await bcrypt.hash(pin, 10);
            await pool.query(`
                INSERT INTO usuarios (id, tenant_id, nombre, nombre_usuario, pin_o_password, rol)
                VALUES (7, $1, 'Ana', 'cajera', $2, 'user')
            `, [terminal.tenant_id, hash]);
            await pool.query(`
                INSERT INTO dispositivos_pos (id, tenant_id, nombre, clave_publica, creado_por, estado)
                VALUES ($1, $2, $3, $4, 7, 'activo')
            `, [terminal.id, terminal.tenant_id, terminal.nombre, terminal.clave_publica]);
        }));
        await ejecutar({ pool: a, poolB: b, terminalA, terminalB });
    }));
}

function revocar(pool, terminal) {
    return pool.query("UPDATE dispositivos_pos SET estado = 'revocado', revocado_en = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND id = $2",
        [terminal.tenant_id, terminal.id]);
}

function firmar(terminal, challenge) {
    return crypto.sign('sha256', Buffer.from(challenge, 'utf8'), terminal.privada).toString('base64url');
}

prueba('1. un cajero puede autenticarse desde su dispositivo autorizado', async ({ pool, terminalA }) => {
    const challenge = crypto.randomUUID();

    const resultado = await verificarPruebaDispositivo({
        tenantId: TENANT_A,
        deviceId: terminalA.id,
        challenge,
        signature: firmar(terminalA, challenge)
    }, pool);

    assert.deepEqual(resultado, { id: 1, tenantId: TENANT_A, estado: 'activo' });
});

prueba('2. un cajero no puede autenticarse desde un dispositivo revocado', async ({ pool, terminalA }) => {
    await revocar(pool, terminalA);
    const challenge = crypto.randomUUID();

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

prueba('3. un cajero no puede reutilizar credenciales o dispositivo en otro tenant', async ({ pool, poolB, terminalA }) => {
    const usuarioEnTenantCorrecto = await verificarUsuarioEnTenant(pool, TENANT_A, 'cajera', PIN_A);
    const usuarioEnTenantAjeno = await verificarUsuarioEnTenant(poolB, TENANT_B, 'cajera', PIN_A);

    assert.equal(usuarioEnTenantCorrecto.tenantId, TENANT_A);
    assert.equal(usuarioEnTenantAjeno, undefined);

    const challenge = crypto.randomUUID();
    await assert.rejects(
        verificarPruebaDispositivo({
            tenantId: TENANT_B,
            deviceId: terminalA.id,
            challenge,
            signature: firmar(terminalA, challenge)
        }, poolB),
        (error) => error.status === 403
    );
});

prueba('4. el propietario puede iniciar sesión sin dispositivo POS registrado', async () => {
    const { tenantId, id } = { tenantId: TENANT_A, id: 99 };
    const token = await crearTokenSesion({ id, nombre: 'Propietario A', rol: 'propietario', tenantId });
    const payload = await verificarTokenSesion(token);

    assert.equal(payload.id, id);
    assert.equal(payload.tenantId, tenantId);
    assert.equal(payload.deviceId, undefined);
});

prueba('5. revocar el dispositivo invalida una sesión de cajero previamente abierta', async ({ pool, terminalA }) => {
    const token = await crearTokenSesion({ id: 7, nombre: 'Ana A', rol: 'user', tenantId: TENANT_A, deviceId: terminalA.id });
    assert.ok(await verificarTokenSesion(token), 'el JWT sigue siendo criptográficamente válido');
    assert.equal(await obtenerEstadoDispositivoParaSesion(TENANT_A, terminalA.id, pool), true);

    await revocar(pool, terminalA);

    assert.equal(await obtenerEstadoDispositivoParaSesion(TENANT_A, terminalA.id, pool), false);
});

prueba('6. dos tenants pueden tener usuarios y dispositivos con el mismo nombre sin mezclarse', async ({ pool, poolB, terminalA, terminalB }) => {
    const usuarioA = await verificarUsuarioEnTenant(pool, TENANT_A, 'CAJERA', PIN_A);
    const usuarioB = await verificarUsuarioEnTenant(poolB, TENANT_B, 'cajera', PIN_B);

    assert.equal(terminalA.nombre, terminalB.nombre);
    assert.equal(usuarioA.nombreUsuario, usuarioB.nombreUsuario);
    assert.equal(usuarioA.tenantId, TENANT_A);
    assert.equal(usuarioB.tenantId, TENANT_B);
    assert.equal(await obtenerEstadoDispositivoParaSesion(TENANT_A, 1, pool), true);
    assert.equal(await obtenerEstadoDispositivoParaSesion(TENANT_B, 1, poolB), true);
});

prueba('7. la revocación durante la validación impide aceptar la prueba del dispositivo', async ({ pool, terminalA }) => {
    const cliente = await pool.connect();
    let rechazo;
    try {
        await cliente.query('BEGIN');
        await revocar(cliente, terminalA);
        const challenge = crypto.randomUUID();
        rechazo = assert.rejects(verificarPruebaDispositivo({
            tenantId: TENANT_A,
            deviceId: terminalA.id,
            challenge,
            signature: firmar(terminalA, challenge)
        }, pool), { status: 403 });
        // El SELECT lee la fila activa anterior. El UPDATE debe esperar a que
        // finalice la revocación y reevaluar el predicado con la versión nueva.
        const { rows: [{ pid }] } = await cliente.query('SELECT pg_backend_pid() AS pid');
        const limite = Date.now() + 5000;
        let bloqueada = false;
        while (!bloqueada && Date.now() < limite) {
            const { rows } = await pool.query(`
                SELECT EXISTS (
                    SELECT FROM pg_stat_activity
                    WHERE datname = current_database() AND $1 = ANY(pg_blocking_pids(pid))
                ) AS bloqueada
            `, [pid]);
            bloqueada = rows[0].bloqueada;
            if (!bloqueada) await esperar(20);
        }
        assert.ok(bloqueada, 'la verificación debe disputar el bloqueo de fila con otra conexión');
        await cliente.query('COMMIT');
    } finally {
        try {
            await cliente.query('ROLLBACK');
        } finally {
            cliente.release();
            await rechazo;
        }
    }
});

test('8. una prueba incompleta se rechaza como acceso POS no autorizado', async () => {
    await assert.rejects(verificarPruebaDispositivo({ tenantId: TENANT_A }), { status: 403 });
    assert.equal(await obtenerEstadoDispositivoParaSesion(TENANT_A, undefined), false);
});

prueba('9. bloquear una cuenta no bloquea el mismo ID de usuario en otro tenant', async ({ pool, poolB }) => {
    for (let intento = 0; intento < 20; intento += 1) {
        assert.equal(await verificarUsuarioEnTenant(pool, TENANT_A, 'cajera', PIN_B, `origen-${intento}`), undefined);
    }
    await assert.rejects(verificarUsuarioEnTenant(pool, TENANT_A, 'cajera', PIN_A), /exceso de intentos fallidos/);
    assert.equal((await verificarUsuarioEnTenant(poolB, TENANT_B, 'cajera', PIN_B)).tenantId, TENANT_B);
});
