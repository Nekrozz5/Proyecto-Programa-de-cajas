/**
 * server/repositories/index.js
 * Barril central de repositorios del sistema POS.
 * Expone la capa completa de acceso a datos y lógica transaccional de negocio.
 */

const db = require('./db');
const costosDomain = require('../domain/costos');
const fiscalDomain = require('../domain/fiscal');

const authRepo = require('./auth.repo');
const configuracionRepo = require('./configuracion.repo');
const cajasRepo = require('./cajas.repo');
const catalogoRepo = require('./catalogo.repo');
const inventarioRepo = require('./inventario.repo');
const ventasRepo = require('./ventas.repo');
const reportesRepo = require('./reportes.repo');
const analiticasRepo = require('./analiticas.repo');
const notificacionesRepo = require('./notificaciones.repo');
const tenantContext = require('../tenancy/tenant-context');

module.exports = {
    ...db,
    ...costosDomain,
    ...fiscalDomain,
    ...authRepo,
    ...configuracionRepo,
    ...cajasRepo,
    ...catalogoRepo,
    ...inventarioRepo,
    ...ventasRepo,
    ...reportesRepo,
    ...analiticasRepo,
    ...notificacionesRepo,
    ...tenantContext
};
