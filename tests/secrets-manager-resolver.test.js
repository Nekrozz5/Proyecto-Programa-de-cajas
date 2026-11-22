const test = require('node:test');
const assert = require('node:assert/strict');

const {
    crearResolverSecretsManager,
    extraerDatabaseUrl,
    validarDatabaseUrl
} = require('../server/tenancy/secrets-manager-resolver');

class FakeGetSecretValueCommand {
    constructor(input) {
        this.input = input;
    }
}

test('el adaptador resuelve connectionString sin exponer el secreto', async () => {
    const llamadas = [];
    const resolver = crearResolverSecretsManager({
        client: {
            async send(command) {
                llamadas.push(command);
                return {
                    SecretString: JSON.stringify({
                        connectionString: 'postgresql://usuario:clave@localhost:5432/cafeteria'
                    })
                };
            }
        },
        GetSecretValueCommand: FakeGetSecretValueCommand
    });

    const url = await resolver('tenant/cafeteria/database');

    assert.equal(url, 'postgresql://usuario:clave@localhost:5432/cafeteria');
    assert.deepEqual(llamadas[0].input, { SecretId: 'tenant/cafeteria/database' });
});

test('el adaptador acepta SecretBinary codificado en base64', () => {
    const secreto = Buffer.from(JSON.stringify({
        databaseUrl: 'postgres://usuario:clave@localhost:5432/cafeteria'
    }), 'utf8').toString('base64');

    assert.equal(
        extraerDatabaseUrl(Buffer.from(secreto, 'base64').toString('utf8')),
        'postgres://usuario:clave@localhost:5432/cafeteria'
    );
});

test('el adaptador rechaza URLs que no sean PostgreSQL', () => {
    assert.throws(
        () => validarDatabaseUrl('https://ejemplo.test/database'),
        /debe usar el protocolo postgres/
    );
});

test('el adaptador rechaza secretos sin URL válida', async () => {
    const resolver = crearResolverSecretsManager({
        client: { async send() { return { SecretString: JSON.stringify({ username: 'usuario' }) }; } },
        GetSecretValueCommand: FakeGetSecretValueCommand
    });

    await assert.rejects(resolver('tenant/invalido'), /no contiene una URL de PostgreSQL/);
});
