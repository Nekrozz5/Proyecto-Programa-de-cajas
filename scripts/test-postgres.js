const { readdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = path.resolve(__dirname, '..');
const carpetaTests = path.join(raiz, 'tests');
const archivos = readdirSync(carpetaTests)
    .filter((archivo) => archivo.endsWith('.test.js'))
    .sort();

let fallos = 0;

for (const archivo of archivos) {
    const ruta = path.join('tests', archivo);
    console.log(`\n=== ${ruta} ===`);
    const resultado = spawnSync(
        process.execPath,
        ['--env-file-if-exists=.env.local', '--test', '--test-concurrency=1', ruta],
        { cwd: raiz, stdio: 'inherit', env: process.env }
    );

    if (resultado.error) {
        console.error(`No se pudo ejecutar ${ruta}: ${resultado.error.message}`);
        fallos += 1;
    } else if (resultado.status !== 0) {
        fallos += 1;
    }
}

if (fallos > 0) {
    console.error(`\nPostgreSQL: ${fallos} archivo(s) con fallo.`);
    process.exitCode = 1;
} else {
    console.log(`\nPostgreSQL: ${archivos.length} archivo(s) correctos.`);
}
