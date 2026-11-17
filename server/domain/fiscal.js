/**
 * server/domain/fiscal.js
 * Funciones puras de cálculo de impuestos (IVA, IT), validación de regímenes tributarios
 * y generación de snapshots fiscales congelados.
 * Sin dependencias de base de datos ni SQL.
 */

const { redondear2 } = require('./costos');

const REGIMENES_TRIBUTARIOS = {
    GENERAL: 'regimen_general',
    SIMPLIFICADO: 'simplificado_control_interno'
};

const BASES_IT = {
    TODAS_LAS_VENTAS: 'todas_las_ventas',
    SOLO_FACTURADAS: 'solo_facturadas'
};

/**
 * Normaliza el identificador de régimen tributario.
 * @param {string} regimen
 * @returns {'regimen_general' | 'simplificado_control_interno'}
 */
function normalizarRegimen(regimen) {
    return regimen === REGIMENES_TRIBUTARIOS.GENERAL
        ? REGIMENES_TRIBUTARIOS.GENERAL
        : REGIMENES_TRIBUTARIOS.SIMPLIFICADO;
}

/**
 * Valida si una venta puede registrarse con factura fiscal de acuerdo con las
 * reglas del negocio, el régimen activo y los permisos del operador y la estación.
 * Lanza un Error con mensaje claro y descriptivo si la operación es rechazada.
 * 
 * @param {Object} params
 * @param {boolean} params.conFactura - Si el comprobante solicitado es factura
 * @param {string} params.regimen - Régimen activo del negocio
 * @param {number|boolean} params.emiteFacturaConfig - Bandera en configuracion_negocio
 * @param {Object} [params.operador] - Datos del cajero { nombre, puede_registrar_respaldo_fiscal }
 * @param {Object} [params.caja] - Datos de la estación { caja_fisica_nombre, habilita_respaldo_fiscal }
 */
function validarRegimenYPermisosVenta({
    conFactura,
    regimen,
    emiteFacturaConfig = 1,
    operador = {},
    caja = {}
}) {
    if (!conFactura) return true;

    const regimenNorm = normalizarRegimen(regimen);

    if (regimenNorm === REGIMENES_TRIBUTARIOS.SIMPLIFICADO) {
        throw new Error(
            'Operación no permitida: El negocio opera en Régimen Simplificado / Control Interno y no puede emitir ni registrar ventas con factura fiscal.'
        );
    }

    if (Number(emiteFacturaConfig ?? 1) !== 1) {
        throw new Error(
            'Operación no permitida: La emisión/registro de facturas en ventas está deshabilitada en la configuración contable del negocio.'
        );
    }

    if (operador && Number(operador.puede_registrar_respaldo_fiscal ?? 1) !== 1) {
        throw new Error(
            `Permiso denegado: El usuario "${operador.nombre || 'operador'}" no tiene autorización para registrar ventas con factura fiscal.`
        );
    }

    if (caja && Number(caja.habilita_respaldo_fiscal ?? 1) !== 1) {
        throw new Error(
            `Operación no permitida: La estación "${caja.caja_fisica_nombre || 'estación'}" tiene deshabilitado el registro de respaldo fiscal.`
        );
    }

    return true;
}

/**
 * Valida los permisos de respaldo fiscal para un egreso / gasto de caja.
 * 
 * @param {Object} params
 * @param {boolean} params.conFactura - Si el egreso cuenta con respaldo de factura
 * @param {number|boolean} params.usaRespaldoComprasEgresos - Bandera en configuracion_negocio
 * @param {Object} [params.ejecutor] - Usuario que registra { nombre, puede_registrar_respaldo_fiscal }
 * @param {Object} [params.caja] - Datos de la estación { caja_fisica_nombre, habilita_respaldo_fiscal }
 */
function validarRegimenYPermisosEgreso({
    conFactura,
    usaRespaldoComprasEgresos = 1,
    ejecutor = {},
    caja = {}
}) {
    if (!conFactura) return true;

    if (Number(usaRespaldoComprasEgresos ?? 1) !== 1) {
        throw new Error(
            'Operación no permitida: El registro de respaldo fiscal en compras y egresos está deshabilitado en la configuración del negocio.'
        );
    }

    if (ejecutor && Number(ejecutor.puede_registrar_respaldo_fiscal ?? 1) !== 1) {
        throw new Error(
            `Permiso denegado: El usuario "${ejecutor.nombre || 'operador'}" no tiene autorización para registrar facturas en egresos.`
        );
    }

    if (caja && Number(caja.habilita_respaldo_fiscal ?? 1) !== 1) {
        throw new Error(
            `Operación no permitida: La estación "${caja.caja_fisica_nombre || 'estación'}" tiene deshabilitado el registro de respaldo fiscal.`
        );
    }

    return true;
}

/**
 * Calcula el snapshot fiscal para un movimiento de venta (ingreso por venta).
 * 
 * @param {Object} params
 * @param {number} params.montoTotal - Monto neto cobrado en la venta
 * @param {boolean} params.conFactura - Indica si se emitió factura
 * @param {string} params.regimen - Régimen configurado ('regimen_general' | 'simplificado_control_interno')
 * @param {number} [params.ivaPorcentaje=13] - Alícuota de IVA
 * @param {number} [params.itPorcentaje=3] - Alícuota de IT
 * @param {string} [params.itBase='todas_las_ventas'] - 'todas_las_ventas' | 'solo_facturadas'
 * @returns {{
 *   regimenTributario: string,
 *   tipoComprobante: 'factura' | 'recibo',
 *   ivaPorcentaje: number,
 *   itPorcentaje: number,
 *   ivaMonto: number,
 *   itMonto: number
 * }}
 */
function calcularSnapshotFiscalVenta({
    montoTotal,
    conFactura,
    regimen,
    ivaPorcentaje = 13,
    itPorcentaje = 3,
    itBase = BASES_IT.TODAS_LAS_VENTAS
}) {
    const regimenNorm = normalizarRegimen(regimen);
    const tipoComprobante = conFactura ? 'factura' : 'recibo';
    const monto = redondear2(montoTotal || 0);

    const ivaPorcCfg = Number(ivaPorcentaje ?? 13);
    const itPorcCfg = Number(itPorcentaje ?? 3);
    const itBaseCfg = itBase === BASES_IT.SOLO_FACTURADAS ? BASES_IT.SOLO_FACTURADAS : BASES_IT.TODAS_LAS_VENTAS;

    let ivaPorcSnapshot = 0;
    let itPorcSnapshot = 0;
    let ivaMontoSnapshot = 0;
    let itMontoSnapshot = 0;

    if (regimenNorm === REGIMENES_TRIBUTARIOS.GENERAL) {
        if (tipoComprobante === 'factura') {
            ivaPorcSnapshot = ivaPorcCfg;
            ivaMontoSnapshot = redondear2(monto * (ivaPorcCfg / 100));
        }
        if (itBaseCfg === BASES_IT.TODAS_LAS_VENTAS || tipoComprobante === 'factura') {
            itPorcSnapshot = itPorcCfg;
            itMontoSnapshot = redondear2(monto * (itPorcCfg / 100));
        }
    }

    return {
        regimenTributario: regimenNorm,
        tipoComprobante,
        ivaPorcentaje: ivaPorcSnapshot,
        itPorcentaje: itPorcSnapshot,
        ivaMonto: ivaMontoSnapshot,
        itMonto: itMontoSnapshot
    };
}

/**
 * Calcula el snapshot fiscal para un movimiento de egreso de caja.
 * En egresos facturados de régimen general se computa el Crédito Fiscal IVA.
 * 
 * @param {Object} params
 * @param {number} params.montoTotal - Monto del egreso
 * @param {boolean} params.conFactura - Indica si cuenta con factura
 * @param {string} params.regimen - Régimen activo del negocio
 * @param {number} [params.ivaPorcentaje=13] - Alícuota de IVA
 * @returns {{
 *   regimenTributario: string,
 *   tipoComprobante: string,
 *   ivaPorcentaje: number,
 *   ivaMonto: number
 * }}
 */
function calcularSnapshotFiscalEgreso({
    montoTotal,
    conFactura,
    regimen,
    ivaPorcentaje = 13,
    tipoComprobante = null
}) {
    const regimenNorm = normalizarRegimen(regimen);
    const compFinal = conFactura
        ? 'factura'
        : (tipoComprobante === 'sin_respaldo' ? 'sin_respaldo' : 'recibo');
    const monto = redondear2(montoTotal || 0);

    const ivaPorcCfg = Number(ivaPorcentaje ?? 13);
    const ivaPorcSnapshot = (regimenNorm === REGIMENES_TRIBUTARIOS.GENERAL && compFinal === 'factura')
        ? ivaPorcCfg
        : 0;
    const ivaMontoSnapshot = ivaPorcSnapshot > 0
        ? redondear2(monto * (ivaPorcSnapshot / 100))
        : 0;

    return {
        regimenTributario: regimenNorm,
        tipoComprobante: compFinal,
        ivaPorcentaje: ivaPorcSnapshot,
        ivaMonto: ivaMontoSnapshot
    };
}

module.exports = {
    REGIMENES_TRIBUTARIOS,
    BASES_IT,
    normalizarRegimen,
    validarRegimenYPermisosVenta,
    validarRegimenYPermisosEgreso,
    calcularSnapshotFiscalVenta,
    calcularSnapshotFiscalEgreso
};
