// Hook de arranque de Next.js: register() se ejecuta una vez al iniciar el servidor
// (`next start` / `next dev`), no por cada petición.
// Valida los secretos de producción para fallar al arrancar con un error claro,
// sin afectar a `next build` (que también corre con NODE_ENV=production).
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
        const modulo = await import('./server/secretos.js');
        // Interop CommonJS: las funciones pueden llegar como export nombrado o dentro de default
        const validarOAbortarArranque = modulo.validarOAbortarArranque
            || (modulo.default && modulo.default.validarOAbortarArranque);
        if (typeof validarOAbortarArranque === 'function') {
            validarOAbortarArranque();
        }
    }
}
