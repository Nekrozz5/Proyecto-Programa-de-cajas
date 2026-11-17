/**
 * server/queries.js
 * Fachada y barrel principal del backend del sistema POS.
 * Re-exporta todos los repositorios modulares (auth, configuracion, cajas,
 * catalogo, inventario, ventas, reportes) y funciones de dominio (costos, fiscal).
 * Garantiza total retrocompatibilidad con las rutas de API (app/api/caja, app/api/reportes)
 * y los scripts de inicialización y testing.
 */

const repositories = require('./repositories');

module.exports = {
    ...repositories
};
