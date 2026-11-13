'use client';

import { useState, useEffect } from 'react';
import GraficosFinancieros from './GraficosFinancieros';
import { exportarReportePDF } from './exportarPDF';

export default function AdminPage() {
    const [cargando, setCargando] = useState(true);
    const [seccionActiva, setSeccionActiva] = useState('arqueos'); // 'arqueos' | 'ventas' | 'catalogo' | 'insumos' | 'usuarios' | 'configuracion'

    const [datos, setDatos] = useState({
        configuracionNegocio: null,
        cajaAbierta: null,
        cajaAuditada: null,
        historialCajas: [],
        estadisticas: null,
        movimientos: [],
        desglosePagos: [],
        productos: [],
        insumos: [],
        usuarios: [],
        prediccionInsumos: []
    });
    const [tendencias, setTendencias] = useState(null);

    // Sesión obligatoria de Administrador (o acceso oculto de Developer)
    const [adminAutenticado, setAdminAutenticado] = useState(null);
    const [loginAdminId, setLoginAdminId] = useState('');
    const [loginAdminPin, setLoginAdminPin] = useState('');
    const [modoLoginManual, setModoLoginManual] = useState(false);
    const [loginAdminNombreManual, setLoginAdminNombreManual] = useState('');

    // Estado para Configuración de Modalidad del Negocio (Primera Ejecución + Ajustes)
    const [cfgNombreNegocio, setCfgNombreNegocio] = useState('Mi Negocio');
    const [cfgModalidadNombre, setCfgModalidadNombre] = useState('Venta Directa de Artículos No Perecederos');
    const [cfgUsaStockDirecto, setCfgUsaStockDirecto] = useState(true);
    const [cfgUsaVencimiento, setCfgUsaVencimiento] = useState(false);
    const [cfgUsaRecetas, setCfgUsaRecetas] = useState(false);

    // Apertura de nuevo turno desde Admin
    const [nuevoFondoInicial, setNuevoFondoInicial] = useState('100');

    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    // Categorías y Pestañas
    const [categoriaTabActiva, setCategoriaTabActiva] = useState('todas');
    const [mostrarModalNuevaCat, setMostrarModalNuevaCat] = useState(false);
    const [nuevaCatNombre, setNuevaCatNombre] = useState('');

    // Formularios de Catálogo de Artículos / Productos
    const [prodNombre, setProdNombre] = useState('');
    const [prodPrecio, setProdPrecio] = useState('');
    const [prodCategorias, setProdCategorias] = useState([]);
    const [tipoComposicion, setTipoComposicion] = useState('unitario'); // 'unitario' | 'receta' | 'libre'
    const [insumoUnitarioId, setInsumoUnitarioId] = useState('');
    const [filasReceta, setFilasReceta] = useState([{ insumoId: '', cantidad: '', unidadReceta: '' }]);

    // Compatibilidad y Reabastecimiento de Artículo Directo (con CPP)
    const [compraProdId, setCompraProdId] = useState('');
    const [compraProdCantidad, setCompraProdCantidad] = useState('');
    const [compraProdCostoTotal, setCompraProdCostoTotal] = useState('');
    const [compraProdVencimiento, setCompraProdVencimiento] = useState('');

    // Formulario de Material / Insumo
    const [insNombre, setInsNombre] = useState('');
    const [insUnidad, setInsUnidad] = useState('unidades');
    const [insStockIni, setInsStockIni] = useState('0');
    const [insCostoUni, setInsCostoUni] = useState('0');
    const [insStockSeg, setInsStockSeg] = useState('1');
    const [insTieneVencimiento, setInsTieneVencimiento] = useState(false);
    const [insFechaVencimiento, setInsFechaVencimiento] = useState('');
    const [insProveedor, setInsProveedor] = useState('');

    // Compra CPP de Insumo y Receta / Ensamblaje
    const [compraInsumoId, setCompraInsumoId] = useState('');
    const [compraDistribuidora, setCompraDistribuidora] = useState('');
    const [compraCantidad, setCompraCantidad] = useState('');
    const [compraCostoTotal, setCompraCostoTotal] = useState('');

    const [recetaProdId, setRecetaProdId] = useState('');
    const [recetaInsumoId, setRecetaInsumoId] = useState('');
    const [recetaCantidad, setRecetaCantidad] = useState('');
    const [recetaUnidad, setRecetaUnidad] = useState('');

    // Nuevo usuario
    const [nuevoUsuarioNombre, setNuevoUsuarioNombre] = useState('');
    const [nuevoUsuarioPin, setNuevoUsuarioPin] = useState('');
    const [nuevoUsuarioRol, setNuevoUsuarioRol] = useState('user');

    // Estados para formularios en línea (sin window.prompt)
    const [cajaAReabrirId, setCajaAReabrirId] = useState(null);
    const [motivoReapertura, setMotivoReapertura] = useState('Reconteo / Corrección de cierre');

    const [movimientoAAnularId, setMovimientoAAnularId] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('');

    const [usuarioCambioPin, setUsuarioCambioPin] = useState(null);
    const [pinActualInput, setPinActualInput] = useState('');
    const [nuevoPinInput, setNuevoPinInput] = useState('');

    async function cargarTodo() {
        try {
            setCargando(true);
            const resCaja = await fetch('/api/caja');
            const dataCaja = await resCaja.json();

            if (!resCaja.ok) throw new Error(dataCaja.error || 'Error al consultar /api/caja');

            if (!dataCaja.configuracionNegocio || Number(dataCaja.configuracionNegocio.configurado) === 0 || (dataCaja.usuarios || []).length === 0) {
                window.location.href = '/';
                return;
            }

            setDatos(dataCaja);

            const sesionAdminValida = dataCaja.usuarioSesion && ['admin', 'superadmin', 'developer'].includes(dataCaja.usuarioSesion.rol);
            if (sesionAdminValida) {
                setAdminAutenticado(dataCaja.usuarioSesion);
                const resRep = await fetch('/api/reportes');
                if (resRep.ok) {
                    const dataRep = await resRep.json();
                    setTendencias(dataRep);
                }
            } else {
                setAdminAutenticado(null);
            }

            if (dataCaja.configuracionNegocio) {
                const c = dataCaja.configuracionNegocio;
                setCfgNombreNegocio(c.nombre_negocio || 'Mi Negocio');
                setCfgModalidadNombre(c.modalidad_nombre || 'Venta Directa de Artículos No Perecederos');
                setCfgUsaStockDirecto(Boolean(c.usa_stock_directo));
                setCfgUsaVencimiento(Boolean(c.usa_vencimiento));
                setCfgUsaRecetas(Boolean(c.usa_recetas_ensamblaje));
            }

            const admins = (dataCaja.usuarios || []).filter((u) => u.rol === 'admin' || u.rol === 'superadmin');
            if (admins.length > 0 && !loginAdminId) {
                setLoginAdminId(String(admins[0].id));
            }
            if (dataCaja.insumos?.length > 0 && !compraInsumoId) {
                setCompraInsumoId(String(dataCaja.insumos[0].id));
                setRecetaInsumoId(String(dataCaja.insumos[0].id));
                setRecetaUnidad(dataCaja.insumos[0].unidad_medida || 'unidades');
            }
            if (dataCaja.productos?.length > 0) {
                if (!recetaProdId) setRecetaProdId(String(dataCaja.productos[0].id));
                const directos = dataCaja.productos.filter((p) => p.tipo_inventario === 'directo');
                if (directos.length > 0) {
                    setCompraProdId((prev) => (directos.some((d) => String(d.id) === String(prev)) ? prev : String(directos[0].id)));
                } else {
                    setCompraProdId('');
                }
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    }

    useEffect(() => {
        cargarTodo();
    }, []);

    // Cierre automático de sesión por inactividad para developer y administradores (15 minutos)
    useEffect(() => {
        if (!adminAutenticado) return;

        const MINUTOS_INACTIVIDAD = adminAutenticado.rol === 'developer' ? 15 : 20;
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
                setAdminAutenticado(null);
                setError(`Tu sesión de ${adminAutenticado.rol} se ha cerrado automáticamente tras ${MINUTOS_INACTIVIDAD} minutos de inactividad por seguridad.`);
            }, TIEMPO_LIMITE_MS);
        };

        const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        eventos.forEach((ev) => window.addEventListener(ev, reiniciarTemporizador, { passive: true }));
        reiniciarTemporizador();

        return () => {
            if (timerInactividad) clearTimeout(timerInactividad);
            eventos.forEach((ev) => window.removeEventListener(ev, reiniciarTemporizador));
        };
    }, [adminAutenticado]);

    function limpiarAlertas() {
        setMensaje(null);
        setError(null);
    }

    function aplicarPlantillaModalidad(tipo) {
        if (tipo === 'no_perecedero') {
            setCfgModalidadNombre('Venta Directa de Artículos No Perecederos');
            setCfgUsaStockDirecto(true);
            setCfgUsaVencimiento(false);
            setCfgUsaRecetas(false);
        } else if (tipo === 'perecedero') {
            setCfgModalidadNombre('Venta Directa de Productos con Fecha de Vencimiento');
            setCfgUsaStockDirecto(true);
            setCfgUsaVencimiento(true);
            setCfgUsaRecetas(false);
        } else if (tipo === 'ensamblaje_no_perecedero') {
            setCfgModalidadNombre('Producción / Ensamblaje con Materiales No Perecederos');
            setCfgUsaStockDirecto(true);
            setCfgUsaVencimiento(false);
            setCfgUsaRecetas(true);
        } else if (tipo === 'elaboracion_perecedera') {
            setCfgModalidadNombre('Elaboración con Recetas e Insumos Perecederos');
            setCfgUsaStockDirecto(true);
            setCfgUsaVencimiento(true);
            setCfgUsaRecetas(true);
        } else if (tipo === 'servicios') {
            setCfgModalidadNombre('Servicios y Cobro Libre sin Stock');
            setCfgUsaStockDirecto(false);
            setCfgUsaVencimiento(false);
            setCfgUsaRecetas(false);
        }
    }

    async function handleLoginAdmin(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const payload = modoLoginManual
                ? {
                    accion: 'login',
                    nombreUsuario: loginAdminNombreManual.trim(),
                    pin: loginAdminPin
                }
                : {
                    accion: 'login',
                    usuarioId: Number(loginAdminId),
                    pin: loginAdminPin
                };

            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (!['admin', 'superadmin', 'developer'].includes(data.usuario.rol)) {
                await fetch('/api/caja', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accion: 'logout' })
                }).catch((logoutErr) => {
                    console.error('Error al revocar sesión no autorizada:', logoutErr);
                });
                throw new Error('Acceso denegado: este panel es exclusivo para Administradores y Super Admin.');
            }
            setAdminAutenticado(data.usuario);
            setLoginAdminPin('');
            setLoginAdminNombreManual('');
            await cargarTodo();
        } catch (err) {
            setLoginAdminPin('');
            setError(err.message);
        }
    }

    async function ejecutarAccion(payload, textoExito) {
        limpiarAlertas();
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMensaje(textoExito);
            await cargarTodo();
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        }
    }

    async function handleGuardarConfiguracion(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'guardar_configuracion',
                nombreNegocio: cfgNombreNegocio,
                modalidadNombre: cfgModalidadNombre,
                usaStockDirecto: cfgUsaStockDirecto,
                usaVencimiento: cfgUsaVencimiento,
                usaRecetasEnsamblaje: cfgUsaRecetas
            },
            `Configuración de inventario guardada (${cfgModalidadNombre}). Los módulos se adaptaron automáticamente.`
        );
        if (ok && seccionActiva === 'configuracion') {
            setSeccionActiva('catalogo');
        }
    }

    async function confirmarReabrirCaja(cajaId) {
        const ok = await ejecutarAccion(
            {
                accion: 'reabrir',
                cajaId,
                motivo: motivoReapertura.trim() || 'Revisión administrativa'
            },
            `Caja #${cajaId} reabierta exitosamente. Se guardó el registro de reapertura en el historial.`
        );
        if (ok) {
            setCajaAReabrirId(null);
            setMotivoReapertura('Reconteo / Corrección de cierre');
        }
    }

    async function handleAbrirNuevoTurnoAdmin(e) {
        e.preventDefault();
        await ejecutarAccion(
            {
                accion: 'abrir',
                montoInicial: Number(nuevoFondoInicial)
            },
            'Nuevo turno de caja habilitado por el Administrador.'
        );
    }

    async function handleCrearCategoria(e) {
        e?.preventDefault();
        const nom = nuevaCatNombre.trim();
        if (!nom) return;
        if (nom.toLowerCase() === 'todas') {
            setError('No puedes crear una categoría llamada "Todas".');
            return;
        }
        const ok = await ejecutarAccion(
            { accion: 'crear_categoria', nombre: nom },
            `Categoría "${nom}" creada exitosamente.`
        );
        if (ok) {
            setNuevaCatNombre('');
            setMostrarModalNuevaCat(false);
            setCategoriaTabActiva(nom);
            setProdCategorias((prev) => {
                const existe = prev.some((c) => c.toLowerCase() === nom.toLowerCase());
                return existe ? prev : [...prev, nom];
            });
        }
    }

    function toggleCategoriaProducto(nomCat) {
        if (!nomCat) return;
        setProdCategorias((prev) => {
            const existe = prev.some((c) => c.toLowerCase() === nomCat.toLowerCase());
            if (existe) {
                return prev.filter((c) => c.toLowerCase() !== nomCat.toLowerCase());
            } else {
                return [...prev, nomCat];
            }
        });
    }

    function agregarFilaReceta() {
        if (filasReceta.length >= 30) {
            setError('Límite alcanzado: una receta no puede tener más de 30 insumos.');
            return;
        }
        const primerInsumo = (datos.insumos || [])[0];
        setFilasReceta([
            ...filasReceta,
            {
                insumoId: primerInsumo ? String(primerInsumo.id) : '',
                cantidad: '',
                unidadReceta: primerInsumo ? primerInsumo.unidad_medida : 'unidades'
            }
        ]);
    }

    function quitarFilaReceta(index) {
        if (filasReceta.length <= 1) return;
        setFilasReceta(filasReceta.filter((_, i) => i !== index));
    }

    function cambiarFilaReceta(index, campo, valor) {
        const copia = [...filasReceta];
        copia[index] = { ...copia[index], [campo]: valor };
        if (campo === 'insumoId') {
            const ins = (datos.insumos || []).find((i) => String(i.id) === String(valor));
            if (ins) {
                copia[index].unidadReceta = ins.unidad_medida;
            }
        }
        setFilasReceta(copia);
    }

    async function handleCrearProducto(e) {
        e.preventDefault();
        limpiarAlertas();

        const catFinal = prodCategorias.join(', ');
        const payload = {
            accion: 'crear_producto',
            nombre: prodNombre,
            precio: prodPrecio,
            categoria: catFinal,
            tipoComposicion
        };

        if (tipoComposicion === 'unitario') {
            if (!insumoUnitarioId) {
                setError('Por favor selecciona el insumo de inventario para la venta unitaria.');
                return;
            }
            payload.insumoUnitarioId = Number(insumoUnitarioId);
        } else if (tipoComposicion === 'receta') {
            const insumosLimpio = filasReceta.filter((f) => f.insumoId && Number(f.cantidad) > 0);
            if (insumosLimpio.length === 0) {
                setError('Debes agregar al menos un insumo con cantidad mayor a 0 para la receta.');
                return;
            }
            if (insumosLimpio.length > 30) {
                setError('Límite excedido: No se pueden agregar más de 30 insumos en una receta.');
                return;
            }
            payload.insumosReceta = insumosLimpio;
        }

        const ok = await ejecutarAccion(
            payload,
            `Artículo "${prodNombre}" registrado en el catálogo con costo y stock automáticos.`
        );
        if (ok) {
            setProdNombre('');
            setProdPrecio('');
            setInsumoUnitarioId('');
            setFilasReceta([{ insumoId: '', cantidad: '', unidadReceta: '' }]);
            setProdCategorias(categoriaTabActiva !== 'todas' ? [categoriaTabActiva] : []);
        }
    }

    async function handleComprarProductoDirecto(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'comprar_producto_directo',
                productoId: compraProdId,
                cantidadComprada: compraProdCantidad,
                costoTotalCompra: compraProdCostoTotal,
                fechaVencimiento: cfgUsaVencimiento ? compraProdVencimiento : null
            },
            'Entrada de stock registrada con Costo Promedio Ponderado (NIC 2) sobre el artículo.'
        );
        if (ok) {
            setCompraProdCantidad('');
            setCompraProdCostoTotal('');
            setCompraProdVencimiento('');
        }
    }

    async function handleCrearInsumo(e) {
        e.preventDefault();
        const distLimpia = insProveedor.trim();
        const ok = await ejecutarAccion(
            {
                accion: 'crear_insumo',
                nombre: insNombre,
                unidadMedida: insUnidad,
                stockInicial: insStockIni,
                costoPorUnidad: insCostoUni,
                stockSeguridad: insStockSeg,
                fechaVencimiento: insTieneVencimiento && insFechaVencimiento ? insFechaVencimiento : null,
                proveedor: distLimpia
            },
            `Material / Insumo "${insNombre}" registrado.`
        );
        if (ok) {
            setInsNombre('');
            setInsStockIni('0');
            setInsCostoUni('0');
            setInsTieneVencimiento(false);
            setInsFechaVencimiento('');
            setInsProveedor('');
        }
    }

    async function handleCompraCPP(e) {
        e.preventDefault();
        const distLimpia = compraDistribuidora.trim();
        const motivoCompra = distLimpia ? `Distribuidora: ${distLimpia}` : 'Compra con Costo Promedio Ponderado';
        const ok = await ejecutarAccion(
            {
                accion: 'comprar_insumo',
                insumoId: compraInsumoId,
                cantidadComprada: compraCantidad,
                costoTotalCompra: compraCostoTotal,
                distribuidora: distLimpia,
                motivo: motivoCompra
            },
            'Compra registrada con Costo Promedio Ponderado (NIC 2) y costos de ensamblaje/recetas recalculados.'
        );
        if (ok) {
            setCompraCantidad('');
            setCompraCostoTotal('');
            setCompraDistribuidora('');
        }
    }

    function obtenerUnidadesCompatibles(unidadBase) {
        const u = String(unidadBase || 'unidades').trim().toLowerCase();
        if (['kilos', 'kg', 'gramos', 'g', 'miligramos', 'mg'].includes(u)) {
            return [
                { valor: 'kilos', etiqueta: 'Kilos (kg)' },
                { valor: 'gramos', etiqueta: 'Gramos (g)' },
                { valor: 'miligramos', etiqueta: 'Miligramos (mg)' }
            ];
        }
        if (['litros', 'l', 'mililitros', 'ml'].includes(u)) {
            return [
                { valor: 'litros', etiqueta: 'Litros (L)' },
                { valor: 'mililitros', etiqueta: 'Mililitros (ml)' }
            ];
        }
        if (['metros', 'm', 'centimetros', 'cm'].includes(u)) {
            return [
                { valor: 'metros', etiqueta: 'Metros (m)' },
                { valor: 'centimetros', etiqueta: 'Centímetros (cm)' }
            ];
        }
        return [{ valor: unidadBase || 'unidades', etiqueta: `Unidades (${unidadBase || 'unidades'})` }];
    }

    function convertirMedidaReceta(cantidad, unidadOrigen, unidadDestino) {
        const num = Number(cantidad);
        if (!num || isNaN(num) || !unidadOrigen || !unidadDestino) return null;
        const factores = {
            kilos: 1000, kg: 1000, gramos: 1, g: 1, miligramos: 0.001, mg: 0.001,
            litros: 1000, l: 1000, mililitros: 1, ml: 1,
            metros: 100, m: 100, centimetros: 1, cm: 1,
            unidades: 1
        };
        const uOrig = String(unidadOrigen).trim().toLowerCase();
        const uDest = String(unidadDestino).trim().toLowerCase();
        if (uOrig === uDest) return num;
        if (!factores[uOrig] || !factores[uDest]) return num;
        return Number(((num * factores[uOrig]) / factores[uDest]).toFixed(6));
    }

    async function handleAsignarReceta(e) {
        e.preventDefault();
        const insumoSel = (datos.insumos || []).find((i) => String(i.id) === String(recetaInsumoId));
        const unidadBaseInsumo = insumoSel ? insumoSel.unidad_medida : 'unidades';
        const unidadElegida = recetaUnidad || unidadBaseInsumo;
        const equiv = convertirMedidaReceta(recetaCantidad, unidadElegida, unidadBaseInsumo);

        const ok = await ejecutarAccion(
            {
                accion: 'asignar_receta',
                productoId: recetaProdId,
                insumoId: recetaInsumoId,
                cantidadRequerida: recetaCantidad,
                unidadReceta: unidadElegida
            },
            unidadElegida !== unidadBaseInsumo
                ? `Receta guardada con conversión automática: ${recetaCantidad} ${unidadElegida} → se descontarán ${equiv} ${unidadBaseInsumo} del almacén por unidad vendida.`
                : 'Material / ingrediente vinculado al producto y costo recalculado.'
        );
        if (ok) setRecetaCantidad('');
    }

    async function confirmarAnularMovimiento(movimientoId) {
        if (!motivoAnulacion || motivoAnulacion.trim().length < 3) {
            setError('Debes ingresar un motivo descriptivo y justificado para realizar la anulación.');
            return;
        }
        const ok = await ejecutarAccion(
            {
                accion: 'anular',
                movimientoId,
                motivo: motivoAnulacion.trim()
            },
            `Movimiento #${movimientoId} anulado y stock reintegrado.`
        );
        if (ok) {
            setMovimientoAAnularId(null);
            setMotivoAnulacion('');
        }
    }

    async function handleCrearUsuario(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'crear_usuario',
                nombre: nuevoUsuarioNombre,
                pin: nuevoUsuarioPin,
                rol: nuevoUsuarioRol
            },
            `Usuario "${nuevoUsuarioNombre}" creado correctamente.`
        );
        if (ok) {
            setNuevoUsuarioNombre('');
            setNuevoUsuarioPin('');
        }
    }

    async function handleBorrarUsuario(idBorrar) {
        await ejecutarAccion(
            {
                accion: 'borrar_usuario',
                usuarioABorrarId: idBorrar
            },
            `Usuario #${idBorrar} dado de baja lógica.`
        );
    }

    async function confirmarCambioPassword(e) {
        e.preventDefault();
        if (!usuarioCambioPin) return;
        const ok = await ejecutarAccion(
            {
                accion: 'cambiar_password',
                usuarioObjetivoId: usuarioCambioPin.id,
                nuevoPin: nuevoPinInput,
                pinActual: Number(usuarioCambioPin.id) === Number(adminAutenticado.id) ? pinActualInput : null
            },
            `Contraseña / PIN de "${usuarioCambioPin.nombre}" actualizada correctamente.`
        );
        if (ok) {
            setUsuarioCambioPin(null);
            setPinActualInput('');
            setNuevoPinInput('');
        }
    }

    if (cargando) {
        return <div style={{ padding: '2rem' }}>Cargando Panel de Administración...</div>;
    }

    const NIVEL_ROL = { user: 1, admin: 2, superadmin: 3, developer: 4 };
    const listaAdmins = (datos.usuarios || []).filter((u) => u.rol === 'admin' || u.rol === 'superadmin');

    // 1. PANTALLA DE LOGIN SI EL ADMIN AÚN NO INICIÓ SESIÓN
    if (!adminAutenticado) {
        return (
            <div style={{ maxWidth: '460px', margin: '3rem auto', padding: '1.5rem' }}>
                <div style={cardStyle}>
                    <h2 style={{ marginTop: 0 }}>Acceso al Panel de Administración</h2>
                    <p style={{ color: '#555', fontSize: '0.9rem' }}>
                        Ingresa el PIN de Administrador o Super Admin para gestionar arqueos, ventas, inventario y usuarios.
                    </p>
                    {error && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                            {error}
                        </div>
                    )}
                    <form onSubmit={handleLoginAdmin} style={formCol}>
                        {!modoLoginManual ? (
                            <label>
                                Administrador:
                                <select value={loginAdminId} onChange={(e) => setLoginAdminId(e.target.value)} style={inputStyle}>
                                    {listaAdmins.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.nombre} ({a.rol === 'superadmin' ? 'Super Admin' : 'Admin'})
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <label>
                                Usuario:
                                <input
                                    type="text"
                                    placeholder="Nombre de usuario"
                                    required
                                    value={loginAdminNombreManual}
                                    onChange={(e) => setLoginAdminNombreManual(e.target.value)}
                                    style={inputStyle}
                                />
                            </label>
                        )}
                        <label>
                            PIN / Contraseña de Acceso:
                            <input
                                type="password"
                                placeholder="Ingresa tu PIN o contraseña"
                                required
                                value={loginAdminPin}
                                onChange={(e) => setLoginAdminPin(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                        <button type="submit" style={btnPrimario}>Entrar al Panel Admin</button>
                        <button
                            type="button"
                            onClick={() => {
                                limpiarAlertas();
                                setModoLoginManual(!modoLoginManual);
                                setLoginAdminNombreManual('');
                                setLoginAdminPin('');
                            }}
                            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', padding: '0.2rem' }}
                        >
                            {modoLoginManual ? 'Seleccionar desde la lista de administradores' : 'Ingresar nombre de usuario manualmente'}
                        </button>
                        <a href="/" style={{ ...btnSecundario, textAlign: 'center', marginTop: '0.25rem' }}>Volver al Inicio</a>
                    </form>
                </div>
            </div>
        );
    }

    const configActual = datos.configuracionNegocio || {
        usa_stock_directo: 1,
        usa_vencimiento: 0,
        usa_recetas_ensamblaje: 0,
        configurado: 0
    };
    const esPrimeraEjecucion = Number(configActual.configurado) === 0;
    const esDeveloper = adminAutenticado?.rol === 'developer';
    const mostrarAsistenteConfig = esDeveloper && (esPrimeraEjecucion || seccionActiva === 'configuracion');

    const usaStockDirecto = Boolean(configActual.usa_stock_directo);
    const usaVencimiento = Boolean(configActual.usa_vencimiento);
    const usaRecetas = Boolean(configActual.usa_recetas_ensamblaje);

    const est = datos.estadisticas;

    // 2. LAYOUT CON BARRA LATERAL (SIDEBAR) POR MÓDULOS ADMINISTRATIVOS
    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
            {/* BARRA LATERAL IZQUIERDA */}
            <aside style={sidebarStyle}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #334155' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>
                        {configActual.nombre_negocio || 'Panel Admin'}
                    </h2>
                    <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '0.25rem' }}>
                        {configActual.modalidad_nombre}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.3rem' }}>
                        {datos.cajaAbierta ? `🟢 Caja #${datos.cajaAbierta.id} en curso` : '🔴 Sin turno abierto'}
                    </div>
                </div>

                {/* Datos del Administrador */}
                <div style={{ padding: '1rem 1.25rem', background: '#0f172a', borderBottom: '1px solid #334155', fontSize: '0.85rem' }}>
                    <div style={{ color: '#94a3b8' }}>Sesión activa:</div>
                    <div style={{ fontWeight: 'bold', color: '#facc15', fontSize: '0.95rem', margin: '0.2rem 0' }}>
                        {adminAutenticado.rol === 'developer' ? '💻 ' : adminAutenticado.rol === 'superadmin' ? '👑 ' : '🛡️ '}
                        {adminAutenticado.nombre}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                        Rango: {adminAutenticado.rol.toUpperCase()}
                    </div>
                    <button
                        onClick={async () => {
                            await fetch('/api/caja', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ accion: 'logout' })
                            }).catch((err) => {
                                console.error('Error al cerrar sesión:', err);
                            });
                            setAdminAutenticado(null);
                        }}
                        style={{ width: '100%', padding: '0.35rem', background: '#475569', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                        Cerrar Sesión Admin
                    </button>
                </div>

                {/* Menú de Módulos Clasificados (Se adapta según los interruptores del negocio) */}
                <nav style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', gap: '0.35rem', flex: 1 }}>
                    <button
                        onClick={() => { limpiarAlertas(); setSeccionActiva('arqueos'); }}
                        style={navBtnStyle(!esPrimeraEjecucion && seccionActiva === 'arqueos')}
                    >
                        🏦 1. Arqueos y Cierres
                    </button>
                    <button
                        onClick={() => { limpiarAlertas(); setSeccionActiva('ventas'); }}
                        style={navBtnStyle(!esPrimeraEjecucion && seccionActiva === 'ventas')}
                    >
                        📊 2. Ventas y Movimientos
                    </button>
                    <button
                        onClick={() => { limpiarAlertas(); setSeccionActiva('catalogo'); }}
                        style={navBtnStyle(!esPrimeraEjecucion && seccionActiva === 'catalogo')}
                    >
                        📦 3. {usaRecetas ? 'Artículos y Ensamblaje' : 'Catálogo y Stock'}
                    </button>
                    {usaRecetas && (
                        <button
                            onClick={() => { limpiarAlertas(); setSeccionActiva('insumos'); }}
                            style={navBtnStyle(!esPrimeraEjecucion && seccionActiva === 'insumos')}
                        >
                            🧱 4. Materiales / Insumos
                        </button>
                    )}
                    <button
                        onClick={() => { limpiarAlertas(); setSeccionActiva('usuarios'); }}
                        style={navBtnStyle(!esPrimeraEjecucion && seccionActiva === 'usuarios')}
                    >
                        👥 {usaRecetas ? '5.' : '4.'} Usuarios y Roles
                    </button>
                    {esDeveloper && (
                        <button
                            onClick={() => { limpiarAlertas(); setSeccionActiva('configuracion'); }}
                            style={navBtnStyle(mostrarAsistenteConfig)}
                        >
                            ⚙️ Modalidad del Negocio
                        </button>
                    )}
                </nav>

                {/* Accesos Rápidos Inferiores */}
                <div style={{ padding: '1rem', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <a href="/api/reportes?formato=xlsx" style={{ ...btnPrimario, background: '#16a34a', textAlign: 'center', fontSize: '0.84rem' }}>
                        📊 Descargar Excel (.xlsx)
                    </a>
                    <button
                        type="button"
                        onClick={() =>
                            exportarReportePDF({
                                nombreNegocio: configActual.nombre_negocio,
                                cajaAuditada: datos.cajaAuditada,
                                estadisticas: est,
                                movimientos: datos.movimientos,
                                desglosePagos: datos.desglosePagos
                            })
                        }
                        style={{ ...btnPrimario, background: '#dc2626', textAlign: 'center', fontSize: '0.84rem' }}
                    >
                        📄 Descargar PDF (Caja #{datos.cajaAuditada?.id || '—'})
                    </button>
                    <a href="/api/reportes?formato=csv" style={{ ...btnPrimario, textAlign: 'center', fontSize: '0.84rem' }}>
                        📥 Descargar CSV
                    </a>
                    <a href="/caja" style={{ ...btnOscuro, background: '#334155', textAlign: 'center', fontSize: '0.84rem' }}>
                        Ir a Punto de Venta
                    </a>
                    <a href="/" style={{ ...btnSecundario, textAlign: 'center', fontSize: '0.84rem' }}>
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

                {/* =========================================================
                    ASISTENTE DE PRIMERA EJECUCIÓN / MODALIDAD DEL NEGOCIO
                   ========================================================= */}
                {mostrarAsistenteConfig ? (
                    <section style={{ ...cardStyle, border: '2px solid #0284c7', maxWidth: '880px' }}>
                        <h2 style={{ marginTop: 0 }}>
                            {esPrimeraEjecucion
                                ? '🚀 Configuración Inicial del Sistema (Primera Ejecución)'
                                : '⚙️ Configurar Modalidad de Funcionamiento del Inventario'}
                        </h2>
                        <p style={{ color: '#475569', fontSize: '0.92rem' }}>
                            Selecciona cómo funciona el inventario de tu negocio. El sistema activará u ocultará automáticamente los campos de <strong>Fechas de Vencimiento</strong> y de <strong>Ensamblaje / Recetas de Materiales</strong> según tu modalidad.
                        </p>

                        {/* 4 Plantillas por Funcionamiento */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <button
                                type="button"
                                onClick={() => aplicarPlantillaModalidad('no_perecedero')}
                                style={plantillaBtnStyle(cfgUsaStockDirecto && !cfgUsaVencimiento && !cfgUsaRecetas)}
                            >
                                <strong>🔧 1. Artículos No Perecederos</strong>
                                <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                                    Compra y venta directa sin fecha de vencimiento ni recetas.
                                </span>
                                <small style={{ color: '#0284c7' }}>Ej: Repuestos de auto, piezas de PC, ferretería, venta de madera.</small>
                            </button>

                            <button
                                type="button"
                                onClick={() => aplicarPlantillaModalidad('perecedero')}
                                style={plantillaBtnStyle(cfgUsaStockDirecto && cfgUsaVencimiento && !cfgUsaRecetas)}
                            >
                                <strong>🛒 2. Productos con Vencimiento</strong>
                                <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                                    Compra y venta directa controlando lote y fecha de caducidad.
                                </span>
                                <small style={{ color: '#0284c7' }}>Ej: Minimarket, supermercado, farmacia, insumos médicos.</small>
                            </button>

                            <button
                                type="button"
                                onClick={() => aplicarPlantillaModalidad('ensamblaje_no_perecedero')}
                                style={plantillaBtnStyle(cfgUsaStockDirecto && !cfgUsaVencimiento && cfgUsaRecetas)}
                            >
                                <strong>🪚 3. Ensamblaje / Fabricación (Sin Vencimiento)</strong>
                                <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                                    Une piezas o materiales no perecederos para crear un producto.
                                </span>
                                <small style={{ color: '#0284c7' }}>Ej: Carpintería/mueblería, armado de PCs, talleres.</small>
                            </button>

                            <button
                                type="button"
                                onClick={() => aplicarPlantillaModalidad('elaboracion_perecedera')}
                                style={plantillaBtnStyle(cfgUsaStockDirecto && cfgUsaVencimiento && cfgUsaRecetas)}
                            >
                                <strong>☕ 4. Elaboración Perecedera (Con Receta y Vencimiento)</strong>
                                <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                                    Recetas con ingredientes que tienen fecha de vencimiento.
                                </span>
                                <small style={{ color: '#0284c7' }}>Ej: Cafetería, restaurante, panadería, pastelería.</small>
                            </button>
                        </div>

                        <form onSubmit={handleGuardarConfiguracion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                    Nombre del Negocio:
                                    <input
                                        type="text"
                                        required
                                        value={cfgNombreNegocio}
                                        onChange={(e) => setCfgNombreNegocio(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                    Descripción de la Modalidad:
                                    <input
                                        type="text"
                                        required
                                        value={cfgModalidadNombre}
                                        onChange={(e) => setCfgModalidadNombre(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <strong>Interruptores de Funcionalidades de Inventario:</strong>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={cfgUsaStockDirecto}
                                        onChange={(e) => setCfgUsaStockDirecto(e.target.checked)}
                                    />
                                    <span>
                                        <strong>Control de Stock Directo por Artículo:</strong> Descuenta unidades/medidas al vender, alerta stock mínimo y recalcula Costo Promedio Ponderado al reabastecer artículos.
                                    </span>
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={cfgUsaVencimiento}
                                        onChange={(e) => setCfgUsaVencimiento(e.target.checked)}
                                    />
                                    <span>
                                        <strong>Control de Fechas de Vencimiento:</strong> Solicita fecha de caducidad al registrar o comprar artículos/insumos (desactívalo para madera, repuestos de auto, piezas de PC o ferretería).
                                    </span>
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={cfgUsaRecetas}
                                        onChange={(e) => setCfgUsaRecetas(e.target.checked)}
                                    />
                                    <span>
                                        <strong>Control de Ensamblaje / Recetas de Materiales (BOM):</strong> Habilita la bolsa de materiales/insumos para productos que se fabrican o ensamblan a partir de componentes.
                                    </span>
                                </label>
                            </div>

                            <button type="submit" style={{ ...btnPrimario, alignSelf: 'flex-start' }}>
                                Guardar Configuración y Continuar
                            </button>
                        </form>
                    </section>
                ) : (
                    <>
                        {/* ==========================================
                            MÓDULO 1: ARQUEOS Y CIERRES DE CAJA
                           ========================================== */}
                        {seccionActiva === 'arqueos' && (
                            <section style={cardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div>
                                        <h2 style={{ margin: 0 }}>🏦 Auditoría de Cierres y Arqueos de Caja</h2>
                                        <p style={{ margin: '0.25rem 0 0', color: '#555', fontSize: '0.9rem' }}>
                                            Revisa si hubo dinero faltante o sobrante en cada turno cerrado y habilita o reabre turnos cuando sea necesario.
                                        </p>
                                    </div>
                                    {!datos.cajaAbierta && (
                                        <form onSubmit={handleAbrirNuevoTurnoAdmin} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={nuevoFondoInicial}
                                                onChange={(e) => setNuevoFondoInicial(e.target.value)}
                                                placeholder="Fondo inicial Bs"
                                                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc', width: '130px' }}
                                            />
                                            <button type="submit" style={btnPrimario}>
                                                + Abrir Nuevo Turno
                                            </button>
                                        </form>
                                    )}
                                </div>

                                {(datos.historialCajas || []).length === 0 ? (
                                    <p style={{ color: '#666' }}>Aún no se ha abierto ni cerrado ninguna caja.</p>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #cbd5e1', textAlign: 'left', background: '#f8fafc' }}>
                                                <th style={thTd}>Caja</th>
                                                <th style={thTd}>Abierta por</th>
                                                <th style={thTd}>Estado</th>
                                                <th style={thTd}>Fondo Inicial</th>
                                                <th style={thTd}>Efectivo Esperado</th>
                                                <th style={thTd}>Efectivo Real Contado</th>
                                                <th style={thTd}>Resultado / Diferencia</th>
                                                <th style={thTd}>Total QR</th>
                                                <th style={thTd}>Acción Admin</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {datos.historialCajas.map((c) => {
                                                const dif = c.diferencia_efectivo !== null && c.diferencia_efectivo !== undefined ? Number(c.diferencia_efectivo) : null;
                                                let badgeColor = '#166534';
                                                let badgeBg = '#dcfce7';
                                                let textoDif = 'En curso (Abierta)';

                                                if (c.estado === 'cerrada' && dif !== null) {
                                                    if (dif < 0) {
                                                        badgeColor = '#991b1b';
                                                        badgeBg = '#fee2e2';
                                                        textoDif = `⚠️ FALTANTE: Bs ${dif.toFixed(2)}`;
                                                    } else if (dif > 0) {
                                                        badgeColor = '#1e40af';
                                                        badgeBg = '#dbeafe';
                                                        textoDif = `SOBRANTE: +Bs ${dif.toFixed(2)}`;
                                                    } else {
                                                        badgeColor = '#166534';
                                                        badgeBg = '#dcfce7';
                                                        textoDif = '✅ CUADRE EXACTO (Bs 0.00)';
                                                    }
                                                }

                                                return (
                                                    <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                        <td style={thTd}><strong>#{c.id}</strong></td>
                                                        <td style={thTd}>{c.usuario_nombre || `Usuario #${c.usuario_id}`}</td>
                                                        <td style={thTd}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                                                                <span style={{
                                                                    padding: '0.2rem 0.55rem',
                                                                    borderRadius: '4px',
                                                                    fontWeight: 'bold',
                                                                    fontSize: '0.8rem',
                                                                    background: c.estado === 'abierta' ? '#dcfce7' : '#e2e8f0',
                                                                    color: c.estado === 'abierta' ? '#166534' : '#334155'
                                                                }}>
                                                                    {c.estado.toUpperCase()}
                                                                </span>
                                                                {Number(c.veces_reabierta) > 0 && (
                                                                    <span style={{
                                                                        padding: '0.18rem 0.5rem',
                                                                        borderRadius: '4px',
                                                                        fontWeight: 'bold',
                                                                        fontSize: '0.75rem',
                                                                        background: '#fef3c7',
                                                                        color: '#92400e',
                                                                        border: '1px solid #f59e0b'
                                                                    }}>
                                                                        🔄 REABIERTA ({c.veces_reabierta} {Number(c.veces_reabierta) === 1 ? 'vez' : 'veces'})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={thTd}>Bs {Number(c.monto_inicial).toFixed(2)}</td>
                                                        <td style={thTd}>
                                                            {c.efectivo_esperado !== null ? `Bs ${Number(c.efectivo_esperado).toFixed(2)}` : '—'}
                                                        </td>
                                                        <td style={thTd}>
                                                            {c.efectivo_real !== null ? <strong>Bs {Number(c.efectivo_real).toFixed(2)}</strong> : '—'}
                                                        </td>
                                                        <td style={thTd}>
                                                            <div>
                                                                <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: 'bold', background: badgeBg, color: badgeColor, display: 'inline-block' }}>
                                                                    {textoDif}
                                                                </span>
                                                                {c.historial_reaperturas && (
                                                                    <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#78350f', background: '#fffbeb', padding: '0.35rem 0.5rem', borderRadius: '4px', borderLeft: '3px solid #f59e0b' }}>
                                                                        <strong>Historial previo:</strong> {c.historial_reaperturas}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={thTd}>Bs {Number(c.qr_esperado || 0).toFixed(2)}</td>
                                                        <td style={thTd}>
                                                            {c.estado === 'cerrada' && !datos.cajaAbierta && (
                                                                cajaAReabrirId === c.id ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '200px' }}>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Motivo de reapertura..."
                                                                            value={motivoReapertura}
                                                                            onChange={(e) => setMotivoReapertura(e.target.value)}
                                                                            style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #94a3b8', fontSize: '0.8rem' }}
                                                                        />
                                                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => confirmarReabrirCaja(c.id)}
                                                                                style={{ padding: '0.3rem 0.6rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.78rem' }}
                                                                            >
                                                                                Confirmar
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setCajaAReabrirId(null)}
                                                                                style={{ padding: '0.3rem 0.6rem', background: '#64748b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                                                                            >
                                                                                Cancelar
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setCajaAReabrirId(c.id);
                                                                            setMotivoReapertura('Reconteo / Corrección de cierre');
                                                                        }}
                                                                        style={{ padding: '0.35rem 0.7rem', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                                                    >
                                                                        Reabrir esta Caja
                                                                    </button>
                                                                )
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </section>
                        )}

                        {/* ==========================================
                            MÓDULO 2: VENTAS, KPIs Y ANULACIONES
                           ========================================== */}
                        {seccionActiva === 'ventas' && (
                            <>
                                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div style={kpiCard}>
                                        <small>Ventas (Caja #{datos.cajaAuditada?.id || '—'})</small>
                                        <strong>Bs {(est?.ventasTotales || 0).toFixed(2)}</strong>
                                        <span>Ticket Promedio: Bs {(est?.ticketPromedio || 0).toFixed(2)}</span>
                                    </div>
                                    <div style={kpiCard}>
                                        <small>Costo de Ventas (CPP / Directo)</small>
                                        <strong>Bs {(est?.costoTotalVentas || 0).toFixed(2)}</strong>
                                        <span>Congelado por ticket vendido</span>
                                    </div>
                                    <div style={kpiCard}>
                                        <small>Ganancia Bruta</small>
                                        <strong style={{ color: '#166534' }}>Bs {(est?.gananciaBruta || 0).toFixed(2)}</strong>
                                        <span>Ventas - Costo de Ventas</span>
                                    </div>
                                    <div style={kpiCard}>
                                        <small>Flujo Neto Operativo</small>
                                        <strong style={{ color: '#0070f3' }}>Bs {(est?.flujoNetoOperativo || 0).toFixed(2)}</strong>
                                        <span>Ganancia Bruta - Egresos (Bs {(est?.totalEgresos || 0).toFixed(2)})</span>
                                    </div>
                                </section>

                                <GraficosFinancieros
                                    estadisticas={est}
                                    tendencias={tendencias}
                                    desglosePagos={datos.desglosePagos}
                                    cajaId={datos.cajaAuditada?.id}
                                />

                                <section style={cardStyle}>
                                    <h2 style={{ marginTop: 0 }}>
                                        📊 Movimientos de Caja #{datos.cajaAuditada?.id || '—'} (Auditoría y Anulación)
                                    </h2>
                                    {!(datos.movimientos || []).length ? (
                                        <p style={{ color: '#666' }}>No hay movimientos registrados en esta caja.</p>
                                    ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                                    <th style={thTd}>ID</th>
                                                    <th style={thTd}>Fecha/Hora</th>
                                                    <th style={thTd}>Operador</th>
                                                    <th style={thTd}>Tipo / Pago</th>
                                                    <th style={thTd}>Monto</th>
                                                    <th style={thTd}>Cambio Entregado</th>
                                                    <th style={thTd}>Estado</th>
                                                    <th style={thTd}>Descripción</th>
                                                    <th style={thTd}>Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {datos.movimientos.map((m) => (
                                                    <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: m.estado === 'anulado' ? 0.55 : 1 }}>
                                                        <td style={thTd}>#{m.id}</td>
                                                        <td style={thTd}>{m.fecha_hora}</td>
                                                        <td style={thTd}><strong>{m.usuario_nombre || '—'}</strong></td>
                                                        <td style={thTd}>{m.tipo.toUpperCase()} ({m.metodo_pago.toUpperCase()})</td>
                                                        <td style={thTd}>Bs {Number(m.monto).toFixed(2)}</td>
                                                        <td style={thTd}>Bs {Number(m.cambio || 0).toFixed(2)}</td>
                                                        <td style={thTd}>{m.estado}</td>
                                                        <td style={thTd}>{m.descripcion}</td>
                                                        <td style={thTd}>
                                                            {m.estado === 'completado' && (
                                                                movimientoAAnularId === m.id ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '170px' }}>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Motivo de anulación..."
                                                                            value={motivoAnulacion}
                                                                            onChange={(e) => setMotivoAnulacion(e.target.value)}
                                                                            style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #94a3b8', fontSize: '0.78rem' }}
                                                                        />
                                                                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                                                                            <button
                                                                                type="button"
                                                                                disabled={!motivoAnulacion || motivoAnulacion.trim().length < 3}
                                                                                onClick={() => confirmarAnularMovimiento(m.id)}
                                                                                style={{ padding: '0.25rem 0.5rem', background: (!motivoAnulacion || motivoAnulacion.trim().length < 3) ? '#94a3b8' : '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: (!motivoAnulacion || motivoAnulacion.trim().length < 3) ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                                                                            >
                                                                                Confirmar
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => { setMovimientoAAnularId(null); setMotivoAnulacion(''); }}
                                                                                style={{ padding: '0.25rem 0.5rem', background: '#64748b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                                                            >
                                                                                Cancelar
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setMovimientoAAnularId(m.id);
                                                                            setMotivoAnulacion('');
                                                                        }}
                                                                        style={{ padding: '0.3rem 0.65rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                                    >
                                                                        Anular
                                                                    </button>
                                                                )
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </section>
                            </>
                        )}

                        {/* ==========================================
                            MÓDULO 3: CATÁLOGO, STOCK DIRECTO Y ENSAMBLAJE
                           ========================================== */}
                        {seccionActiva === 'catalogo' && (() => {
                            const insumoUnitarioSeleccionado = (datos.insumos || []).find((i) => String(i.id) === String(insumoUnitarioId));
                            let costoEstimado = 0;
                            if (tipoComposicion === 'unitario') {
                                costoEstimado = insumoUnitarioSeleccionado ? Number(insumoUnitarioSeleccionado.costo_por_unidad || 0) : 0;
                            } else if (tipoComposicion === 'receta') {
                                for (const f of filasReceta) {
                                    if (!f.insumoId || !f.cantidad) continue;
                                    const ins = (datos.insumos || []).find((i) => String(i.id) === String(f.insumoId));
                                    if (!ins) continue;
                                    const cant = Number(f.cantidad) || 0;
                                    const convertida = f.unidadReceta
                                        ? convertirMedidaReceta(cant, f.unidadReceta, ins.unidad_medida)
                                        : cant;
                                    if (convertida !== null) {
                                        costoEstimado += convertida * Number(ins.costo_por_unidad || 0);
                                    }
                                }
                            }
                            const gananciaEstimada = Number(prodPrecio || 0) - costoEstimado;
                            const margenPorcentaje = Number(prodPrecio) > 0 ? (gananciaEstimada / Number(prodPrecio)) * 100 : 0;

                            const productosFiltrados = (datos.productos || []).filter((p) => {
                                if (categoriaTabActiva === 'todas') return true;
                                const cats = (p.categoria || '').split(',').map((c) => c.trim().toLowerCase());
                                return cats.includes(categoriaTabActiva.toLowerCase());
                            });

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {/* PESTAÑAS HORIZONTALES DE CATEGORÍAS */}
                                    <div style={{ background: '#fff', padding: '0.85rem 1.25rem', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', marginRight: '0.25rem' }}>
                                                Categorías:
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setCategoriaTabActiva('todas')}
                                                style={{
                                                    padding: '0.4rem 0.9rem',
                                                    borderRadius: '999px',
                                                    border: 'none',
                                                    fontWeight: 'bold',
                                                    fontSize: '0.84rem',
                                                    cursor: 'pointer',
                                                    background: categoriaTabActiva === 'todas' ? '#0284c7' : '#f1f5f9',
                                                    color: categoriaTabActiva === 'todas' ? '#fff' : '#334155'
                                                }}
                                            >
                                                🌐 Todas ({(datos.productos || []).length})
                                            </button>
                                            {(datos.categorias || []).map((cat) => {
                                                const cant = (datos.productos || []).filter((p) => {
                                                    const cats = (p.categoria || '').split(',').map((c) => c.trim().toLowerCase());
                                                    return cats.includes(cat.nombre?.toLowerCase());
                                                }).length;
                                                const activa = categoriaTabActiva.toLowerCase() === cat.nombre?.toLowerCase();
                                                return (
                                                    <button
                                                        key={cat.id || cat.nombre}
                                                        type="button"
                                                        onClick={() => {
                                                            setCategoriaTabActiva(cat.nombre);
                                                            setProdCategorias([cat.nombre]);
                                                        }}
                                                        style={{
                                                            padding: '0.4rem 0.9rem',
                                                            borderRadius: '999px',
                                                            border: 'none',
                                                            fontWeight: 'bold',
                                                            fontSize: '0.84rem',
                                                            cursor: 'pointer',
                                                            background: activa ? '#0284c7' : '#f1f5f9',
                                                            color: activa ? '#fff' : '#334155'
                                                        }}
                                                    >
                                                        🏷️ {cat.nombre} ({cant})
                                                    </button>
                                                );
                                            })}
                                            <button
                                                type="button"
                                                onClick={() => setMostrarModalNuevaCat(!mostrarModalNuevaCat)}
                                                style={{
                                                    padding: '0.35rem 0.8rem',
                                                    borderRadius: '999px',
                                                    border: '1px dashed #0284c7',
                                                    background: '#f0f9ff',
                                                    color: '#0284c7',
                                                    fontWeight: 'bold',
                                                    fontSize: '0.82rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ➕ {mostrarModalNuevaCat ? 'Cancelar' : 'Nueva Categoría'}
                                            </button>
                                        </div>

                                        {/* Formulario rápido para crear categoría */}
                                        {mostrarModalNuevaCat && (
                                            <form onSubmit={handleCrearCategoria} style={{ marginTop: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Nombre de la nueva categoría (Ej. Bebidas, Repuestos, Postres)"
                                                    required
                                                    value={nuevaCatNombre}
                                                    onChange={(e) => setNuevaCatNombre(e.target.value)}
                                                    style={{ ...inputStyle, margin: 0, flex: 1 }}
                                                />
                                                <button type="submit" style={{ ...btnPrimario, padding: '0.55rem 1rem' }}>
                                                    Guardar Categoría
                                                </button>
                                            </form>
                                        )}
                                    </div>

                                    {/* CUERPO PRINCIPAL DEL CATÁLOGO: FORMULARIO Y RESUMEN */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.95fr', gap: '1.5rem', alignItems: 'start' }}>
                                        {/* FORMULARIO SIMPLIFICADO DE REGISTRO */}
                                        <section style={cardStyle}>
                                            <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>📦 Registrar Artículo / Producto</h3>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                                                El costo y la disponibilidad se calculan matemáticamente de forma automática a partir de los insumos seleccionados.
                                            </p>

                                            <form onSubmit={handleCrearProducto} style={formCol}>
                                                <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                    Nombre del Artículo / Producto:
                                                    <input
                                                        placeholder="Ej. Café Capuchino, Filtro de Aceite, Tarta de Chocolate"
                                                        required
                                                        value={prodNombre}
                                                        onChange={(e) => setProdNombre(e.target.value)}
                                                        style={inputStyle}
                                                    />
                                                </label>

                                                <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                    Precio de Venta al Público (Bs):
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.01"
                                                        placeholder="Ej. 25.00"
                                                        required
                                                        value={prodPrecio}
                                                        onChange={(e) => setProdPrecio(e.target.value)}
                                                        style={inputStyle}
                                                    />
                                                </label>

                                                {/* BARRA DE ASIGNACIÓN MÚLTIPLE DE CATEGORÍAS */}
                                                <div style={{ marginTop: '0.2rem', marginBottom: '0.4rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                                                            Categorías del Producto: <span style={{ fontWeight: 'normal', color: '#64748b', fontSize: '0.8rem' }}>(Puede pertenecer a más de una)</span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setMostrarModalNuevaCat(!mostrarModalNuevaCat)}
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: '#0284c7',
                                                                fontSize: '0.8rem',
                                                                fontWeight: 'bold',
                                                                cursor: 'pointer',
                                                                textDecoration: 'underline'
                                                            }}
                                                        >
                                                            ➕ {mostrarModalNuevaCat ? 'Cerrar' : 'Nueva Categoría'}
                                                        </button>
                                                    </div>

                                                    {/* Barra interactiva de selección de categorías (sin opción Todas) */}
                                                    <div style={{
                                                        display: 'flex',
                                                        gap: '0.45rem',
                                                        flexWrap: 'wrap',
                                                        alignItems: 'center',
                                                        padding: '0.65rem 0.85rem',
                                                        background: '#f8fafc',
                                                        borderRadius: '8px',
                                                        border: '1px solid #e2e8f0',
                                                        minHeight: '44px'
                                                    }}>
                                                        {(!datos.categorias || datos.categorias.length === 0) ? (
                                                            <div style={{ fontSize: '0.82rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                                                <span>Aún no hay categorías registradas.</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setMostrarModalNuevaCat(true)}
                                                                    style={{
                                                                        padding: '0.25rem 0.65rem',
                                                                        borderRadius: '6px',
                                                                        border: '1px dashed #0284c7',
                                                                        background: '#eff6ff',
                                                                        color: '#0284c7',
                                                                        fontWeight: 'bold',
                                                                        fontSize: '0.8rem',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    ➕ Crear primera categoría
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            datos.categorias.map((cat) => {
                                                                const seleccionada = prodCategorias.some(
                                                                    (c) => c.toLowerCase() === cat.nombre?.toLowerCase()
                                                                );
                                                                return (
                                                                    <button
                                                                        key={cat.id || cat.nombre}
                                                                        type="button"
                                                                        onClick={() => toggleCategoriaProducto(cat.nombre)}
                                                                        style={{
                                                                            padding: '0.35rem 0.8rem',
                                                                            borderRadius: '999px',
                                                                            border: seleccionada ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                                            fontWeight: 'bold',
                                                                            fontSize: '0.82rem',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.35rem',
                                                                            background: seleccionada ? '#0284c7' : '#ffffff',
                                                                            color: seleccionada ? '#ffffff' : '#334155',
                                                                            boxShadow: seleccionada ? '0 1px 2px rgba(2,132,199,0.2)' : 'none',
                                                                            transition: 'all 0.15s ease'
                                                                        }}
                                                                    >
                                                                        <span>{seleccionada ? '✓' : '🏷️'}</span>
                                                                        <span>{cat.nombre}</span>
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                    {prodCategorias.length > 0 && (
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem' }}>
                                                            <span style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: 500 }}>
                                                                Asignadas: <strong>{prodCategorias.join(', ')}</strong>
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setProdCategorias([])}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    color: '#64748b',
                                                                    fontSize: '0.75rem',
                                                                    cursor: 'pointer',
                                                                    textDecoration: 'underline'
                                                                }}
                                                            >
                                                                Limpiar selección
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* SELECTOR DE MODO DE COMPOSICIÓN / INVENTARIO */}
                                                <div style={{ marginTop: '0.4rem' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '0.4rem' }}>
                                                        Composición y Origen de Inventario:
                                                    </span>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.9fr', gap: '0.4rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setTipoComposicion('unitario')}
                                                            style={{
                                                                padding: '0.6rem 0.5rem',
                                                                borderRadius: '8px',
                                                                border: tipoComposicion === 'unitario' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                                background: tipoComposicion === 'unitario' ? '#f0f9ff' : '#fff',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                fontSize: '0.82rem'
                                                            }}
                                                        >
                                                            <strong>📦 Artículo Unitario</strong>
                                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>Reventa 1 a 1 de un insumo</div>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setTipoComposicion('receta')}
                                                            style={{
                                                                padding: '0.6rem 0.5rem',
                                                                borderRadius: '8px',
                                                                border: tipoComposicion === 'receta' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                                background: tipoComposicion === 'receta' ? '#f0f9ff' : '#fff',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                fontSize: '0.82rem'
                                                            }}
                                                        >
                                                            <strong>🧪 Receta / Ensamble</strong>
                                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>Hasta 30 insumos métricos</div>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setTipoComposicion('libre')}
                                                            style={{
                                                                padding: '0.6rem 0.5rem',
                                                                borderRadius: '8px',
                                                                border: tipoComposicion === 'libre' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                                background: tipoComposicion === 'libre' ? '#f0f9ff' : '#fff',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                fontSize: '0.82rem'
                                                            }}
                                                        >
                                                            <strong>✨ Venta Libre</strong>
                                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>Servicio sin inventario</div>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* OPCIÓN 1: PRODUCTO UNITARIO (1 a 1) */}
                                                {tipoComposicion === 'unitario' && (
                                                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                        <label style={{ fontSize: '0.84rem', color: '#334155' }}>
                                                            Selecciona el Insumo del Inventario:
                                                            <select
                                                                required
                                                                value={insumoUnitarioId}
                                                                onChange={(e) => setInsumoUnitarioId(e.target.value)}
                                                                style={inputStyle}
                                                            >
                                                                <option value="">-- Elige el insumo/artículo a vender --</option>
                                                                {(datos.insumos || []).map((ins) => (
                                                                    <option key={ins.id} value={ins.id}>
                                                                        {ins.nombre} (Stock: {ins.stock_actual} {ins.unidad_medida} | Costo: Bs {Number(ins.costo_por_unidad).toFixed(2)})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>
                                                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.4rem' }}>
                                                            🔒 <em>Relación 1 a 1: Cada venta descontará automáticamente 1 unidad de este insumo. No se pueden agregar insumos adicionales.</em>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* OPCIÓN 2: RECETA / ENSAMBLE (HASTA 30 INSUMOS) */}
                                                {tipoComposicion === 'receta' && (
                                                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                            <span style={{ fontSize: '0.84rem', fontWeight: 'bold', color: '#334155' }}>
                                                                Insumos y Materiales de la Receta:
                                                            </span>
                                                            <span style={{ fontSize: '0.78rem', color: filasReceta.length >= 30 ? '#dc2626' : '#0284c7', fontWeight: 'bold' }}>
                                                                {filasReceta.length} / 30 insumos
                                                            </span>
                                                        </div>

                                                        {filasReceta.map((fila, index) => {
                                                            const insSel = (datos.insumos || []).find((i) => String(i.id) === String(fila.insumoId));
                                                            const unidadAlm = insSel ? insSel.unidad_medida : 'unidades';
                                                            const opcionesComp = obtenerUnidadesCompatibles(unidadAlm);
                                                            return (
                                                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 34px', gap: '0.4rem', marginBottom: '0.45rem', alignItems: 'center' }}>
                                                                    <select
                                                                        required
                                                                        value={fila.insumoId}
                                                                        onChange={(e) => cambiarFilaReceta(index, 'insumoId', e.target.value)}
                                                                        style={{ ...inputStyle, margin: 0, fontSize: '0.82rem' }}
                                                                    >
                                                                        <option value="">-- Insumo --</option>
                                                                        {(datos.insumos || []).map((i) => (
                                                                            <option key={i.id} value={i.id}>
                                                                                {i.nombre} ({i.unidad_medida})
                                                                            </option>
                                                                        ))}
                                                                    </select>

                                                                    <input
                                                                        type="number"
                                                                        step="0.001"
                                                                        min="0.001"
                                                                        required
                                                                        placeholder="Cantidad"
                                                                        value={fila.cantidad}
                                                                        onChange={(e) => cambiarFilaReceta(index, 'cantidad', e.target.value)}
                                                                        style={{ ...inputStyle, margin: 0, fontSize: '0.82rem' }}
                                                                    />

                                                                    <select
                                                                        value={fila.unidadReceta || unidadAlm}
                                                                        onChange={(e) => cambiarFilaReceta(index, 'unidadReceta', e.target.value)}
                                                                        style={{ ...inputStyle, margin: 0, fontSize: '0.82rem' }}
                                                                    >
                                                                        {opcionesComp.map((o) => (
                                                                            <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                                                                        ))}
                                                                    </select>

                                                                    <button
                                                                        type="button"
                                                                        disabled={filasReceta.length <= 1}
                                                                        onClick={() => quitarFilaReceta(index)}
                                                                        style={{
                                                                            padding: '0.4rem',
                                                                            background: filasReceta.length <= 1 ? '#e2e8f0' : '#fee2e2',
                                                                            color: filasReceta.length <= 1 ? '#94a3b8' : '#b91c1c',
                                                                            border: 'none',
                                                                            borderRadius: '4px',
                                                                            cursor: filasReceta.length <= 1 ? 'not-allowed' : 'pointer',
                                                                            fontWeight: 'bold'
                                                                        }}
                                                                        title="Quitar este insumo"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}

                                                        <button
                                                            type="button"
                                                            disabled={filasReceta.length >= 30}
                                                            onClick={agregarFilaReceta}
                                                            style={{
                                                                width: '100%',
                                                                marginTop: '0.25rem',
                                                                padding: '0.4rem',
                                                                background: '#f1f5f9',
                                                                color: '#0284c7',
                                                                border: '1px dashed #cbd5e1',
                                                                borderRadius: '6px',
                                                                cursor: filasReceta.length >= 30 ? 'not-allowed' : 'pointer',
                                                                fontSize: '0.82rem',
                                                                fontWeight: 'bold'
                                                            }}
                                                        >
                                                            ➕ Agregar otro insumo a la receta ({filasReceta.length}/30)
                                                        </button>
                                                    </div>
                                                )}

                                                {/* OPCIÓN 3: SERVICIO / LIBRE */}
                                                {tipoComposicion === 'libre' && (
                                                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.82rem', color: '#64748b' }}>
                                                        ✨ <em>Este producto se registrará como servicio o venta libre sin descontar stock físico del inventario.</em>
                                                    </div>
                                                )}

                                                {/* PANEL DE CÁLCULO FINANCIERO AUTOMÁTICO EN VIVO */}
                                                <div style={{ background: '#f0fdf4', padding: '0.85rem', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-around', alignItems: 'center', textAlign: 'center' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', fontWeight: 'bold' }}>Costo Calculado</div>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#15803d' }}>
                                                            Bs {costoEstimado.toFixed(2)}
                                                        </div>
                                                    </div>
                                                    <div style={{ borderLeft: '1px solid #86efac', height: '35px' }} />
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', fontWeight: 'bold' }}>Ganancia Estimada</div>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: gananciaEstimada >= 0 ? '#15803d' : '#b91c1c' }}>
                                                            Bs {gananciaEstimada.toFixed(2)}
                                                        </div>
                                                    </div>
                                                    <div style={{ borderLeft: '1px solid #86efac', height: '35px' }} />
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', fontWeight: 'bold' }}>Margen Comercial</div>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: margenPorcentaje >= 0 ? '#0284c7' : '#b91c1c' }}>
                                                            {margenPorcentaje.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                </div>

                                                <button type="submit" style={{ ...btnPrimario, marginTop: '0.5rem', padding: '0.75rem' }}>
                                                    ✅ Guardar Producto en Catálogo
                                                </button>
                                            </form>
                                        </section>

                                        {/* COLUMNA DERECHA: ATAJOS Y ESTADO DE INVENTARIO */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <section style={cardStyle}>
                                                <h3 style={{ marginTop: 0 }}>🧱 Materiales e Insumos en Almacén</h3>
                                                <p style={{ color: '#64748b', fontSize: '0.84rem', marginTop: 0 }}>
                                                    Los costos de tus productos y su disponibilidad máxima se actualizan automáticamente cuando ingresas compras de insumos.
                                                </p>
                                                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                        <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                                            <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                                                <th style={{ padding: '0.4rem' }}>Insumo</th>
                                                                <th style={{ padding: '0.4rem' }}>Stock</th>
                                                                <th style={{ padding: '0.4rem' }}>Costo Unit.</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(datos.insumos || []).length === 0 ? (
                                                                <tr>
                                                                    <td colSpan="3" style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>
                                                                        Aún no tienes insumos registrados.
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                (datos.insumos || []).map((ins) => (
                                                                    <tr key={ins.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                        <td style={{ padding: '0.4rem' }}><strong>{ins.nombre}</strong></td>
                                                                        <td style={{ padding: '0.4rem' }}>{ins.stock_actual} {ins.unidad_medida}</td>
                                                                        <td style={{ padding: '0.4rem' }}>Bs {Number(ins.costo_por_unidad).toFixed(2)}</td>
                                                                    </tr>
                                                                ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => { limpiarAlertas(); setSeccionActiva('insumos'); }}
                                                        style={{ ...btnSecundario, flex: 1, fontSize: '0.82rem', padding: '0.45rem' }}
                                                    >
                                                        🚚 Ir a Reabastecer Insumos
                                                    </button>
                                                </div>
                                            </section>

                                            {/* Si algún producto requiere compra directa tradicional */}
                                            {usaStockDirecto && (
                                                <section style={cardStyle}>
                                                    <h3 style={{ marginTop: 0, fontSize: '0.98rem' }}>🚚 Reabastecer Artículo Directo (NIC 2)</h3>
                                                    {(() => {
                                                        const productosDirectos = (datos.productos || []).filter((p) => p.tipo_inventario === 'directo');
                                                        if (productosDirectos.length === 0) {
                                                            return (
                                                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
                                                                    No hay artículos de reventa directa registrados. Los artículos con receta (como café o bebidas) se abastecen automáticamente mediante sus insumos.
                                                                </p>
                                                            );
                                                        }
                                                        return (
                                                            <form onSubmit={handleComprarProductoDirecto} style={formCol}>
                                                                <select value={compraProdId} onChange={(e) => setCompraProdId(e.target.value)} style={inputStyle}>
                                                                    <option value="">-- Selecciona el artículo directo --</option>
                                                                    {productosDirectos.map((p) => (
                                                                        <option key={p.id} value={p.id}>
                                                                            {p.nombre} (Stock: {p.stock ?? 0} {p.unidad_medida || 'u.'} | Costo: Bs {Number(p.costo).toFixed(2)})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                                                    <input type="number" step="0.01" placeholder="Cantidad" required value={compraProdCantidad} onChange={(e) => setCompraProdCantidad(e.target.value)} style={inputStyle} />
                                                                    <input type="number" step="0.01" placeholder="Costo Total (Bs)" required value={compraProdCostoTotal} onChange={(e) => setCompraProdCostoTotal(e.target.value)} style={inputStyle} />
                                                                </div>
                                                                <button type="submit" style={{ ...btnOscuro, padding: '0.45rem', fontSize: '0.82rem' }}>Registrar Entrada</button>
                                                            </form>
                                                        );
                                                    })()}
                                                </section>
                                            )}
                                        </div>
                                    </div>

                                    {/* TABLA INVENTARIO ACTUAL DE ARTÍCULOS FILTRADA POR PESTAÑA */}
                                    <section style={{ ...cardStyle, marginTop: '0.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                            <h3 style={{ margin: 0 }}>
                                                Catálogo de Artículos {categoriaTabActiva !== 'todas' ? `— Categoría: ${categoriaTabActiva}` : ''}
                                            </h3>
                                            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                                Mostrando {productosFiltrados.length} artículo(s)
                                            </span>
                                        </div>

                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', background: '#f8fafc' }}>
                                                    <th style={thTd}>ID</th>
                                                    <th style={thTd}>Artículo</th>
                                                    <th style={thTd}>Categoría</th>
                                                    <th style={thTd}>Modalidad</th>
                                                    <th style={thTd}>Precio Venta</th>
                                                    <th style={thTd}>Costo Unitario</th>
                                                    <th style={thTd}>Ganancia Unitaria</th>
                                                    <th style={thTd}>Disponibilidad (Stock)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {productosFiltrados.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                                                            No hay artículos registrados en esta categoría.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    productosFiltrados.map((p) => {
                                                        const gananciaUni = Number(p.precio) - Number(p.costo || 0);
                                                        const stockBajo = p.tipo_inventario === 'directo' && Number(p.stock) <= Number(p.stock_minimo || 0);
                                                        return (
                                                            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                                <td style={thTd}>#{p.id}</td>
                                                                <td style={thTd}><strong>{p.nombre}</strong></td>
                                                                <td style={thTd}>
                                                                    {p.categoria && p.categoria.trim() ? (
                                                                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                                                            {p.categoria.split(',').map((catItem, idx) => {
                                                                                const cTrim = catItem.trim();
                                                                                if (!cTrim) return null;
                                                                                return (
                                                                                    <span
                                                                                        key={idx}
                                                                                        style={{
                                                                                            background: '#eff6ff',
                                                                                            color: '#0369a1',
                                                                                            border: '1px solid #bae6fd',
                                                                                            padding: '0.15rem 0.5rem',
                                                                                            borderRadius: '999px',
                                                                                            fontSize: '0.75rem',
                                                                                            fontWeight: '600',
                                                                                            whiteSpace: 'nowrap'
                                                                                        }}
                                                                                    >
                                                                                        🏷️ {cTrim}
                                                                                    </span>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    ) : (
                                                                        <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontStyle: 'italic' }}>
                                                                            Sin categoría
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td style={thTd}>
                                                                    {p.tipo_inventario === 'receta' ? '🧪 Receta / Insumo' : p.tipo_inventario === 'directo' ? '📦 Reventa Directa' : '✨ Libre'}
                                                                </td>
                                                                <td style={{ ...thTd, fontWeight: 'bold' }}>Bs {Number(p.precio).toFixed(2)}</td>
                                                                <td style={thTd}>Bs {Number(p.costo).toFixed(2)}</td>
                                                                <td style={{ ...thTd, color: gananciaUni >= 0 ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>
                                                                    Bs {gananciaUni.toFixed(2)}
                                                                </td>
                                                                <td style={{ ...thTd, fontWeight: 'bold', color: p.unidades_disponibles === 0 ? '#b91c1c' : '#166534' }}>
                                                                    {p.tipo_inventario === 'libre' || p.unidades_disponibles === null
                                                                        ? 'Libre (Servicio)'
                                                                        : `${p.unidades_disponibles} ${p.unidad_medida || 'u.'} ${p.insumo_limitante ? `(Límite: ${p.insumo_limitante})` : ''} ${stockBajo ? '⚠️ (Reponer)' : ''}`}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </section>
                                </div>
                            );
                        })()}

                        {/* ==========================================
                            MÓDULO 4: MATERIALES / INSUMOS (SOLO SI USA RECETAS/ENSAMBLAJE)
                           ========================================== */}
                        {seccionActiva === 'insumos' && usaRecetas && (
                            <>
                                <section style={{ ...cardStyle, marginBottom: '1.5rem' }}>
                                    <h2 style={{ marginTop: 0 }}>🧱 Estado de Materiales / Insumos y Punto de Reorden</h2>
                                    {(datos.prediccionInsumos || []).length === 0 ? (
                                        <p style={{ color: '#666' }}>No hay materiales o insumos registrados todavía.</p>
                                    ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                                    <th style={thTd}>Material / Insumo</th>
                                                    <th style={thTd}>Stock Actual</th>
                                                    <th style={thTd}>Consumo Diario Prom.</th>
                                                    <th style={thTd}>Punto Reorden (ROP)</th>
                                                    <th style={thTd}>Compra Sugerida</th>
                                                    <th style={thTd}>Costo Estimado</th>
                                                    <th style={thTd}>Estado / Alerta</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {datos.prediccionInsumos.map((ins) => (
                                                    <tr key={ins.insumoId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                        <td style={thTd}><strong>{ins.nombre}</strong></td>
                                                        <td style={thTd}>{ins.stockActual} {ins.unidad}</td>
                                                        <td style={thTd}>{ins.consumoPromedioDiario} {ins.unidad}/día</td>
                                                        <td style={thTd}>{ins.puntoReordenROP} {ins.unidad}</td>
                                                        <td style={thTd}>{ins.cantidadSugeridaCompra} {ins.unidad}</td>
                                                        <td style={thTd}>Bs {ins.costoEstimadoCompra.toFixed(2)}</td>
                                                        <td style={{ ...thTd, fontWeight: 'bold', color: ins.estadoAlerta === 'OK' ? '#166534' : '#b91c1c' }}>
                                                            {ins.estadoAlerta}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </section>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    <section style={cardStyle}>
                                        <h3 style={{ marginTop: 0 }}>Registrar Compra de Material / Insumo (CPP - NIC 2)</h3>
                                        <form onSubmit={handleCompraCPP} style={formCol}>
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Seleccionar Material / Insumo:
                                                <select value={compraInsumoId} onChange={(e) => setCompraInsumoId(e.target.value)} style={inputStyle}>
                                                    {(datos.insumos || []).map((i) => (
                                                        <option key={i.id} value={i.id}>
                                                            {i.nombre} (Stock: {i.stock_actual} {i.unidad_medida})
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Nombre de la distribuidora:
                                                <input
                                                    type="text"
                                                    placeholder="Nombre de la distribuidora"
                                                    value={compraDistribuidora}
                                                    onChange={(e) => setCompraDistribuidora(e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </label>
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Cantidad Comprada (según su unidad de medida):
                                                <input type="number" step="0.01" placeholder="Ej. 10" required value={compraCantidad} onChange={(e) => setCompraCantidad(e.target.value)} style={inputStyle} />
                                            </label>
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Costo Total Pagado por la Compra (Bs):
                                                <input type="number" step="0.01" placeholder="Ej. 150.00" required value={compraCostoTotal} onChange={(e) => setCompraCostoTotal(e.target.value)} style={inputStyle} />
                                            </label>
                                            <button type="submit" style={btnOscuro}>Registrar Compra y Actualizar Costos</button>
                                        </form>
                                    </section>

                                    <section style={cardStyle}>
                                        <h3 style={{ marginTop: 0 }}>Registrar Nuevo Material / Insumo</h3>
                                        <form onSubmit={handleCrearInsumo} style={formCol}>
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Nombre del Material, Pieza o Ingrediente:
                                                <input placeholder="Nombre del material o insumo" required value={insNombre} onChange={(e) => setInsNombre(e.target.value)} style={inputStyle} />
                                            </label>
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Unidad de Medida (Sistema Métrico o Unidades):
                                                <select value={insUnidad} onChange={(e) => setInsUnidad(e.target.value)} style={inputStyle}>
                                                    <option value="unidades">Unidades (u. / piezas / paquetes)</option>
                                                    <option value="metros">Metros (m)</option>
                                                    <option value="centimetros">Centímetros (cm)</option>
                                                    <option value="litros">Litros (L)</option>
                                                    <option value="mililitros">Mililitros (ml)</option>
                                                    <option value="kilos">Kilos (kg)</option>
                                                    <option value="gramos">Gramos (g)</option>
                                                    <option value="miligramos">Miligramos (mg)</option>
                                                </select>
                                            </label>
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Stock Inicial Disponible en Almacén:
                                                <input type="number" step="0.01" min="0" placeholder="Cantidad actual (0 si aún no compraste)" value={insStockIni} onChange={(e) => setInsStockIni(e.target.value)} style={inputStyle} />
                                            </label>
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Costo por unidad (Bs):
                                                <input type="number" step="0.01" min="0" placeholder="Cuánto cuesta 1 unidad en Bs" value={insCostoUni} onChange={(e) => setInsCostoUni(e.target.value)} style={inputStyle} />
                                            </label>
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Stock de Seguridad (Reserva mínima para alerta de reposición):
                                                <input type="number" step="0.01" min="0" placeholder="Cantidad mínima antes de alertar" value={insStockSeg} onChange={(e) => setInsStockSeg(e.target.value)} style={inputStyle} />
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.2rem 0' }}>
                                                <input
                                                    type="checkbox"
                                                    id="checkInsVencimiento"
                                                    checked={insTieneVencimiento}
                                                    onChange={(e) => {
                                                        setInsTieneVencimiento(e.target.checked);
                                                        if (!e.target.checked) setInsFechaVencimiento('');
                                                    }}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                />
                                                <label htmlFor="checkInsVencimiento" style={{ fontSize: '0.85rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                                                    ¿Tiene fecha de vencimiento?
                                                </label>
                                            </div>
                                            {insTieneVencimiento && (
                                                <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                    Fecha de Vencimiento:
                                                    <input type="date" required={insTieneVencimiento} value={insFechaVencimiento} onChange={(e) => setInsFechaVencimiento(e.target.value)} style={inputStyle} />
                                                </label>
                                            )}
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Proveedor:
                                                <input
                                                    type="text"
                                                    placeholder="ingrese nombre de provedor"
                                                    value={insProveedor}
                                                    onChange={(e) => setInsProveedor(e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </label>
                                            <button type="submit" style={btnPrimario}>Crear Material / Insumo</button>
                                        </form>
                                    </section>
                                </div>
                            </>
                        )}

                        {/* ==========================================
                            MÓDULO 5: USUARIOS, JERARQUÍA Y CONTRASEÑAS
                           ========================================== */}
                        {seccionActiva === 'usuarios' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1.5rem' }}>
                                <section style={cardStyle}>
                                    <h3 style={{ marginTop: 0 }}>👥 Registrar Nuevo Usuario</h3>
                                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#555' }}>
                                        Jerarquía activa: <strong>Super Admin</strong> &gt; <strong>Admin</strong> &gt; <strong>Cajero (user)</strong>.
                                    </p>
                                    <form onSubmit={handleCrearUsuario} style={formCol}>
                                        <input placeholder="Nombre completo o usuario" required value={nuevoUsuarioNombre} onChange={(e) => setNuevoUsuarioNombre(e.target.value)} style={inputStyle} />
                                        <input placeholder="PIN o Contraseña inicial" required value={nuevoUsuarioPin} onChange={(e) => setNuevoUsuarioPin(e.target.value)} style={inputStyle} />
                                        <select value={nuevoUsuarioRol} onChange={(e) => setNuevoUsuarioRol(e.target.value)} style={inputStyle}>
                                            <option value="user">Cajero (user)</option>
                                            {(adminAutenticado.rol === 'superadmin' || adminAutenticado.rol === 'developer') && (
                                                <option value="admin">Administrador (admin) — Exclusivo Super Admin</option>
                                            )}
                                            {adminAutenticado.rol === 'developer' && (
                                                <option value="superadmin">Super Admin (superadmin) — Exclusivo Developer</option>
                                            )}
                                        </select>
                                        <button type="submit" style={btnPrimario}>Crear Usuario</button>
                                    </form>
                                </section>

                                <section style={cardStyle}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <h3 style={{ margin: 0 }}>Directorio de Usuarios y Control de PIN</h3>
                                        {adminAutenticado.rol === 'developer' && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setUsuarioCambioPin(adminAutenticado);
                                                    setPinActualInput('');
                                                    setNuevoPinInput('');
                                                }}
                                                style={{ padding: '0.32rem 0.65rem', background: '#0f172a', color: '#facc15', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                                            >
                                                💻 Cambiar mi PIN (developer)
                                            </button>
                                        )}
                                    </div>
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                        {(datos.usuarios || []).map((u) => {
                                            const esMismoUsuario = Number(u.id) === Number(adminAutenticado.id);
                                            const esInferior = NIVEL_ROL[adminAutenticado.rol] > NIVEL_ROL[u.rol];
                                            const etiquetaRol = u.rol === 'superadmin' ? '👑 SUPER ADMIN' : u.rol === 'admin' ? '🛡️ ADMIN' : '👤 CAJERO';

                                            return (
                                                <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0', borderBottom: '1px solid #eee', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <div>
                                                        <strong>{u.nombre}</strong>{' '}
                                                        <span style={{
                                                            fontSize: '0.75rem',
                                                            padding: '0.15rem 0.45rem',
                                                            borderRadius: '4px',
                                                            background: u.rol === 'superadmin' ? '#fef3c7' : u.rol === 'admin' ? '#dbeafe' : '#f3f4f6',
                                                            color: u.rol === 'superadmin' ? '#92400e' : u.rol === 'admin' ? '#1e40af' : '#374151',
                                                            fontWeight: 'bold'
                                                        }}>
                                                            {etiquetaRol}
                                                        </span>{' '}
                                                        <small style={{ color: '#6b7280' }}>ID #{u.id}</small>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                        {(esMismoUsuario || esInferior) ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setUsuarioCambioPin(u);
                                                                    setPinActualInput('');
                                                                    setNuevoPinInput('');
                                                                }}
                                                                style={{ padding: '0.32rem 0.65rem', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}
                                                            >
                                                                {esMismoUsuario ? 'Cambiar mi PIN' : 'Cambiar PIN'}
                                                            </button>
                                                        ) : (
                                                            <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                                                                🔒 Rango igual/superior
                                                            </span>
                                                        )}
                                                        {esInferior && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleBorrarUsuario(u.id)}
                                                                style={{ padding: '0.32rem 0.65rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}
                                                            >
                                                                Dar de baja
                                                            </button>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>

                                    {usuarioCambioPin && (
                                        <form onSubmit={confirmarCambioPassword} style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                            <strong>Cambiar PIN / Contraseña de: {usuarioCambioPin.nombre}</strong>
                                            {Number(usuarioCambioPin.id) === Number(adminAutenticado.id) && (
                                                <input
                                                    type="password"
                                                    placeholder="Tu PIN / Contraseña actual"
                                                    required
                                                    value={pinActualInput}
                                                    onChange={(e) => setPinActualInput(e.target.value)}
                                                    style={inputStyle}
                                                />
                                            )}
                                            <input
                                                type="password"
                                                placeholder="Nuevo PIN / Contraseña"
                                                required
                                                value={nuevoPinInput}
                                                onChange={(e) => setNuevoPinInput(e.target.value)}
                                                style={inputStyle}
                                            />
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button type="submit" style={btnPrimario}>Guardar Nuevo PIN</button>
                                                <button type="button" onClick={() => setUsuarioCambioPin(null)} style={btnSecundario}>Cancelar</button>
                                            </div>
                                        </form>
                                    )}
                                </section>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

function plantillaBtnStyle(activo) {
    return {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        textAlign: 'left',
        padding: '0.85rem',
        borderRadius: '8px',
        border: activo ? '2px solid #0284c7' : '1px solid #cbd5e1',
        background: activo ? '#f0f9ff' : '#fff',
        cursor: 'pointer'
    };
}

const sidebarStyle = {
    width: '265px',
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

const cardStyle = {
    background: '#fff',
    padding: '1.25rem',
    borderRadius: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
};

const kpiCard = {
    background: '#fff',
    padding: '1rem',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
};

const formCol = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem'
};

const inputStyle = {
    width: '100%',
    padding: '0.55rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    boxSizing: 'border-box'
};

const btnPrimario = {
    padding: '0.65rem 1rem',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

const btnOscuro = {
    padding: '0.65rem 1rem',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

const btnSecundario = {
    padding: '0.65rem 1rem',
    background: '#e5e7eb',
    color: '#111',
    borderRadius: '6px',
    fontWeight: 'bold',
    textDecoration: 'none'
};

const thTd = {
    padding: '0.55rem 0.45rem'
};
