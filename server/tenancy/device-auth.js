const crypto = require('crypto');

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CHALLENGE_LENGTH = 8;
const MAX_CHALLENGES = 10000;
const challenges = new Map();

function normalizarTenantId(tenantId) {
    const valor = String(tenantId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)) {
        throw new Error('Tenant inválido para el desafío de emparejamiento.');
    }
    return valor;
}

function normalizarCodigo(codigo) {
    const valor = String(codigo || '').replace(/\s+/g, '');
    if (!new RegExp(`^\\d{${CHALLENGE_LENGTH}}$`).test(valor)) {
        throw new Error('El código de emparejamiento no es válido.');
    }
    return valor;
}

function hashCodigo(codigo) {
    return crypto.createHash('sha256').update(codigo, 'utf8').digest('hex');
}

function purgarDesafios() {
    const ahora = Date.now();
    for (const [clave, desafio] of challenges) {
        if (desafio.expiraEn <= ahora) challenges.delete(clave);
    }
    while (challenges.size > MAX_CHALLENGES) {
        const primero = challenges.keys().next().value;
        challenges.delete(primero);
    }
}

function crearDesafioEmparejamiento(tenantId, administradorId) {
    const tenant = normalizarTenantId(tenantId);
    const adminId = Number(administradorId);
    if (!Number.isInteger(adminId) || adminId <= 0) {
        throw new Error('Administrador inválido para el desafío de emparejamiento.');
    }

    purgarDesafios();
    const codigo = String(crypto.randomInt(0, 10 ** CHALLENGE_LENGTH)).padStart(CHALLENGE_LENGTH, '0');
    const ahora = Date.now();
    challenges.set(hashCodigo(codigo), {
        tenantId: tenant,
        administradorId: adminId,
        creadoEn: ahora,
        expiraEn: ahora + CHALLENGE_TTL_MS
    });

    return {
        codigo,
        expiraEn: new Date(ahora + CHALLENGE_TTL_MS).toISOString(),
        expiraEnEpochMs: ahora + CHALLENGE_TTL_MS
    };
}

function consumirDesafioEmparejamiento(codigo, tenantId) {
    const codigoNormalizado = normalizarCodigo(codigo);
    const tenant = normalizarTenantId(tenantId);
    purgarDesafios();

    const clave = hashCodigo(codigoNormalizado);
    const desafio = challenges.get(clave);
    if (!desafio || desafio.tenantId !== tenant || desafio.expiraEn <= Date.now()) {
        throw new Error('Código de emparejamiento inválido, expirado o perteneciente a otro tenant.');
    }

    // Se elimina antes de devolverlo: un código canjeado no puede reutilizarse.
    challenges.delete(clave);
    return { ...desafio };
}

module.exports = {
    CHALLENGE_TTL_MS,
    crearDesafioEmparejamiento,
    consumirDesafioEmparejamiento
};
