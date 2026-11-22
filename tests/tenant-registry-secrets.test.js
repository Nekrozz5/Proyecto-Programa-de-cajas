const test = require('node:test');
const assert = require('node:assert/strict');

const {
    configurarResolverSecretoTenant,
    obtenerPoolTenant
} = require('../server/tenancy/tenant-registry');

const TENANT = {
    tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'cafeteria',
    database_secret_ref: 'tenant/cafeteria/database'
};

test('un tenant con referencia de secreto usa el resolver configurado', async () => {
    let argumentos;
    configurarResolverSecretoTenant(async (...valores) => {
        argumentos = valores;
        return 'postgresql://usuario:clave@localhost:5432/cafeteria';
    });

    try {
        const pool = await obtenerPoolTenant(TENANT);
        assert.ok(pool);
        assert.deepEqual(argumentos, [TENANT.database_secret_ref, TENANT]);
    } finally {
        configurarResolverSecretoTenant(null);
    }
});

test('un tenant con referencia de secreto falla si no existe resolver cloud', async () => {
    const mapaPrevio = process.env.TENANT_DATABASE_URLS_JSON;
    configurarResolverSecretoTenant(null);
    delete process.env.TENANT_DATABASE_URLS_JSON;

    try {
        await assert.rejects(
            obtenerPoolTenant(TENANT),
            /requiere un resolver de secretos configurado/
        );
    } finally {
        if (mapaPrevio === undefined) delete process.env.TENANT_DATABASE_URLS_JSON;
        else process.env.TENANT_DATABASE_URLS_JSON = mapaPrevio;
    }
});

