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

function rotarLogs() {
    const logPath = path.join(ROOT_DIR, 'server.log');
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    if (fs.existsSync(logPath)) {
        try {
            const stats = fs.statSync(logPath);
            if (stats.size > MAX_SIZE) {
                const logOldPath = path.join(ROOT_DIR, 'server.log.old');
                if (fs.existsSync(logOldPath)) {
                    fs.unlinkSync(logOldPath);
                }
                fs.renameSync(logPath, logOldPath);
                console.log(`[OK] server.log superó 10MB (${(stats.size / 1024 / 1024).toFixed(2)} MB) y fue rotado a server.log.old.`);
            }
        } catch (err) {
            console.error(`[ADVERTENCIA] Error durante la rotación de logs: ${err.message}`);
        }
    }
}

function autodiagnosticoBaseDatos(dbPathConfig) {
    const dbPath = path.isAbsolute(dbPathConfig) ? dbPathConfig : path.resolve(ROOT_DIR, dbPathConfig || './caja.db');
    if (!fs.existsSync(dbPath)) {
        return;
    }

    try {
        const stats = fs.statSync(dbPath);
        if (stats.size === 0) {
            return;
        }

        let Database;
        try {
            Database = require('better-sqlite3');
        } catch (e) {
            try {
                Database = require('sqlite3').Database;
            } catch (e2) {
                console.warn(`[ADVERTENCIA] No se pudo cargar módulo SQLite para autodiagnóstico.`);
                return;
            }
        }

        // Si es better-sqlite3 (síncrono)
        if (typeof Database === 'function' && Database.prototype && Database.prototype.prepare) {
            const db = new Database(dbPath);
            try {
                // 1. Integridad
                const row = db.prepare('PRAGMA quick_check;').get();
                const resultado = row ? Object.values(row)[0] : 'ok';
                if (resultado !== 'ok') {
                    console.error(`[ERROR INTEGRIDAD SQLITE] PRAGMA quick_check falló: ${resultado}`);
                } else {
                    console.log(`[OK] Integridad SQLite verificada (PRAGMA quick_check: ok).`);
                }

                // 2. Si se solicitó --checkpoint
                if (process.argv.includes('--checkpoint')) {
                    db.pragma('wal_checkpoint(TRUNCATE)');
                    console.log(`[OK] Checkpoint WAL ejecutado con TRUNCATE en ${path.basename(dbPath)}.`);
                }

                // 3. Si se solicitó --check-open-caja
                if (process.argv.includes('--check-open-caja')) {
                    const abierta = db.prepare("SELECT COUNT(*) AS total FROM cajas WHERE estado = 'abierta'").get();
                    db.close();
                    if (abierta && abierta.total > 0) {
                        console.log(`[ALERTA] Existen ${abierta.total} caja(s) en estado abierta.`);
                        process.exit(2);
                    } else {
                        console.log(`[OK] No existen cajas abiertas. Cierre seguro confirmado.`);
                        process.exit(0);
                    }
                }
            } finally {
                if (db.open) {
                    db.close();
                }
            }
        }
    } catch (err) {
        console.error(`[ERROR] Fallo en autodiagnóstico de base de datos: ${err.message}`);
    }
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
    return variables['DATABASE_PATH'] || './caja.db';
}

function main() {
    rotarLogs();
    const dbPathConfig = inicializarEntorno();
    autodiagnosticoBaseDatos(dbPathConfig);
}

main();
