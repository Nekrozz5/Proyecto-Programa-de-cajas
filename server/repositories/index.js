/**
 * server/repositories/index.js
 * Barril central de repositorios del sistema.
 */

const db = require('./db');
const authRepo = require('./auth.repo');
const configuracionRepo = require('./configuracion.repo');
const cajasRepo = require('./cajas.repo');

module.exports = {
    ...db,
    ...authRepo,
    ...configuracionRepo,
    ...cajasRepo
};
