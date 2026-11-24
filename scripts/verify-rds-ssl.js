#!/usr/bin/env node
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Client } = require('pg');

const databaseNames = ['control_plane', process.env.RDS_TENANT_DATABASE || 'negocio_cafeteria'];

async function readSecret() {
    const arn = process.env.RDS_MASTER_SECRET_ARN;
    if (!arn) throw new Error('Falta RDS_MASTER_SECRET_ARN.');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION });
    const response = await client.send(new GetSecretValueCommand({ SecretId: arn }));
    return JSON.parse(response.SecretString || Buffer.from(response.SecretBinary).toString('utf8'));
}

async function verifyDatabase(secret, database) {
    const client = new Client({
        host: secret.host,
        port: secret.port || 5432,
        user: secret.username,
        password: secret.password,
        database,
        ssl: { rejectUnauthorized: true },
        connectionTimeoutMillis: 10_000
    });
    await client.connect();
    try {
        const result = await client.query(
            'SELECT ssl, version, cipher FROM pg_stat_ssl WHERE pid = pg_backend_pid()'
        );
        const connection = result.rows[0];
        if (!connection || connection.ssl !== true) {
            throw new Error(`La conexión a ${database} no negoció SSL/TLS.`);
        }
        console.log(`${database}: SSL/TLS ${connection.version} (${connection.cipher})`);
    } finally {
        await client.end();
    }
}

async function main() {
    const secret = await readSecret();
    for (const database of databaseNames) await verifyDatabase(secret, database);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});

