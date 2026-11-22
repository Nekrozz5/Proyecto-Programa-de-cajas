const test = require('node:test');
const assert = require('node:assert/strict');

const { ejecutarRequestEnTenant } = require('../server/tenancy/request-context');

test('resolución de tenant inválida devuelve JSON en vez de dejar escapar una respuesta HTML/vacía', async () => {
    const previo = process.env.TENANT_HOST_SUFFIX;
    const modoPrevio = process.env.TENANCY_MODE;
    process.env.TENANT_HOST_SUFFIX = 'localhost';
    process.env.TENANCY_MODE = 'AWS_MULTI_TENANT';

    try {
        const respuesta = await ejecutarRequestEnTenant(
            { headers: new Headers({ host: 'localhost:3000' }) },
            async () => {
                throw new Error('La función no debe ejecutarse sin tenant válido.');
            }
        );

        assert.equal(respuesta.status, 400);
        assert.equal(respuesta.headers.get('content-type'), 'application/json');
        assert.deepEqual(await respuesta.json(), {
            ok: false,
            error: 'El host no pertenece al dominio multi-negocio configurado.'
        });
    } finally {
        if (previo === undefined) delete process.env.TENANT_HOST_SUFFIX;
        else process.env.TENANT_HOST_SUFFIX = previo;
        if (modoPrevio === undefined) delete process.env.TENANCY_MODE;
        else process.env.TENANCY_MODE = modoPrevio;
    }
});
