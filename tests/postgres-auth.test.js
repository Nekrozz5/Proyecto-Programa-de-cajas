const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const { conBasesPostgres } = require('./postgres-fixture');
const { ejecutarMigracionesControl } = require('../database/migraciones-control');
const { ejecutarMigracionesEnPool } = require('../database/migraciones-tenant');
const { getQuery, runQuery, ejecutarConContextoTenant } = require('../server/repositories/db');
const {
    crearUsuario, crearUsuarioEnTenant, crearUsuarioConPermiso, obtenerCajerosParaLogin,
    obtenerUsuarioPorId, obtenerUsuarios, borrarUsuarioConPermiso, cambiarPasswordConPermiso,
    actualizarPermisoFiscalUsuario, verificarUsuarioEnTenant, verificarPruebaDispositivo
} = require('../server/repositories/auth.repo');
const {
    obtenerConfiguracionNegocio, actualizarConfiguracionNegocio, guardarConfiguracionNegocio
} = require('../server/repositories/configuracion.repo');
const {
    emparejarDispositivo, obtenerEstadoDispositivo, listarDispositivos, revocarDispositivo
} = require('../server/repositories/dispositivos.repo');
const { crearDesafioEmparejamiento, consumirDesafioEmparejamiento } = require('../server/tenancy/device-auth');
const { obtenerContextoTenantDesdeRequest } = require('../server/tenancy/tenant-context');
const { crearTokenSesion, obtenerUsuarioSesion, NOMBRE_COOKIE_SESION } = require('../server/lib/sesion');

const tenantA = { tenant_id: crypto.randomUUID(), slug: 'cafeteria' };
const tenantB = { tenant_id: crypto.randomUUID(), slug: 'otro-negocio' };
const claveAdmin = `A1${crypto.randomBytes(12).toString('hex')}`;
const pin = String(crypto.randomInt(1000, 5000));
const otroPin = String(crypto.randomInt(5000, 10000));
let poolA;
let poolB;

function solicitud(tenant, token = null) {
    const headers = new Headers({ host: `${tenant.slug}.fase2.test` });
    if (token) headers.set('cookie', `${NOMBRE_COOKIE_SESION}=${token}`);
    return { headers };
}

async function conTenant(tenant, ejecutar) {
    const contexto = await obtenerContextoTenantDesdeRequest(solicitud(tenant));
    return ejecutarConContextoTenant(contexto, ejecutar);
}

async function sinDetallesDeConexion(fn) {
    try {
        await fn();
    } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        const codigo = /^[A-Z0-9]{5}$/.test(error.code) ? ` (${error.code})` : '';
        throw new Error(`Falló la operación de prueba PostgreSQL${codigo}.`);
    }
}

function configurarPruebas(ejecutar) {
    return conBasesPostgres(['control', 'a', 'b'], async ({ control, a, b }, plan) => {
        process.env.CONTROL_DATABASE_URL = plan.control.url;
        process.env.TENANT_HOST_SUFFIX = 'fase2.test';
        process.env.TENANT_DATABASE_URLS_JSON = JSON.stringify({ [tenantA.slug]: plan.a.url, [tenantB.slug]: plan.b.url });
        process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
        poolA = a;
        poolB = b;
        await ejecutarMigracionesControl();
        await Promise.all([ejecutarMigracionesEnPool(a), ejecutarMigracionesEnPool(b)]);
        for (const [tenant, { base }] of [[tenantA, plan.a], [tenantB, plan.b]]) {
            await control.query(
                'INSERT INTO control_tenants (tenant_id, nombre, slug, database_name) VALUES ($1, $2, $2, $3)',
                [tenant.tenant_id, tenant.slug, base]
            );
        }
        await ejecutar();
    });
}

function prueba(nombre, fn) {
    test(nombre, { timeout: 60_000 }, () => sinDetallesDeConexion(() => configurarPruebas(fn)));
}

prueba('cafeteria inicializa y actualiza su configuración singleton sin alterar otro tenant', async () => {
    await conTenant(tenantA, async () => {
        const propietario = await crearUsuario('Titular configuración', claveAdmin, 'propietario');
        const config = await actualizarConfiguracionNegocio({ nombreNegocio: 'Primer ajuste' }, propietario);
        assert.equal(config.id, 1);
        assert.equal(config.nombre_negocio, 'Primer ajuste');
        const guardada = await guardarConfiguracionNegocio(propietario, {
            nombreNegocio: 'Negocio de prueba', usaStockDirecto: true
        });
        assert.equal(guardada.configurado, 1);
        assert.equal(guardada.nombre_negocio, 'Negocio de prueba');
    });

    await conTenant(tenantB, async () => {
        const configs = await Promise.all([obtenerConfiguracionNegocio(), obtenerConfiguracionNegocio()]);
        assert.deepEqual(configs.map((config) => config.id), [1, 1]);
        assert.equal(configs[0].nombre_negocio, 'Mi Negocio');
        assert.equal((await getQuery('SELECT COUNT(*)::int AS total FROM configuracion_negocio')).total, 1);
    });
    const config = await conTenant(tenantA, obtenerConfiguracionNegocio);
    assert.equal(config.nombre_negocio, 'Negocio de prueba');
});

prueba('propietario y admin mantienen sesión, los usuarios se aíslan y la baja invalida la sesión', async () => {
    await assert.rejects(obtenerUsuarios(), /Contexto de tenant/);
    await conTenant(tenantA, async () => {
        const propietario = await crearUsuario('Titular usuarios', claveAdmin, 'propietario');
        const admin = await crearUsuarioConPermiso(propietario, 'Admin Prueba', claveAdmin, 'admin');
        const cajero = await crearUsuarioConPermiso(admin, 'zeta', pin, 'user');
        await crearUsuarioConPermiso(admin, 'Alfa', pin, 'user');
        await assert.rejects(crearUsuario('Inválido', '12345678', 'admin'), /letra y un número/);
        await assert.rejects(crearUsuario('PIN inválido', '123a', 'user'), /únicamente dígitos/);

        const interno = await getQuery('SELECT pin_o_password FROM usuarios WHERE id = $1', [cajero]);
        assert.equal(bcrypt.getRounds(interno.pin_o_password), 10);
        assert.ok(await bcrypt.compare(pin, interno.pin_o_password));
        await assert.rejects(crearUsuario('ADMIN PRUEBA', claveAdmin, 'admin'), /Ya existe el usuario/);
        const nuevas = await Promise.allSettled([
            crearUsuario('Concurrente', pin, 'user'), crearUsuario('CONCURRENTE', pin, 'user')
        ]);
        assert.equal(nuevas.filter((resultado) => resultado.status === 'fulfilled').length, 1);
        assert.match(nuevas.find((resultado) => resultado.status === 'rejected').reason.message, /Ya existe el usuario/);
        await runQuery('UPDATE usuarios SET nombre_usuario = $1 WHERE id = $2', ['ZeTa', cajero]);
        await assert.rejects(crearUsuario('ZETA', pin, 'user'), /Ya existe el usuario/);

        const ajeno = await poolA.query(`
            INSERT INTO usuarios (tenant_id, nombre, nombre_usuario, pin_o_password, rol)
            VALUES ($1, 'Ajeno', 'ajeno', $2, 'user') RETURNING id
        `, [tenantB.tenant_id, interno.pin_o_password]);
        const ajenoId = ajeno.rows[0].id;
        assert.equal(await obtenerUsuarioPorId(ajenoId), undefined);
        assert.equal((await obtenerUsuarios()).some((usuario) => usuario.id === ajenoId), false);
        const cajerosLogin = await obtenerCajerosParaLogin();
        assert.deepEqual(cajerosLogin.map((usuario) => usuario.nombre.toLowerCase()), ['alfa', 'concurrente', 'zeta']);
        assert.ok(cajerosLogin.every((usuario) => typeof usuario.nombreUsuario === 'string' && usuario.nombreUsuario.length > 0));
        await actualizarPermisoFiscalUsuario(admin, ajenoId, false);
        assert.equal((await getQuery('SELECT puede_registrar_respaldo_fiscal AS permiso FROM usuarios WHERE id = $1', [ajenoId])).permiso, 1);

        for (const [nombre, rol] of [['TITULAR USUARIOS', 'propietario'], ['ADMIN PRUEBA', 'admin']]) {
            const usuario = await verificarUsuarioEnTenant(poolA, tenantA.tenant_id, nombre, claveAdmin);
            assert.equal(usuario.rol, rol);
            assert.equal(Object.hasOwn(usuario, 'pin_o_password'), false);
            const token = await crearTokenSesion(usuario);
            assert.equal((await obtenerUsuarioSesion(solicitud(tenantA, token))).rol, rol);
            assert.equal(await obtenerUsuarioSesion(solicitud(tenantB, token)), null);
            if (rol === 'admin') {
                assert.equal(await borrarUsuarioConPermiso(propietario, admin), true);
                assert.equal(await verificarUsuarioEnTenant(poolA, tenantA.tenant_id, nombre, claveAdmin), undefined);
                assert.equal(await obtenerUsuarioSesion(solicitud(tenantA, token)), null);
            }
        }
        await cambiarPasswordConPermiso(propietario, cajero, otroPin);
        assert.equal(await verificarUsuarioEnTenant(poolA, tenantA.tenant_id, 'zeta', pin), undefined);
        assert.equal((await verificarUsuarioEnTenant(poolA, tenantA.tenant_id, 'zeta', otroPin)).rol, 'user');
    });

    await crearUsuarioEnTenant(poolB, tenantB.tenant_id, 'Zeta ajeno', 'zeta', pin, 'user');
    assert.equal(await verificarUsuarioEnTenant(poolB, tenantB.tenant_id, 'zeta', otroPin), undefined);
    assert.equal((await verificarUsuarioEnTenant(poolB, tenantB.tenant_id, 'ZETA', pin)).tenantId, tenantB.tenant_id);
});

prueba('emparejamiento, prueba y revocación del POS se limitan al tenant', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const clavePublica = publicKey.export({ type: 'spki', format: 'pem' });
    const { administradorId, dispositivo, token, prueba } = await conTenant(tenantA, async () => {
        const administradorId = await crearUsuario('Titular POS', claveAdmin, 'propietario');
        await crearUsuarioConPermiso(administradorId, 'Cajero POS', pin, 'user');
        const desafio = crearDesafioEmparejamiento(tenantA.tenant_id, administradorId);
        assert.throws(() => consumirDesafioEmparejamiento(desafio.codigo, tenantB.tenant_id), /otro tenant/);
        const registro = consumirDesafioEmparejamiento(desafio.codigo, tenantA.tenant_id);
        assert.throws(() => consumirDesafioEmparejamiento(desafio.codigo, tenantA.tenant_id), /inválido/);
        const datos = { administradorId: registro.administradorId, nombre: 'zeta POS', clavePublica };
        const dispositivo = await emparejarDispositivo(datos);
        assert.equal(dispositivo.estado, 'activo');
        await assert.rejects(emparejarDispositivo(datos), /ya está registrada/);
        const secundaria = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey;
        await emparejarDispositivo({
            administradorId, nombre: 'Alfa POS', clavePublica: secundaria.export({ type: 'spki', format: 'pem' })
        });
        assert.deepEqual((await listarDispositivos()).map((pos) => pos.nombre), ['Alfa POS', 'zeta POS']);
        await assert.rejects(obtenerEstadoDispositivo({ tenantId: tenantB.tenant_id, clavePublica }), /Contexto de tenant/);

        const challenge = crypto.randomUUID();
        const signature = crypto.sign('sha256', Buffer.from(challenge), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
        const prueba = { deviceId: dispositivo.id, challenge, signature };
        const validado = await verificarPruebaDispositivo({ tenantId: tenantA.tenant_id, ...prueba }, poolA);
        assert.equal(validado.estado, 'activo');
        assert.ok((await obtenerEstadoDispositivo({ clavePublica })).ultimoAcceso instanceof Date);
        await assert.rejects(verificarPruebaDispositivo({ tenantId: tenantA.tenant_id, ...prueba }, poolA), { status: 403 });
        const usuario = await verificarUsuarioEnTenant(poolA, tenantA.tenant_id, 'cajero pos', pin);
        const token = await crearTokenSesion({ ...usuario, deviceId: validado.id });
        assert.equal((await obtenerUsuarioSesion(solicitud(tenantA, token))).deviceId, validado.id);
        return { administradorId, dispositivo, token, prueba };
    });

    await conTenant(tenantB, async () => {
        const adminB = await crearUsuario('Titular ajeno', claveAdmin, 'propietario');
        assert.equal(await obtenerEstadoDispositivo({ clavePublica }), null);
        assert.deepEqual(await listarDispositivos(), []);
        await assert.rejects(revocarDispositivo({ administradorId: adminB, dispositivoId: dispositivo.id }), /no existe/);
        await assert.rejects(verificarPruebaDispositivo({ tenantId: tenantB.tenant_id, ...prueba }, poolB), { status: 403 });
        assert.equal(await obtenerUsuarioSesion(solicitud(tenantB, token)), null);
    });

    await conTenant(tenantA, async () => {
        const revocado = await revocarDispositivo({ administradorId, dispositivoId: dispositivo.id });
        assert.equal(revocado.estado, 'revocado');
        assert.ok(revocado.revocado_en instanceof Date);
        assert.equal((await obtenerEstadoDispositivo({ clavePublica })).estado, 'revocado');
        assert.equal(await obtenerUsuarioSesion(solicitud(tenantA, token)), null);
    });
});
