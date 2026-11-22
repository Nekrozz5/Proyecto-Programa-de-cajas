const test = require('node:test');
const assert = require('node:assert/strict');

const { conBasesPostgres, contextoOperativo } = require('./postgres-fixture');
const { ejecutarMigracionesEnPool } = require('../database/migraciones-tenant');
const { ejecutarConContextoTenant } = require('../server/repositories/db');
const {
    obtenerConfiguracionNegocio,
    actualizarConfiguracionNegocio
} = require('../server/repositories/configuracion.repo');

test('branding del tenant conserva defaults, persiste cambios y valida colores', {
    timeout: 30_000
}, () => conBasesPostgres(['branding'], async ({ branding }) => {
    await ejecutarMigracionesEnPool(branding);

    await ejecutarConContextoTenant(contextoOperativo(branding, 'branding'), async () => {
        const inicial = await obtenerConfiguracionNegocio();
        assert.equal(inicial.color_primario, '#0284C7');
        assert.equal(inicial.color_secundario, '#0F172A');
        assert.equal(inicial.tema_visual, 'claro');

        const actualizado = await actualizarConfiguracionNegocio({
            nombreNegocio: 'Café Central',
            nombreCorto: 'Central',
            logoUrl: 'https://cdn.example.test/logo.png',
            colorPrimario: '#112233',
            colorSecundario: '#445566',
            temaVisual: 'oscuro'
        });

        assert.equal(actualizado.nombre_corto, 'Central');
        assert.equal(actualizado.logo_url, 'https://cdn.example.test/logo.png');
        assert.equal(actualizado.color_primario, '#112233');
        assert.equal(actualizado.color_secundario, '#445566');
        assert.equal(actualizado.tema_visual, 'oscuro');

        await assert.rejects(
            actualizarConfiguracionNegocio({ colorPrimario: 'azul' }),
            /color primario debe ser un color hexadecimal/
        );
    });
}));

