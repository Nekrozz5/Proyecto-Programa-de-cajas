const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { cifrarPasswordSmtp, descifrarPasswordSmtp } = require('../server/lib/cifrado-smtp');

test('SMTP: cifra y descifra sin exponer la contraseña', () => {
    process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    const original = 'FalsaClaveSMTP-2026!';
    const cifrada = cifrarPasswordSmtp(original);
    assert.match(cifrada, /^enc:v1:/);
    assert.equal(cifrada.includes(original), false);
    assert.equal(descifrarPasswordSmtp(cifrada), original);
});

test('SMTP: rechaza alteración, clave ausente y longitud inválida; legacy sigue siendo legible', () => {
    process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    const cifrada = cifrarPasswordSmtp('OtraClaveFalsa-2026!');
    const alterada = `${cifrada.slice(0, -1)}${cifrada.endsWith('A') ? 'B' : 'A'}`;
    assert.throws(() => descifrarPasswordSmtp(alterada), /No se pudo descifrar/);
    assert.equal(descifrarPasswordSmtp('legacy-en-texto-plano'), 'legacy-en-texto-plano');
    delete process.env.SMTP_ENCRYPTION_KEY;
    assert.throws(() => cifrarPasswordSmtp('no debe guardarse'), /SMTP_ENCRYPTION_KEY/);
    process.env.SMTP_ENCRYPTION_KEY = 'corta';
    assert.throws(() => cifrarPasswordSmtp('no debe guardarse'), /exactamente 32 bytes/);
});
