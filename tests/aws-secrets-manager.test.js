const test = require('node:test');
const assert = require('node:assert/strict');

const { configurarResolverSecretsManagerDesdeEntorno } = require('../server/tenancy/aws-secrets-manager');
const { configurarResolverSecretoTenant } = require('../server/tenancy/tenant-registry');

test('el proveedor env no crea cliente AWS ni cambia el resolver', () => {
    const regionPrevia = process.env.AWS_REGION;
    const proveedorPrevio = process.env.TENANT_SECRETS_PROVIDER;
    process.env.TENANT_SECRETS_PROVIDER = 'env';

    try {
        assert.equal(configurarResolverSecretsManagerDesdeEntorno(), false);
    } finally {
        if (regionPrevia === undefined) delete process.env.AWS_REGION;
        else process.env.AWS_REGION = regionPrevia;
        if (proveedorPrevio === undefined) delete process.env.TENANT_SECRETS_PROVIDER;
        else process.env.TENANT_SECRETS_PROVIDER = proveedorPrevio;
        configurarResolverSecretoTenant(null);
    }
});

test('el proveedor aws exige una Región explícita', () => {
    const regionPrevia = process.env.AWS_REGION;
    const regionDefaultPrevia = process.env.AWS_DEFAULT_REGION;
    const proveedorPrevio = process.env.TENANT_SECRETS_PROVIDER;
    process.env.TENANT_SECRETS_PROVIDER = 'aws';
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;

    try {
        assert.throws(
            () => configurarResolverSecretsManagerDesdeEntorno(),
            /AWS_REGION es obligatoria/
        );
    } finally {
        if (regionPrevia === undefined) delete process.env.AWS_REGION;
        else process.env.AWS_REGION = regionPrevia;
        if (regionDefaultPrevia === undefined) delete process.env.AWS_DEFAULT_REGION;
        else process.env.AWS_DEFAULT_REGION = regionDefaultPrevia;
        if (proveedorPrevio === undefined) delete process.env.TENANT_SECRETS_PROVIDER;
        else process.env.TENANT_SECRETS_PROVIDER = proveedorPrevio;
        configurarResolverSecretoTenant(null);
    }
});
