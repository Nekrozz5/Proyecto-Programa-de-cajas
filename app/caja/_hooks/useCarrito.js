'use client';

import { useState, useRef, useMemo, useCallback } from 'react';

/**
 * Hook para la gestión integral del estado del carrito de ventas en el POS.
 * Maneja adición con modificadores, cantidades editables por teclado con debounce,
 * límites de inventario físico y cálculo exacto de subtotales y descuentos.
 */
export function useCarrito({ onError, onLimpiarAlertas } = {}) {
    const [carrito, setCarrito] = useState([]);
    const [descuentoVenta, setDescuentoVenta] = useState('');
    const typingTimers = useRef({});

    const emitError = useCallback((msg) => {
        if (typeof onError === 'function') onError(msg);
    }, [onError]);

    const emitLimpiarAlertas = useCallback(() => {
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();
    }, [onLimpiarAlertas]);

    /**
     * Agrega un producto con sus opciones de modificadores seleccionadas al carrito.
     */
    const agregarAlCarrito = useCallback((prod, opcionesElegidas = []) => {
        emitLimpiarAlertas();
        const sortedModIds = opcionesElegidas.map((o) => o.id).sort((a, b) => a - b);
        const itemKey = `${prod.id}__${sortedModIds.join('_')}`;

        const sumaAdicionales = opcionesElegidas.reduce(
            (sum, o) => sum + (Number(o.precio_adicional) || 0),
            0
        );
        const precioUnitario = Math.round((Number(prod.precio) + sumaAdicionales) * 100) / 100;

        setCarrito((prev) => {
            const existe = prev.find((item) => (item.itemKey || String(item.productoId)) === itemKey);
            const cantidadActual = existe ? (Number(existe.cantidad) || 0) : 0;
            const nuevaCantidad = cantidadActual + 1;
            const maxDisponible = (prod.tipo_inventario !== 'libre' && prod.unidades_disponibles !== null)
                ? prod.unidades_disponibles
                : Infinity;

            const totalProdEnCarrito = prev
                .filter((it) => it.productoId === prod.id)
                .reduce((sum, it) => sum + (Number(it.cantidad) || 0), 0);

            if (maxDisponible !== Infinity && (totalProdEnCarrito + 1) > maxDisponible) {
                emitError(`⚠️ Stock máximo alcanzado para "${prod.nombre}" (${maxDisponible} productos disponibles en total).`);
                return prev;
            }

            if (existe) {
                return prev.map((item) =>
                    (item.itemKey || String(item.productoId)) === itemKey
                        ? { ...item, cantidad: nuevaCantidad, cantidadTexto: String(nuevaCantidad), maximoDisponible: maxDisponible }
                        : item
                );
            }

            return [
                ...prev,
                {
                    itemKey,
                    productoId: prod.id,
                    nombre: prod.nombre,
                    precio: precioUnitario,
                    precioBase: prod.precio,
                    cantidad: 1,
                    cantidadTexto: '1',
                    maximoDisponible: maxDisponible,
                    modificadores: opcionesElegidas
                }
            ];
        });
    }, [emitError, emitLimpiarAlertas]);

    /**
     * Incrementa o decrementa la cantidad de un ítem existente en el pedido.
     */
    const cambiarCantidad = useCallback((itemKey, delta, productos = []) => {
        emitLimpiarAlertas();
        if (typingTimers.current[itemKey]) {
            clearTimeout(typingTimers.current[itemKey]);
            delete typingTimers.current[itemKey];
        }

        setCarrito((prev) => {
            const item = prev.find((i) => (i.itemKey || String(i.productoId)) === String(itemKey));
            if (!item) return prev;

            const prodOriginal = productos.find((p) => p.id === item.productoId);
            const maxDisponible = (prodOriginal && prodOriginal.tipo_inventario !== 'libre' && prodOriginal.unidades_disponibles !== null)
                ? prodOriginal.unidades_disponibles
                : (item.maximoDisponible ?? Infinity);

            const nuevaCantidad = (Number(item.cantidad) || 0) + delta;

            if (nuevaCantidad <= 0) {
                return prev.filter((i) => (i.itemKey || String(i.productoId)) !== String(itemKey));
            }

            const totalProdEnCarrito = prev
                .filter((it) => it.productoId === item.productoId)
                .reduce((sum, it) => (it.itemKey || String(it.productoId)) === String(itemKey) ? sum + nuevaCantidad : sum + (Number(it.cantidad) || 0), 0);

            if (maxDisponible !== Infinity && totalProdEnCarrito > maxDisponible) {
                emitError(`⚠️ Límite alcanzado: La cantidad máxima disponible para "${item.nombre}" es de ${maxDisponible} productos.`);
                return prev;
            }

            return prev.map((i) =>
                (i.itemKey || String(i.productoId)) === String(itemKey)
                    ? { ...i, cantidad: nuevaCantidad, cantidadTexto: String(nuevaCantidad), maximoDisponible: maxDisponible }
                    : i
            );
        });
    }, [emitError, emitLimpiarAlertas]);

    /**
     * Valida y fija la cantidad tras culminar la edición por teclado.
     */
    const finalizarEdicionCantidad = useCallback((itemKey, valor, productos = []) => {
        if (typingTimers.current[itemKey]) {
            clearTimeout(typingTimers.current[itemKey]);
            delete typingTimers.current[itemKey];
        }

        setCarrito((prev) => {
            const item = prev.find((i) => (i.itemKey || String(i.productoId)) === String(itemKey));
            if (!item) return prev;

            const prodOriginal = productos.find((p) => p.id === item.productoId);
            const maxDisponible = (prodOriginal && prodOriginal.tipo_inventario !== 'libre' && prodOriginal.unidades_disponibles !== null)
                ? prodOriginal.unidades_disponibles
                : (item.maximoDisponible ?? Infinity);

            if (valor === '' || valor === null || valor === undefined) {
                return prev.map((i) =>
                    (i.itemKey || String(i.productoId)) === String(itemKey)
                        ? { ...i, cantidadTexto: '', cantidad: 0 }
                        : i
                );
            }

            const num = parseInt(valor, 10);

            if (isNaN(num) || num <= 0) {
                emitError(`Ingresa una cantidad numérica mayor a 0 para "${item.nombre}".`);
                return prev.map((i) =>
                    (i.itemKey || String(i.productoId)) === String(itemKey)
                        ? { ...i, cantidadTexto: '', cantidad: 0 }
                        : i
                );
            }

            const totalProdEnCarrito = prev
                .filter((it) => it.productoId === item.productoId)
                .reduce((sum, it) => (it.itemKey || String(it.productoId)) === String(itemKey) ? sum + num : sum + (Number(it.cantidad) || 0), 0);

            if (maxDisponible !== Infinity && totalProdEnCarrito > maxDisponible) {
                emitError(`⚠️ Cantidad máxima superada: Para "${item.nombre}" el límite máximo disponible es de ${maxDisponible} productos.`);
                return prev.map((i) =>
                    (i.itemKey || String(i.productoId)) === String(itemKey)
                        ? { ...i, cantidadTexto: '', cantidad: 0 }
                        : i
                );
            }

            emitLimpiarAlertas();
            return prev.map((i) =>
                (i.itemKey || String(i.productoId)) === String(itemKey)
                    ? { ...i, cantidad: num, cantidadTexto: String(num), maximoDisponible: maxDisponible }
                    : i
            );
        });
    }, [emitError, emitLimpiarAlertas]);

    /**
     * Refleja de inmediato el texto tipeado para fluidez total del teclado.
     */
    const handleInputCantidad = useCallback((itemKey, rawValor, productos = []) => {
        emitLimpiarAlertas();

        setCarrito((prev) =>
            prev.map((item) =>
                (item.itemKey || String(item.productoId)) === String(itemKey)
                    ? { ...item, cantidadTexto: rawValor }
                    : item
            )
        );

        if (typingTimers.current[itemKey]) {
            clearTimeout(typingTimers.current[itemKey]);
        }

        typingTimers.current[itemKey] = setTimeout(() => {
            finalizarEdicionCantidad(itemKey, rawValor, productos);
        }, 500);
    }, [emitLimpiarAlertas, finalizarEdicionCantidad]);

    /**
     * Elimina un ítem específico del carrito.
     */
    const eliminarDelCarrito = useCallback((itemKey) => {
        emitLimpiarAlertas();
        if (typingTimers.current[itemKey]) {
            clearTimeout(typingTimers.current[itemKey]);
            delete typingTimers.current[itemKey];
        }
        setCarrito((prev) => prev.filter((i) => (i.itemKey || String(i.productoId)) !== String(itemKey)));
    }, [emitLimpiarAlertas]);

    /**
     * Vacía completamente el carrito y limpia los timers pendientes.
     */
    const vaciarCarrito = useCallback(() => {
        Object.values(typingTimers.current).forEach((t) => clearTimeout(t));
        typingTimers.current = {};
        setCarrito([]);
        setDescuentoVenta('');
    }, []);

    // Cálculos monetarios y validaciones reactivas
    const subtotalBrutoCarrito = useMemo(() => {
        return Number(
            carrito.reduce((acc, item) => acc + (Number(item.precio) || 0) * (Number(item.cantidad) || 0), 0).toFixed(2)
        );
    }, [carrito]);

    const descuentoAplicadoNum = useMemo(() => {
        return descuentoVenta !== '' && !isNaN(Number(descuentoVenta))
            ? Number(Number(descuentoVenta).toFixed(2))
            : 0;
    }, [descuentoVenta]);

    const descuentoInvalido = useMemo(() => {
        return descuentoAplicadoNum < 0 || (descuentoAplicadoNum > 0 && descuentoAplicadoNum >= subtotalBrutoCarrito);
    }, [descuentoAplicadoNum, subtotalBrutoCarrito]);

    const totalCarrito = useMemo(() => {
        return descuentoInvalido
            ? subtotalBrutoCarrito
            : Math.max(0, Number((subtotalBrutoCarrito - descuentoAplicadoNum).toFixed(2)));
    }, [descuentoInvalido, subtotalBrutoCarrito, descuentoAplicadoNum]);

    const hayCantidadInvalida = useMemo(() => {
        return carrito.some((i) => !i.cantidad || Number(i.cantidad) <= 0);
    }, [carrito]);

    return {
        carrito,
        setCarrito,
        descuentoVenta,
        setDescuentoVenta,
        agregarAlCarrito,
        cambiarCantidad,
        handleInputCantidad,
        finalizarEdicionCantidad,
        eliminarDelCarrito,
        vaciarCarrito,
        subtotalBrutoCarrito,
        descuentoAplicadoNum,
        descuentoInvalido,
        totalCarrito,
        hayCantidadInvalida
    };
}
