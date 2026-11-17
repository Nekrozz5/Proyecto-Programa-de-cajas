/**
 * server/repositories/configuracion.repo.js
 * Repositorio para la configuración del negocio, régimen tributario y setup inicial.
 * Gestiona la tabla singleton `configuracion_negocio`.
 */

const crypto = require('crypto');
const { runQuery, getQuery, enTransaccion, redondear2, numeroNoNegativo } = require('./db');
const { obtenerUsuarioPorId, obtenerUsuarios, crearUsuario, esRolAdministrativo } = require('./auth.repo');
const { obtenerSetupTokenValido } = require('../secretos');
const { normalizarRegimen } = require('../domain/fiscal');

async function obtenerConfiguracionNegocio() {
    let config = await getQuery(`SELECT * FROM configuracion_negocio WHERE id = 1`);
    if (!config) {
        await runQuery(
            `INSERT INTO configuracion_negocio (id, nombre_negocio, modalidad_nombre, usa_stock_directo, usa_vencimiento, usa_recetas_ensamblaje, configurado)
             VALUES (1, 'Mi Negocio', 'Venta Directa No Perecedera', 1, 0, 0, 0)`
        );
        config = await getQuery(`SELECT * FROM configuracion_negocio WHERE id = 1`);
    }
    return config;
}

async function guardarConfiguracionNegocio(adminId, config) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || ejecutor.rol !== 'developer') {
        throw new Error('Permiso denegado: solo el rol Developer puede modificar la modalidad del negocio.');
    }

    const regimen = normalizarRegimen(config.regimenTributario);
    const ivaPorc = config.ivaPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.ivaPorcentaje, 'El porcentaje de IVA')) : 13;
    const itPorc = config.itPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.itPorcentaje, 'El porcentaje de IT')) : 3;
    const itBase = config.itBase === 'solo_facturadas' ? 'solo_facturadas' : (config.itBase === 'todas_las_ventas' ? 'todas_las_ventas' : null);
    const emiteFacturaFinal = regimen === 'simplificado_control_interno'
        ? 0
        : (config.emiteFactura !== undefined ? (config.emiteFactura ? 1 : 0) : null);

    await runQuery(
        `UPDATE configuracion_negocio
         SET nombre_negocio = ?,
             modalidad_nombre = ?,
             usa_stock_directo = ?,
             usa_vencimiento = ?,
             usa_recetas_ensamblaje = ?,
             nit_negocio = COALESCE(?, nit_negocio, ''),
             regimen_tributario = COALESCE(?, regimen_tributario, 'simplificado_control_interno'),
             emite_factura = COALESCE(?, emite_factura, 0),
             iva_porcentaje = ?,
             it_porcentaje = ?,
             it_base = COALESCE(?, it_base, 'todas_las_ventas'),
             usa_respaldo_compras_egresos = COALESCE(?, usa_respaldo_compras_egresos, 1),
             configurado = 1
         WHERE id = 1`,
        [
            (config.nombreNegocio || 'Mi Negocio').trim(),
            config.modalidadNombre || 'Personalizado',
            config.usaStockDirecto ? 1 : 0,
            config.usaVencimiento ? 1 : 0,
            config.usaRecetasEnsamblaje ? 1 : 0,
            config.nitNegocio !== undefined ? String(config.nitNegocio).trim() : null,
            config.regimenTributario !== undefined ? regimen : null,
            emiteFacturaFinal,
            ivaPorc,
            itPorc,
            itBase,
            config.usaRespaldoComprasEgresos !== undefined ? (config.usaRespaldoComprasEgresos ? 1 : 0) : null
        ]
    );
    return await obtenerConfiguracionNegocio();
}

async function guardarConfiguracionContable(adminId, config) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador o Super Admin puede modificar la configuración contable.');
    }

    const regimen = normalizarRegimen(config.regimenTributario);
    const emiteFactura = regimen === 'simplificado_control_interno'
        ? 0
        : (config.emiteFactura !== undefined ? (config.emiteFactura ? 1 : 0) : 1);
    const ivaPorc = config.ivaPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.ivaPorcentaje, 'El porcentaje de IVA')) : 13;
    const itPorc = config.itPorcentaje !== undefined ? redondear2(numeroNoNegativo(config.itPorcentaje, 'El porcentaje de IT')) : 3;
    const itBase = config.itBase === 'solo_facturadas' ? 'solo_facturadas' : 'todas_las_ventas';
    const usaRespaldo = config.usaRespaldoComprasEgresos !== undefined ? (config.usaRespaldoComprasEgresos ? 1 : 0) : 1;

    await runQuery(
        `UPDATE configuracion_negocio
         SET nombre_negocio = COALESCE(?, nombre_negocio),
             nit_negocio = ?,
             regimen_tributario = ?,
             emite_factura = ?,
             iva_porcentaje = ?,
             it_porcentaje = ?,
             it_base = ?,
             usa_respaldo_compras_egresos = ?
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
    return await obtenerConfiguracionNegocio();
}

function validarTokenInstalacion(tokenRecibido) {
    const esperado = obtenerSetupTokenValido();

    if (!esperado) {
        if (process.env.NODE_ENV === 'production') {
            const err = new Error('Instalación deshabilitada: el servidor no tiene definida la variable SETUP_TOKEN (o conserva el valor de ejemplo). Configúrala en el archivo .env de producción y reinicia el servicio.');
            err.status = 403;
            throw err;
        }
        console.warn('[Seguridad] SETUP_TOKEN no está definido: instalación inicial permitida sin token (solo en desarrollo).');
        return;
    }

    const recibido = String(tokenRecibido || '').trim();
    const hashEsperado = crypto.createHash('sha256').update(esperado, 'utf8').digest();
    const hashRecibido = crypto.createHash('sha256').update(recibido, 'utf8').digest();
    if (!recibido || !crypto.timingSafeEqual(hashEsperado, hashRecibido)) {
        const err = new Error('Token de instalación inválido o ausente.');
        err.status = 403;
        throw err;
    }
}

async function sistemaEstaInstalado(configuracion = null) {
    const config = configuracion || await obtenerConfiguracionNegocio();
    if (!config || Number(config.configurado) !== 1) return false;
    const fila = await getQuery(`SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1 AND rol != 'developer'`);
    return Number(fila?.total || 0) > 0;
}

async function inicializarSistemaPrimeraVez(datos = {}) {
    validarTokenInstalacion(datos.setupToken);

    if (!datos.nombreNegocio || !String(datos.nombreNegocio).trim()) {
        throw new Error('Debes ingresar el nombre de la empresa o negocio.');
    }

    // Asegura que exista la fila singleton antes de abrir la transacción
    await obtenerConfiguracionNegocio();

    const superAdminId = await enTransaccion(async () => {
        const configActual = await getQuery(`SELECT configurado FROM configuracion_negocio WHERE id = 1`);
        const usuariosExistentes = await obtenerUsuarios();

        if (Number(configActual.configurado) === 1 && usuariosExistentes.length > 0) {
            throw new Error('El sistema ya fue inicializado previamente.');
        }

        await runQuery(
            `UPDATE configuracion_negocio
             SET nombre_negocio = ?,
                 modalidad_nombre = ?,
                 usa_stock_directo = ?,
                 usa_vencimiento = ?,
                 usa_recetas_ensamblaje = ?,
                 configurado = 1
             WHERE id = 1`,
            [
                String(datos.nombreNegocio).trim(),
                datos.modalidadNombre || 'Venta Directa No Perecedera',
                datos.usaStockDirecto ? 1 : 0,
                datos.usaVencimiento ? 1 : 0,
                datos.usaRecetasEnsamblaje ? 1 : 0
            ]
        );

        if (usuariosExistentes.length > 0) {
            return usuariosExistentes[0].id;
        }

        if (!datos.adminNombre || !String(datos.adminNombre).trim() || !datos.adminPin || !String(datos.adminPin).trim()) {
            throw new Error('Debes ingresar el nombre y PIN/contraseña para crear el primer Super Admin.');
        }
        return await crearUsuario(String(datos.adminNombre).trim(), String(datos.adminPin).trim(), 'superadmin');
    });

    return {
        configuracionNegocio: await obtenerConfiguracionNegocio(),
        superAdminId
    };
}

module.exports = {
    obtenerConfiguracionNegocio,
    guardarConfiguracionNegocio,
    guardarConfiguracionContable,
    validarTokenInstalacion,
    sistemaEstaInstalado,
    inicializarSistemaPrimeraVez
};
