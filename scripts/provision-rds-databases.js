#!/usr/bin/env node
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
const { Client } = require('pg');

const tenantDatabaseName = process.env.RDS_TENANT_DATABASE || 'negocio_cafeteria';
const secretArn = process.env.RDS_MASTER_SECRET_ARN;

function quoteIdentifier(value) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
        throw new Error(`Nombre de base no permitido: ${value}`);
    }
    return `"${value.replaceAll('"', '""')}"`;
}

async function readSecret() {
    if (!secretArn) throw new Error('Falta RDS_MASTER_SECRET_ARN.');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION });
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    return JSON.parse(response.SecretString || Buffer.from(response.SecretBinary).toString('utf8'));
}

async function main() {
    if (process.env.RDS_MIGRATION_INSTANCE_ID) {
        const ssm = new SSMClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION });
        const command = await ssm.send(new SendCommandCommand({
            InstanceIds: [process.env.RDS_MIGRATION_INSTANCE_ID],
            DocumentName: 'AWS-RunShellScript',
            Parameters: { commands: ['node /opt/programa-cajas/scripts/provision-rds-databases.js'] },
            TimeoutSeconds: 600
        }));
        const commandId = command.Command.CommandId;
        let invocation;
        for (let attempt = 0; attempt < 60; attempt += 1) {
            try {
                invocation = await ssm.send(new GetCommandInvocationCommand({
                    CommandId: commandId,
                    InstanceId: process.env.RDS_MIGRATION_INSTANCE_ID
                }));
                if (['Success', 'Failed', 'TimedOut', 'Cancelled'].includes(invocation.Status)) break;
            } catch (error) {
                if (error.name !== 'InvocationDoesNotExist') throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        if (invocation?.Status !== 'Success') {
            throw new Error(`Migracion SSM termino con estado ${invocation?.Status || 'desconocido'}: ${invocation?.StandardErrorContent || ''}`);
        }
        console.log(invocation.StandardOutputContent || 'Migracion completada.');
        return;
    }

    const secret = await readSecret();
    const ssl = { rejectUnauthorized: true };
    const client = new Client({
        host: secret.host,
        port: secret.port || 5432,
        user: secret.username,
        password: secret.password,
        database: 'postgres',
        ssl,
        connectionTimeoutMillis: 10_000
    });

    await client.connect();
    try {
        const identifier = quoteIdentifier(tenantDatabaseName);
        const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [tenantDatabaseName]);
        if (exists.rowCount === 0) {
            await client.query(`CREATE DATABASE ${identifier}`);
            console.log(`Base creada: ${tenantDatabaseName}`);
        } else {
            console.log(`Base ya existente: ${tenantDatabaseName}`);
        }
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});

