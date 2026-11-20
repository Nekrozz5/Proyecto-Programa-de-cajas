/**
 * scripts/inicializar-entorno.js
 * 
 * Garantiza que la instalación disponga de un archivo de configuración (.env.production)
 * con secretos criptográficos únicos, seguros y no compartidos entre clientes.
 * Se ejecuta automáticamente antes de iniciar el servidor.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PROD_PATH = path.join(ROOT_DIR, '.env.production');
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');

function generarSecretoHex(longitudBytes = 32) {
    return crypto.randomBytes(longitudBytes).toString('hex');
}

function generarPasswordDeveloper() {
    // Genera una contraseña segura alfanumérica de 16 caracteres
    return crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, 'X') + '!Pos9';
}

function inicializarEntorno() {
    const envDestino = fs.existsSync(ENV_PROD_PATH) ? ENV_PROD_PATH : 
                       (fs.existsSync(ENV_LOCAL_PATH) ? ENV_LOCAL_PATH : ENV_PROD_PATH);

    let contenido = '';
    let variables = {};

    if (fs.existsSync(envDestino)) {
        contenido = fs.readFileSync(envDestino, 'utf8');
        const lineas = contenido.split(/\r?\n/);
        for (const linea of lineas) {
            const trim = linea.trim();
            if (trim && !trim.startsWith('#') && trim.includes('=')) {
                const idx = trim.indexOf('=');
                const clave = trim.slice(0, idx).trim();
                const valor = trim.slice(idx + 1).trim();
                variables[clave] = valor;
            }
        }
    }

    let modificado = false;

    // 1. Validar o generar SESSION_SECRET
    const sessionSecret = variables['SESSION_SECRET'];
    const esInvalido = !sessionSecret || sessionSecret.length < 32 || 
                       sessionSecret.toLowerCase().includes('cambiaesta') || 
                       sessionSecret.toLowerCase().includes('reemplazar');

    if (esInvalido) {
        variables['SESSION_SECRET'] = generarSecretoHex(32); // 64 caracteres hex
        modificado = true;
    }

    // 2. Validar o generar DEVELOPER_PASSWORD
    const devPass = variables['DEVELOPER_PASSWORD'];
    const devInvalido = !devPass || devPass.length < 8 || 
                        devPass.toLowerCase().includes('cambiaesta');

    if (devInvalido) {
        variables['DEVELOPER_PASSWORD'] = generarPasswordDeveloper();
        modificado = true;
    }

    // 3. Garantizar variables base
    if (!variables['NODE_ENV']) {
        variables['NODE_ENV'] = 'production';
        modificado = true;
    }
    if (!variables['PORT']) {
        variables['PORT'] = '3000';
        modificado = true;
    }
    if (!variables['DATABASE_PATH']) {
        variables['DATABASE_PATH'] = './caja.db';
        modificado = true;
    }

    // 4. Si se requirieron cambios o el archivo no existía, reescribir ordenadamente
    if (modificado || !fs.existsSync(envDestino)) {
        const nuevoContenido = [
            '# =====================================================================',
            '# CONFIGURACIÓN DE PRODUCCIÓN - SISTEMA POS Y CONTROL DE CAJAS',
            '# Generado automáticamente con secretos criptográficos únicos.',
            '# =====================================================================',
            `NODE_ENV=${variables['NODE_ENV'] || 'production'}`,
            `PORT=${variables['PORT'] || '3000'}`,
            `DATABASE_PATH=${variables['DATABASE_PATH'] || './caja.db'}`,
            `SESSION_SECRET=${variables['SESSION_SECRET']}`,
            `DEVELOPER_PASSWORD=${variables['DEVELOPER_PASSWORD']}`,
            '',
            '# Configuración opcional SMTP para alertas de cierre de caja por correo:',
            '# SMTP_HOST=smtp.gmail.com',
            '# SMTP_PORT=465',
            '# SMTP_SECURE=true',
            '# SMTP_USER=correo@dominio.com',
            '# SMTP_PASS=app_password',
            ''
        ].join('\r\n');

        fs.writeFileSync(envDestino, nuevoContenido, 'utf8');
        console.log(`[OK] Entorno seguro inicializado en ${path.basename(envDestino)} con secretos criptográficos únicos.`);
    }
}

inicializarEntorno();
