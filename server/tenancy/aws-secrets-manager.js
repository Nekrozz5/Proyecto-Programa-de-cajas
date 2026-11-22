const {
    GetSecretValueCommand,
    SecretsManagerClient
} = require('@aws-sdk/client-secrets-manager');
const { configurarResolverSecretoTenant } = require('./tenant-registry');
const { crearResolverSecretsManager } = require('./secrets-manager-resolver');

function configurarResolverSecretsManagerDesdeEntorno() {
    const proveedor = String(process.env.TENANT_SECRETS_PROVIDER || 'env').trim().toLowerCase();
    if (proveedor !== 'aws') return false;

    const region = String(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '').trim();
    if (!region) {
        throw new Error('AWS_REGION es obligatoria cuando TENANT_SECRETS_PROVIDER=aws.');
    }

    const client = new SecretsManagerClient({ region });
    configurarResolverSecretoTenant(crearResolverSecretsManager({
        client,
        GetSecretValueCommand
    }));
    return true;
}

module.exports = {
    configurarResolverSecretsManagerDesdeEntorno
};
