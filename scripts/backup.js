const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), 'caja.db');

const backupDir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.resolve(process.cwd(), 'backups');

const MAX_BACKUPS_LOCAL = parseInt(process.env.MAX_BACKUPS_LOCAL || '30', 10);

if (!fs.existsSync(dbPath)) {
    console.error(`[Backup Error] La base de datos no existe en: ${dbPath}`);
    process.exit(1);
}

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

function generarNombreArchivo() {
    const ahora = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fecha = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
    const hora = `${pad(ahora.getHours())}-${pad(ahora.getMinutes())}-${pad(ahora.getSeconds())}`;
    return `caja-backup-${fecha}_${hora}.db`;
}

function limpiarBackupsAntiguos() {
    try {
        const archivos = fs.readdirSync(backupDir)
            .filter((f) => f.startsWith('caja-backup-') && f.endsWith('.db'))
            .map((f) => ({
                nombre: f,
                ruta: path.join(backupDir, f),
                mtime: fs.statSync(path.join(backupDir, f)).mtimeMs
            }))
            .sort((a, b) => b.mtime - a.mtime);

        if (archivos.length > MAX_BACKUPS_LOCAL) {
            const sobrantes = archivos.slice(MAX_BACKUPS_LOCAL);
            for (const item of sobrantes) {
                fs.unlinkSync(item.ruta);
                console.log(`[Backup Prune] Eliminado respaldo local antiguo: ${item.nombre}`);
            }
        }
    } catch (err) {
        console.warn(`[Backup Prune Aviso] No se pudieron purgar backups antiguos: ${err.message}`);
    }
}

async function ejecutarBackup() {
    const nombreArchivo = generarNombreArchivo();
    const rutaDestino = path.join(backupDir, nombreArchivo);

    console.log(`[Backup] Iniciando respaldo seguro de: ${dbPath}`);
    console.log(`[Backup] Destino: ${rutaDestino}`);

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
        if (err) {
            console.error(`[Backup Error] Error abriendo base de datos:`, err.message);
            process.exit(1);
        }
    });

    db.run(`VACUUM INTO ?`, [rutaDestino], (err) => {
        db.close();

        if (err) {
            console.error(`[Backup Error] Falló VACUUM INTO:`, err.message);
            process.exit(1);
        }

        const stats = fs.statSync(rutaDestino);
        const tamKb = Math.round(stats.size / 1024);
        console.log(`[Backup Éxito] Respaldo generado correctamente (${tamKb} KB).`);

        limpiarBackupsAntiguos();

        // Si se configuró bucket S3 de AWS, sincronizarlo
        if (process.env.S3_BUCKET) {
            const s3Destino = `s3://${process.env.S3_BUCKET}/backups/${nombreArchivo}`;
            console.log(`[Backup S3] Subiendo respaldo a AWS S3: ${s3Destino}`);
            try {
                execSync(`aws s3 cp "${rutaDestino}" "${s3Destino}"`, { stdio: 'inherit' });
                console.log(`[Backup S3 Éxito] Copia remota completada en ${s3Destino}`);
            } catch (s3Err) {
                console.error(`[Backup S3 Error] Falló la subida a S3:`, s3Err.message);
            }
        }
    });
}

ejecutarBackup();
