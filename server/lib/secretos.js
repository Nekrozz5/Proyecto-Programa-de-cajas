// ==========================================
// VALIDACIÓN DE SECRETOS Y VARIABLES DE ENTORNO
// ==========================================
// Funciones puras (sin efectos al importar) para que puedan usarse de forma perezosa:
// - en el primer uso real (sesion.js, migraciones.js, queries.js)
// - y al arrancar el servidor desde instrumentation.js (nunca durante `next build`).

const LONGITUD_MINIMA_SESSION_SECRET = 32;
const LONGITUD_MINIMA_DEVELOPER_PASSWORD = 8;

// Marcadores usados en .env.production.example (y en versiones anteriores del ejemplo).
// Se comparan sin mayúsculas ni separadores: "cambia_esta", "CambiaEsta", "REEMPLAZAR_..." etc.
const MARCADORES_EJEMPLO = ['cambiaesta', 'reemplazar'];

// Valor literal del ejemplo anterior de DEVELOPER_PASSWORD
const VALORES_EJEMPLO_DEVELOPER = ['CambiaEstaClaveDeveloperEnProduccion!'];

function esProduccion() {
    return process.env.NODE_ENV === 'production';
}

function contieneMarcadorEjemplo(valor) {
    const normalizado = String(valor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return MARCADORES_EJEMPLO.some((m) => normalizado.includes(m));
}

function errorConfiguracion(mensaje) {
    const err = new Error(`[Configuración insegura] ${mensaje}`);
    err.status = 500;
    err.code = 'CONFIGURACION_INSEGURA';
    return err;
}

// Devuelve null si el secreto es válido; si no, el motivo del rechazo.
function motivoSecretoSesionInvalido(valor) {
    const secreto = String(valor || '').trim();
    if (!secreto) return 'SESSION_SECRET no está definido.';
    if (secreto.length < LONGITUD_MINIMA_SESSION_SECRET) {
        return `SESSION_SECRET es demasiado corto (${secreto.length} caracteres; mínimo ${LONGITUD_MINIMA_SESSION_SECRET}).`;
    }
    if (contieneMarcadorEjemplo(secreto)) {
        return 'SESSION_SECRET conserva el valor de ejemplo de .env.production.example.';
    }
    return null;
}

// En producción lanza si SESSION_SECRET no es apto. Devuelve el secreto validado.
function exigirSecretoSesionProduccion() {
    const motivo = motivoSecretoSesionInvalido(process.env.SESSION_SECRET);
    if (motivo) {
        throw errorConfiguracion(
            `${motivo} En producción no se genera automáticamente. Define un valor aleatorio en el archivo .env (por ejemplo: openssl rand -hex 32) y reinicia el servicio.`
        );
    }
    return String(process.env.SESSION_SECRET).trim();
}

// Devuelve null si la clave es apta para producción; si no, el motivo.
function motivoPasswordDeveloperInvalida(valor) {
    const clave = String(valor || '').trim();
    if (!clave) return null; // Ausente: se gestiona aparte (no se crea la cuenta developer)
    if (VALORES_EJEMPLO_DEVELOPER.includes(clave) || contieneMarcadorEjemplo(clave)) {
        return 'DEVELOPER_PASSWORD conserva el valor de ejemplo de .env.production.example.';
    }
    if (clave.length < LONGITUD_MINIMA_DEVELOPER_PASSWORD) {
        return `DEVELOPER_PASSWORD es demasiado corta (mínimo ${LONGITUD_MINIMA_DEVELOPER_PASSWORD} caracteres).`;
    }
    return null;
}

// En producción lanza si DEVELOPER_PASSWORD está definida con un valor no apto.
function exigirPasswordDeveloperProduccion(valor) {
    const motivo = motivoPasswordDeveloperInvalida(valor);
    if (motivo) {
        throw errorConfiguracion(`${motivo} Define una clave propia en el archivo .env y reinicia el servicio.`);
    }
}

// Validación completa al arrancar el servidor en producción (llamada desde instrumentation.js).
// Lanza en el primer problema bloqueante; los avisos no bloqueantes se escriben en consola.
function validarEntornoArranqueProduccion() {
    if (!esProduccion()) return;

    exigirSecretoSesionProduccion();
    exigirPasswordDeveloperProduccion(process.env.DEVELOPER_PASSWORD);

    if (!String(process.env.DEVELOPER_PASSWORD || '').trim()) {
        console.warn('[Seguridad] DEVELOPER_PASSWORD no está definida: la cuenta técnica developer no estará disponible.');
    }
    if (String(process.env.TRUST_PROXY || '').trim().toLowerCase() !== 'true') {
        console.warn('[Seguridad] TRUST_PROXY no es "true": el límite de intentos por IP agrupará a todos los clientes como \'local\'.');
    }
}

// Ejecuta la validación y aborta el proceso si falla.
// Centralizado aquí para que instrumentation.js no contenga llamadas directas a process.exit,
// evitando advertencias del analizador estático para Edge Runtime en Next.js / Turbopack.
function validarOAbortarArranque() {
    try {
        validarEntornoArranqueProduccion();
    } catch (err) {
        console.error('\n==================================================================');
        console.error('[Arranque abortado] ' + err.message);
        console.error('==================================================================\n');
        process.exit(1);
    }
}

module.exports = {
    esProduccion,
    contieneMarcadorEjemplo,
    motivoSecretoSesionInvalido,
    exigirSecretoSesionProduccion,
    motivoPasswordDeveloperInvalida,
    exigirPasswordDeveloperProduccion,
    validarEntornoArranqueProduccion,
    validarOAbortarArranque
};
