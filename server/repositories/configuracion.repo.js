/**
 * server/repositories/configuracion.repo.js
 * Repositorio para la configuración del negocio y régimen tributario.
 * Gestiona la tabla singleton `configuracion_negocio`.
 */

const { runQuery, getQuery, enTransaccion, redondear2, numeroNoNegativo } = require('./db');
const { obtenerUsuarioPorId, esRolAdministrativo } = require('./auth.repo');
const { normalizarRegimen } = require('../domain/fiscal');
const {
    obtenerConfiguracionSmtp,
    guardarConfiguracionSmtp,
    listarDestinatariosNotificaciones,
    crearDestinatarioPendiente,
    validarCodigoDestinatario,
    eliminarDestinatario
} = require('./notificaciones.repo');

/**
 * Determina si el negocio completó su configuración inicial.
 * Se mantiene como función pura para poder usarla en API, UI y simulaciones
 * sin abrir otra conexión ni duplicar la regla de negocio.
 */
function sistemaEstaInstalado(configuracion) {
    return Boolean(configuracion && Number(configuracion.configurado) === 1);
}

const CONSULTA_CONFIGURACION = 'SELECT * FROM configuracion_negocio WHERE id = 1';

async function inicializarConfiguracion() {
    await runQuery(
        `INSERT INTO configuracion_negocio (id, nombre_negocio, modalidad_nombre, usa_stock_directo, usa_vencimiento, usa_recetas_ensamblaje, habilita_apps_comida, habilita_delivery, configurado)
         VALUES (1, 'Mi Negocio', 'Venta Directa No Perecedera', 1, 0, 0, 0, 0, 1)
         ON CONFLICT (id) DO NOTHING`
    );
}

async function obtenerConfiguracionNegocio() {
    const config = await getQuery(CONSULTA_CONFIGURACION);
    if (config) return config;

    const inicializar = async () => {
        await inicializarConfiguracion();
        return getQuery(CONSULTA_CONFIGURACION);
    };
    return enTransaccion(inicializar);
}

async function actualizarConfiguracionSingleton(sql, parametros) {
    return enTransaccion(async () => {
        await inicializarConfiguracion();
        await runQuery(sql, parametros);
        return getQuery(CONSULTA_CONFIGURACION);
    });
}

async function guardarConfiguracionNegocio(adminId, config) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || (ejecutor.rol !== 'developer' && ejecutor.rol !== 'propietario')) {
        throw new Error('Permiso denegado: solo el rol Developer o Propietario(a) puede modificar la modalidad del negocio.');
    }

    const regimen = normalizarRegimen(config.regimenTributario);
    const ivaPorc = config.ivaPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.ivaPorcentaje, 'El porcentaje de IVA')) : 13;
    const itPorc = config.itPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.itPorcentaje, 'El porcentaje de IT')) : 3;
    const itBase = config.itBase === 'solo_facturadas' ? 'solo_facturadas' : (config.itBase === 'todas_las_ventas' ? 'todas_las_ventas' : null);
    const emiteFacturaFinal = regimen === 'simplificado_control_interno'
        ? 0
        : (config.emiteFactura !== undefined ? (config.emiteFactura ? 1 : 0) : null);
    const habilitaDeliveryVal = config.habilitaDelivery !== undefined
        ? (config.habilitaDelivery ? 1 : 0)
        : (config.habilita_delivery !== undefined ? (config.habilita_delivery ? 1 : 0) : null);

    return actualizarConfiguracionSingleton(
        `UPDATE configuracion_negocio
         SET nombre_negocio = $1,
             modalidad_nombre = $2,
             usa_stock_directo = $3,
             usa_vencimiento = $4,
             usa_recetas_ensamblaje = $5,
             habilita_apps_comida = COALESCE($6, habilita_apps_comida, 0),
             habilita_delivery = COALESCE($7, habilita_delivery, 0),
             nit_negocio = COALESCE($8, nit_negocio, ''),
             regimen_tributario = COALESCE($9, regimen_tributario, 'simplificado_control_interno'),
             emite_factura = COALESCE($10, emite_factura, 0),
             iva_porcentaje = $11,
             it_porcentaje = $12,
             it_base = COALESCE($13, it_base, 'todas_las_ventas'),
             usa_respaldo_compras_egresos = COALESCE($14, usa_respaldo_compras_egresos, 1),
             configurado = 1
         WHERE id = 1`,
        [
            (config.nombreNegocio || 'Mi Negocio').trim(),
            config.modalidadNombre || 'Personalizado',
            config.usaStockDirecto ? 1 : 0,
            config.usaVencimiento ? 1 : 0,
            config.usaRecetasEnsamblaje ? 1 : 0,
            config.habilitaAppsComida !== undefined ? (config.habilitaAppsComida ? 1 : 0) : null,
            habilitaDeliveryVal,
            config.nitNegocio !== undefined ? String(config.nitNegocio).trim() : null,
            config.regimenTributario !== undefined ? regimen : null,
            emiteFacturaFinal,
            ivaPorc,
            itPorc,
            itBase,
            config.usaRespaldoComprasEgresos !== undefined ? (config.usaRespaldoComprasEgresos ? 1 : 0) : null
        ]
    );
}

async function actualizarConfiguracionNegocio(config, adminId = null) {
    if (adminId) {
        const ejecutor = await obtenerUsuarioPorId(adminId);
        if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
            throw new Error('Permiso denegado: rol no autorizado para actualizar la configuración.');
        }
    }

    const habilitaDeliveryVal = config.habilita_delivery !== undefined
        ? (config.habilita_delivery ? 1 : 0)
        : (config.habilitaDelivery !== undefined ? (config.habilitaDelivery ? 1 : 0) : null);

    const habilitaAppsComidaVal = config.habilita_apps_comida !== undefined
        ? (config.habilita_apps_comida ? 1 : 0)
        : (config.habilitaAppsComida !== undefined ? (config.habilitaAppsComida ? 1 : 0) : null);

    const nombreNegocio = config.nombre_negocio !== undefined
        ? String(config.nombre_negocio).trim()
        : (config.nombreNegocio !== undefined ? String(config.nombreNegocio).trim() : null);

    const modalidadNombre = config.modalidad_nombre !== undefined
        ? config.modalidad_nombre
        : (config.modalidadNombre !== undefined ? config.modalidadNombre : null);

    const usaStockDirecto = config.usa_stock_directo !== undefined
        ? (config.usa_stock_directo ? 1 : 0)
        : (config.usaStockDirecto !== undefined ? (config.usaStockDirecto ? 1 : 0) : null);

    const usaVencimiento = config.usa_vencimiento !== undefined
        ? (config.usa_vencimiento ? 1 : 0)
        : (config.usaVencimiento !== undefined ? (config.usaVencimiento ? 1 : 0) : null);

    const usaRecetas = config.usa_recetas_ensamblaje !== undefined
        ? (config.usa_recetas_ensamblaje ? 1 : 0)
        : (config.usaRecetasEnsamblaje !== undefined ? (config.usaRecetasEnsamblaje ? 1 : 0) : null);

    const nitNegocio = config.nit_negocio !== undefined
        ? String(config.nit_negocio).trim()
        : (config.nitNegocio !== undefined ? String(config.nitNegocio).trim() : null);

    return actualizarConfiguracionSingleton(
        `UPDATE configuracion_negocio
         SET nombre_negocio = COALESCE($1, nombre_negocio),
             modalidad_nombre = COALESCE($2, modalidad_nombre),
             usa_stock_directo = COALESCE($3, usa_stock_directo),
             usa_vencimiento = COALESCE($4, usa_vencimiento),
             usa_recetas_ensamblaje = COALESCE($5, usa_recetas_ensamblaje),
             habilita_apps_comida = COALESCE($6, habilita_apps_comida),
             habilita_delivery = COALESCE($7, habilita_delivery),
             nit_negocio = COALESCE($8, nit_negocio)
         WHERE id = 1`,
        [
            nombreNegocio,
            modalidadNombre,
            usaStockDirecto,
            usaVencimiento,
            usaRecetas,
            habilitaAppsComidaVal,
            habilitaDeliveryVal,
            nitNegocio
        ]
    );

}

async function guardarConfiguracionContable(adminId, config) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador o Propietario(a) puede modificar la configuración contable.');
    }

    const regimen = normalizarRegimen(config.regimenTributario);
    const emiteFactura = regimen === 'simplificado_control_interno'
        ? 0
        : (config.emiteFactura !== undefined ? (config.emiteFactura ? 1 : 0) : 1);
    const ivaPorc = config.ivaPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.ivaPorcentaje, 'El porcentaje de IVA')) : 13;
    const itPorc = config.itPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.itPorcentaje, 'El porcentaje de IT')) : 3;
    const itBase = config.itBase === 'solo_facturadas' ? 'solo_facturadas' : 'todas_las_ventas';
    const usaRespaldo = config.usaRespaldoComprasEgresos !== undefined ? (config.usaRespaldoComprasEgresos ? 1 : 0) : 1;

    return actualizarConfiguracionSingleton(
        `UPDATE configuracion_negocio
         SET nombre_negocio = COALESCE($1, nombre_negocio),
             nit_negocio = $2,
             regimen_tributario = $3,
             emite_factura = $4,
             iva_porcentaje = $5,
             it_porcentaje = $6,
             it_base = $7,
             usa_respaldo_compras_egresos = $8,
             configurado = 1
         WHERE id = 1`,
        [
            config.nombreNegocio ? String(config.nombreNegocio).trim() : null,
            String(config.nitNegocio || '').trim(),
            regimen,
            emiteFactura,
            ivaPorc,
            itPorc,
            itBase,
            usaRespaldo
        ]
    );
}

module.exports = {
    sistemaEstaInstalado,
    obtenerConfiguracionNegocio,
    guardarConfiguracionNegocio,
    actualizarConfiguracionNegocio,
    guardarConfiguracionContable,
    obtenerConfiguracionSmtp,
    guardarConfiguracionSmtp,
    listarDestinatariosNotificaciones,
    crearDestinatarioPendiente,
    validarCodigoDestinatario,
    eliminarDestinatario
};
