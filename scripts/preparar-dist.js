/**
 * scripts/preparar-dist.js
 * Valida y recolecta todos los archivos requeridos para la distribución
 * e instalador de Windows (Inno Setup) del Sistema POS y Control de Cajas.
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

const COLORES = {
    reset: '\x1b[0m',
    verde: '\x1b[32m',
    amarillo: '\x1b[33m',
    rojo: '\x1b[31m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

function logInfo(msg) {
    console.log(`${COLORES.cyan}[INFO]${COLORES.reset} ${msg}`);
}

function logOk(msg) {
    console.log(`${COLORES.verde}[OK]${COLORES.reset} ${msg}`);
}

function logWarn(msg) {
    console.log(`${COLORES.amarillo}[ADVERTENCIA]${COLORES.reset} ${msg}`);
}

function logError(msg) {
    console.log(`${COLORES.rojo}[ERROR]${COLORES.reset} ${msg}`);
}

/**
 * Copia recursiva filtrando carpetas no deseadas (como caches pesadas)
 */
function copiarDirectorio(origen, destino, exclusiones = []) {
    if (!fs.existsSync(origen)) return;
    if (!fs.existsSync(destino)) {
        fs.mkdirSync(destino, { recursive: true });
    }

    const entradas = fs.readdirSync(origen, { withFileTypes: true });
    for (const entrada of entradas) {
        const rutaOrigen = path.join(origen, entrada.name);
        const rutaDestino = path.join(destino, entrada.name);

        if (exclusiones.some(ex => entrada.name === ex || rutaOrigen.endsWith(path.sep + ex))) {
            continue;
        }

        if (entrada.isDirectory()) {
            copiarDirectorio(rutaOrigen, rutaDestino, exclusiones);
        } else if (entrada.isFile()) {
            fs.copyFileSync(rutaOrigen, rutaDestino);
        }
    }
}

/**
 * 1. Validaciones previas
 */
function validarRequisitos() {
    console.log(`\n${COLORES.bold}=== 1. Validando Archivos y Prerrequisitos ===${COLORES.reset}`);
    let errores = 0;
    let advertencias = 0;

    // A. Servidor Next.js compilado
    const nextDir = path.join(ROOT_DIR, '.next');
    const buildIdFile = path.join(nextDir, 'BUILD_ID');
    if (fs.existsSync(nextDir) && fs.existsSync(buildIdFile)) {
        const buildId = fs.readFileSync(buildIdFile, 'utf8').trim();
        logOk(`Build de Next.js detectado (.next, BUILD_ID: ${buildId})`);
    } else {
        logWarn(`No se detectó una compilación de producción en '.next'. Ejecute 'npm run build' antes de empaquetar.`);
        advertencias++;
    }

    // B. Dependencias nativas
    // better-sqlite3
    const betterSqliteDir = path.join(ROOT_DIR, 'node_modules', 'better-sqlite3');
    const bsqlPrebuildWin = path.join(betterSqliteDir, 'prebuilds', 'win32-x64.node');
    const bsqlRelease = path.join(betterSqliteDir, 'build', 'Release', 'better_sqlite3.node');
    if (fs.existsSync(betterSqliteDir) && (fs.existsSync(bsqlPrebuildWin) || fs.existsSync(bsqlRelease))) {
        logOk(`Binario nativo better-sqlite3 verificado`);
    } else {
        logError(`No se encontró el binario nativo de better-sqlite3 en node_modules`);
        errores++;
    }

    // sqlite3
    const sqlite3Dir = path.join(ROOT_DIR, 'node_modules', 'sqlite3');
    const sqlite3Release = path.join(sqlite3Dir, 'build', 'Release', 'node_sqlite3.node');
    if (fs.existsSync(sqlite3Dir) && fs.existsSync(sqlite3Release)) {
        logOk(`Binario nativo sqlite3 verificado`);
    } else {
        logWarn(`No se localizó 'node_sqlite3.node' en build/Release (puede estar empaquetado en bindings)`);
        advertencias++;
    }

    // C. Lanzadores del POS
    const lanzadores = [
        path.join(ROOT_DIR, 'scripts', 'iniciar-pos.bat'),
        path.join(ROOT_DIR, 'scripts', 'detener-pos.bat'),
        path.join(ROOT_DIR, 'scripts', 'lanzar-silencioso.vbs'),
        path.join(ROOT_DIR, 'scripts', 'iniciar-servidor.vbs')
    ];
    for (const lanzador of lanzadores) {
        if (fs.existsSync(lanzador)) {
            logOk(`Lanzador encontrado: scripts/${path.basename(lanzador)}`);
        } else {
            logError(`Lanzador faltante: scripts/${path.basename(lanzador)}`);
            errores++;
        }
    }

    // D. Carpetas y módulos del sistema
    const carpetasRequeridas = ['database', 'server', 'public'];
    for (const c of carpetasRequeridas) {
        const ruta = path.join(ROOT_DIR, c);
        if (fs.existsSync(ruta)) {
            logOk(`Carpeta de sistema encontrada: ${c}/`);
        } else {
            logError(`Carpeta de sistema faltante: ${c}/`);
            errores++;
        }
    }

    // E. Base de datos
    const dbPath = path.join(ROOT_DIR, 'caja.db');
    if (fs.existsSync(dbPath)) {
        logOk(`Base de datos SQLite local detectada (caja.db)`);
    } else {
        logWarn(`No existe 'caja.db' en la raíz. Se creará una plantilla inicial para el instalador.`);
    }

    // F. Motor Node.js Embebido Portable
    const nodeBinPath = path.join(ROOT_DIR, 'bin', 'node.exe');
    if (fs.existsSync(nodeBinPath)) {
        logOk(`Motor Node.js portable embebido verificado (bin/node.exe)`);
        // Validar coincidencia de ABI con el binario nativo better-sqlite3
        try {
            const probe = child_process.spawnSync(nodeBinPath, ['-e', "require('./node_modules/better-sqlite3')"], {
                cwd: ROOT_DIR,
                encoding: 'utf8'
            });
            if (probe.status === 0) {
                logOk(`Coincidencia de ABI de better-sqlite3 con bin/node.exe verificada exitosamente.`);
            } else {
                const detalleError = (probe.stderr || probe.stdout || '').trim();
                logError(`Incompatibilidad de ABI detectada entre bin/node.exe y better-sqlite3: ${detalleError}`);
                errores++;
            }
        } catch (err) {
            logError(`Error al verificar ABI con bin/node.exe: ${err.message}`);
            errores++;
        }
    } else {
        logWarn(`No se encontró 'bin/node.exe'. La distribución dependerá del Node.js global del sistema.`);
        advertencias++;
    }

    // G. Paquete Microsoft Visual C++ Redistributable
    const vcRedistPath = path.join(ROOT_DIR, 'redist', 'vc_redist.x64.exe');
    if (fs.existsSync(vcRedistPath)) {
        logOk(`Paquete Microsoft Visual C++ verificado (redist/vc_redist.x64.exe)`);
    } else {
        logWarn(`No se encontró 'redist/vc_redist.x64.exe'. Se recomienda para computadoras vírgenes.`);
        advertencias++;
    }

    return { valido: errores === 0, errores, advertencias };
}

/**
 * 2. Recolección de archivos para la distribución
 */
function recolectarArchivos() {
    console.log(`\n${COLORES.bold}=== 2. Recolectando Archivos en Carpeta 'dist' ===${COLORES.reset}`);
    logInfo(`Directorio destino: ${DIST_DIR}`);

    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    // Sanitización previa: asegurar que dist/ no contenga bases de datos ni archivos .env de desarrollo
    const archivosSanitizar = ['caja.db', 'caja.db-wal', 'caja.db-shm', '.env.local', '.env.production'];
    for (const archivo of archivosSanitizar) {
        const rutaEliminar = path.join(DIST_DIR, archivo);
        if (fs.existsSync(rutaEliminar)) {
            try {
                fs.rmSync(rutaEliminar, { force: true });
                logWarn(`Sanitizado archivo de desarrollo eliminado de dist/: ${archivo}`);
            } catch (err) {
                logWarn(`No se pudo eliminar ${archivo} de dist/: ${err.message}`);
            }
        }
    }

    // Crear subcarpetas requeridas
    const subcarpetas = ['scripts', 'database', 'server', 'public', 'backups'];
    for (const sub of subcarpetas) {
        const target = path.join(DIST_DIR, sub);
        if (!fs.existsSync(target)) {
            fs.mkdirSync(target, { recursive: true });
        }
    }

    // Copiar archivos raíz de configuración
    const archivosRaiz = ['package.json', 'next.config.js'];
    for (const archivo of archivosRaiz) {
        const src = path.join(ROOT_DIR, archivo);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(DIST_DIR, archivo));
            logOk(`Copiado: ${archivo}`);
        }
    }

    // NOTA DE SEGURIDAD: Nunca copiamos .env.local, .env.production ni caja.db de desarrollo a dist/.
    // El entorno seguro se genera automáticamente en destino con scripts/inicializar-entorno.js
    // y la base de datos se inicializa limpia en la primera ejecución.

    // Copiar lanzadores y scripts de producción
    const scripts = ['iniciar-pos.bat', 'detener-pos.bat', 'lanzar-silencioso.vbs', 'iniciar-servidor.vbs', 'backup.js', 'inicializar-entorno.js'];
    for (const s of scripts) {
        const src = path.join(ROOT_DIR, 'scripts', s);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(DIST_DIR, 'scripts', s));
            logOk(`Copiado: scripts/${s}`);
        }
    }

    // Copiar carpetas completas del sistema
    logInfo(`Copiando carpetas de aplicación (database, server, public)...`);
    copiarDirectorio(path.join(ROOT_DIR, 'database'), path.join(DIST_DIR, 'database'));
    copiarDirectorio(path.join(ROOT_DIR, 'server'), path.join(DIST_DIR, 'server'));
    copiarDirectorio(path.join(ROOT_DIR, 'public'), path.join(DIST_DIR, 'public'));
    logOk(`Carpetas de aplicación copiadas exitosamente`);

    // Copiar .next (excluyendo carpetas temporales y de desarrollo para optimizar espacio y velocidad)
    const srcNext = path.join(ROOT_DIR, '.next');
    const destNext = path.join(DIST_DIR, '.next');
    if (fs.existsSync(srcNext)) {
        logInfo(`Limpiando carpeta previa dist/.next para evitar residuos de builds anteriores...`);
        if (fs.existsSync(destNext)) {
            fs.rmSync(destNext, { recursive: true, force: true });
        }
        logInfo(`Copiando build de Next.js (.next) omitiendo cache y carpetas de desarrollo...`);
        const exclusionesNext = ['cache', 'dev', 'diagnostics', 'types'];
        copiarDirectorio(srcNext, destNext, exclusionesNext);
        logOk(`Build de Next.js copiado a dist/.next (100% limpio y optimizado)`);
    }

    // NOTA DE SEGURIDAD: Nunca copiamos caja.db existente hacia dist/.
    // Inno Setup no debe arrastrar datos reales de clientes ni ventas locales de desarrollo.

    // Copiar motor Node.js portable embebido (bin/node.exe)
    const srcBin = path.join(ROOT_DIR, 'bin', 'node.exe');
    const destBinDir = path.join(DIST_DIR, 'bin');
    if (fs.existsSync(srcBin)) {
        if (!fs.existsSync(destBinDir)) fs.mkdirSync(destBinDir, { recursive: true });
        fs.copyFileSync(srcBin, path.join(destBinDir, 'node.exe'));
        logOk(`Binario portable embebido copiado a dist/bin/node.exe`);
    }

    // Copiar instalador de Microsoft Visual C++ (redist/vc_redist.x64.exe)
    const srcRedist = path.join(ROOT_DIR, 'redist', 'vc_redist.x64.exe');
    const destRedistDir = path.join(DIST_DIR, 'redist');
    if (fs.existsSync(srcRedist)) {
        if (!fs.existsSync(destRedistDir)) fs.mkdirSync(destRedistDir, { recursive: true });
        fs.copyFileSync(srcRedist, path.join(destRedistDir, 'vc_redist.x64.exe'));
        logOk(`Paquete Microsoft Visual C++ copiado a dist/redist/vc_redist.x64.exe`);
    }

    // Gestionar node_modules en dist
    const srcModules = path.join(ROOT_DIR, 'node_modules');
    const destModules = path.join(DIST_DIR, 'node_modules');
    const copiarModulos = process.argv.includes('--copy-modules');

    if (fs.existsSync(srcModules)) {
        if (copiarModulos) {
            logInfo(`Copiando node_modules físicamente (--copy-modules especificado)...`);
            copiarDirectorio(srcModules, destModules);
            logOk(`node_modules copiado físicamente`);
        } else {
            // En Windows, crear o actualizar un enlace NTFS junction es instantáneo y no duplica 47.000 archivos
            if (!fs.existsSync(destModules)) {
                try {
                    fs.symlinkSync(srcModules, destModules, 'junction');
                    logOk(`Enlace junction creado para node_modules -> dist/node_modules`);
                } catch (err) {
                    logWarn(`No se pudo crear junction para node_modules (${err.message}). Puede usar 'node scripts/preparar-dist.js --copy-modules' para copiar físicamente.`);
                }
            } else {
                logOk(`dist/node_modules ya se encuentra configurado`);
            }
        }
    }
}

function main() {
    console.log(`\n=============================================================`);
    console.log(`  PREPARADOR DE DISTRIBUCIÓN - SISTEMA POS Y CONTROL DE CAJAS`);
    console.log(`=============================================================`);

    const validacion = validarRequisitos();
    if (!validacion.valido) {
        logError(`La validación falló con ${validacion.errores} error(es). Corrija los problemas antes de compilar.`);
        process.exit(1);
    }

    recolectarArchivos();

    console.log(`\n${COLORES.bold}=== 3. Resumen y Siguientes Pasos ===${COLORES.reset}`);
    logOk(`Directorio 'dist/' preparado y validado correctamente.`);
    console.log(`\nPara generar el instalador final 'Setup-POS-Cajas.exe':`);
    console.log(`  1. Abra el archivo 'installer/pos-cajas.iss' en Inno Setup Compiler.`);
    console.log(`  2. O compile directamente por consola si dispone de Inno Setup CLI:`);
    console.log(`     ${COLORES.cyan}iscc installer/pos-cajas.iss${COLORES.reset}\n`);
}

main();
