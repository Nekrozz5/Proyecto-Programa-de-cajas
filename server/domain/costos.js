/**
 * server/domain/costos.js
 * Funciones puras de cálculo de costos, inventario y prorrateo de descuentos.
 * Regla de negocio: Costo Promedio Ponderado según NIC 2 y prorrateo exacto con ajuste en última línea.
 * Sin dependencias de base de datos ni SQL.
 */

function redondear2(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula el Costo Promedio Ponderado (NIC 2) tras una compra o reabastecimiento.
 * @param {Object} params
 * @param {number} params.stockActual - Stock actual en almacén (unidades o cantidad métrica)
 * @param {number} params.costoActual - Costo unitario actual (CPP previo)
 * @param {number} params.cantidadComprada - Cantidad comprada (> 0)
 * @param {number} params.costoTotalCompra - Importe total abonado por la compra
 * @param {number} [params.decimales=4] - Precisión decimal requerida (4 para artículos directos, 6 para insumos métricos g/ml)
 * @returns {{ stockAnterior: number, nuevoStock: number, costoUnitarioCompra: number, costoPromedioResultante: number }}
 */
function calcularCostoPromedioPonderado({
    stockActual = 0,
    costoActual = 0,
    cantidadComprada,
    costoTotalCompra,
    decimales = 4
}) {
    const cantVal = Number(cantidadComprada);
    if (!Number.isFinite(cantVal) || cantVal <= 0) {
        throw new Error('La cantidad comprada debe ser un número finito mayor a 0 para calcular el CPP.');
    }
    const costoVal = Number(costoTotalCompra);
    if (!Number.isFinite(costoVal) || costoVal < 0) {
        throw new Error('El costo total de compra debe ser un número finito no negativo.');
    }

    const stockAnterior = Math.max(0, Number(stockActual || 0));
    const valorAnterior = stockAnterior * Number(costoActual || 0);
    const nuevoStock = Number((stockAnterior + cantVal).toFixed(4));

    // Fórmula NIC 2: si el nuevo stock es > 0, pondera el valor total; si venía de cero o negativo, toma el costo de compra
    const nuevoCostoUnitario = nuevoStock > 0
        ? (valorAnterior + costoVal) / (stockAnterior + cantVal)
        : (costoVal / cantVal);

    const cppResultante = Number(nuevoCostoUnitario.toFixed(decimales));
    const costoUnitarioCompra = Number((costoVal / cantVal).toFixed(decimales));

    return {
        stockAnterior,
        nuevoStock,
        costoUnitarioCompra,
        costoPromedioResultante: cppResultante
    };
}

/**
 * Prorratea el descuento total de un ticket entre cada una de sus líneas de detalle.
 * La última línea absorbe el centavo residual por redondeo para asegurar que:
 * SUM(ingreso_neto) === montoNeto y SUM(descuento_prorrateado) === descuentoTotal.
 * 
 * @param {Object} params
 * @param {number} params.subtotalBruto - Suma de subtotales brutos del ticket
 * @param {number} params.descuentoTotal - Descuento global otorgado en la venta
 * @param {number} params.montoNeto - Monto total neto cobrado al cliente
 * @param {Array<Object>} params.lineas - Arreglo de líneas con { subtotal, cantidad, costo_unitario, ... }
 * @returns {Array<Object>} Líneas enriquecidas con { subtotal, descuento_prorrateado, ingreso_neto, costo_total, ganancia_neta }
 */
function prorratearDescuentoTicket({
    subtotalBruto = 0,
    descuentoTotal = 0,
    montoNeto = 0,
    lineas = []
}) {
    const subBrutoNum = Number(subtotalBruto || 0);
    const descMov = Number(descuentoTotal || 0);
    const montoNetoMov = redondear2(montoNeto);
    let acumuladoNeto = 0;

    return lineas.map((linea, index) => {
        const subLinea = redondear2(linea.subtotal || 0);
        let ingresoNetoLinea;

        if (descMov <= 0 || subBrutoNum <= 0) {
            ingresoNetoLinea = redondear2(subLinea);
        } else if (index === lineas.length - 1) {
            ingresoNetoLinea = redondear2(montoNetoMov - acumuladoNeto);
        } else {
            const descLinea = redondear2(descMov * (subLinea / subBrutoNum));
            ingresoNetoLinea = redondear2(subLinea - descLinea);
            acumuladoNeto = redondear2(acumuladoNeto + ingresoNetoLinea);
        }

        const descuentoProrrateado = redondear2(subLinea - ingresoNetoLinea);
        const costoTotalLinea = redondear2(Number(linea.cantidad || 0) * Number(linea.costo_unitario || 0));
        const gananciaLinea = redondear2(ingresoNetoLinea - costoTotalLinea);

        return {
            ...linea,
            subtotal: subLinea,
            descuento_prorrateado: descuentoProrrateado,
            ingreso_neto: ingresoNetoLinea,
            costo_total: costoTotalLinea,
            ganancia_neta: gananciaLinea
        };
    });
}

module.exports = {
    redondear2,
    calcularCostoPromedioPonderado,
    prorratearDescuentoTicket
};
