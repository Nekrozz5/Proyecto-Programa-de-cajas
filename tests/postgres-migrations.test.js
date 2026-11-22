const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { obtenerPool, cerrarPoolsPostgres } = require('../database/postgres');
const { ejecutarMigracionesEnPool } = require('../database/migraciones-tenant');
const { ejecutarConContextoTenant, getQuery } = require('../server/repositories/db');

const urlPruebas = process.env.POSTGRES_TEST_URL;

test('la base PostgreSQL vacía migra de forma atómica, concurrente e idempotente', {
    skip: !urlPruebas && 'Configura POSTGRES_TEST_URL con permiso CREATEDB'
}, async () => {
    const admin = new Pool({ connectionString: urlPruebas });
    const base = `migraciones_${randomBytes(8).toString('hex')}`;
    const conexion = new URL(urlPruebas);
    conexion.pathname = `/${base}`;
    let creada = false;
    let pg;
    try {
        await admin.query(`CREATE DATABASE ${base} TEMPLATE template0`);
        creada = true;
        const pool = obtenerPool(conexion.toString());
        pg = new Pool({ connectionString: conexion.toString() });

        await assert.rejects(ejecutarMigracionesEnPool(pool, () => {
            throw new Error('Falla de inicialización simulada.');
        }), /Falla de inicialización simulada/);
        const tablasPublicas = () => pool.query(`
            SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
        `);
        assert.deepEqual((await tablasPublicas()).rows, []);

        assert.deepEqual(await Promise.all([
            ejecutarMigracionesEnPool(pool), ejecutarMigracionesEnPool(pool)
        ]), [3, 3]);
        const historial = () => pool.query('SELECT version, applied_at FROM schema_migrations ORDER BY version');
        const { rows: aplicadas } = await historial();
        assert.deepEqual(aplicadas.map(({ version }) => version), [1, 2, 3]);
        assert.ok(aplicadas.every(({ applied_at }) => applied_at instanceof Date));
        assert.deepEqual((await tablasPublicas()).rows.map(({ tablename }) => tablename), [
            'cajas', 'cajas_fisicas', 'categorias', 'combo_componentes', 'configuracion_negocio',
            'configuracion_smtp', 'detalle_movimientos', 'detalle_movimientos_combos',
            'detalle_movimientos_modificadores', 'dispositivos_pos', 'grupos_modificadores',
            'insumos', 'modificadores_opciones', 'movimientos', 'movimientos_insumos',
            'movimientos_pagos', 'movimientos_productos_directos', 'notificacion_destinatarios',
            'producto_grupos_modificadores', 'producto_lotes', 'productos', 'recetas',
            'schema_migrations', 'usuarios'
        ]);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM configuracion_negocio')).rows[0].total, 0);

        await pg.query(`
            INSERT INTO productos (nombre, precio, costo, fecha_inicio_vigencia)
            VALUES ('Artículo', 0.1 + 0.2, 1.23456789, '2026-01-01 08:00:00-04')
        `);
        const resultado = 'SELECT precio, costo, fecha_inicio_vigencia FROM productos';
        assert.equal((await pg.query(resultado)).rows[0].precio, '0.3');
        process.env.TENANCY_MODE = 'AWS_MULTI_TENANT';
        const tenantId = randomUUID();
        const leido = await ejecutarConContextoTenant({
            tenantId, tenant: { tenant_id: tenantId, slug: 'nuevo-negocio' }, pool: pg
        }, () => getQuery(resultado));
        assert.deepEqual(leido, {
            precio: 0.3, costo: 1.23456789, fecha_inicio_vigencia: new Date('2026-01-01T12:00:00Z')
        });
        assert.equal(await ejecutarMigracionesEnPool(pool), 3);
        assert.deepEqual((await historial()).rows, aplicadas);

        await pool.query("INSERT INTO categorias (nombre) VALUES ('Papelería')");
        await assert.rejects(pool.query("INSERT INTO categorias (nombre) VALUES ('papelería')"), { code: '23505' });
        await assert.rejects(pool.query('INSERT INTO configuracion_smtp (id) VALUES (2)'), { code: '23514' });

        const { rows: [usuario] } = await pool.query(`
            INSERT INTO usuarios (tenant_id, nombre, nombre_usuario, pin_o_password, rol)
            VALUES ($1, 'Operador', 'operador', '', 'user') RETURNING id
        `, [randomUUID()]);
        await pool.query("INSERT INTO cajas_fisicas (nombre) VALUES ('Estación')");
        await pool.query('INSERT INTO cajas (usuario_id, monto_inicial) VALUES ($1, 0)', [usuario.id]);
        await assert.rejects(pool.query('INSERT INTO cajas (usuario_id, monto_inicial) VALUES ($1, 0)', [usuario.id]),
            { code: '23505' });
        await pool.query("INSERT INTO notificacion_destinatarios (email, creado_por) VALUES ('prueba@example.test', $1)", [usuario.id]);
        await pool.query('DELETE FROM cajas WHERE usuario_id = $1', [usuario.id]);
        await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
        assert.equal((await pool.query('SELECT creado_por FROM notificacion_destinatarios')).rows[0].creado_por, null);
    } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        const codigo = /^[A-Z0-9]{5}$/.test(error.code) ? ` (${error.code})` : '';
        throw new Error(`Falló la verificación de migraciones PostgreSQL${codigo}.`);
    } finally {
        try {
            if (pg) await pg.end();
            await cerrarPoolsPostgres();
            if (creada) await admin.query(`DROP DATABASE ${base}`);
        } finally {
            await admin.end();
        }
    }
});
