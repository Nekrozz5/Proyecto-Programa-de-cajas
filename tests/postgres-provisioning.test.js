const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { obtenerPool, cerrarPoolsPostgres } = require('../database/postgres');
const { ejecutarMigracionesControl } = require('../database/migraciones-control');
const { provisionarTenant } = require('../database/provisionar-tenant');
const { crearTenant } = require('../server/tenancy/tenant-registry');

const urlPruebas = process.env.POSTGRES_TEST_URL;

test('el aprovisionamiento inicial y repetido conserva la configuración y sincroniza developer y la versión', {
    skip: !urlPruebas && 'Configura POSTGRES_TEST_URL con permiso CREATEDB'
}, async () => {
    const admin = new Pool({ connectionString: urlPruebas });
    const sufijo = randomBytes(8).toString('hex');
    const nombres = [`provision_control_${sufijo}`, `provision_operativa_${sufijo}`];
    const bases = [];
    const slug = 'nuevo-negocio';
    const clave = `A1${randomBytes(16).toString('hex')}`;
    const nuevaClave = `B2${randomBytes(16).toString('hex')}`;

    function urlBase(nombre) {
        const url = new URL(urlPruebas);
        url.pathname = `/${nombre}`;
        return url.toString();
    }

    try {
        for (const base of nombres) {
            await admin.query(`CREATE DATABASE ${base} TEMPLATE template0`);
            bases.push(base);
        }
        const [urlControl, urlOperativa] = bases.map(urlBase);
        process.env.CONTROL_DATABASE_URL = urlControl;
        process.env.TENANT_DATABASE_URLS_JSON = JSON.stringify({ [slug]: urlOperativa });
        process.env.DEVELOPER_PASSWORD = clave;
        await Promise.all([ejecutarMigracionesControl(), ejecutarMigracionesControl()]);

        const control = obtenerPool(urlControl);
        const operativo = obtenerPool(urlOperativa);
        const tenant = await crearTenant({ nombre: 'Nuevo negocio', slug, databaseName: nombres[1] });
        const estadoControl = async () => (await control.query(`
            SELECT schema_version, actualizado_en FROM control_tenants WHERE tenant_id = $1
        `, [tenant.tenant_id])).rows[0];
        assert.equal((await estadoControl()).schema_version, 0);
        await assert.rejects(provisionarTenant('slug-desconocido'), /registrado y activo/);
        process.env.TENANT_DATABASE_URLS_JSON = JSON.stringify({ [slug]: urlPruebas });
        await assert.rejects(provisionarTenant(slug), /base operativa no coincide/);
        process.env.TENANT_DATABASE_URLS_JSON = JSON.stringify({ [slug]: urlOperativa });

        delete process.env.DEVELOPER_PASSWORD;
        await assert.rejects(provisionarTenant(slug), /DEVELOPER_PASSWORD es obligatoria/);
        assert.equal((await estadoControl()).schema_version, 0);
        assert.equal((await operativo.query("SELECT to_regclass('schema_migrations') AS historial")).rows[0].historial, null);

        process.env.DEVELOPER_PASSWORD = clave;
        const version = await provisionarTenant(slug);
        const publicado = await estadoControl();
        assert.equal(publicado.schema_version, version);
        assert.equal((await operativo.query('SELECT MAX(version) AS version FROM schema_migrations')).rows[0].version, version);
        const leerConfiguracion = async () => (await operativo.query('SELECT * FROM configuracion_negocio')).rows;
        const usuarios = async () => (await operativo.query(`
            SELECT id, tenant_id, nombre_usuario, rol, activo, pin_o_password FROM usuarios
        `)).rows;

        const inicial = await leerConfiguracion();
        assert.equal(inicial.length, 1);
        assert.equal(inicial[0].configurado, 0);
        const usuariosIniciales = await usuarios();
        assert.equal(usuariosIniciales.length, 1);
        const [developer] = usuariosIniciales;
        assert.equal(developer.tenant_id, tenant.tenant_id);
        assert.equal(developer.rol, 'developer');
        assert.equal(developer.nombre_usuario, 'developer');
        assert.equal(developer.activo, 1);
        assert.equal(bcrypt.getRounds(developer.pin_o_password), 10);
        assert.ok(await bcrypt.compare(clave, developer.pin_o_password));

        await operativo.query(`
            UPDATE configuracion_negocio SET nombre_negocio = 'Papelería Norte', configurado = 1, iva_porcentaje = 12.5
        `);
        const configuracion = await leerConfiguracion();
        assert.deepEqual(await Promise.all([provisionarTenant(slug), provisionarTenant(slug)]), [version, version]);
        assert.deepEqual(await leerConfiguracion(), configuracion);
        assert.deepEqual(await estadoControl(), publicado);
        const repetidos = await usuarios();
        assert.equal(repetidos.length, 1);
        assert.equal(repetidos[0].id, developer.id);
        assert.ok(repetidos[0].pin_o_password === developer.pin_o_password);

        await control.query('UPDATE control_tenants SET schema_version = 0 WHERE tenant_id = $1', [tenant.tenant_id]);
        await operativo.query("UPDATE usuarios SET activo = 0, nombre_usuario = 'Developer' WHERE id = $1", [developer.id]);
        process.env.DEVELOPER_PASSWORD = nuevaClave;
        assert.equal(await provisionarTenant(slug), version);
        const [sincronizado] = await usuarios();
        assert.equal(sincronizado.id, developer.id);
        assert.equal(sincronizado.activo, 1);
        assert.equal(sincronizado.nombre_usuario, 'developer');
        assert.ok(await bcrypt.compare(nuevaClave, sincronizado.pin_o_password));
        assert.equal(await bcrypt.compare(clave, sincronizado.pin_o_password), false);
        assert.deepEqual(await leerConfiguracion(), configuracion);
        assert.equal((await estadoControl()).schema_version, version);
    } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        const codigo = /^[A-Z0-9]{5}$/.test(error.code) ? ` (${error.code})` : '';
        const detalle = error instanceof Error
            ? ` ${error.name}: ${error.message || '(sin mensaje)'}${error.stack ? `\n${error.stack}` : ''}`
            : ` ${String(error)}`;
        throw new Error(`Falló la verificación de aprovisionamiento PostgreSQL${codigo}.${detalle}`);
    } finally {
        try {
            await cerrarPoolsPostgres();
            for (const base of bases.reverse()) {
                await admin.query(`DROP DATABASE ${base}`);
            }
        } finally {
            await admin.end();
        }
    }
});
