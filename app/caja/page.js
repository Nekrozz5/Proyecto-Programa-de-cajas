'use client';

import { useState, useEffect, useRef } from 'react';

export default function CajaPage() {
    const [cargando, setCargando] = useState(true);
    const [seccionActiva, setSeccionActiva] = useState('pos'); // 'pos' | 'egresos' | 'cierre' | 'movimientos'

    const typingTimers = useRef({});

    const [cajaAbierta, setCajaAbierta] = useState(null);
    const [cajasFisicas, setCajasFisicas] = useState([]);
    const [cajaFisicaSeleccionada, setCajaFisicaSeleccionada] = useState('');
    const [historialCajas, setHistorialCajas] = useState([]);
    const [productos, setProductos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [movimientos, setMovimientos] = useState([]);

    // Estado de sesión del operador (Login previo obligatorio)
    const [usuarioActual, setUsuarioActual] = useState(null);
    const [loginUsuarioId, setLoginUsuarioId] = useState('');
    const [loginPin, setLoginPin] = useState('');
    const [modoLoginManualCaja, setModoLoginManualCaja] = useState(false);
    const [loginNombreManualCaja, setLoginNombreManualCaja] = useState('');
    const [mostrarFormPin, setMostrarFormPin] = useState(false);
    const [pinActualCajero, setPinActualCajero] = useState('');
    const [nuevoPinCajero, setNuevoPinCajero] = useState('');

    // Estado para abrir caja
    const [montoInicial, setMontoInicial] = useState('100');

    // Estado del carrito y cobro
    const [carrito, setCarrito] = useState([]);
    const [metodoPago, setMetodoPago] = useState('efectivo');
    const [montoRecibido, setMontoRecibido] = useState('');
    const [cambioManual, setCambioManual] = useState('');
    const [descripcionVenta, setDescripcionVenta] = useState('Venta en mostrador');
    const [ultimoTicket, setUltimoTicket] = useState(null);

    // Estado para egresos
    const [montoEgreso, setMontoEgreso] = useState('');
    const [motivoEgreso, setMotivoEgreso] = useState('');
    const [metodoEgreso, setMetodoEgreso] = useState('efectivo');

    // Estado para inyección / reposición de efectivo (cambio / sencillo)
    const [montoIngresoEfectivo, setMontoIngresoEfectivo] = useState('');
    const [motivoIngresoEfectivo, setMotivoIngresoEfectivo] = useState('');

    // Estado para cierre ciego
    const [efectivoReal, setEfectivoReal] = useState('');
    const [confirmacionCierreCiego, setConfirmacionCierreCiego] = useState(null);

    // Estado para personalización de complementos / modificadores en el POS
    const [productoParaPersonalizar, setProductoParaPersonalizar] = useState(null);
    const [opcionesSeleccionadas, setOpcionesSeleccionadas] = useState({});

    // Mensajes de feedback
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    async function cargarDatos() {
        try {
            setCargando(true);
            const res = await fetch('/api/caja');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al cargar datos');

            if (!data.configuracionNegocio || Number(data.configuracionNegocio.configurado) === 0 || !data.sistemaInstalado) {
                window.location.href = '/';
                return;
            }

            setCajaAbierta(data.cajaAbierta);
            setCajasFisicas(data.cajasFisicas || []);
            setHistorialCajas(data.historialCajas || []);
            setProductos(data.productos || []);
            setCategorias(data.categorias || []);
            setUsuarios(data.usuarios || []);
            setMovimientos(data.cajaAbierta ? (data.movimientos || []) : []);
            if (data.usuarioSesion) {
                setUsuarioActual(data.usuarioSesion);
            } else {
                setUsuarioActual(null);
            }

            if (data.usuarios?.length > 0 && !loginUsuarioId) {
                setLoginUsuarioId(String(data.usuarios[0].id));
            }
            // Sin cajeros en la lista pública (p. ej. solo hay administradores): login escribiendo el nombre
            if (!data.usuarioSesion && (data.usuarios || []).length === 0) {
                setModoLoginManualCaja(true);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    }

    useEffect(() => {
        cargarDatos();
    }, []);

    // Cierre automático de sesión por inactividad si el usuario en caja es developer o admin (15 minutos)
    useEffect(() => {
        if (!usuarioActual || !['developer', 'superadmin', 'admin'].includes(usuarioActual.rol)) return;

        const MINUTOS_INACTIVIDAD = 15;
        const TIEMPO_LIMITE_MS = MINUTOS_INACTIVIDAD * 60 * 1000;
        let timerInactividad = null;

        const reiniciarTemporizador = () => {
            if (timerInactividad) clearTimeout(timerInactividad);
            timerInactividad = setTimeout(async () => {
                try {
                    await fetch('/api/caja', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accion: 'logout' })
                    });
                } catch (_) {}
                setUsuarioActual(null);
                setError(`Tu sesión de ${usuarioActual.rol} se ha cerrado automáticamente tras ${MINUTOS_INACTIVIDAD} minutos de inactividad por seguridad.`);
            }, TIEMPO_LIMITE_MS);
        };

        const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        eventos.forEach((ev) => window.addEventListener(ev, reiniciarTemporizador, { passive: true }));
        reiniciarTemporizador();

        return () => {
            if (timerInactividad) clearTimeout(timerInactividad);
            eventos.forEach((ev) => window.removeEventListener(ev, reiniciarTemporizador));
        };
    }, [usuarioActual]);

    function limpiarAlertas() {
        setMensaje(null);
        setError(null);
    }

    async function handleLogin(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const payload = modoLoginManualCaja
                ? {
                    accion: 'login',
                    nombreUsuario: loginNombreManualCaja.trim(),
                    pin: loginPin
                }
                : {
                    accion: 'login',
                    usuarioId: Number(loginUsuarioId),
                    pin: loginPin
                };

            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setUsuarioActual(data.usuario);
            setLoginPin('');
            setLoginNombreManualCaja('');
            setSeccionActiva('pos');
            await cargarDatos();
            setMensaje(`Sesión iniciada como ${data.usuario.nombre} (${data.usuario.rol}).`);
        } catch (err) {
            setLoginPin('');
            setError(err.message);
        }
    }

    async function cerrarSesion() {
        limpiarAlertas();
        await fetch('/api/caja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'logout' })
        }).catch((err) => {
            console.error('Error al cerrar sesión:', err);
        });
        setUsuarioActual(null);
        setCarrito([]);
        setCategoriasSeleccionadas([]);
        setSeccionActiva('pos');
    }

    async function handleCambiarMiPin(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'cambiar_password',
                    usuarioObjetivoId: usuarioActual.id,
                    pinActual: pinActualCajero,
                    nuevoPin: nuevoPinCajero
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMensaje('Tu contraseña / PIN se actualizó correctamente.');
            setMostrarFormPin(false);
            setPinActualCajero('');
            setNuevoPinCajero('');
        } catch (err) {
            setError(err.message);
        }
    }

    function iniciarAgregarAlCarrito(prod) {
        limpiarAlertas();
        if (prod.grupos_modificadores && prod.grupos_modificadores.length > 0) {
            const inicial = {};
            for (const g of prod.grupos_modificadores) {
                if (g.tipo_seleccion === 'unica') {
                    const opDef = g.opciones.find((o) => o.es_default) || (g.es_obligatorio && g.opciones.length > 0 ? g.opciones[0] : null);
                    if (opDef) inicial[g.id] = opDef.id;
                } else {
                    const opsDef = g.opciones.filter((o) => o.es_default).map((o) => o.id);
                    inicial[g.id] = opsDef;
                }
            }
            setOpcionesSeleccionadas(inicial);
            setProductoParaPersonalizar(prod);
        } else {
            ejecutarAgregarAlCarrito(prod, []);
        }
    }

    function ejecutarAgregarAlCarrito(prod, opcionesElegidas = []) {
        limpiarAlertas();
        const sortedModIds = opcionesElegidas.map((o) => o.id).sort((a, b) => a - b);
        const itemKey = `${prod.id}__${sortedModIds.join('_')}`;

        const sumaAdicionales = opcionesElegidas.reduce((sum, o) => sum + (Number(o.precio_adicional) || 0), 0);
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
                setError(`⚠️ Stock máximo alcanzado para "${prod.nombre}" (${maxDisponible} productos disponibles en total).`);
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
    }

    function calcularTotalPersonalizado() {
        if (!productoParaPersonalizar) return 0;
        let total = Number(productoParaPersonalizar.precio) || 0;
        for (const grupo of productoParaPersonalizar.grupos_modificadores || []) {
            const sel = opcionesSeleccionadas[grupo.id];
            if (grupo.tipo_seleccion === 'unica') {
                const op = grupo.opciones.find((o) => o.id === sel);
                if (op) total += Number(op.precio_adicional) || 0;
            } else if (Array.isArray(sel)) {
                for (const opId of sel) {
                    const op = grupo.opciones.find((o) => o.id === opId);
                    if (op) total += Number(op.precio_adicional) || 0;
                }
            }
        }
        return Math.round(total * 100) / 100;
    }

    function confirmarPersonalizacionYAgregar() {
        if (!productoParaPersonalizar) return;

        for (const grupo of productoParaPersonalizar.grupos_modificadores || []) {
            if (grupo.es_obligatorio) {
                const sel = opcionesSeleccionadas[grupo.id];
                const vacio = grupo.tipo_seleccion === 'unica' ? !sel : !Array.isArray(sel) || sel.length === 0;
                if (vacio) {
                    setError(`Debes elegir una opción obligatoria para "${grupo.nombre}".`);
                    return;
                }
            }
        }

        const opcionesElegidas = [];
        for (const grupo of productoParaPersonalizar.grupos_modificadores || []) {
            const sel = opcionesSeleccionadas[grupo.id];
            if (grupo.tipo_seleccion === 'unica') {
                const op = grupo.opciones.find((o) => o.id === sel);
                if (op) opcionesElegidas.push(op);
            } else if (Array.isArray(sel)) {
                for (const opId of sel) {
                    const op = grupo.opciones.find((o) => o.id === opId);
                    if (op) opcionesElegidas.push(op);
                }
            }
        }

        const prod = productoParaPersonalizar;
        setProductoParaPersonalizar(null);
        setOpcionesSeleccionadas({});
        ejecutarAgregarAlCarrito(prod, opcionesElegidas);
    }

    function cambiarCantidad(itemKey, delta) {
        limpiarAlertas();
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
                setError(`⚠️ Límite alcanzado: La cantidad máxima disponible para "${item.nombre}" es de ${maxDisponible} productos.`);
                return prev;
            }

            return prev.map((i) =>
                (i.itemKey || String(i.productoId)) === String(itemKey)
                    ? { ...i, cantidad: nuevaCantidad, cantidadTexto: String(nuevaCantidad), maximoDisponible: maxDisponible }
                    : i
            );
        });
    }

    function handleInputCantidad(itemKey, rawValor) {
        limpiarAlertas();

        // 1. Reflejar de inmediato el texto tipeado para fluidez total del teclado
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

        // 2. Al terminar de escribir (pausa de 500ms) se valida y actualiza
        typingTimers.current[itemKey] = setTimeout(() => {
            finalizarEdicionCantidad(itemKey, rawValor);
        }, 500);
    }

    function finalizarEdicionCantidad(itemKey, valor) {
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
                setError(`Ingresa una cantidad numérica mayor a 0 para "${item.nombre}".`);
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
                setError(`⚠️ Cantidad máxima superada: Para "${item.nombre}" el límite máximo disponible es de ${maxDisponible} productos.`);
                return prev.map((i) =>
                    (i.itemKey || String(i.productoId)) === String(itemKey)
                        ? { ...i, cantidadTexto: '', cantidad: 0 }
                        : i
                );
            }

            limpiarAlertas();
            return prev.map((i) =>
                (i.itemKey || String(i.productoId)) === String(itemKey)
                    ? { ...i, cantidad: num, cantidadTexto: String(num), maximoDisponible: maxDisponible }
                    : i
            );
        });
    }

    function eliminarDelCarrito(itemKey) {
        limpiarAlertas();
        if (typingTimers.current[itemKey]) {
            clearTimeout(typingTimers.current[itemKey]);
            delete typingTimers.current[itemKey];
        }
        setCarrito((prev) => prev.filter((i) => (i.itemKey || String(i.productoId)) !== String(itemKey)));
    }

    const totalCarrito = Number(
        carrito.reduce((acc, item) => acc + (Number(item.precio) || 0) * (Number(item.cantidad) || 0), 0).toFixed(2)
    );

    const hayCantidadInvalida = carrito.some((i) => !i.cantidad || Number(i.cantidad) <= 0);

    const montoRecibidoNum = montoRecibido !== '' ? Number(montoRecibido) : 0;
    const faltaDineroRecibido = metodoPago === 'efectivo' && montoRecibido !== '' && montoRecibidoNum < totalCarrito;
    const cambioCalculadoAuto =
        metodoPago === 'efectivo' && montoRecibido !== '' && montoRecibidoNum >= totalCarrito
            ? Number((montoRecibidoNum - totalCarrito).toFixed(2))
            : 0;
    const cambioQueSaleDeCaja =
        cambioManual !== '' ? Number(cambioManual) : cambioCalculadoAuto;

    // Recalcular cambio automáticamente si cambia el total del carrito o el monto recibido
    useEffect(() => {
        if (montoRecibido !== '') {
            const mNum = Number(montoRecibido);
            if (mNum >= totalCarrito) {
                setCambioManual(String(Number((mNum - totalCarrito).toFixed(2))));
            } else {
                setCambioManual('');
            }
        }
    }, [totalCarrito, montoRecibido]);

    function handleChangeMontoRecibido(valor) {
        setMontoRecibido(valor);
        if (valor !== '' && Number(valor) >= totalCarrito) {
            setCambioManual(String(Number((Number(valor) - totalCarrito).toFixed(2))));
        } else if (valor === '') {
            setCambioManual('');
        }
    }

    function toggleFiltroCategoria(nombreCat) {
        const nomLower = nombreCat.toLowerCase();
        setCategoriasSeleccionadas((prev) => {
            const existe = prev.some((c) => c.toLowerCase() === nomLower);
            if (existe) {
                return prev.filter((c) => c.toLowerCase() !== nomLower);
            } else {
                return [...prev, nombreCat];
            }
        });
    }

    function resetearFiltroCategorias() {
        setCategoriasSeleccionadas([]);
    }

    const listaCategoriasDisponibles = (() => {
        const catsMap = new Map();
        (categorias || []).forEach((c) => {
            if (c.nombre && c.nombre.trim()) {
                const nomLimpio = c.nombre.trim();
                catsMap.set(nomLimpio.toLowerCase(), nomLimpio);
            }
        });
        (productos || []).forEach((p) => {
            if (p.categoria && typeof p.categoria === 'string') {
                p.categoria.split(',').forEach((c) => {
                    const nomLimpio = c.trim();
                    if (nomLimpio && nomLimpio.toLowerCase() !== 'todas') {
                        if (!catsMap.has(nomLimpio.toLowerCase())) {
                            catsMap.set(nomLimpio.toLowerCase(), nomLimpio);
                        }
                    }
                });
            }
        });
        return Array.from(catsMap.values()).sort((a, b) => a.localeCompare(b));
    })();

    const productosSinCategoria = productos.filter((p) => !p.categoria || p.categoria.trim() === '');

    const productosFiltrados = productos.filter((p) => {
        // Si es un combo con vigencia y no está vigente, no mostrarlo en el mostrador del POS
        if (p.tipo_inventario === 'combo' && p.esta_vigente === false) {
            return false;
        }

        if (categoriasSeleccionadas.length === 0) return true;
        const catsProd = (p.categoria || '')
            .split(',')
            .map((c) => c.trim().toLowerCase())
            .filter(Boolean);

        return categoriasSeleccionadas.some((catSel) => {
            const catSelLower = catSel.toLowerCase();
            if (catSelLower === 'sin categoría' || catSelLower === 'sin categoria') {
                return catsProd.length === 0;
            }
            return catsProd.includes(catSelLower);
        });
    });

    function contarProductosEnCategoria(catNombre) {
        const catLower = catNombre.toLowerCase();
        return productos.filter((p) => {
            const cats = (p.categoria || '').split(',').map((c) => c.trim().toLowerCase());
            return cats.includes(catLower);
        }).length;
    }

    async function handleAbrirCaja(e) {
        e.preventDefault();
        limpiarAlertas();
        setConfirmacionCierreCiego(null);
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'abrir',
                    montoInicial: Number(montoInicial),
                    cajaFisicaId: cajaFisicaSeleccionada ? Number(cajaFisicaSeleccionada) : null
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMensaje(`Turno #${data.cajaId} abierto exitosamente por ${usuarioActual.nombre}.`);
            setCajaFisicaSeleccionada('');
            await cargarDatos();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleCobrarVenta(e) {
        e.preventDefault();
        limpiarAlertas();
        if (carrito.length === 0) {
            setError('Agrega al menos un producto al carrito.');
            return;
        }
        const itemInvalido = carrito.find((i) => !i.cantidad || Number(i.cantidad) <= 0);
        if (itemInvalido) {
            setError(`El producto "${itemInvalido.nombre}" no tiene una cantidad válida. Ingresa un número mayor a 0 o elimínalo del pedido.`);
            return;
        }
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'vender',
                    cajaId: cajaAbierta.id,
                    items: carrito.map((i) => ({
                        productoId: i.productoId,
                        cantidad: i.cantidad,
                        modificadores: (i.modificadores || []).map((m) => m.id)
                    })),
                    metodoPago,
                    montoRecibido: metodoPago === 'efectivo' && montoRecibido !== '' ? Number(montoRecibido) : null,
                    cambioEntregado: metodoPago === 'efectivo' ? Number(cambioQueSaleDeCaja) : 0,
                    descripcion: `${descripcionVenta} (Operador: ${usuarioActual.nombre})`
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setUltimoTicket({ ...data.venta, operador: usuarioActual.nombre });
            setCarrito([]);
            setMontoRecibido('');
            setCambioManual('');
            setDescripcionVenta('Venta en mostrador');
            setCategoriasSeleccionadas([]);
            setMensaje(`Venta #${data.venta.movimientoId} registrada. Cambio entregado de caja: Bs ${data.venta.cambio.toFixed(2)}`);
            await cargarDatos();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleRegistrarEgreso(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'egreso',
                    cajaId: cajaAbierta.id,
                    monto: Number(montoEgreso),
                    descripcion: `${motivoEgreso} (Por: ${usuarioActual.nombre})`,
                    metodoPago: usuarioActual.rol === 'user' ? 'efectivo' : metodoEgreso
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setMontoEgreso('');
            setMotivoEgreso('');
            setMensaje(`Egreso #${data.movimientoId} registrado por ${usuarioActual.nombre}.`);
            await cargarDatos();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleRegistrarIngresoEfectivo(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'ingreso_efectivo',
                    cajaId: cajaAbierta.id,
                    monto: Number(montoIngresoEfectivo),
                    motivo: `${motivoIngresoEfectivo} (Entregado/Registrado por: ${usuarioActual.nombre})`
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setMontoIngresoEfectivo('');
            setMotivoIngresoEfectivo('');
            setMensaje(`Reposición de efectivo #${data.movimientoId} ingresada exitosamente a la caja.`);
            await cargarDatos();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleCerrarCaja(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const montoDeclarado = Number(efectivoReal);
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'cerrar',
                    cajaId: cajaAbierta.id,
                    efectivoReal: montoDeclarado
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setConfirmacionCierreCiego({
                cajaId: data.arqueo.cajaId,
                efectivoDeclarado: montoDeclarado,
                cerradoPor: usuarioActual.nombre
            });
            setEfectivoReal('');
            setCarrito([]);
            setMensaje('Caja cerrada con Arqueo Ciego. Los resultados de diferencias fueron enviados a Administración.');
            await cargarDatos();
        } catch (err) {
            setError(err.message);
        }
    }

    const puedeAbrirCaja = Boolean(usuarioActual);

    if (cargando) {
        return <div style={{ padding: '2rem' }}>Cargando módulo de caja...</div>;
    }

    // 1. PANTALLA DE LOGIN SI NO HAY OPERADOR AUTENTICADO
    if (!usuarioActual) {
        return (
            <div style={{ maxWidth: '460px', margin: '3rem auto', padding: '1.5rem' }}>
                <div style={cardStyle}>
                    <h2 style={{ marginTop: 0 }}>Iniciar Sesión en Caja</h2>
                    <p style={{ color: '#555', fontSize: '0.9rem' }}>
                        Identifícate con tu PIN para registrar quién realiza cada venta o movimiento.
                    </p>
                    {error && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                            <strong>Error:</strong> {error}
                        </div>
                    )}
                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {!modoLoginManualCaja ? (
                            <label>
                                Selecciona tu Usuario:
                                <select
                                    value={loginUsuarioId}
                                    onChange={(e) => setLoginUsuarioId(e.target.value)}
                                    required
                                    style={inputStyle}
                                >
                                    {usuarios.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.nombre}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <label>
                                Nombre de Usuario:
                                <input
                                    type="text"
                                    placeholder="Ingresa tu nombre de usuario"
                                    value={loginNombreManualCaja}
                                    onChange={(e) => setLoginNombreManualCaja(e.target.value)}
                                    required
                                    style={inputStyle}
                                />
                                <small style={{ display: 'block', color: '#64748b', marginTop: '0.3rem' }}>
                                    Administradores: escriban su nombre de usuario (no aparecen en la lista).
                                </small>
                            </label>
                        )}
                        <label>
                            PIN / Contraseña:
                            <input
                                type="password"
                                placeholder="Ingresa tu PIN o contraseña"
                                value={loginPin}
                                onChange={(e) => setLoginPin(e.target.value)}
                                required
                                style={inputStyle}
                            />
                        </label>
                        <button type="submit" style={btnPrimario}>
                            Ingresar a Caja
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                limpiarAlertas();
                                setModoLoginManualCaja(!modoLoginManualCaja);
                                setLoginNombreManualCaja('');
                                setLoginPin('');
                            }}
                            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', padding: '0.2rem' }}
                        >
                            {modoLoginManualCaja ? 'Seleccionar usuario de la lista' : 'Ingresar nombre de usuario manualmente'}
                        </button>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
                            <a href="/" style={{ ...btnSecundario, flex: 1, textAlign: 'center' }}>Inicio</a>
                            <a href="/admin" style={{ ...btnOscuro, flex: 1, textAlign: 'center' }}>Panel Admin</a>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // 2. LAYOUT CON BARRA LATERAL (SIDEBAR) PARA OPERACIÓN DE CAJA
    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
            {/* BARRA LATERAL IZQUIERDA */}
            <aside style={sidebarStyle}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #334155' }}>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>Módulo de Caja</h2>
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                        {cajaAbierta ? `🟢 [${cajaAbierta.caja_fisica_nombre || 'Caja Principal'}] Turno #${cajaAbierta.id} Abierto` : '🔴 Sin Turno Abierto'}
                    </div>
                </div>

                {/* Datos del Operador */}
                <div style={{ padding: '1rem 1.25rem', background: '#0f172a', borderBottom: '1px solid #334155', fontSize: '0.85rem' }}>
                    <div style={{ color: '#94a3b8' }}>Operador activo:</div>
                    <div style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '0.95rem', margin: '0.2rem 0' }}>
                        {usuarioActual.nombre} ({usuarioActual.rol})
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                        <button type="button" onClick={() => setMostrarFormPin(!mostrarFormPin)} style={btnSidebarMini}>
                            Cambiar PIN
                        </button>
                        <button type="button" onClick={cerrarSesion} style={{ ...btnSidebarMini, background: '#475569' }}>
                            Salir
                        </button>
                    </div>
                    {mostrarFormPin && (
                        <form onSubmit={handleCambiarMiPin} style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <input
                                type="password"
                                placeholder="PIN actual"
                                required
                                value={pinActualCajero}
                                onChange={(e) => setPinActualCajero(e.target.value)}
                                style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #475569', fontSize: '0.8rem' }}
                            />
                            <input
                                type="password"
                                placeholder="Nuevo PIN"
                                required
                                value={nuevoPinCajero}
                                onChange={(e) => setNuevoPinCajero(e.target.value)}
                                style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #475569', fontSize: '0.8rem' }}
                            />
                            <button type="submit" style={{ ...btnSidebarMini, background: '#16a34a' }}>Guardar PIN</button>
                        </form>
                    )}
                </div>

                {/* Menú de Navegación Lateral */}
                <nav style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', gap: '0.35rem', flex: 1 }}>
                    <button
                        onClick={() => { limpiarAlertas(); setSeccionActiva('pos'); }}
                        style={navBtnStyle(seccionActiva === 'pos')}
                    >
                        🛒 1. Punto de Venta (Cobrar)
                    </button>
                    {cajaAbierta && (
                        <>
                            <button
                                onClick={() => { limpiarAlertas(); setSeccionActiva('ingreso_efectivo'); }}
                                style={navBtnStyle(seccionActiva === 'ingreso_efectivo')}
                            >
                                📥 2. Ingresar Efectivo / Sencillo
                            </button>
                            <button
                                onClick={() => { limpiarAlertas(); setSeccionActiva('egresos'); }}
                                style={navBtnStyle(seccionActiva === 'egresos')}
                            >
                                💸 3. Registrar Egreso
                            </button>
                            <button
                                onClick={() => { limpiarAlertas(); setSeccionActiva('cierre'); }}
                                style={navBtnStyle(seccionActiva === 'cierre')}
                            >
                                🔒 4. Cerrar Turno (Arqueo)
                            </button>
                            {usuarioActual.rol !== 'user' && (
                                <button
                                    onClick={() => { limpiarAlertas(); setSeccionActiva('movimientos'); }}
                                    style={navBtnStyle(seccionActiva === 'movimientos')}
                                >
                                    📋 5. Historial del Turno
                                </button>
                            )}
                        </>
                    )}
                </nav>

                <div style={{ padding: '1rem', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <a href="/admin" style={{ ...btnPrimario, textAlign: 'center', fontSize: '0.85rem' }}>
                        Ir a Panel Admin
                    </a>
                    <a href="/" style={{ ...btnSecundario, textAlign: 'center', fontSize: '0.85rem' }}>
                        Menú Principal
                    </a>
                </div>
            </aside>

            {/* ÁREA PRINCIPAL DERECHA */}
            <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
                {error && (
                    <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.85rem 1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #f87171' }}>
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {mensaje && (
                    <div style={{ background: '#dcfce7', color: '#166534', padding: '0.85rem 1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #4ade80' }}>
                        {mensaje}
                    </div>
                )}

                {confirmacionCierreCiego && (
                    <section style={{ ...cardStyle, border: '2px solid #0070f3', marginBottom: '1.5rem', background: '#f8fafc' }}>
                        <h3 style={{ marginTop: 0 }}>Comprobante de Cierre Ciego (Turno #{confirmacionCierreCiego.cajaId})</h3>
                        <p style={{ margin: '0.35rem 0' }}>
                            Cerrado por: <strong>{confirmacionCierreCiego.cerradoPor}</strong> | Efectivo físico declarado: <strong>Bs {confirmacionCierreCiego.efectivoDeclarado.toFixed(2)}</strong>
                        </p>
                        <small style={{ color: '#555' }}>
                            🔒 El cálculo de sobrantes o faltantes fue enviado exclusivamente al Panel de Administración.
                        </small>
                    </section>
                )}

                {!cajaAbierta ? (
                    <section style={{ ...cardStyle, maxWidth: '520px', margin: '2rem auto' }}>
                        <h2 style={{ marginTop: 0 }}>Estado: Sin Turno Abierto</h2>
                        {!puedeAbrirCaja ? (
                            <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', padding: '1rem', borderRadius: '8px' }}>
                                <strong>🔒 Reapertura Restringida al Administrador</strong>
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.92rem' }}>
                                    El turno de caja ya fue cerrado. Un cajero (<code>user</code>) no puede volver a abrir la caja después de cerrada.
                                    Solicita al <strong>Administrador</strong> que la habilite.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleAbrirCaja} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <p style={{ margin: 0, color: '#555', fontSize: '0.9rem' }}>
                                    Abriendo turno con: <strong>{usuarioActual.nombre} ({usuarioActual.rol})</strong>.
                                </p>
                                {cajasFisicas.filter((cf) => Number(cf.activa) === 1).length > 1 ? (
                                    <label>
                                        Estación de Caja Física:
                                        <select
                                            value={cajaFisicaSeleccionada}
                                            onChange={(e) => setCajaFisicaSeleccionada(e.target.value)}
                                            style={inputStyle}
                                        >
                                            <option value="">-- Seleccionar Estación --</option>
                                            {cajasFisicas.filter((cf) => Number(cf.activa) === 1).map((cf) => (
                                                <option key={cf.id} value={cf.id} disabled={!!cf.turno_abierto_id}>
                                                    {cf.nombre} {cf.turno_abierto_id ? `(Ocupada: Turno #${cf.turno_abierto_id})` : '(Disponible)'}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                ) : (
                                    <div style={{ fontSize: '0.88rem', color: '#0369a1', background: '#e0f2fe', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
                                        Estación asignada: <strong>{cajasFisicas[0]?.nombre || 'Caja 1 - Principal'}</strong>
                                    </div>
                                )}
                                <label>
                                    Fondo Inicial en Efectivo (Bs):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={montoInicial}
                                        onChange={(e) => setMontoInicial(e.target.value)}
                                        required
                                        style={inputStyle}
                                    />
                                </label>
                                <button type="submit" style={btnPrimario}>
                                    Abrir Turno de Caja
                                </button>
                            </form>
                        )}
                    </section>
                ) : (
                    <>
                        {/* SECCIÓN 1: PUNTO DE VENTA Y CASILLA DIRECTA DE CAMBIO */}
                        {seccionActiva === 'pos' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: '1.25rem', alignItems: 'start' }}>
                                {/* Catálogo de Productos */}
                                <section style={cardStyle}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Catálogo de Productos</h2>
                                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Haz clic en un producto para agregarlo</span>
                                    </div>

                                    {/* Barra de Categorías */}
                                    {(listaCategoriasDisponibles.length > 0 || productosSinCategoria.length > 0) && (
                                        <div style={{
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            padding: '0.75rem',
                                            marginBottom: '1rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.5rem'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
                                                        🏷️ Categorías:
                                                    </span>
                                                    {categoriasSeleccionadas.length > 0 && (
                                                        <span style={{ fontSize: '0.74rem', background: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600 }}>
                                                            {categoriasSeleccionadas.length} seleccionada{categoriasSeleccionadas.length > 1 ? 's' : ''}
                                                        </span>
                                                    )}
                                                </div>
                                                {categoriasSeleccionadas.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={resetearFiltroCategorias}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: '#dc2626',
                                                            fontSize: '0.78rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            padding: '0.15rem 0.35rem',
                                                            borderRadius: '4px',
                                                            textDecoration: 'underline'
                                                        }}
                                                    >
                                                        Restablecer a todas
                                                    </button>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={resetearFiltroCategorias}
                                                    style={{
                                                        padding: '0.35rem 0.75rem',
                                                        borderRadius: '999px',
                                                        border: categoriasSeleccionadas.length === 0 ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                        fontWeight: categoriasSeleccionadas.length === 0 ? 'bold' : 500,
                                                        fontSize: '0.82rem',
                                                        cursor: 'pointer',
                                                        background: categoriasSeleccionadas.length === 0 ? '#0284c7' : '#ffffff',
                                                        color: categoriasSeleccionadas.length === 0 ? '#ffffff' : '#475569',
                                                        boxShadow: categoriasSeleccionadas.length === 0 ? '0 1px 3px rgba(2,132,199,0.3)' : 'none',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    🌐 Todas ({productos.length})
                                                </button>

                                                {listaCategoriasDisponibles.map((catNombre) => {
                                                    const estaSeleccionada = categoriasSeleccionadas.some(
                                                        (c) => c.toLowerCase() === catNombre.toLowerCase()
                                                    );
                                                    const cantidadEnCat = contarProductosEnCategoria(catNombre);

                                                    return (
                                                        <button
                                                            key={catNombre}
                                                            type="button"
                                                            onClick={() => toggleFiltroCategoria(catNombre)}
                                                            title={estaSeleccionada ? 'Clic para quitar filtro' : 'Clic para filtrar (selección múltiple permitida)'}
                                                            style={{
                                                                padding: '0.35rem 0.75rem',
                                                                borderRadius: '999px',
                                                                border: estaSeleccionada ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                                fontWeight: estaSeleccionada ? 'bold' : 500,
                                                                fontSize: '0.82rem',
                                                                cursor: 'pointer',
                                                                background: estaSeleccionada ? '#0284c7' : '#ffffff',
                                                                color: estaSeleccionada ? '#ffffff' : '#334155',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.35rem',
                                                                boxShadow: estaSeleccionada ? '0 1px 3px rgba(2,132,199,0.3)' : 'none',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            {estaSeleccionada && <span>✓</span>}
                                                            <span>{catNombre}</span>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                opacity: estaSeleccionada ? 0.9 : 0.7,
                                                                background: estaSeleccionada ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                                                                padding: '0.05rem 0.35rem',
                                                                borderRadius: '999px'
                                                            }}>
                                                                {cantidadEnCat}
                                                            </span>
                                                        </button>
                                                    );
                                                })}

                                                {productosSinCategoria.length > 0 && (() => {
                                                    const estaSeleccionada = categoriasSeleccionadas.some(
                                                        (c) => c.toLowerCase() === 'sin categoría' || c.toLowerCase() === 'sin categoria'
                                                    );
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleFiltroCategoria('Sin categoría')}
                                                            title={estaSeleccionada ? 'Clic para quitar filtro' : 'Clic para filtrar productos sin categoría'}
                                                            style={{
                                                                padding: '0.35rem 0.75rem',
                                                                borderRadius: '999px',
                                                                border: estaSeleccionada ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                                fontWeight: estaSeleccionada ? 'bold' : 500,
                                                                fontSize: '0.82rem',
                                                                cursor: 'pointer',
                                                                background: estaSeleccionada ? '#0284c7' : '#ffffff',
                                                                color: estaSeleccionada ? '#ffffff' : '#64748b',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.35rem',
                                                                boxShadow: estaSeleccionada ? '0 1px 3px rgba(2,132,199,0.3)' : 'none',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            {estaSeleccionada && <span>✓</span>}
                                                            <span>Sin categoría</span>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                background: estaSeleccionada ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                                                                padding: '0.05rem 0.35rem',
                                                                borderRadius: '999px'
                                                            }}>
                                                                {productosSinCategoria.length}
                                                            </span>
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}

                                    {productos.length === 0 ? (
                                        <p>No hay productos registrados. Créalos desde el Panel Admin.</p>
                                    ) : productosFiltrados.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem 1rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                            <p style={{ margin: '0 0 0.5rem', color: '#64748b' }}>
                                                No hay productos registrados que coincidan con las categorías seleccionadas.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={resetearFiltroCategorias}
                                                style={{ ...btnSecundario, padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
                                            >
                                                Mostrar todos los productos
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '0.75rem' }}>
                                            {productosFiltrados.map((p) => {
                                                const itemsEnCarrito = carrito.filter((item) => item.productoId === p.id);
                                                const cantidadEnCarrito = itemsEnCarrito.reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0);
                                                const esLibre = p.tipo_inventario === 'libre' || p.unidades_disponibles === null || p.unidades_disponibles === Infinity;
                                                const disponiblesRestantes = esLibre ? Infinity : Math.max(0, p.unidades_disponibles - cantidadEnCarrito);
                                                const sinStock = !esLibre && disponiblesRestantes <= 0;
                                                const tieneModificadores = p.grupos_modificadores && p.grupos_modificadores.length > 0;

                                                return (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => iniciarAgregarAlCarrito(p)}
                                                        disabled={sinStock}
                                                        style={{
                                                            textAlign: 'left',
                                                            padding: '0.8rem',
                                                            borderRadius: '8px',
                                                            border: cantidadEnCarrito > 0 ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                            background: sinStock ? '#f8fafc' : cantidadEnCarrito > 0 ? '#f0f9ff' : '#fff',
                                                            cursor: sinStock ? 'not-allowed' : 'pointer',
                                                            opacity: sinStock ? 0.6 : 1,
                                                            position: 'relative',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        {cantidadEnCarrito > 0 && (
                                                            <span style={{
                                                                position: 'absolute',
                                                                top: '6px',
                                                                right: '6px',
                                                                background: '#0284c7',
                                                                color: '#fff',
                                                                borderRadius: '999px',
                                                                padding: '0.1rem 0.45rem',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 'bold'
                                                            }}>
                                                                {cantidadEnCarrito} en pedido
                                                            </span>
                                                        )}
                                                        <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                                                            {(p.categoria && p.categoria.trim()) ? p.categoria : 'Sin categoría'} • {p.tipo_inventario}
                                                            {tieneModificadores && (
                                                                <span style={{ marginLeft: '0.35rem', color: '#0284c7', fontWeight: 'bold' }}>
                                                                    ✨ Con opciones
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontWeight: 'bold', fontSize: '0.98rem', margin: '0.2rem 0', color: '#0f172a' }}>
                                                            {p.nombre}
                                                        </div>
                                                        <div style={{ color: '#0070f3', fontWeight: 'bold', fontSize: '1.05rem' }}>
                                                            Bs {Number(p.precio).toFixed(2)}
                                                        </div>
                                                        <div style={{ fontSize: '0.78rem', color: sinStock ? '#b91c1c' : '#166534', marginTop: '0.3rem', fontWeight: 500 }}>
                                                            {esLibre ? (
                                                                'Disponible (Libre)'
                                                            ) : sinStock ? (
                                                                <span>⚠️ {p.insumo_limitante ? p.insumo_limitante : 'Sin stock disponible'} {cantidadEnCarrito > 0 ? `(${cantidadEnCarrito} en pedido)` : ''}</span>
                                                            ) : (
                                                                <span>
                                                                    Stock: <strong>{disponiblesRestantes}</strong> disponibles
                                                                    {p.tipo_inventario === 'combo' && Number(p.limite_maximo_activo) === 1 && (
                                                                        <span style={{ color: '#0369a1', marginLeft: '0.25rem' }}>
                                                                            ({p.limite_unidades_restante} rest.)
                                                                        </span>
                                                                    )}
                                                                    {cantidadEnCarrito > 0 && (
                                                                        <span style={{ color: '#0369a1', marginLeft: '0.25rem' }}>
                                                                            (de {p.unidades_disponibles})
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                {/* Panel Derecho: Ticket y CASILLA DE SALIDA DE CAMBIO ARRIBA */}
                                <section style={cardStyle}>
                                    <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.2rem' }}>Cobro y Salida de Cambio</h2>

                                    {/* CASILLAS SUPERIORES SIEMPRE VISIBLES: TOTAL / RECIBIDO / CAMBIO QUE SALE DE CAJA */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                        <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '8px', padding: '0.75rem' }}>
                                            <div style={{ fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                                Total a Cobrar
                                            </div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e3a8a', marginTop: '0.2rem' }}>
                                                Bs {totalCarrito.toFixed(2)}
                                            </div>
                                        </div>

                                        <div style={{
                                            background: metodoPago === 'efectivo' ? (faltaDineroRecibido ? '#fef2f2' : '#f0fdf4') : '#f8fafc',
                                            border: `2px solid ${metodoPago === 'efectivo' ? (faltaDineroRecibido ? '#ef4444' : '#22c55e') : '#cbd5e1'}`,
                                            borderRadius: '8px',
                                            padding: '0.75rem'
                                        }}>
                                            <div style={{ fontSize: '0.78rem', color: faltaDineroRecibido ? '#b91c1c' : '#15803d', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                                {metodoPago === 'efectivo' ? 'Cambio que Sale de Caja (Bs)' : 'Pago QR (Sin Cambio)'}
                                            </div>
                                            {metodoPago === 'efectivo' ? (
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    placeholder="Ingresa cuánto sale de cambio..."
                                                    value={cambioManual}
                                                    onChange={(e) => setCambioManual(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        marginTop: '0.35rem',
                                                        padding: '0.45rem 0.6rem',
                                                        fontSize: '1.25rem',
                                                        fontWeight: 'bold',
                                                        color: '#166534',
                                                        border: '2px solid #16a34a',
                                                        borderRadius: '6px',
                                                        background: '#fff',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                            ) : (
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#64748b', marginTop: '0.2rem' }}>
                                                    Bs 0.00
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Formulario de Pago justo arriba para no bajar */}
                                    <form onSubmit={handleCobrarVenta} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                            <label style={{ fontSize: '0.88rem', fontWeight: 'bold' }}>
                                                Método de Pago:
                                                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={inputStyle}>
                                                    <option value="efectivo">💵 Efectivo Físico</option>
                                                    <option value="qr">📱 Pago por QR</option>
                                                </select>
                                            </label>

                                            {metodoPago === 'efectivo' && (
                                                <label style={{ fontSize: '0.88rem', fontWeight: 'bold' }}>
                                                    Billete Recibido (Opcional Bs):
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder={`Ej. ${totalCarrito.toFixed(2)}`}
                                                        value={montoRecibido}
                                                        onChange={(e) => handleChangeMontoRecibido(e.target.value)}
                                                        style={{ ...inputStyle, fontWeight: 'bold', borderColor: '#0070f3' }}
                                                    />
                                                </label>
                                            )}
                                        </div>

                                        {/* Botones rápidos de billetes en efectivo */}
                                        {metodoPago === 'efectivo' && totalCarrito > 0 && (
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <button type="button" onClick={() => handleChangeMontoRecibido(String(totalCarrito))} style={btnBillete}>Exacto</button>
                                                {[10, 20, 50, 100, 200].map((billete) => (
                                                    <button
                                                        key={billete}
                                                        type="button"
                                                        onClick={() => handleChangeMontoRecibido(String(billete))}
                                                        style={btnBillete}
                                                    >
                                                        Bs {billete}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={carrito.length === 0 || faltaDineroRecibido || hayCantidadInvalida}
                                            style={{
                                                ...btnPrimario,
                                                fontSize: '1rem',
                                                opacity: (carrito.length === 0 || faltaDineroRecibido || hayCantidadInvalida) ? 0.6 : 1,
                                                cursor: (carrito.length === 0 || faltaDineroRecibido || hayCantidadInvalida) ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            Confirmar Cobro ({metodoPago.toUpperCase()})
                                        </button>
                                    </form>

                                    {/* Lista de productos en el carrito */}
                                    <h4 style={{ margin: '0 0 0.5rem', color: '#334155' }}>
                                        Detalle del Pedido ({carrito.length} {carrito.length === 1 ? 'ítem' : 'ítems'})
                                    </h4>
                                    {carrito.length === 0 ? (
                                        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                                            Selecciona productos a la izquierda o haz clic para agregar al pedido.
                                        </p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            {carrito.map((item) => {
                                                const itemClave = item.itemKey || String(item.productoId);
                                                return (
                                                    <div
                                                        key={itemClave}
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            padding: '0.5rem 0',
                                                            borderBottom: '1px solid #f1f5f9',
                                                            fontSize: '0.9rem',
                                                            gap: '0.5rem'
                                                        }}
                                                    >
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: 'bold', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {item.nombre}
                                                            </div>
                                                            {item.modificadores && item.modificadores.length > 0 && (
                                                                <div style={{ margin: '0.15rem 0 0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                                    {item.modificadores.map((m, idx) => (
                                                                        <span
                                                                            key={idx}
                                                                            style={{
                                                                                fontSize: '0.72rem',
                                                                                background: '#e0f2fe',
                                                                                color: '#0369a1',
                                                                                borderRadius: '4px',
                                                                                padding: '0.05rem 0.35rem',
                                                                                fontWeight: 500
                                                                            }}
                                                                        >
                                                                            {m.nombre} {Number(m.precio_adicional || 0) > 0 ? `(+Bs ${Number(m.precio_adicional).toFixed(2)})` : ''}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                                Bs {Number(item.precio).toFixed(2)} x {item.cantidad || 0} = <strong style={{ color: '#0f172a' }}>Bs {((Number(item.precio) || 0) * (Number(item.cantidad) || 0)).toFixed(2)}</strong>
                                                            </div>
                                                            {item.maximoDisponible !== null && item.maximoDisponible !== Infinity && (
                                                                <div style={{ fontSize: '0.72rem', color: '#0369a1' }}>
                                                                    Máx. disponible: {item.maximoDisponible} u.
                                                                </div>
                                                            )}
                                                        </div>

                                                    {/* Controles de cantidad: restar, escribir por teclado, sumar, borrar */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => cambiarCantidad(itemClave, -1)}
                                                            style={{
                                                                ...btnMini,
                                                                width: '28px',
                                                                height: '28px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontWeight: 'bold',
                                                                cursor: 'pointer'
                                                            }}
                                                            title="Restar 1 unidad"
                                                        >
                                                            -
                                                        </button>

                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={item.maximoDisponible !== Infinity ? item.maximoDisponible : undefined}
                                                            value={item.cantidadTexto ?? item.cantidad ?? ''}
                                                            onChange={(e) => handleInputCantidad(itemClave, e.target.value)}
                                                            onBlur={(e) => finalizarEdicionCantidad(itemClave, e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    finalizarEdicionCantidad(itemClave, e.target.value);
                                                                    e.target.blur();
                                                                }
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            style={{
                                                                width: '54px',
                                                                height: '28px',
                                                                padding: '0 0.25rem',
                                                                textAlign: 'center',
                                                                fontWeight: 'bold',
                                                                fontSize: '0.92rem',
                                                                border: (!item.cantidad || item.cantidad <= 0 || item.cantidadTexto === '') ? '2px dashed #f59e0b' : '1px solid #cbd5e1',
                                                                borderRadius: '6px',
                                                                background: (!item.cantidad || item.cantidad <= 0 || item.cantidadTexto === '') ? '#fffbeb' : '#ffffff',
                                                                outline: 'none'
                                                            }}
                                                            title="Escribe la cantidad deseada desde el teclado"
                                                            placeholder="Cant"
                                                        />

                                                        <button
                                                            type="button"
                                                            onClick={() => cambiarCantidad(itemClave, 1)}
                                                            style={{
                                                                ...btnMini,
                                                                width: '28px',
                                                                height: '28px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontWeight: 'bold',
                                                                cursor: 'pointer'
                                                            }}
                                                            title="Sumar 1 unidad"
                                                        >
                                                            +
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => eliminarDelCarrito(itemClave)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: '#94a3b8',
                                                                fontSize: '0.9rem',
                                                                cursor: 'pointer',
                                                                padding: '0.2rem 0.35rem',
                                                                borderRadius: '4px',
                                                                marginLeft: '0.15rem'
                                                            }}
                                                            title="Eliminar del pedido"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        </div>
                                    )}

                                    {ultimoTicket && (
                                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0', fontSize: '0.88rem' }}>
                                            <div><strong>✅ Último Ticket #{ultimoTicket.movimientoId}:</strong> Cobrado Bs {ultimoTicket.montoTotal.toFixed(2)} ({ultimoTicket.metodoPago.toUpperCase()})</div>
                                            {ultimoTicket.metodoPago === 'efectivo' && (
                                                <div style={{ marginTop: '0.2rem' }}>
                                                    Entregó cliente: Bs {ultimoTicket.montoRecibido.toFixed(2)} | <strong style={{ color: '#15803d' }}>Salió de caja en cambio: Bs {ultimoTicket.cambio.toFixed(2)}</strong>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}

                        {/* SECCIÓN 2: INGRESAR EFECTIVO / REPOSICIÓN PARA CAMBIO */}
                        {seccionActiva === 'ingreso_efectivo' && (
                            <section style={{ ...cardStyle, maxWidth: '540px' }}>
                                <h2 style={{ marginTop: 0 }}>📥 Ingresar Efectivo / Sencillo para Cambio</h2>
                                <p style={{ color: '#555', fontSize: '0.9rem' }}>
                                    Usa esta opción cuando el dueño o administrador entregue billetes o monedas adicionales a la caja (ej. Bs 200, Bs 500) para tener cambio/sencillo disponible.
                                    Este monto <strong>se suma al dinero físico que debe haber en el cajón</strong>, pero <strong>no cuenta como venta de productos</strong>.
                                </p>
                                <form onSubmit={handleRegistrarIngresoEfectivo} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    <label>
                                        Monto en Efectivo que Entra al Cajón (Bs):
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.1"
                                            required
                                            placeholder="Ej. 200.00"
                                            value={montoIngresoEfectivo}
                                            onChange={(e) => setMontoIngresoEfectivo(e.target.value)}
                                            style={inputStyle}
                                        />
                                    </label>
                                    <label>
                                        Motivo Obligatorio (Justificación):
                                        <input
                                            type="text"
                                            required
                                            placeholder="Ej. Aporte del director para sencillo, cambio de billetes grandes..."
                                            value={motivoIngresoEfectivo}
                                            onChange={(e) => setMotivoIngresoEfectivo(e.target.value)}
                                            style={inputStyle}
                                        />
                                    </label>
                                    <button type="submit" style={btnPrimario}>Confirmar Entrada de Efectivo al Cajón</button>
                                </form>
                            </section>
                        )}

                        {/* SECCIÓN 3: REGISTRAR EGRESOS */}
                        {seccionActiva === 'egresos' && (
                            <section style={{ ...cardStyle, maxWidth: '540px' }}>
                                <h2 style={{ marginTop: 0 }}>💸 Registrar Egreso / Gasto Menor de Caja</h2>
                                <p style={{ color: '#555', fontSize: '0.9rem' }}>
                                    Registra aquí cualquier salida de efectivo autorizada para gastos operativos del día (deja siempre el recibo o comprobante físico dentro del cajón).
                                </p>
                                <form onSubmit={handleRegistrarEgreso} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    <label>
                                        Monto que sale de Caja (Bs):
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.1"
                                            required
                                            value={montoEgreso}
                                            onChange={(e) => setMontoEgreso(e.target.value)}
                                            style={inputStyle}
                                        />
                                    </label>
                                    {usuarioActual.rol === 'user' ? (
                                        <div style={{ fontSize: '0.88rem', color: '#374151', background: '#f3f4f6', padding: '0.65rem', borderRadius: '6px' }}>
                                            Modalidad: <strong>Efectivo Físico del Cajón</strong>
                                        </div>
                                    ) : (
                                        <label>
                                            Método de Salida:
                                            <select value={metodoEgreso} onChange={(e) => setMetodoEgreso(e.target.value)} style={inputStyle}>
                                                <option value="efectivo">Efectivo del Cajón</option>
                                                <option value="qr">Transferencia / QR (Solo Admin)</option>
                                            </select>
                                        </label>
                                    )}
                                    <label>
                                        Motivo Obligatorio:
                                        <input
                                            type="text"
                                            required
                                            placeholder="Ej. Compra de hielo, botellón de agua, bolsas..."
                                            value={motivoEgreso}
                                            onChange={(e) => setMotivoEgreso(e.target.value)}
                                            style={inputStyle}
                                        />
                                    </label>
                                    <button type="submit" style={btnOscuro}>Confirmar Salida de Efectivo</button>
                                </form>
                            </section>
                        )}

                        {/* SECCIÓN 3: CIERRE DE TURNO (ARQUEO CIEGO) */}
                        {seccionActiva === 'cierre' && (
                            <section style={{ ...cardStyle, maxWidth: '540px' }}>
                                <h2 style={{ marginTop: 0 }}>🔒 Cerrar Turno (Arqueo Ciego)</h2>
                                <p style={{ fontSize: '0.92rem', color: '#555' }}>
                                    Cuenta todos los billetes y monedas físicas del cajón e ingresa el monto total exacto.
                                    Una vez cerrada la caja, solo el Administrador podrá volver a abrirla y revisar el cuadre.
                                </p>
                                <form onSubmit={handleCerrarCaja} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    <label>
                                        Efectivo Físico Real Contado en Cajón (Bs):
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            required
                                            placeholder="Ingresa el monto físico contado..."
                                            value={efectivoReal}
                                            onChange={(e) => setEfectivoReal(e.target.value)}
                                            style={inputStyle}
                                        />
                                    </label>
                                    <button type="submit" style={{ ...btnPrimario, background: '#dc2626' }}>
                                        Declarar Efectivo y Cerrar Caja
                                    </button>
                                </form>
                            </section>
                        )}

                        {/* MODAL DE PERSONALIZACIÓN / COMPLEMENTOS PARA EL POS */}
                        {productoParaPersonalizar && (
                            <div style={{
                                position: 'fixed',
                                inset: 0,
                                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                                backdropFilter: 'blur(3px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 9999,
                                padding: '1rem'
                            }}>
                                <div style={{
                                    background: '#ffffff',
                                    borderRadius: '12px',
                                    maxWidth: '520px',
                                    width: '100%',
                                    maxHeight: '90vh',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
                                    overflow: 'hidden'
                                }}>
                                    {/* Cabecera */}
                                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>
                                                Personalizar: {productoParaPersonalizar.nombre}
                                            </h3>
                                            <div style={{ fontSize: '0.88rem', color: '#64748b', marginTop: '0.2rem' }}>
                                                Precio base: <strong style={{ color: '#0f172a' }}>Bs {Number(productoParaPersonalizar.precio).toFixed(2)}</strong>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setProductoParaPersonalizar(null);
                                                setOpcionesSeleccionadas({});
                                            }}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                fontSize: '1.2rem',
                                                cursor: 'pointer',
                                                color: '#64748b',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '4px'
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    {/* Lista de grupos de opciones */}
                                    <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {productoParaPersonalizar.grupos_modificadores.map((grupo) => {
                                            const seleccion = opcionesSeleccionadas[grupo.id];
                                            return (
                                                <div key={grupo.id} style={{ background: '#f8fafc', padding: '0.9rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                        <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#1e293b' }}>
                                                            {grupo.nombre}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.72rem',
                                                            padding: '0.15rem 0.5rem',
                                                            borderRadius: '999px',
                                                            background: grupo.es_obligatorio ? '#fee2e2' : '#e0f2fe',
                                                            color: grupo.es_obligatorio ? '#991b1b' : '#0369a1',
                                                            fontWeight: 600
                                                        }}>
                                                            {grupo.tipo_seleccion === 'unica' ? 'Una sola opción' : 'Múltiples extras'}
                                                            {grupo.es_obligatorio ? ' • Obligatorio' : ''}
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
                                                        {grupo.opciones.map((op) => {
                                                            const esSeleccionado = grupo.tipo_seleccion === 'unica'
                                                                ? seleccion === op.id
                                                                : Array.isArray(seleccion) && seleccion.includes(op.id);

                                                            return (
                                                                <button
                                                                    key={op.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (grupo.tipo_seleccion === 'unica') {
                                                                            setOpcionesSeleccionadas((prev) => ({ ...prev, [grupo.id]: op.id }));
                                                                        } else {
                                                                            setOpcionesSeleccionadas((prev) => {
                                                                                const actuales = Array.isArray(prev[grupo.id]) ? prev[grupo.id] : [];
                                                                                const nuevo = actuales.includes(op.id)
                                                                                    ? actuales.filter((id) => id !== op.id)
                                                                                    : [...actuales, op.id];
                                                                                return { ...prev, [grupo.id]: nuevo };
                                                                            });
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        padding: '0.6rem 0.75rem',
                                                                        borderRadius: '6px',
                                                                        border: esSeleccionado ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                                        background: esSeleccionado ? '#e0f2fe' : '#ffffff',
                                                                        color: esSeleccionado ? '#0369a1' : '#334155',
                                                                        fontWeight: esSeleccionado ? 'bold' : 500,
                                                                        fontSize: '0.85rem',
                                                                        cursor: 'pointer',
                                                                        textAlign: 'left',
                                                                        transition: 'all 0.1s ease'
                                                                    }}
                                                                >
                                                                    <div>{op.nombre}</div>
                                                                    <div style={{
                                                                        fontSize: '0.75rem',
                                                                        color: Number(op.precio_adicional || 0) > 0 ? '#166534' : '#64748b',
                                                                        fontWeight: 'bold',
                                                                        marginTop: '0.2rem'
                                                                    }}>
                                                                        {Number(op.precio_adicional || 0) > 0 ? `+Bs ${Number(op.precio_adicional).toFixed(2)}` : 'Sin recargo'}
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Pie del modal con total y confirmación */}
                                    <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Total ítem con opciones:</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a' }}>
                                                Bs {calcularTotalPersonalizado().toFixed(2)}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setProductoParaPersonalizar(null);
                                                    setOpcionesSeleccionadas({});
                                                }}
                                                style={{ ...btnSecundario, padding: '0.55rem 0.9rem', fontSize: '0.88rem' }}
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={confirmarPersonalizacionYAgregar}
                                                style={{ ...btnPrimario, padding: '0.55rem 1.2rem', fontSize: '0.92rem' }}
                                            >
                                                ✓ Agregar al Pedido
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

const sidebarStyle = {
    width: '260px',
    background: '#1e293b',
    color: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0
};

function navBtnStyle(activo) {
    return {
        textAlign: 'left',
        padding: '0.75rem 1rem',
        borderRadius: '6px',
        border: 'none',
        background: activo ? '#0284c7' : 'transparent',
        color: activo ? '#fff' : '#cbd5e1',
        fontWeight: activo ? 'bold' : 'normal',
        cursor: 'pointer',
        fontSize: '0.92rem'
    };
}

const btnSidebarMini = {
    flex: 1,
    padding: '0.35rem 0.5rem',
    background: '#0284c7',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.78rem'
};

const btnBillete = {
    padding: '0.35rem 0.65rem',
    borderRadius: '6px',
    border: '1px solid #93c5fd',
    background: '#eff6ff',
    color: '#1d4ed8',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.82rem'
};

const cardStyle = {
    background: '#fff',
    padding: '1.25rem',
    borderRadius: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
};

const inputStyle = {
    width: '100%',
    padding: '0.55rem',
    marginTop: '0.3rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    boxSizing: 'border-box'
};

const btnPrimario = {
    padding: '0.7rem 1.2rem',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

const btnOscuro = {
    padding: '0.7rem 1.2rem',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

const btnSecundario = {
    padding: '0.7rem 1.2rem',
    background: '#e5e7eb',
    color: '#111',
    borderRadius: '6px',
    fontWeight: 'bold',
    textDecoration: 'none'
};

const btnMini = {
    padding: '0.25rem 0.6rem',
    borderRadius: '4px',
    border: '1px solid #ccc',
    background: '#f9fafb',
    cursor: 'pointer',
    fontWeight: 'bold'
};

const thTd = {
    padding: '0.55rem 0.4rem'
};
