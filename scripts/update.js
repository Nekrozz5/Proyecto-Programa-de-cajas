const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const esWindows = process.platform === 'win32';
const npmCmd = esWindows ? 'npm.cmd' : 'npm';

const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), 'caja.db');

function ejecutarPaso(titulo, comando) {
    console.log(`\n==================================================`);
    console.log(`[Update] ${titulo}`);
    console.log(`[Comando] ${comando}`);
    console.log(`==================================================`);
    execSync(comando, { stdio: 'inherit', cwd: process.cwd() });
}

function main() {
    console.log(`[Update] Iniciando actualización segura del sistema POS...`);

    // 1. Respaldo preventivo obligatorio si existe base de datos
    if (fs.existsSync(dbPath)) {
        try {
            ejecutarPaso('Paso 1/4: Creando copia de seguridad preventiva de la base de datos', `node scripts/backup.js`);
        } catch (err) {
            console.error(`\n[Update Abortado] Falló el respaldo preventivo de la base de datos. No se modificó ningún archivo.`);
            process.exit(1);
        }
    } else {
        console.log(`\n[Update Aviso] Paso 1/4: Aún no existe base de datos en ${dbPath} (se omitirá el backup inicial).`);
    }

    // 2. Descargar actualizaciones desde el repositorio Git
    if (fs.existsSync(path.resolve(process.cwd(), '.git'))) {
        try {
            ejecutarPaso('Paso 2/4: Descargando actualizaciones de código (git pull)', 'git pull --ff-only');
        } catch (err) {
            console.error(`\n[Update Error] No se pudo completar 'git pull --ff-only'. Verifica tu conexión a internet o posibles cambios locales sin guardar.`);
            process.exit(1);
        }
    } else {
        console.log(`\n[Update Aviso] Paso 2/4: No se detectó carpeta .git, omitiendo 'git pull'.`);
    }

    // 3. Instalar versiones exactas de dependencias (package-lock.json)
    const tieneLock = fs.existsSync(path.resolve(process.cwd(), 'package-lock.json'));
    const comandoInstalacion = tieneLock ? `${npmCmd} ci` : `${npmCmd} install`;
    try {
        ejecutarPaso('Paso 3/4: Sincronizando dependencias exactas', comandoInstalacion);
    } catch (err) {
        console.error(`\n[Update Error] Falló la instalación de dependencias.`);
        process.exit(1);
    }

    // 4. Compilar versión de producción
    try {
        ejecutarPaso('Paso 4/4: Compilando aplicación para producción (next build)', `${npmCmd} run build`);
    } catch (err) {
        console.error(`\n[Update Error] Falló la compilación de producción.`);
        process.exit(1);
    }

    // 5. Si PM2 está activo con el proceso, reiniciarlo automáticamente
    try {
        const pm2Cmd = esWindows ? 'pm2.cmd' : 'pm2';
        const salidaPm2 = execSync(`${pm2Cmd} jlist`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        if (salidaPm2 && salidaPm2.includes('pos-cajas')) {
            console.log(`\n[Update] Detectado proceso activo en PM2. Reiniciando 'pos-cajas'...`);
            execSync(`${pm2Cmd} restart pos-cajas`, { stdio: 'inherit' });
        }
    } catch (_) {
        // PM2 no instalado o no en uso; ignorar silenciosamente
    }

    console.log(`\n==================================================`);
    console.log(`[Update Éxito] Sistema actualizado correctamente.`);
    console.log(`- Tus ventas, usuarios y configuraciones están intactos.`);
    console.log(`- Las migraciones nuevas de base de datos se aplicarán automáticamente al iniciar el servidor.`);
    console.log(`==================================================\n`);
}

main();
