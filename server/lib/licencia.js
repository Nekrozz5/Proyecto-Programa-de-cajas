const crypto = require('crypto');

// ==========================================
// MÓDULO DE VERIFICACIÓN DE CLAVES DE ACTIVACIÓN (ED25519)
// ==========================================
// Esta llave pública viene incrustada en el código del sistema.
// Solo puede validar firmas creadas con la LLAVE PRIVADA del desarrollador.
// Es matemáticamente imposible generar claves válidas con esta llave pública.

const LLAVE_PUBLICA_MAESTRA_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAJeqXIcb2Vk9crro4SafNxAM6W4OTj7zvqsVJfstTHZc=
-----END PUBLIC KEY-----`;

const PREFIJO_CLAVE = 'POS-ACT-';

/**
 * Valida una clave criptográfica de activación de producto.
 * @param {string} claveStr - Clave en formato "POS-ACT-<payload>.<firma>"
 * @param {object} opciones - { nombreNegocioEsperado }
 * @returns {{ valida: boolean, payload?: object, motivo?: string }}
 */
function verificarClaveActivacion(claveStr, { nombreNegocioEsperado = null } = {}) {
    if (!claveStr || typeof claveStr !== 'string') {
        return { valida: false, motivo: 'Clave ausente o formato incorrecto.' };
    }

    const limpia = claveStr.trim();
    if (!limpia.startsWith(PREFIJO_CLAVE)) {
        return { valida: false, motivo: 'La clave no tiene el prefijo de activación válido (POS-ACT-).' };
    }

    const contenido = limpia.slice(PREFIJO_CLAVE.length);
    const partes = contenido.split('.');
    if (partes.length !== 2) {
        return { valida: false, motivo: 'Estructura de clave de activación dañada o incompleta.' };
    }

    const [payloadB64, firmaB64] = partes;

    let payloadBuf;
    let firmaBuf;
    try {
        payloadBuf = Buffer.from(payloadB64, 'base64url');
        firmaBuf = Buffer.from(firmaB64, 'base64url');
    } catch {
        return { valida: false, motivo: 'Codificación base64url inválida en la clave.' };
    }

    let firmaValida = false;
    try {
        firmaValida = crypto.verify(null, payloadBuf, LLAVE_PUBLICA_MAESTRA_PEM, firmaBuf);
    } catch (err) {
        return { valida: false, motivo: `Error criptográfico al verificar: ${err.message}` };
    }

    if (!firmaValida) {
        return { valida: false, motivo: 'Firma criptográfica inválida. La clave no fue emitida por el desarrollador autorizado o fue modificada.' };
    }

    let payload;
    try {
        payload = JSON.parse(payloadBuf.toString('utf8'));
    } catch {
        return { valida: false, motivo: 'Contenido interno de la licencia corrupto.' };
    }

    // Validación de fecha de expiración (si aplica)
    if (payload.expira) {
        const fechaExp = new Date(payload.expira).getTime();
        if (Number.isFinite(fechaExp) && Date.now() > fechaExp) {
            return {
                valida: false,
                motivo: `La clave de activación expiró el ${new Date(payload.expira).toLocaleDateString('es-ES')}. Contacta al proveedor para renovar tu licencia.`
            };
        }
    }

    // Validación de asignación por nombre de negocio (si la clave fue emitida para un negocio en particular)
    if (payload.negocio && typeof payload.negocio === 'string' && payload.negocio.trim() !== '*') {
        const negocioEsperadoLimpio = String(nombreNegocioEsperado || '').trim().toLowerCase();
        const negocioLicenciaLimpio = payload.negocio.trim().toLowerCase();

        if (negocioEsperadoLimpio && negocioEsperadoLimpio !== negocioLicenciaLimpio) {
            return {
                valida: false,
                motivo: `Esta clave de activación está asignada exclusivamente al establecimiento "${payload.negocio}". No corresponde a "${nombreNegocioEsperado}".`
            };
        }
    }

    return {
        valida: true,
        payload
    };
}

module.exports = {
    verificarClaveActivacion,
    PREFIJO_CLAVE
};
