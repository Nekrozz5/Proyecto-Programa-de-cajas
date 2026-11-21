const test = require('node:test');
const assert = require('node:assert/strict');

const { conBasesPostgres, contextoOperativo } = require('./postgres-fixture');
const { ejecutarMigracionesControl } = require('../database/migraciones-control');
const { ejecutarMigracionesEnPool } = require('../database/migraciones-tenant');
const { runQuery, getQuery, allQuery, enTransaccion, ejecutarConContextoTenant } = require('../server/repositories/db');

function pruebaPostgres(nombre, ejecutar) {
    test(nombre, () => conBasesPostgres(['operativa'], async ({ operativa }) => {
        try {
            await ejecutarConContextoTenant(contextoOperativo(operativa), ejecutar);
        } catch (error) {
            if (error instanceof assert.AssertionError) throw error;
            const codigo = /^[0-9A-Z]{5}$/.test(error.code) ? ` (${error.code})` : '';
            throw new Error(`Falló la prueba PostgreSQL${codigo}.`);
        }
    }));
}

test('las tablas operativas de un tenant se migran por separado del registro de control', () =>
    conBasesPostgres(['control', 'operativa'], async ({ control, operativa }, plan) => {
        process.env.CONTROL_DATABASE_URL = plan.control.url;
        await Promise.all([ejecutarMigracionesControl(), ejecutarMigracionesEnPool(operativa)]);
        const identidad = `
            SELECT current_database() AS base,
                   to_regclass('public.productos') IS NOT NULL AS productos,
                   to_regclass('public.control_tenants') IS NOT NULL AS registro
        `;
        assert.deepEqual((await operativa.query(identidad)).rows[0],
            { base: plan.operativa.base, productos: true, registro: false });
        assert.deepEqual((await control.query(identidad)).rows[0],
            { base: plan.control.base, productos: false, registro: true });
    })
);

pruebaPostgres('los parámetros nativos respetan literales, identificadores, comentarios y operadores JSONB', async () => {
    const fila = await getQuery(`
        SELECT '?' AS literal, $$? $1$$ AS dolar, $1::int AS "valor?",
               /* ? /* $9 */ ? */ $2::text AS segundo -- ?
    `, [12, 'texto']);
    assert.deepEqual(fila, { literal: '?', dolar: '? $1', 'valor?': 12, segundo: 'texto' });
    assert.deepEqual(await getQuery(`SELECT '{"a":1}'::jsonb ? $1 AS contiene`, ['a']), { contiene: true });
});

pruebaPostgres('runQuery, getQuery y allQuery comparten el cliente y COMMIT conserva filas', async () => {
    const pid = await enTransaccion(async () => {
        const sesion = await getQuery('SELECT pg_backend_pid() AS pid');
        await runQuery('CREATE TEMP TABLE prueba_db_fase1 (id int PRIMARY KEY, nombre text)');
        const insercion = await runQuery(
            'INSERT INTO pg_temp.prueba_db_fase1 VALUES ($1, $2) RETURNING id', [0, 'primera']
        );
        assert.deepEqual(insercion, { lastID: 0, changes: 1 });
        const duplicado = await runQuery(
            'INSERT INTO pg_temp.prueba_db_fase1 VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
            [0, 'duplicada']
        );
        assert.deepEqual(duplicado, { lastID: null, changes: 0 });
        assert.deepEqual(
            await allQuery('SELECT nombre, pg_backend_pid() AS pid FROM pg_temp.prueba_db_fase1'),
            [{ nombre: 'primera', pid: sesion.pid }]
        );
        return sesion.pid;
    });

    assert.deepEqual(
        await getQuery('SELECT nombre, pg_backend_pid() AS pid FROM pg_temp.prueba_db_fase1 WHERE id = $1', [0]),
        { nombre: 'primera', pid }
    );
});

pruebaPostgres('ROLLBACK revierte escrituras cuando falla una consulta y libera el cliente', async () => {
    const pid = (await getQuery('SELECT pg_backend_pid() AS pid')).pid;
    const codigo = await enTransaccion(async () => {
        await runQuery('CREATE TEMP TABLE prueba_rollback_fase1 (id int PRIMARY KEY)');
        await runQuery('INSERT INTO pg_temp.prueba_rollback_fase1 VALUES ($1)', [1]);
        await runQuery('INSERT INTO pg_temp.prueba_rollback_fase1 VALUES ($1)', [1]);
    }).then(() => '', (error) => error.code);
    assert.ok(codigo === '23505', 'se debe propagar la violación de unicidad');
    assert.deepEqual(
        await getQuery(`
            SELECT pg_backend_pid() AS pid, to_regclass('pg_temp.prueba_rollback_fase1') IS NULL AS revertida
        `),
        { pid, revertida: true }
    );
});
