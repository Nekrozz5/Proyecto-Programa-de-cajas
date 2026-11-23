const crypto = require('crypto');

const PREFIJO = 'enc:v1:';

function obtenerClaveSmtp() {
    const valor = String(process.env.SMTP_ENCRYPTION_KEY || '').trim();
    if (!valor) throw new Error('SMTP_ENCRYPTION_KEY es obligatoria para guardar o enviar correo SMTP.');
    let clave;
    if (/^[0-9a-f]{64}$/i.test(valor)) clave = Buffer.from(valor, 'hex');
    else {
        try { clave = Buffer.from(valor, 'base64'); } catch (_) { clave = null; }
    }
    if (!clave || clave.length !== 32) {
        throw new Error('SMTP_ENCRYPTION_KEY debe contener exactamente 32 bytes en hex (64 caracteres) o base64.');
    }
    return clave;
}

function cifrarPasswordSmtp(password) {
    const texto = String(password ?? '');
    if (!texto) throw new Error('La contraseña SMTP no puede estar vacía al cifrarla.');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', obtenerClaveSmtp(), iv);
    const ciphertext = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return `${PREFIJO}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

function descifrarPasswordSmtp(valor) {
    const texto = String(valor ?? '');
    if (!texto.startsWith(PREFIJO)) return texto;
    const partes = texto.slice(PREFIJO.length).split(':');
    if (partes.length !== 3) throw new Error('El valor cifrado de SMTP tiene un formato inválido.');
    const [ivB64, tagB64, ciphertextB64] = partes;
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', obtenerClaveSmtp(), Buffer.from(ivB64, 'base64'));
        decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]).toString('utf8');
    } catch (error) {
        throw new Error(`No se pudo descifrar la contraseña SMTP: ${error.message}`);
    }
}

module.exports = { PREFIJO, cifrarPasswordSmtp, descifrarPasswordSmtp, obtenerClaveSmtp };
