/**
 * Adaptador pequeño para Secrets Manager.
 *
 * El cliente y el comando se inyectan para que el proyecto pueda probar el
 * contrato sin credenciales AWS ni una llamada de red. En AWS se conectará con
 * SecretsManagerClient y GetSecretValueCommand desde @aws-sdk/client-secrets-manager.
 */

function validarDatabaseUrl(valor) {
    if (typeof valor !== 'string' || !valor.trim()) {
        throw new Error('El secreto del tenant no contiene una URL de PostgreSQL.');
    }

    let url;
    try {
        url = new URL(valor);
    } catch {
        throw new Error('El secreto del tenant no contiene una URL de PostgreSQL válida.');
    }

    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new Error('El secreto del tenant debe usar el protocolo postgres o postgresql.');
    }

    return valor.trim();
}

function obtenerTextoSecreto(respuesta) {
    if (typeof respuesta?.SecretString === 'string' && respuesta.SecretString.trim()) {
        return respuesta.SecretString;
    }

    if (respuesta?.SecretBinary instanceof Uint8Array) {
        return Buffer.from(respuesta.SecretBinary).toString('utf8');
    }

    if (typeof respuesta?.SecretBinary === 'string' && respuesta.SecretBinary.trim()) {
        return Buffer.from(respuesta.SecretBinary, 'base64').toString('utf8');
    }

    throw new Error('Secrets Manager no devolvió SecretString ni SecretBinary.');
}

function extraerDatabaseUrl(texto) {
    let contenido;
    try {
        contenido = JSON.parse(texto);
    } catch {
        throw new Error('El secreto del tenant debe ser JSON válido.');
    }

    if (!contenido || typeof contenido !== 'object' || Array.isArray(contenido)) {
        throw new Error('El secreto del tenant debe ser un objeto JSON.');
    }

    return validarDatabaseUrl(contenido.connectionString || contenido.databaseUrl);
}

function crearResolverSecretsManager({ client, GetSecretValueCommand }) {
    if (!client || typeof client.send !== 'function') {
        throw new TypeError('El cliente de Secrets Manager debe exponer send().');
    }
    if (typeof GetSecretValueCommand !== 'function') {
        throw new TypeError('GetSecretValueCommand debe ser un constructor.');
    }

    return async function resolverSecretTenant(secretId) {
        if (typeof secretId !== 'string' || !secretId.trim()) {
            throw new Error('La referencia del secreto del tenant es obligatoria.');
        }

        const respuesta = await client.send(new GetSecretValueCommand({
            SecretId: secretId.trim()
        }));

        return extraerDatabaseUrl(obtenerTextoSecreto(respuesta));
    };
}

module.exports = {
    crearResolverSecretsManager,
    extraerDatabaseUrl,
    validarDatabaseUrl
};
