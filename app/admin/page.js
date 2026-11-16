'use client';

import { useState, useEffect } from 'react';
import GraficosFinancieros from './GraficosFinancieros';
import { exportarReportePDF } from './exportarPDF';

export default function AdminPage() {
    const [cargando, setCargando] = useState(true);
    const [seccionActiva, setSeccionActiva] = useState('arqueos'); // 'arqueos' | 'ventas' | 'catalogo' | 'insumos' | 'usuarios' | 'exportacion' | 'configuracion'

    const [datos, setDatos] = useState({
        configuracionNegocio: null,
        cajasFisicas: [],
        cajasAbiertas: [],
        cajaAbierta: null,
        cajaAuditada: null,
        historialCajas: [],
        estadisticas: null,
        movimientos: [],
        desglosePagos: [],
        productos: [],
        insumos: [],
        usuarios: [],
        prediccionInsumos: [],
        kardexDetallado: { kardexProductosDirectos: [], kardexInsumos: [] }
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

    // Estado para Configuración Contable y Régimen Tributario Modular
    const [mostrarPanelContable, setMostrarPanelContable] = useState(false);
    const [cfgNitNegocio, setCfgNitNegocio] = useState('');
    const [cfgRegimenTributario, setCfgRegimenTributario] = useState('simplificado_control_interno');
    const [cfgEmiteFactura, setCfgEmiteFactura] = useState(false);
    const [cfgIvaPorcentaje, setCfgIvaPorcentaje] = useState('13');
    const [cfgItPorcentaje, setCfgItPorcentaje] = useState('3');
    const [cfgItBase, setCfgItBase] = useState('todas_las_ventas');
    const [cfgUsaRespaldoComprasEgresos, setCfgUsaRespaldoComprasEgresos] = useState(true);

    // Filtros para Exportación Contable (Rango de Fechas, Usuario, Estación y Turno Auditado)
    const [filtroExportDesde, setFiltroExportDesde] = useState('');
    const [filtroExportHasta, setFiltroExportHasta] = useState('');
    const [filtroExportUsuarioId, setFiltroExportUsuarioId] = useState('');
    const [filtroExportCajaFisicaId, setFiltroExportCajaFisicaId] = useState('');
    const [turnoAuditadoId, setTurnoAuditadoId] = useState(null);

    // Apertura de nuevo turno desde Admin
    const [nuevoFondoInicial, setNuevoFondoInicial] = useState('100');
    const [cajaFisicaParaAbrir, setCajaFisicaParaAbrir] = useState('');

    // Gestión de Estaciones Físicas de Caja
    const [nuevaCajaFisicaNombre, setNuevaCajaFisicaNombre] = useState('');
    const [mostrarPanelCajasFisicas, setMostrarPanelCajasFisicas] = useState(false);

    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    // Categorías y Pestañas
    const [categoriaTabActiva, setCategoriaTabActiva] = useState('todas');
    const [mostrarModalNuevaCat, setMostrarModalNuevaCat] = useState(false);
    const [nuevaCatNombre, setNuevaCatNombre] = useState('');

    // Buscador y Paginación Limpia para Catálogo e Insumos
    const [busquedaProductos, setBusquedaProductos] = useState('');
    const [paginaProductos, setPaginaProductos] = useState(1);
    const [limitePorPaginaProductos, setLimitePorPaginaProductos] = useState(10);

    const [busquedaInsumos, setBusquedaInsumos] = useState('');
    const [paginaInsumos, setPaginaInsumos] = useState(1);
    const [limitePorPaginaInsumos, setLimitePorPaginaInsumos] = useState(10);

    // Formularios de Catálogo de Artículos / Productos
    const [prodNombre, setProdNombre] = useState('');
    const [prodPrecio, setProdPrecio] = useState('');
    const [prodCategorias, setProdCategorias] = useState([]);
    const [tipoComposicion, setTipoComposicion] = useState('unitario'); // 'directo' | 'unitario' | 'receta' | 'libre' | 'combo'
    const [prodDirectoStockIni, setProdDirectoStockIni] = useState('0');
    const [prodDirectoCostoIni, setProdDirectoCostoIni] = useState('0');
    const [prodDirectoStockMin, setProdDirectoStockMin] = useState('2');
    const [prodDirectoUnidad, setProdDirectoUnidad] = useState('unidades');
    const [prodDirectoVencimiento, setProdDirectoVencimiento] = useState('');
    const [insumoUnitarioId, setInsumoUnitarioId] = useState('');
    const [filasReceta, setFilasReceta] = useState([{ insumoId: '', cantidad: '', unidadReceta: '' }]);
    const [filasCombo, setFilasCombo] = useState([{ productoId: '', cantidad: '1' }]);
    const [comboModoLimite, setComboModoLimite] = useState('sin_limite'); // 'sin_limite' | 'cantidad_maxima'
    const [comboCantidadMaxima, setComboCantidadMaxima] = useState('50');
    const [comboUsaVigencia, setComboUsaVigencia] = useState(false);
    const [comboFechaInicio, setComboFechaInicio] = useState('');
    const [comboFechaFin, setComboFechaFin] = useState('');

    // Compatibilidad y Reabastecimiento de Artículo Directo (con CPP y respaldo fiscal)
    const [compraProdId, setCompraProdId] = useState('');
    const [compraProdCantidad, setCompraProdCantidad] = useState('');
    const [compraProdCostoTotal, setCompraProdCostoTotal] = useState('');
    const [compraProdVencimiento, setCompraProdVencimiento] = useState('');
    const [compraProdProveedor, setCompraProdProveedor] = useState('');
    const [compraProdNit, setCompraProdNit] = useState('');
    const [compraProdNroFactura, setCompraProdNroFactura] = useState('');
    const [compraProdConFactura, setCompraProdConFactura] = useState(false);

    // Formulario de Mermas de Productos Directos (con confirmación y vista de resultado)
    const [mermaProdId, setMermaProdId] = useState('');
    const [mermaProdCantidad, setMermaProdCantidad] = useState('');
    const [mermaProdMotivo, setMermaProdMotivo] = useState('');
    const [mermaProdConfirmando, setMermaProdConfirmando] = useState(false);
    const [mermaProdResultado, setMermaProdResultado] = useState(null);

    // Formulario de Mermas de Insumos (con confirmación y vista de resultado)
    const [mermaInsId, setMermaInsId] = useState('');
    const [mermaInsCantidad, setMermaInsCantidad] = useState('');
    const [mermaInsMotivo, setMermaInsMotivo] = useState('');
    const [mermaInsConfirmando, setMermaInsConfirmando] = useState(false);
    const [mermaInsResultado, setMermaInsResultado] = useState(null);

    // Estado de verificación de integridad Kardex
    const [resultadoIntegridadKardex, setResultadoIntegridadKardex] = useState(null);

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
    const [compraNitProveedor, setCompraNitProveedor] = useState('');
    const [compraNroFactura, setCompraNroFactura] = useState('');
    const [compraConFactura, setCompraConFactura] = useState(false);
    const [compraCantidad, setCompraCantidad] = useState('');
    const [compraCostoTotal, setCompraCostoTotal] = useState('');

    const [recetaProdId, setRecetaProdId] = useState('');
    const [recetaInsumoId, setRecetaInsumoId] = useState('');
    const [recetaCantidad, setRecetaCantidad] = useState('');
    const [recetaUnidad, setRecetaUnidad] = useState('');

    // Gestión de Modificadores / Complementos
    const [subSeccionCatalogo, setSubSeccionCatalogo] = useState('articulos'); // 'articulos' | 'modificadores'
    const [nombreGrupoMod, setNombreGrupoMod] = useState('');
    const [tipoSeleccionGrupoMod, setTipoSeleccionGrupoMod] = useState('unica');
    const [esObligatorioGrupoMod, setEsObligatorioGrupoMod] = useState(false);
    const [opcionesGrupoMod, setOpcionesGrupoMod] = useState([
        { nombre: '', insumoId: '', cantidadInsumo: '0.2', precioAdicional: '0', insumoReemplazadoId: '', esDefault: false }
    ]);
    const [productoAsignarModId, setProductoAsignarModId] = useState('');
    const [gruposAsignarIds, setGruposAsignarIds] = useState([]);

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

    // Estados para notificaciones de cierre por correo
    const [enviandoPruebaEmail, setEnviandoPruebaEmail] = useState(false);
    const [enviandoEmailCajaId, setEnviandoEmailCajaId] = useState(null);

    async function handleProbarEmail() {
        try {
            setEnviandoPruebaEmail(true);
            setError(null);
            setMensaje(null);
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'probar_email' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al enviar correo de prueba.');
            setMensaje(`✅ ${data.mensaje}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setEnviandoPruebaEmail(false);
        }
    }

    async function handleReenviarEmailCierre(cajaId) {
        try {
            setEnviandoEmailCajaId(cajaId);
            setError(null);
            setMensaje(null);
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'reenviar_cierre_email', cajaId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al enviar el reporte por correo.');
            setMensaje(`✅ ${data.mensaje}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setEnviandoEmailCajaId(null);
        }
    }

    async function cargarTodo(cajaAuditadaOpcional = turnoAuditadoId) {
        try {
            setCargando(true);
            const urlCaja = cajaAuditadaOpcional ? `/api/caja?cajaAuditadaId=${cajaAuditadaOpcional}` : '/api/caja';
            const resCaja = await fetch(urlCaja);
            const dataCaja = await resCaja.json();

            if (!resCaja.ok) throw new Error(dataCaja.error || 'Error al consultar /api/caja');

            if (!dataCaja.configuracionNegocio || Number(dataCaja.configuracionNegocio.configurado) === 0 || !dataCaja.sistemaInstalado) {
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
                setCfgNitNegocio(c.nit_negocio || '');
                setCfgRegimenTributario(c.regimen_tributario || 'simplificado_control_interno');
                setCfgEmiteFactura(Boolean(c.emite_factura));
                setCfgIvaPorcentaje(String(c.iva_porcentaje ?? 13));
                setCfgItPorcentaje(String(c.it_porcentaje ?? 3));
                setCfgItBase(c.it_base === 'solo_facturadas' ? 'solo_facturadas' : 'todas_las_ventas');
                setCfgUsaRespaldoComprasEgresos(c.usa_respaldo_compras_egresos !== undefined ? Boolean(c.usa_respaldo_compras_egresos) : true);
            }

            if (dataCaja.insumos?.length > 0) {
                if (!compraInsumoId) {
                    setCompraInsumoId(String(dataCaja.insumos[0].id));
                    setRecetaInsumoId(String(dataCaja.insumos[0].id));
                    setRecetaUnidad(dataCaja.insumos[0].unidad_medida || 'unidades');
                }
                setMermaInsId((prev) => (dataCaja.insumos.some((i) => String(i.id) === String(prev)) ? prev : String(dataCaja.insumos[0].id)));
            }
            if (dataCaja.productos?.length > 0) {
                if (!recetaProdId) setRecetaProdId(String(dataCaja.productos[0].id));
                const directos = dataCaja.productos.filter((p) => p.tipo_inventario === 'directo');
                if (directos.length > 0) {
                    setCompraProdId((prev) => (directos.some((d) => String(d.id) === String(prev)) ? prev : String(directos[0].id)));
                    setMermaProdId((prev) => (directos.some((d) => String(d.id) === String(prev)) ? prev : String(directos[0].id)));
                } else {
                    setCompraProdId('');
                    setMermaProdId('');
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
            // El panel admin siempre exige escribir el nombre de usuario (no se exponen cuentas privilegiadas)
            const payload = {
                accion: 'login',
                nombreUsuario: loginAdminNombreManual.trim(),
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
        const ok = await ejecutarAccion(
            {
                accion: 'abrir',
                montoInicial: Number(nuevoFondoInicial),
                cajaFisicaId: cajaFisicaParaAbrir ? Number(cajaFisicaParaAbrir) : null
            },
            'Nuevo turno de caja habilitado por el Administrador.'
        );
        if (ok) {
            setCajaFisicaParaAbrir('');
        }
    }

    async function handleCrearCajaFisica(e) {
        e.preventDefault();
        const nom = nuevaCajaFisicaNombre.trim();
        if (!nom) return;
        const ok = await ejecutarAccion(
            {
                accion: 'crear_caja_fisica',
                nombre: nom
            },
            `Estación de caja "${nom}" creada exitosamente.`
        );
        if (ok) {
            setNuevaCajaFisicaNombre('');
        }
    }

    async function handleDesactivarCajaFisica(cajaFisicaId, nombre) {
        if (!confirm(`¿Estás seguro de desactivar la estación "${nombre}"? Sus turnos y arqueos históricos se conservarán.`)) {
            return;
        }
        await ejecutarAccion(
            {
                accion: 'desactivar_caja_fisica',
                cajaFisicaId
            },
            `Estación "${nombre}" desactivada.`
        );
    }

    async function handleGuardarConfiguracionContable(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'guardar_configuracion_contable',
                nombreNegocio: cfgNombreNegocio,
                nitNegocio: cfgNitNegocio,
                regimenTributario: cfgRegimenTributario,
                emiteFactura: cfgEmiteFactura,
                ivaPorcentaje: Number(cfgIvaPorcentaje || 13),
                itPorcentaje: Number(cfgItPorcentaje || 3),
                itBase: cfgItBase,
                usaRespaldoComprasEgresos: cfgUsaRespaldoComprasEgresos
            },
            `Configuración contable actualizada (${cfgRegimenTributario === 'regimen_general' ? 'Régimen General con Facturación' : 'Control Interno / Régimen Simplificado'}).`
        );
        if (ok) {
            setMostrarPanelContable(false);
        }
    }

    async function handleTogglePermisoFiscalCaja(cajaFisicaId, actualHabilitado, nombre) {
        const nuevo = !actualHabilitado;
        await ejecutarAccion(
            {
                accion: 'actualizar_permiso_fiscal_caja',
                cajaFisicaId,
                habilitado: nuevo
            },
            `Respaldo fiscal en "${nombre}" ${nuevo ? 'HABILITADO' : 'DESHABILITADO'}.`
        );
    }

    async function handleTogglePermisoFiscalUsuario(usuarioObjetivoId, actualHabilitado, nombre) {
        const nuevo = !actualHabilitado;
        await ejecutarAccion(
            {
                accion: 'actualizar_permiso_fiscal_usuario',
                usuarioObjetivoId,
                habilitado: nuevo
            },
            `Permiso de registro de respaldo fiscal para "${nombre}" ${nuevo ? 'HABILITADO' : 'DESHABILITADO'}.`
        );
    }

    async function seleccionarTurnoParaAuditar(cajaId) {
        setTurnoAuditadoId(cajaId);
        await cargarTodo(cajaId);
        setMensaje(`Auditando Turno #${cajaId}. Los indicadores, movimientos y el botón de descarga PDF ahora apuntan a este turno.`);
    }

    async function handleReactivarCajaFisica(cajaFisicaId, nombre) {
        await ejecutarAccion(
            {
                accion: 'reactivar_caja_fisica',
                cajaFisicaId
            },
            `Estación "${nombre}" reactivada exitosamente.`
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

    function agregarOpcionGrupoMod() {
        const primerInsumo = (datos.insumos || [])[0];
        setOpcionesGrupoMod((prev) => [
            ...prev,
            {
                nombre: '',
                insumoId: primerInsumo ? String(primerInsumo.id) : '',
                cantidadInsumo: '0.2',
                precioAdicional: '0',
                insumoReemplazadoId: '',
                esDefault: false
            }
        ]);
    }

    function quitarOpcionGrupoMod(idx) {
        if (opcionesGrupoMod.length <= 1) return;
        setOpcionesGrupoMod((prev) => prev.filter((_, i) => i !== idx));
    }

    function cambiarOpcionGrupoMod(idx, campo, valor) {
        const copia = [...opcionesGrupoMod];
        copia[idx] = { ...copia[idx], [campo]: valor };
        setOpcionesGrupoMod(copia);
    }

    async function handleCrearGrupoModificador(e) {
        e.preventDefault();
        limpiarAlertas();
        const nom = nombreGrupoMod.trim();
        if (!nom) {
            setError('Ingresa un nombre para el grupo de modificadores.');
            return;
        }
        const opsValidadas = opcionesGrupoMod
            .filter((o) => o.nombre && o.nombre.trim())
            .map((o) => ({
                nombre: o.nombre.trim(),
                insumoId: o.insumoId ? Number(o.insumoId) : null,
                cantidadInsumo: Number(o.cantidadInsumo || 0),
                precioAdicional: Number(o.precioAdicional || 0),
                insumoReemplazadoId: o.insumoReemplazadoId ? Number(o.insumoReemplazadoId) : null,
                esDefault: Boolean(o.esDefault)
            }));

        if (opsValidadas.length === 0) {
            setError('Debes agregar al menos una opción válida para el grupo.');
            return;
        }

        const ok = await ejecutarAccion(
            {
                accion: 'crear_grupo_modificador',
                nombre: nom,
                tipoSeleccion: tipoSeleccionGrupoMod,
                esObligatorio: esObligatorioGrupoMod,
                opciones: opsValidadas
            },
            `Grupo "${nom}" creado exitosamente con ${opsValidadas.length} opción(es).`
        );

        if (ok) {
            setNombreGrupoMod('');
            setTipoSeleccionGrupoMod('unica');
            setEsObligatorioGrupoMod(false);
            const primerInsumo = (datos.insumos || [])[0];
            setOpcionesGrupoMod([
                {
                    nombre: '',
                    insumoId: primerInsumo ? String(primerInsumo.id) : '',
                    cantidadInsumo: '0.2',
                    precioAdicional: '0',
                    insumoReemplazadoId: '',
                    esDefault: false
                }
            ]);
        }
    }

    async function handleEliminarGrupoModificador(grupoId, nombre) {
        if (!confirm(`¿Eliminar el grupo "${nombre}"? Sus opciones no se ofrecerán en nuevas ventas.`)) {
            return;
        }
        await ejecutarAccion(
            {
                accion: 'eliminar_grupo_modificador',
                grupoId
            },
            `Grupo de complementos "${nombre}" eliminado.`
        );
    }

    async function handleGuardarAsignacionModificadores(e) {
        e.preventDefault();
        limpiarAlertas();
        if (!productoAsignarModId) {
            setError('Selecciona un producto con receta para asignarle grupos de complementos.');
            return;
        }
        await ejecutarAccion(
            {
                accion: 'asignar_modificadores_producto',
                productoId: Number(productoAsignarModId),
                grupoIds: gruposAsignarIds
            },
            'Grupos de complementos asignados al producto exitosamente.'
        );
    }

    function toggleGrupoAsignar(grupoId) {
        const idNum = Number(grupoId);
        setGruposAsignarIds((prev) =>
            prev.includes(idNum) ? prev.filter((id) => id !== idNum) : [...prev, idNum]
        );
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

        if (tipoComposicion === 'directo') {
            payload.stockInicial = Number(prodDirectoStockIni || 0);
            payload.costoInicial = Number(prodDirectoCostoIni || 0);
            payload.stockMinimo = Number(prodDirectoStockMin || 2);
            payload.unidadMedida = prodDirectoUnidad || 'unidades';
            payload.fechaVencimiento = cfgUsaVencimiento && prodDirectoVencimiento ? prodDirectoVencimiento : null;
        } else if (tipoComposicion === 'unitario') {
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
        } else if (tipoComposicion === 'combo') {
            const componentesLimpio = filasCombo.filter((f) => f.productoId && Number(f.cantidad) > 0);
            if (componentesLimpio.length === 0) {
                setError('Debes agregar al menos un producto componente con cantidad mayor a 0 para el combo.');
                return;
            }
            payload.componentesCombo = componentesLimpio;
            payload.limiteMaximoActivo = comboModoLimite === 'cantidad_maxima';
            if (payload.limiteMaximoActivo) {
                const maxVal = Number(comboCantidadMaxima);
                if (!Number.isFinite(maxVal) || maxVal <= 0) {
                    setError('Debes indicar una cantidad máxima válida mayor a 0.');
                    return;
                }
                payload.limiteUnidadesTotal = maxVal;
            }
            if (comboUsaVigencia) {
                payload.fechaInicioVigencia = comboFechaInicio ? new Date(comboFechaInicio).toISOString() : null;
                payload.fechaFinVigencia = comboFechaFin ? new Date(comboFechaFin).toISOString() : null;
                if (payload.fechaInicioVigencia && payload.fechaFinVigencia && new Date(payload.fechaInicioVigencia) > new Date(payload.fechaFinVigencia)) {
                    setError('La fecha y hora de inicio no puede ser posterior a la fecha final.');
                    return;
                }
            } else {
                payload.fechaInicioVigencia = null;
                payload.fechaFinVigencia = null;
            }
        }

        const ok = await ejecutarAccion(
            payload,
            `Artículo "${prodNombre}" registrado en el catálogo con costo y stock automáticos.`
        );
        if (ok) {
            setProdNombre('');
            setProdPrecio('');
            setProdDirectoStockIni('0');
            setProdDirectoCostoIni('0');
            setProdDirectoStockMin('2');
            setProdDirectoUnidad('unidades');
            setProdDirectoVencimiento('');
            setInsumoUnitarioId('');
            setFilasReceta([{ insumoId: '', cantidad: '', unidadReceta: '' }]);
            setFilasCombo([{ productoId: '', cantidad: '1' }]);
            setComboModoLimite('sin_limite');
            setComboCantidadMaxima('50');
            setComboUsaVigencia(false);
            setComboFechaInicio('');
            setComboFechaFin('');
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
                fechaVencimiento: cfgUsaVencimiento ? compraProdVencimiento : null,
                proveedorNombre: compraProdProveedor.trim() || null,
                proveedorNit: compraProdNit.trim() || null,
                nroFacturaCompra: compraProdNroFactura.trim() || null,
                conFactura: compraProdConFactura
            },
            'Entrada de stock registrada con Costo Promedio Ponderado (NIC 2) sobre el artículo.'
        );
        if (ok) {
            setCompraProdCantidad('');
            setCompraProdCostoTotal('');
            setCompraProdVencimiento('');
            setCompraProdProveedor('');
            setCompraProdNit('');
            setCompraProdNroFactura('');
            setCompraProdConFactura(false);
        }
    }

    async function handleConfirmarMermaProductoDirecto() {
        limpiarAlertas();
        try {
            const prodSel = (datos.productos || []).find((p) => String(p.id) === String(mermaProdId));
            if (!prodSel) throw new Error('Selecciona un producto directo válido.');
            const cant = Number(mermaProdCantidad);
            if (!Number.isFinite(cant) || cant <= 0) {
                throw new Error('La cantidad de merma debe ser mayor a 0.');
            }
            if (cant > Number(prodSel.stock || 0)) {
                throw new Error(`No puedes dar de baja ${cant} unidades porque el stock disponible es ${prodSel.stock}.`);
            }
            if (!mermaProdMotivo || mermaProdMotivo.trim().length < 3) {
                throw new Error('Ingresa un motivo descriptivo para la merma (mínimo 3 caracteres).');
            }

            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'merma_producto_directo',
                    productoId: Number(mermaProdId),
                    cantidadPerdida: cant,
                    motivo: mermaProdMotivo.trim()
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al registrar la merma de producto directo.');

            setMermaProdResultado({
                productoNombre: prodSel.nombre,
                cantidadPerdida: cant,
                unidadMedida: prodSel.unidad_medida || 'unidades',
                stockRestante: data.stockRestante,
                costoUnitario: data.costoUnitario,
                costoPerdida: data.costoPerdida,
                motivo: mermaProdMotivo.trim()
            });
            setMermaProdCantidad('');
            setMermaProdMotivo('');
            setMermaProdConfirmando(false);
            setMensaje(`✅ Merma registrada: -${cant} ${prodSel.unidad_medida || 'u.'} de "${prodSel.nombre}" (Pérdida valorizada: Bs ${Number(data.costoPerdida || 0).toFixed(2)} | Stock restante: ${data.stockRestante}).`);
            await cargarTodo();
        } catch (err) {
            setError(err.message);
            setMermaProdConfirmando(false);
        }
    }

    async function handleConfirmarMermaInsumo() {
        limpiarAlertas();
        try {
            const insSel = (datos.insumos || []).find((i) => String(i.id) === String(mermaInsId));
            if (!insSel) throw new Error('Selecciona un material o insumo válido.');
            const cant = Number(mermaInsCantidad);
            if (!Number.isFinite(cant) || cant <= 0) {
                throw new Error('La cantidad de merma debe ser mayor a 0.');
            }
            if (cant > Number(insSel.stock_actual || 0)) {
                throw new Error(`No puedes dar de baja ${cant} ${insSel.unidad_medida} porque el stock actual es ${insSel.stock_actual} ${insSel.unidad_medida}.`);
            }
            if (!mermaInsMotivo || mermaInsMotivo.trim().length < 3) {
                throw new Error('Ingresa un motivo descriptivo para la merma (mínimo 3 caracteres).');
            }

            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'merma_insumo',
                    insumoId: Number(mermaInsId),
                    cantidadPerdida: cant,
                    motivo: mermaInsMotivo.trim()
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al registrar la merma de insumo.');

            setMermaInsResultado({
                insumoNombre: insSel.nombre,
                cantidadPerdida: cant,
                unidadMedida: insSel.unidad_medida || 'unidades',
                stockRestante: data.stockRestante,
                costoPerdida: data.costoPerdida,
                motivo: mermaInsMotivo.trim()
            });
            setMermaInsCantidad('');
            setMermaInsMotivo('');
            setMermaInsConfirmando(false);
            setMensaje(`✅ Merma de insumo registrada: -${cant} ${insSel.unidad_medida} de "${insSel.nombre}" (Pérdida: Bs ${Number(data.costoPerdida || 0).toFixed(2)} | Stock restante: ${data.stockRestante}).`);
            await cargarTodo();
        } catch (err) {
            setError(err.message);
            setMermaInsConfirmando(false);
        }
    }

    async function handleVerificarIntegridadKardex() {
        limpiarAlertas();
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'verificar_integridad_kardex' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al verificar la integridad del Kardex.');
            setResultadoIntegridadKardex(data);
            if (data.integro) {
                setMensaje('✅ Verificación de Kardex completada: 100% íntegro (stock real coincide con los saldos acumulados de Kardex en productos directos e insumos).');
            } else {
                setError('⚠️ Se detectaron discrepancias en la conciliación del Kardex. Revisa el detalle en pantalla.');
            }
        } catch (err) {
            setError(err.message);
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
                proveedorNit: compraNitProveedor.trim() || null,
                nroFacturaCompra: compraNroFactura.trim() || null,
                conFactura: compraConFactura,
                motivo: motivoCompra
            },
            'Compra registrada con Costo Promedio Ponderado (NIC 2) y costos de ensamblaje/recetas recalculados.'
        );
        if (ok) {
            setCompraCantidad('');
            setCompraCostoTotal('');
            setCompraDistribuidora('');
            setCompraNitProveedor('');
            setCompraNroFactura('');
            setCompraConFactura(false);
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
                        <label>
                            Usuario:
                            <input
                                type="text"
                                placeholder="Nombre de usuario"
                                autoComplete="username"
                                required
                                value={loginAdminNombreManual}
                                onChange={(e) => setLoginAdminNombreManual(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
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
                        {(datos.cajasAbiertas || []).length > 0 ? (
                            <span style={{ color: '#4ade80' }}>
                                🟢 {(datos.cajasAbiertas || []).length === 1
                                    ? `Turno #${datos.cajasAbiertas[0].id} (${datos.cajasAbiertas[0].caja_fisica_nombre || 'Caja'})`
                                    : `${(datos.cajasAbiertas || []).length} turnos abiertos en simultáneo`}
                            </span>
                        ) : (
                            <span style={{ color: '#f87171' }}>🔴 Sin turnos abiertos</span>
                        )}
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
                    <button
                        onClick={() => { limpiarAlertas(); setSeccionActiva('exportacion'); }}
                        style={navBtnStyle(!esPrimeraEjecucion && seccionActiva === 'exportacion')}
                    >
                        📥 {usaRecetas ? '6.' : '5.'} Exportar Reportes (Excel / PDF / CSV)
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
                        {seccionActiva === 'arqueos' && (() => {
                            const cajasFisicasDisponibles = (datos.cajasFisicas || []).filter(
                                (cf) => Number(cf.activa) === 1 && !cf.turno_abierto_id
                            );

                            return (
                                <section style={cardStyle}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                                        <div>
                                            <h2 style={{ margin: 0 }}>🏦 Auditoría de Cierres y Arqueos por Turno</h2>
                                            <p style={{ margin: '0.25rem 0 0', color: '#555', fontSize: '0.9rem' }}>
                                                Revisa si hubo dinero faltante o sobrante en cada turno cerrado y habilita o reabre turnos cuando sea necesario.
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                onClick={() => setMostrarPanelContable(!mostrarPanelContable)}
                                                style={{ ...btnSecundario, fontSize: '0.84rem', padding: '0.45rem 0.8rem', background: mostrarPanelContable ? '#dbeafe' : '#e2e8f0', color: '#0f172a' }}
                                            >
                                                🧾 {mostrarPanelContable ? 'Ocultar Régimen Contable' : 'Régimen Contable / Facturación'}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setMostrarPanelCajasFisicas(!mostrarPanelCajasFisicas)}
                                                style={{ ...btnSecundario, fontSize: '0.84rem', padding: '0.45rem 0.8rem' }}
                                            >
                                                🏢 {mostrarPanelCajasFisicas ? 'Ocultar Estaciones' : 'Gestionar Estaciones de Caja'} ({(datos.cajasFisicas || []).length})
                                            </button>

                                            {cajasFisicasDisponibles.length > 0 && (
                                                <form onSubmit={handleAbrirNuevoTurnoAdmin} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    {cajasFisicasDisponibles.length > 1 && (
                                                        <select
                                                            value={cajaFisicaParaAbrir}
                                                            onChange={(e) => setCajaFisicaParaAbrir(e.target.value)}
                                                            style={{ padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.84rem', background: '#fff' }}
                                                        >
                                                            <option value="">-- Estación --</option>
                                                            {cajasFisicasDisponibles.map((cf) => (
                                                                <option key={cf.id} value={cf.id}>{cf.nombre}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={nuevoFondoInicial}
                                                        onChange={(e) => setNuevoFondoInicial(e.target.value)}
                                                        placeholder="Fondo inicial Bs"
                                                        style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '120px', fontSize: '0.85rem' }}
                                                    />
                                                    <button type="submit" style={{ ...btnPrimario, fontSize: '0.85rem', padding: '0.45rem 0.8rem' }}>
                                                        + Abrir Turno
                                                    </button>
                                                </form>
                                            )}
                                        </div>
                                    </div>

                                    {/* BANNER INFORMATIVO Y DE PRUEBA DE CORREO ELECTRÓNICO */}
                                    <div style={{
                                        background: datos.estadoEmail?.configurado ? '#f0fdf4' : '#f8fafc',
                                        border: `1px solid ${datos.estadoEmail?.configurado ? '#bbf7d0' : '#e2e8f0'}`,
                                        borderRadius: '8px',
                                        padding: '0.75rem 1rem',
                                        marginBottom: '1.25rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: '0.75rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.86rem' }}>
                                            <span style={{ fontSize: '1.25rem' }}>{datos.estadoEmail?.configurado ? '🟢' : '✉️'}</span>
                                            <div>
                                                {datos.estadoEmail?.configurado ? (
                                                    <>
                                                        <strong style={{ color: '#166534' }}>Notificaciones automáticas por correo activadas:</strong>{' '}
                                                        <span style={{ color: '#334155' }}>
                                                            Al cerrar cada turno se envía el resumen ejecutivo y el Excel a: <strong>{datos.estadoEmail.destinatarios}</strong>
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <strong style={{ color: '#475569' }}>Notificaciones automáticas por correo desactivadas:</strong>{' '}
                                                        <span style={{ color: '#64748b' }}>
                                                            Configura <code>SMTP_USER</code>, <code>SMTP_PASS</code> y <code>EMAIL_DESTINATARIO_CIERRE</code> en <code>.env.local</code> para recibir el arqueo y Excel automáticamente.
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {datos.estadoEmail?.configurado && (
                                            <button
                                                type="button"
                                                disabled={enviandoPruebaEmail}
                                                onClick={handleProbarEmail}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: '#16a34a',
                                                    color: '#fff',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '600',
                                                    cursor: enviandoPruebaEmail ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                {enviandoPruebaEmail ? '⏳ Enviando prueba...' : '🧪 Enviar Correo de Prueba'}
                                            </button>
                                        )}
                                    </div>

                                    {mostrarPanelContable && (
                                        <form onSubmit={handleGuardarConfiguracionContable} style={{ background: '#f8fafc', border: '2px solid #0284c7', borderRadius: '8px', padding: '1.1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                            <div>
                                                <h4 style={{ margin: 0, color: '#0f172a' }}>🧾 Configuración Contable y Régimen Tributario Modular (Bolivia)</h4>
                                                <p style={{ margin: '0.2rem 0 0', color: '#475569', fontSize: '0.84rem' }}>
                                                    Adapta el sistema según el régimen del cliente: <strong>Control Interno / Régimen Simplificado (RTS)</strong> o <strong>Régimen General (Con Facturación IVA / IT)</strong>. Todos los reportes Excel, CSV y PDF se ajustan automáticamente.
                                                </p>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                    Régimen del Negocio:
                                                    <select
                                                        value={cfgRegimenTributario}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setCfgRegimenTributario(val);
                                                            setCfgEmiteFactura(val === 'regimen_general');
                                                        }}
                                                        style={inputStyle}
                                                    >
                                                        <option value="simplificado_control_interno">📋 Control Interno / Régimen Simplificado (Sin IVA)</option>
                                                        <option value="regimen_general">🏛️ Régimen General (Facturación IVA / IT)</option>
                                                    </select>
                                                </label>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                    NIT del Establecimiento (Opcional):
                                                    <input
                                                        type="text"
                                                        placeholder="Ej. 1029384015"
                                                        value={cfgNitNegocio}
                                                        onChange={(e) => setCfgNitNegocio(e.target.value)}
                                                        style={inputStyle}
                                                    />
                                                </label>
                                                {cfgRegimenTributario === 'regimen_general' && (
                                                    <>
                                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                            Alícuota IVA (%):
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={cfgIvaPorcentaje}
                                                                onChange={(e) => setCfgIvaPorcentaje(e.target.value)}
                                                                style={inputStyle}
                                                            />
                                                        </label>
                                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                            Alícuota IT (%):
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={cfgItPorcentaje}
                                                                onChange={(e) => setCfgItPorcentaje(e.target.value)}
                                                                style={inputStyle}
                                                            />
                                                        </label>
                                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                            Base Imponible IT (a confirmar con el contador):
                                                            <select
                                                                value={cfgItBase}
                                                                onChange={(e) => setCfgItBase(e.target.value)}
                                                                style={inputStyle}
                                                            >
                                                                <option value="todas_las_ventas">Todas las ventas del turno (por defecto)</option>
                                                                <option value="solo_facturadas">Solo ventas con factura emitida</option>
                                                            </select>
                                                        </label>
                                                    </>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.85rem' }}>
                                                {cfgRegimenTributario === 'regimen_general' && (
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={cfgEmiteFactura}
                                                            onChange={(e) => setCfgEmiteFactura(e.target.checked)}
                                                        />
                                                        <span>Habilitar captura de <strong>N° Factura, NIT/CI y Razón Social</strong> en ventas</span>
                                                    </label>
                                                )}
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={cfgUsaRespaldoComprasEgresos}
                                                        onChange={(e) => setCfgUsaRespaldoComprasEgresos(e.target.checked)}
                                                    />
                                                    <span>Habilitar registro de <strong>Factura / NIT Proveedor</strong> en compras y egresos de caja</span>
                                                </label>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button type="submit" style={{ ...btnPrimario, fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}>
                                                    Guardar Configuración Contable
                                                </button>
                                                <button type="button" onClick={() => setMostrarPanelContable(false)} style={{ ...btnSecundario, fontSize: '0.85rem', padding: '0.45rem 0.9rem', border: 'none', cursor: 'pointer' }}>
                                                    Cerrar
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {mostrarPanelCajasFisicas && (
                                        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                <div>
                                                    <h4 style={{ margin: 0, color: '#0f172a' }}>🏢 Estaciones Físicas de Caja (Puntos de Venta)</h4>
                                                    <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                                                        Define las terminales físicas del negocio. Puedes agregar nuevas o desactivar las que no uses (mínimo 1 activa requerida).
                                                    </p>
                                                </div>
                                                <form onSubmit={handleCrearCajaFisica} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        value={nuevaCajaFisicaNombre}
                                                        onChange={(e) => setNuevaCajaFisicaNombre(e.target.value)}
                                                        placeholder="ej. Caja 2 - Barra"
                                                        style={{ padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', minWidth: '170px' }}
                                                    />
                                                    <button type="submit" style={{ ...btnPrimario, fontSize: '0.82rem', padding: '0.45rem 0.8rem' }}>
                                                        + Crear Caja
                                                    </button>
                                                </form>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
                                                {(datos.cajasFisicas || []).map((cf) => {
                                                    const esActiva = Number(cf.activa) === 1;
                                                    const totalActivas = (datos.cajasFisicas || []).filter((c) => Number(c.activa) === 1).length;
                                                    const tieneTurno = Boolean(cf.turno_abierto_id);

                                                    return (
                                                        <div
                                                            key={cf.id}
                                                            style={{
                                                                background: esActiva ? '#fff' : '#f1f5f9',
                                                                border: `1px solid ${esActiva ? '#e2e8f0' : '#cbd5e1'}`,
                                                                borderRadius: '6px',
                                                                padding: '0.75rem',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '0.4rem',
                                                                opacity: esActiva ? 1 : 0.65
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{cf.nombre}</strong>
                                                                <span
                                                                    style={{
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: 'bold',
                                                                        padding: '0.15rem 0.45rem',
                                                                        borderRadius: '4px',
                                                                        background: esActiva ? '#dcfce7' : '#e2e8f0',
                                                                        color: esActiva ? '#166534' : '#64748b'
                                                                    }}
                                                                >
                                                                    {esActiva ? 'ACTIVA' : 'INACTIVA'}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                                {tieneTurno ? (
                                                                    <span style={{ color: '#16a34a', fontWeight: '600' }}>
                                                                        🟢 Turno #{cf.turno_abierto_id} en curso ({cf.operador_abierto || 'Cajero'})
                                                                    </span>
                                                                ) : (
                                                                    <span>⚪ Sin turno abierto actualmente</span>
                                                                )}
                                                            </div>
                                                            <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleTogglePermisoFiscalCaja(cf.id, Number(cf.habilita_respaldo_fiscal ?? 1) === 1, cf.nombre)}
                                                                    style={{
                                                                        fontSize: '0.73rem',
                                                                        padding: '0.25rem 0.55rem',
                                                                        borderRadius: '4px',
                                                                        border: `1px solid ${Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? '#38bdf8' : '#cbd5e1'}`,
                                                                        background: Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? '#e0f2fe' : '#f1f5f9',
                                                                        color: Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? '#0369a1' : '#64748b',
                                                                        cursor: 'pointer',
                                                                        fontWeight: '600'
                                                                    }}
                                                                    title="Habilitar o deshabilitar el registro de factura/respaldo en ventas y egresos de esta estación"
                                                                >
                                                                    🧾 Respaldo Fiscal: {Number(cf.habilita_respaldo_fiscal ?? 1) === 1 ? 'SÍ' : 'NO'}
                                                                </button>
                                                                {esActiva ? (
                                                                    <button
                                                                        type="button"
                                                                        disabled={totalActivas <= 1 || tieneTurno}
                                                                        onClick={() => handleDesactivarCajaFisica(cf.id, cf.nombre)}
                                                                        title={totalActivas <= 1 ? 'El sistema debe mantener al menos 1 caja activa' : tieneTurno ? 'Cierra el turno antes de desactivarla' : 'Desactivar esta caja'}
                                                                        style={{
                                                                            fontSize: '0.75rem',
                                                                            padding: '0.25rem 0.55rem',
                                                                            borderRadius: '4px',
                                                                            border: '1px solid #f87171',
                                                                            background: totalActivas <= 1 || tieneTurno ? '#f1f5f9' : '#fee2e2',
                                                                            color: totalActivas <= 1 || tieneTurno ? '#94a3b8' : '#991b1b',
                                                                            cursor: totalActivas <= 1 || tieneTurno ? 'not-allowed' : 'pointer',
                                                                            fontWeight: '600'
                                                                        }}
                                                                    >
                                                                        {totalActivas <= 1 ? 'Mínimo 1 requerida' : tieneTurno ? 'Turno en curso' : 'Desactivar'}
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleReactivarCajaFisica(cf.id, cf.nombre)}
                                                                        style={{
                                                                            fontSize: '0.75rem',
                                                                            padding: '0.25rem 0.55rem',
                                                                            borderRadius: '4px',
                                                                            border: '1px solid #86efac',
                                                                            background: '#dcfce7',
                                                                            color: '#166534',
                                                                            cursor: 'pointer',
                                                                            fontWeight: '600'
                                                                        }}
                                                                    >
                                                                        Reactivar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {(datos.historialCajas || []).length === 0 ? (
                                        <p style={{ color: '#666' }}>Aún no se ha abierto ni cerrado ningún turno de caja.</p>
                                    ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid #cbd5e1', textAlign: 'left', background: '#f8fafc' }}>
                                                    <th style={thTd}>N° Turno</th>
                                                    <th style={thTd}>Estación / Caja</th>
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
                                                    let textoDif = 'En curso (Abierto)';

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
                                                            <td style={thTd}><strong>Turno #{c.id}</strong></td>
                                                            <td style={thTd}><span style={{ fontWeight: '600', color: '#0369a1' }}>{c.caja_fisica_nombre || 'Caja Principal'}</span></td>
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
                                                                            🔄 REABIERTO ({c.veces_reabierta} {Number(c.veces_reabierta) === 1 ? 'vez' : 'veces'})
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
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '170px' }}>
                                                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => seleccionarTurnoParaAuditar(c.id)}
                                                                        style={{
                                                                            padding: '0.3rem 0.55rem',
                                                                            background: Number(datos.cajaAuditada?.id) === Number(c.id) ? '#0f172a' : '#e2e8f0',
                                                                            color: Number(datos.cajaAuditada?.id) === Number(c.id) ? '#fff' : '#0f172a',
                                                                            border: 'none',
                                                                            borderRadius: '4px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: '600'
                                                                        }}
                                                                    >
                                                                        {Number(datos.cajaAuditada?.id) === Number(c.id) ? '👁️ Auditando' : '🔍 Auditar / PDF'}
                                                                    </button>
                                                                    <a
                                                                        href={`/api/reportes?formato=xlsx&cajaId=${c.id}`}
                                                                        style={{
                                                                            padding: '0.3rem 0.55rem',
                                                                            background: '#dcfce7',
                                                                            color: '#166534',
                                                                            borderRadius: '4px',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: '600',
                                                                            textDecoration: 'none'
                                                                        }}
                                                                    >
                                                                        📊 Excel
                                                                    </a>
                                                                </div>
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
                                                                            style={{ padding: '0.35rem 0.7rem', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
                                                                        >
                                                                            Reabrir este Turno
                                                                        </button>
                                                                    )
                                                                )}
                                                                {c.estado === 'cerrada' && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={enviandoEmailCajaId === c.id}
                                                                        onClick={() => handleReenviarEmailCierre(c.id)}
                                                                        style={{
                                                                            padding: '0.35rem 0.65rem',
                                                                            background: '#047857',
                                                                            color: '#fff',
                                                                            border: 'none',
                                                                            borderRadius: '4px',
                                                                            cursor: enviandoEmailCajaId === c.id ? 'not-allowed' : 'pointer',
                                                                            fontSize: '0.78rem',
                                                                            fontWeight: '600'
                                                                        }}
                                                                    >
                                                                        {enviandoEmailCajaId === c.id ? '⏳ Enviando...' : '✉️ Enviar por Correo'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </section>
                            );
                        })()}

                        {/* ==========================================
                            MÓDULO 2: VENTAS, KPIs Y ANULACIONES
                           ========================================== */}
                        {seccionActiva === 'ventas' && (
                            <>
                                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div style={kpiCard}>
                                        <small>Ventas (Turno #{datos.cajaAuditada?.id || '—'})</small>
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
                                        📊 Movimientos del Turno #{datos.cajaAuditada?.id || '—'} ({datos.cajaAuditada?.caja_fisica_nombre || 'Caja Principal'}) — Auditoría y Anulación
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
                            if (tipoComposicion === 'directo') {
                                costoEstimado = Number(prodDirectoCostoIni || 0);
                            } else if (tipoComposicion === 'unitario') {
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
                            } else if (tipoComposicion === 'combo') {
                                for (const f of filasCombo) {
                                    if (!f.productoId || !f.cantidad) continue;
                                    const prodComp = (datos.productos || []).find((p) => String(p.id) === String(f.productoId));
                                    if (!prodComp) continue;
                                    const cant = Number(f.cantidad) || 0;
                                    costoEstimado += cant * Number(prodComp.costo || 0);
                                }
                            }
                            const gananciaEstimada = Number(prodPrecio || 0) - costoEstimado;
                            const margenPorcentaje = Number(prodPrecio) > 0 ? (gananciaEstimada / Number(prodPrecio)) * 100 : 0;

                            const productosFiltrados = (datos.productos || []).filter((p) => {
                                if (categoriaTabActiva !== 'todas') {
                                    const cats = (p.categoria || '').split(',').map((c) => c.trim().toLowerCase());
                                    if (!cats.includes(categoriaTabActiva.toLowerCase())) return false;
                                }
                                if (busquedaProductos.trim()) {
                                    const term = busquedaProductos.toLowerCase();
                                    const enNombre = (p.nombre || '').toLowerCase().includes(term);
                                    const enCat = (p.categoria || '').toLowerCase().includes(term);
                                    const enTipo = (p.tipo_inventario || '').toLowerCase().includes(term);
                                    if (!enNombre && !enCat && !enTipo) return false;
                                }
                                return true;
                            });

                            const totalPaginasProductos = Math.max(1, Math.ceil(productosFiltrados.length / limitePorPaginaProductos));
                            const paginaProductosValida = Math.min(Math.max(1, paginaProductos), totalPaginasProductos);
                            const inicioProductos = (paginaProductosValida - 1) * limitePorPaginaProductos;
                            const productosPaginados = productosFiltrados.slice(inicioProductos, inicioProductos + limitePorPaginaProductos);

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {/* SELECTOR DE SUB-SECCIÓN: ARTÍCULOS, MODIFICADORES O KARDEX */}
                                    <div style={{ display: 'flex', gap: '0.5rem', background: '#e2e8f0', padding: '0.35rem', borderRadius: '8px', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            onClick={() => setSubSeccionCatalogo('articulos')}
                                            style={{
                                                padding: '0.45rem 1rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                fontWeight: 'bold',
                                                fontSize: '0.88rem',
                                                cursor: 'pointer',
                                                background: subSeccionCatalogo === 'articulos' ? '#ffffff' : 'transparent',
                                                color: subSeccionCatalogo === 'articulos' ? '#0f172a' : '#64748b',
                                                boxShadow: subSeccionCatalogo === 'articulos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                            }}
                                        >
                                            📦 Artículos y Catálogo ({(datos.productos || []).length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSubSeccionCatalogo('modificadores')}
                                            style={{
                                                padding: '0.45rem 1rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                fontWeight: 'bold',
                                                fontSize: '0.88rem',
                                                cursor: 'pointer',
                                                background: subSeccionCatalogo === 'modificadores' ? '#ffffff' : 'transparent',
                                                color: subSeccionCatalogo === 'modificadores' ? '#0284c7' : '#64748b',
                                                boxShadow: subSeccionCatalogo === 'modificadores' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                            }}
                                        >
                                            ✨ Complementos y Modificadores ({(datos.gruposModificadores || []).length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSubSeccionCatalogo('kardex')}
                                            style={{
                                                padding: '0.45rem 1rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                fontWeight: 'bold',
                                                fontSize: '0.88rem',
                                                cursor: 'pointer',
                                                background: subSeccionCatalogo === 'kardex' ? '#ffffff' : 'transparent',
                                                color: subSeccionCatalogo === 'kardex' ? '#15803d' : '#64748b',
                                                boxShadow: subSeccionCatalogo === 'kardex' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                            }}
                                        >
                                            📜 Kardex Cronológico e Integridad
                                        </button>
                                    </div>

                                    {subSeccionCatalogo === 'kardex' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                            <section style={cardStyle}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                                                    <div>
                                                        <h3 style={{ margin: 0 }}>🛡️ Verificación de Integridad del Kardex (NIC 2)</h3>
                                                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                                                            Comprueba que el stock físico actual de cada producto directo e insumo coincida exactamente con la reconstrucción matemática de sus movimientos de Kardex.
                                                        </p>
                                                    </div>
                                                    <button type="button" onClick={handleVerificarIntegridadKardex} style={{ ...btnPrimario, background: '#15803d' }}>
                                                        🔍 Auditar Integridad del Kardex Ahora
                                                    </button>
                                                </div>
                                                {resultadoIntegridadKardex && (
                                                    <div style={{
                                                        marginTop: '0.85rem',
                                                        padding: '0.75rem 1rem',
                                                        borderRadius: '8px',
                                                        background: resultadoIntegridadKardex.integro ? '#f0fdf4' : '#fef2f2',
                                                        border: `1px solid ${resultadoIntegridadKardex.integro ? '#86efac' : '#fca5a5'}`,
                                                        fontSize: '0.85rem'
                                                    }}>
                                                        <strong>
                                                            {resultadoIntegridadKardex.integro
                                                                ? '✅ Estado: 100% ÍNTEGRO'
                                                                : '⚠️ Estado: Discrepancias detectadas'}
                                                        </strong>
                                                        <div style={{ marginTop: '0.25rem', color: '#334155' }}>
                                                            Productos directos auditados: <strong>{resultadoIntegridadKardex.totalProductosAuditados}</strong> |{' '}
                                                            Insumos auditados: <strong>{resultadoIntegridadKardex.insumos?.totalInsumosAuditados ?? 0}</strong>
                                                        </div>
                                                    </div>
                                                )}
                                            </section>

                                            <section style={cardStyle}>
                                                <h3 style={{ marginTop: 0 }}>📦 Kardex Cronológico de Productos Directos</h3>
                                                {(datos.kardexDetallado?.kardexProductosDirectos || []).length === 0 ? (
                                                    <p style={{ color: '#64748b', fontSize: '0.88rem' }}>No hay movimientos de Kardex de productos directos registrados.</p>
                                                ) : (
                                                    <div style={{ overflowX: 'auto', maxHeight: '340px' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                                                <tr style={{ borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                                                                    <th style={thTd}>ID</th>
                                                                    <th style={thTd}>Fecha / Hora</th>
                                                                    <th style={thTd}>Producto Directo</th>
                                                                    <th style={thTd}>Tipo</th>
                                                                    <th style={{ ...thTd, textAlign: 'right' }}>Cantidad</th>
                                                                    <th style={{ ...thTd, textAlign: 'right' }}>Stock Resultante</th>
                                                                    <th style={{ ...thTd, textAlign: 'right' }}>Costo Unit.</th>
                                                                    <th style={{ ...thTd, textAlign: 'right' }}>CPP Resultante</th>
                                                                    <th style={{ ...thTd, textAlign: 'right' }}>Costo Total</th>
                                                                    <th style={thTd}>Motivo / Comprobante</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(datos.kardexDetallado?.kardexProductosDirectos || []).map((k) => (
                                                                    <tr key={k.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                        <td style={thTd}>#{k.id}</td>
                                                                        <td style={thTd}>{k.fecha_hora_local}</td>
                                                                        <td style={thTd}><strong>{k.producto_nombre}</strong></td>
                                                                        <td style={{ ...thTd, fontWeight: 600, color: k.tipo === 'merma' || k.tipo === 'venta' ? '#b91c1c' : '#15803d' }}>
                                                                            {k.tipo.toUpperCase()}
                                                                        </td>
                                                                        <td style={{ ...thTd, textAlign: 'right', fontWeight: 'bold' }}>
                                                                            {k.tipo === 'merma' || k.tipo === 'venta' ? `-${k.cantidad}` : `+${k.cantidad}`} {k.unidad_medida || 'u.'}
                                                                        </td>
                                                                        <td style={{ ...thTd, textAlign: 'right', fontWeight: 'bold' }}>{k.stock_resultante}</td>
                                                                        <td style={{ ...thTd, textAlign: 'right' }}>Bs {Number(k.costo_unitario || 0).toFixed(2)}</td>
                                                                        <td style={{ ...thTd, textAlign: 'right' }}>Bs {Number(k.costo_promedio_resultante || 0).toFixed(2)}</td>
                                                                        <td style={{ ...thTd, textAlign: 'right' }}>Bs {Number(k.costo_total || 0).toFixed(2)}</td>
                                                                        <td style={thTd}>
                                                                            {k.motivo}
                                                                            {k.nro_factura_compra ? ` (Fact. #${k.nro_factura_compra})` : ''}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </section>

                                            <section style={cardStyle}>
                                                <h3 style={{ marginTop: 0 }}>🧱 Kardex Cronológico de Materiales e Insumos</h3>
                                                {(datos.kardexDetallado?.kardexInsumos || []).length === 0 ? (
                                                    <p style={{ color: '#64748b', fontSize: '0.88rem' }}>No hay movimientos de Kardex de insumos registrados.</p>
                                                ) : (
                                                    <div style={{ overflowX: 'auto', maxHeight: '340px' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                                                <tr style={{ borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                                                                    <th style={thTd}>ID</th>
                                                                    <th style={thTd}>Fecha / Hora</th>
                                                                    <th style={thTd}>Insumo</th>
                                                                    <th style={thTd}>Tipo</th>
                                                                    <th style={{ ...thTd, textAlign: 'right' }}>Cantidad</th>
                                                                    <th style={{ ...thTd, textAlign: 'right' }}>Stock Resultante</th>
                                                                    <th style={{ ...thTd, textAlign: 'right' }}>CPP Resultante</th>
                                                                    <th style={{ ...thTd, textAlign: 'right' }}>Costo Total</th>
                                                                    <th style={thTd}>Motivo / Proveedor</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(datos.kardexDetallado?.kardexInsumos || []).map((k) => (
                                                                    <tr key={k.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                        <td style={thTd}>#{k.id}</td>
                                                                        <td style={thTd}>{k.fecha_hora_local}</td>
                                                                        <td style={thTd}><strong>{k.insumo_nombre}</strong></td>
                                                                        <td style={{ ...thTd, fontWeight: 600, color: k.tipo === 'merma' || k.tipo === 'consumo_venta' ? '#b91c1c' : '#15803d' }}>
                                                                            {k.tipo.toUpperCase()}
                                                                        </td>
                                                                        <td style={{ ...thTd, textAlign: 'right', fontWeight: 'bold' }}>
                                                                            {k.tipo === 'merma' || k.tipo === 'consumo_venta' ? `-${k.cantidad}` : `+${k.cantidad}`} {k.unidad_medida}
                                                                        </td>
                                                                        <td style={{ ...thTd, textAlign: 'right', fontWeight: 'bold' }}>{Number(k.stock_resultante ?? 0).toFixed(2)}</td>
                                                                        <td style={{ ...thTd, textAlign: 'right' }}>Bs {Number(k.costo_promedio_resultante ?? 0).toFixed(4)}</td>
                                                                        <td style={{ ...thTd, textAlign: 'right' }}>Bs {Number(k.costo_total || 0).toFixed(2)}</td>
                                                                        <td style={thTd}>
                                                                            {k.motivo}
                                                                            {k.nro_factura_compra ? ` (Fact. #${k.nro_factura_compra})` : ''}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </section>
                                        </div>
                                    ) : subSeccionCatalogo === 'modificadores' ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem', alignItems: 'start' }}>
                                            {/* COLUMNA IZQUIERDA: CREAR NUEVO GRUPO */}
                                            <section style={cardStyle}>
                                                <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>✨ Crear Grupo de Complementos / Modificadores</h3>
                                                <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                                                    Configura grupos como <em>"Tipo de Leche"</em> (reemplazo) o <em>"Extras / Jarabes"</em> (adiciones) con sus precios e insumos.
                                                </p>

                                                <form onSubmit={handleCrearGrupoModificador} style={formCol}>
                                                    <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                        Nombre del Grupo:
                                                        <input
                                                            type="text"
                                                            placeholder="Ej. Tipo de Leche, Extras / Jarabes, Adicionales"
                                                            required
                                                            value={nombreGrupoMod}
                                                            onChange={(e) => setNombreGrupoMod(e.target.value)}
                                                            style={inputStyle}
                                                        />
                                                    </label>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.2rem' }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 'bold' }}>Tipo de Selección:</label>
                                                            <select
                                                                value={tipoSeleccionGrupoMod}
                                                                onChange={(e) => setTipoSeleccionGrupoMod(e.target.value)}
                                                                style={inputStyle}
                                                            >
                                                                <option value="unica">🔘 Selección Única (Excluyente / Reemplazo)</option>
                                                                <option value="multiple">☑️ Múltiples Opciones (Extras / Agregados)</option>
                                                            </select>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '1.4rem' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={esObligatorioGrupoMod}
                                                                    onChange={(e) => setEsObligatorioGrupoMod(e.target.checked)}
                                                                />
                                                                <strong>¿Obligatorio al cobrar?</strong>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {/* OPCIONES DEL GRUPO */}
                                                    <div style={{ marginTop: '0.75rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                                                                Opciones del Grupo ({opcionesGrupoMod.length})
                                                            </span>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                Insumo, cantidad y recargo al cliente
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                                            {opcionesGrupoMod.map((op, idx) => {
                                                                const insumoActual = (datos.insumos || []).find((i) => String(i.id) === String(op.insumoId));
                                                                return (
                                                                    <div key={idx} style={{ background: '#fff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Nombre de la opción (Ej. Leche de Almendras, Shot Extra)"
                                                                                required
                                                                                value={op.nombre}
                                                                                onChange={(e) => cambiarOpcionGrupoMod(idx, 'nombre', e.target.value)}
                                                                                style={{ ...inputStyle, margin: 0, flex: 2 }}
                                                                            />
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1 }}>
                                                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>+Bs</span>
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    min="0"
                                                                                    placeholder="0.00"
                                                                                    value={op.precioAdicional}
                                                                                    onChange={(e) => cambiarOpcionGrupoMod(idx, 'precioAdicional', e.target.value)}
                                                                                    style={{ ...inputStyle, margin: 0 }}
                                                                                    title="Recargo adicional para el cliente"
                                                                                />
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => quitarOpcionGrupoMod(idx)}
                                                                                disabled={opcionesGrupoMod.length <= 1}
                                                                                style={{
                                                                                    background: '#fee2e2',
                                                                                    color: '#b91c1c',
                                                                                    border: '1px solid #fecaca',
                                                                                    borderRadius: '4px',
                                                                                    padding: '0.4rem 0.6rem',
                                                                                    cursor: opcionesGrupoMod.length <= 1 ? 'not-allowed' : 'pointer',
                                                                                    fontSize: '0.85rem'
                                                                                }}
                                                                                title="Quitar opción"
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </div>

                                                                        {/* Configuración de Insumo y Descuento */}
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr auto', gap: '0.4rem', alignItems: 'center', fontSize: '0.8rem' }}>
                                                                            <div>
                                                                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Insumo que descuenta:</span>
                                                                                <select
                                                                                    value={op.insumoId}
                                                                                    onChange={(e) => cambiarOpcionGrupoMod(idx, 'insumoId', e.target.value)}
                                                                                    style={{ ...inputStyle, margin: 0, fontSize: '0.8rem', padding: '0.35rem' }}
                                                                                >
                                                                                    <option value="">-- Sin insumo físico --</option>
                                                                                    {(datos.insumos || []).map((ins) => (
                                                                                        <option key={ins.id} value={ins.id}>
                                                                                            {ins.nombre} ({ins.unidad_medida})
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>

                                                                            <div>
                                                                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Cantidad ({insumoActual?.unidad_medida || 'u.'}):</span>
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.001"
                                                                                    min="0"
                                                                                    placeholder="0.2"
                                                                                    value={op.cantidadInsumo}
                                                                                    onChange={(e) => cambiarOpcionGrupoMod(idx, 'cantidadInsumo', e.target.value)}
                                                                                    style={{ ...inputStyle, margin: 0, fontSize: '0.8rem', padding: '0.35rem' }}
                                                                                />
                                                                            </div>

                                                                            <div>
                                                                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Insumo que sustituye:</span>
                                                                                <select
                                                                                    value={op.insumoReemplazadoId}
                                                                                    onChange={(e) => cambiarOpcionGrupoMod(idx, 'insumoReemplazadoId', e.target.value)}
                                                                                    style={{ ...inputStyle, margin: 0, fontSize: '0.8rem', padding: '0.35rem' }}
                                                                                >
                                                                                    <option value="">-- Ninguno (Es extra/adicional) --</option>
                                                                                    {(datos.insumos || []).map((ins) => (
                                                                                        <option key={ins.id} value={ins.id}>
                                                                                            Sustituye a: {ins.nombre}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>

                                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '1rem', cursor: 'pointer' }}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={op.esDefault}
                                                                                    onChange={(e) => cambiarOpcionGrupoMod(idx, 'esDefault', e.target.checked)}
                                                                                />
                                                                                <span style={{ fontSize: '0.72rem', color: '#334155' }}>Por defecto</span>
                                                                            </label>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}

                                                            <button
                                                                type="button"
                                                                onClick={agregarOpcionGrupoMod}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '0.45rem',
                                                                    background: '#f1f5f9',
                                                                    color: '#0284c7',
                                                                    border: '1px dashed #cbd5e1',
                                                                    borderRadius: '6px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.82rem',
                                                                    fontWeight: 'bold'
                                                                }}
                                                            >
                                                                ➕ Agregar otra opción al grupo
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <button type="submit" style={{ ...btnPrimario, marginTop: '0.75rem', padding: '0.7rem' }}>
                                                        ✅ Guardar Grupo de Modificadores
                                                    </button>
                                                </form>
                                            </section>

                                            {/* COLUMNA DERECHA: ASIGNACIÓN A PRODUCTOS Y LISTADO EXISTENTE */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                {/* ASIGNACIÓN A PRODUCTOS */}
                                                <section style={cardStyle}>
                                                    <h3 style={{ marginTop: 0, fontSize: '1rem' }}>🔗 Asignar a Productos con Receta</h3>
                                                    <p style={{ color: '#64748b', fontSize: '0.84rem', marginTop: 0 }}>
                                                        Indica qué productos con receta ofrecerán estos modificadores en la pantalla de cobro.
                                                    </p>

                                                    <form onSubmit={handleGuardarAsignacionModificadores} style={formCol}>
                                                        <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                            Selecciona el Producto con Receta:
                                                            <select
                                                                value={productoAsignarModId}
                                                                onChange={(e) => {
                                                                    const pId = e.target.value;
                                                                    setProductoAsignarModId(pId);
                                                                    const prod = (datos.productos || []).find((p) => String(p.id) === String(pId));
                                                                    setGruposAsignarIds(prod?.grupos_modificadores_ids || []);
                                                                }}
                                                                style={inputStyle}
                                                                required
                                                            >
                                                                <option value="">-- Elige un producto con receta --</option>
                                                                {(datos.productos || [])
                                                                    .filter((p) => p.tipo_inventario === 'receta')
                                                                    .map((p) => (
                                                                        <option key={p.id} value={p.id}>
                                                                            {p.nombre} (Bs {Number(p.precio).toFixed(2)})
                                                                        </option>
                                                                    ))}
                                                            </select>
                                                        </label>

                                                        {productoAsignarModId && (
                                                            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '0.4rem' }}>
                                                                    Grupos que aplican a este producto:
                                                                </div>
                                                                {(datos.gruposModificadores || []).length === 0 ? (
                                                                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>No hay grupos creados todavía.</p>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                                        {(datos.gruposModificadores || []).map((g) => (
                                                                            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', color: '#334155', cursor: 'pointer' }}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={gruposAsignarIds.includes(g.id)}
                                                                                    onChange={() => toggleGrupoAsignar(g.id)}
                                                                                />
                                                                                <strong>{g.nombre}</strong>
                                                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                                    ({g.tipo_seleccion === 'unica' ? 'Única' : 'Múltiple'} • {g.opciones?.length || 0} opciones)
                                                                                </span>
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <button type="submit" disabled={!productoAsignarModId} style={{ ...btnOscuro, padding: '0.5rem', fontSize: '0.85rem' }}>
                                                            Guardar Asignación
                                                        </button>
                                                    </form>
                                                </section>

                                                {/* LISTADO DE GRUPOS ACTIVOS */}
                                                <section style={cardStyle}>
                                                    <h3 style={{ marginTop: 0, fontSize: '1rem' }}>
                                                        📋 Grupos Registrados ({(datos.gruposModificadores || []).length})
                                                    </h3>
                                                    {(datos.gruposModificadores || []).length === 0 ? (
                                                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>No hay grupos registrados.</p>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                            {(datos.gruposModificadores || []).map((g) => (
                                                                <div key={g.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', background: '#f8fafc' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <span style={{ fontWeight: 'bold', fontSize: '0.92rem', color: '#0f172a' }}>
                                                                            {g.nombre}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleEliminarGrupoModificador(g.id, g.nombre)}
                                                                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}
                                                                            title="Eliminar grupo"
                                                                        >
                                                                            🗑️ Eliminar
                                                                        </button>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                                                                        {g.tipo_seleccion === 'unica' ? '🔘 Selección única' : '☑️ Selección múltiple'}
                                                                        {g.es_obligatorio ? ' • Obligatorio' : ' • Opcional'}
                                                                    </div>
                                                                    <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                                        {(g.opciones || []).map((op) => (
                                                                            <span
                                                                                key={op.id}
                                                                                style={{
                                                                                    fontSize: '0.72rem',
                                                                                    background: '#ffffff',
                                                                                    border: '1px solid #cbd5e1',
                                                                                    padding: '0.15rem 0.45rem',
                                                                                    borderRadius: '4px',
                                                                                    color: '#334155'
                                                                                }}
                                                                            >
                                                                                {op.nombre} {Number(op.precio_adicional || 0) > 0 ? `(+Bs ${Number(op.precio_adicional).toFixed(2)})` : ''}
                                                                                {op.insumo_reemplazado_nombre ? ` (Sustituye: ${op.insumo_reemplazado_nombre})` : ''}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </section>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* PESTAÑAS HORIZONTALES DE CATEGORÍAS */}
                                            <div style={{ background: '#fff', padding: '0.85rem 1.25rem', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', marginRight: '0.25rem' }}>
                                                Categorías:
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCategoriaTabActiva('todas');
                                                    setPaginaProductos(1);
                                                }}
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
                                                            setPaginaProductos(1);
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
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setTipoComposicion('directo')}
                                                            style={{
                                                                padding: '0.55rem 0.35rem',
                                                                borderRadius: '8px',
                                                                border: tipoComposicion === 'directo' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                                background: tipoComposicion === 'directo' ? '#f0f9ff' : '#fff',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                fontSize: '0.78rem'
                                                            }}
                                                        >
                                                            <strong>📦 Directo</strong>
                                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>Stock propio</div>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setTipoComposicion('unitario')}
                                                            style={{
                                                                padding: '0.55rem 0.35rem',
                                                                borderRadius: '8px',
                                                                border: tipoComposicion === 'unitario' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                                background: tipoComposicion === 'unitario' ? '#f0f9ff' : '#fff',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                fontSize: '0.78rem'
                                                            }}
                                                        >
                                                            <strong>🔗 Unitario</strong>
                                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>1 a 1 Insumo</div>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setTipoComposicion('receta')}
                                                            style={{
                                                                padding: '0.55rem 0.35rem',
                                                                borderRadius: '8px',
                                                                border: tipoComposicion === 'receta' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                                background: tipoComposicion === 'receta' ? '#f0f9ff' : '#fff',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                fontSize: '0.78rem'
                                                            }}
                                                        >
                                                            <strong>🧪 Receta</strong>
                                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>Insumos métricos</div>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setTipoComposicion('combo')}
                                                            style={{
                                                                padding: '0.55rem 0.35rem',
                                                                borderRadius: '8px',
                                                                border: tipoComposicion === 'combo' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                                background: tipoComposicion === 'combo' ? '#f0f9ff' : '#fff',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                fontSize: '0.78rem'
                                                            }}
                                                        >
                                                            <strong>🎁 Combo</strong>
                                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>Agrupa productos</div>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setTipoComposicion('libre')}
                                                            style={{
                                                                padding: '0.55rem 0.35rem',
                                                                borderRadius: '8px',
                                                                border: tipoComposicion === 'libre' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                                background: tipoComposicion === 'libre' ? '#f0f9ff' : '#fff',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                fontSize: '0.78rem'
                                                            }}
                                                        >
                                                            <strong>✨ Libre</strong>
                                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>Sin inventario</div>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* OPCIÓN 0: PRODUCTO DE STOCK DIRECTO (KARDEX PROPIO) */}
                                                {tipoComposicion === 'directo' && (
                                                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                                Stock Inicial Físico:
                                                                <input
                                                                    type="number"
                                                                    step="1"
                                                                    min="0"
                                                                    required
                                                                    value={prodDirectoStockIni}
                                                                    onChange={(e) => setProdDirectoStockIni(e.target.value)}
                                                                    style={inputStyle}
                                                                />
                                                            </label>
                                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                                Costo Unitario Inicial (Bs):
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    required
                                                                    value={prodDirectoCostoIni}
                                                                    onChange={(e) => setProdDirectoCostoIni(e.target.value)}
                                                                    style={inputStyle}
                                                                />
                                                            </label>
                                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                                Stock Mínimo (Alerta):
                                                                <input
                                                                    type="number"
                                                                    step="1"
                                                                    min="0"
                                                                    value={prodDirectoStockMin}
                                                                    onChange={(e) => setProdDirectoStockMin(e.target.value)}
                                                                    style={inputStyle}
                                                                />
                                                            </label>
                                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                                Unidad de Medida:
                                                                <input
                                                                    type="text"
                                                                    value={prodDirectoUnidad}
                                                                    onChange={(e) => setProdDirectoUnidad(e.target.value)}
                                                                    style={inputStyle}
                                                                />
                                                            </label>
                                                        </div>
                                                        {cfgUsaVencimiento && (
                                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                                Fecha de Vencimiento (Opcional):
                                                                <input
                                                                    type="date"
                                                                    value={prodDirectoVencimiento}
                                                                    onChange={(e) => setProdDirectoVencimiento(e.target.value)}
                                                                    style={inputStyle}
                                                                />
                                                            </label>
                                                        )}
                                                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                                            📦 <em>Artículo de reventa directa con Kardex propio (`movimientos_productos_directos`), compras CPP y registro de mermas directo.</em>
                                                        </div>
                                                    </div>
                                                )}

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

                                                {/* OPCIÓN 3: COMBO / PROMOCIÓN */}
                                                {tipoComposicion === 'combo' && (
                                                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.84rem', fontWeight: 'bold', color: '#334155' }}>
                                                                Productos Componentes del Combo:
                                                            </span>
                                                            <span style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 'bold' }}>
                                                                {filasCombo.length} / 20 productos
                                                            </span>
                                                        </div>

                                                        {filasCombo.map((fila, index) => {
                                                            const prodSel = (datos.productos || []).find((p) => String(p.id) === String(fila.productoId));
                                                            return (
                                                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 34px', gap: '0.4rem', alignItems: 'center' }}>
                                                                    <select
                                                                        required
                                                                        value={fila.productoId}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setFilasCombo((prev) => prev.map((f, i) => i === index ? { ...f, productoId: val } : f));
                                                                        }}
                                                                        style={{ ...inputStyle, padding: '0.4rem', fontSize: '0.82rem' }}
                                                                    >
                                                                        <option value="">-- Selecciona producto --</option>
                                                                        {(datos.productos || [])
                                                                            .filter((p) => p.tipo_inventario !== 'combo')
                                                                            .map((prod) => (
                                                                                <option key={prod.id} value={prod.id}>
                                                                                    {prod.nombre} (Costo: Bs {Number(prod.costo || 0).toFixed(2)} | {prod.tipo_inventario})
                                                                                </option>
                                                                            ))}
                                                                    </select>
                                                                    <input
                                                                        type="number"
                                                                        step="1"
                                                                        min="1"
                                                                        required
                                                                        placeholder="Cantidad"
                                                                        value={fila.cantidad}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setFilasCombo((prev) => prev.map((f, i) => i === index ? { ...f, cantidad: val } : f));
                                                                        }}
                                                                        style={{ ...inputStyle, padding: '0.4rem', fontSize: '0.82rem' }}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        disabled={filasCombo.length <= 1}
                                                                        onClick={() => {
                                                                            if (filasCombo.length <= 1) return;
                                                                            setFilasCombo((prev) => prev.filter((_, i) => i !== index));
                                                                        }}
                                                                        style={{
                                                                            padding: '0.4rem',
                                                                            background: filasCombo.length <= 1 ? '#e2e8f0' : '#fee2e2',
                                                                            color: filasCombo.length <= 1 ? '#94a3b8' : '#b91c1c',
                                                                            border: 'none',
                                                                            borderRadius: '4px',
                                                                            cursor: filasCombo.length <= 1 ? 'not-allowed' : 'pointer',
                                                                            fontWeight: 'bold'
                                                                        }}
                                                                        title="Quitar este componente"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}

                                                        <button
                                                            type="button"
                                                            disabled={filasCombo.length >= 20}
                                                            onClick={() => setFilasCombo((prev) => [...prev, { productoId: '', cantidad: '1' }])}
                                                            style={{
                                                                width: '100%',
                                                                padding: '0.4rem',
                                                                background: '#f1f5f9',
                                                                color: '#0284c7',
                                                                border: '1px dashed #cbd5e1',
                                                                borderRadius: '6px',
                                                                cursor: filasCombo.length >= 20 ? 'not-allowed' : 'pointer',
                                                                fontSize: '0.82rem',
                                                                fontWeight: 'bold'
                                                            }}
                                                        >
                                                            ➕ Agregar otro producto al combo ({filasCombo.length}/20)
                                                        </button>

                                                        {/* MODO DE VENTA / LÍMITES */}
                                                        <div style={{ marginTop: '0.4rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
                                                            <span style={{ fontSize: '0.84rem', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
                                                                Modo de Límite de Venta (Excluyente):
                                                            </span>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', background: '#fff', padding: '0.5rem', borderRadius: '6px', border: comboModoLimite === 'sin_limite' ? '2px solid #0284c7' : '1px solid #cbd5e1', cursor: 'pointer' }}>
                                                                    <input
                                                                        type="radio"
                                                                        name="modo_combo"
                                                                        checked={comboModoLimite === 'sin_limite'}
                                                                        onChange={() => setComboModoLimite('sin_limite')}
                                                                    />
                                                                    <span><strong>Sin límite</strong><br/><small style={{ color: '#64748b' }}>Hasta agotar inventario</small></span>
                                                                </label>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', background: '#fff', padding: '0.5rem', borderRadius: '6px', border: comboModoLimite === 'cantidad_maxima' ? '2px solid #0284c7' : '1px solid #cbd5e1', cursor: 'pointer' }}>
                                                                    <input
                                                                        type="radio"
                                                                        name="modo_combo"
                                                                        checked={comboModoLimite === 'cantidad_maxima'}
                                                                        onChange={() => setComboModoLimite('cantidad_maxima')}
                                                                    />
                                                                    <span><strong>Cantidad máxima</strong><br/><small style={{ color: '#64748b' }}>Límite de unidades fijas</small></span>
                                                                </label>
                                                            </div>

                                                            {comboModoLimite === 'cantidad_maxima' && (
                                                                <div style={{ marginBottom: '0.5rem' }}>
                                                                    <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                                        Número máximo de combos a vender:
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            step="1"
                                                                            required
                                                                            value={comboCantidadMaxima}
                                                                            onChange={(e) => setComboCantidadMaxima(e.target.value)}
                                                                            style={{ ...inputStyle, marginTop: '0.2rem' }}
                                                                        />
                                                                    </label>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* VIGENCIA TEMPORAL (FECHA Y HORA) */}
                                                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={comboUsaVigencia}
                                                                    onChange={(e) => setComboUsaVigencia(e.target.checked)}
                                                                />
                                                                Programar vigencia temporal (Fecha y Hora)
                                                            </label>

                                                            {comboUsaVigencia && (
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.4rem' }}>
                                                                    <label style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                                        Válido Desde:
                                                                        <input
                                                                            type="datetime-local"
                                                                            value={comboFechaInicio}
                                                                            onChange={(e) => setComboFechaInicio(e.target.value)}
                                                                            style={{ ...inputStyle, marginTop: '0.2rem', fontSize: '0.8rem' }}
                                                                        />
                                                                    </label>
                                                                    <label style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                                        Válido Hasta:
                                                                        <input
                                                                            type="datetime-local"
                                                                            value={comboFechaFin}
                                                                            onChange={(e) => setComboFechaFin(e.target.value)}
                                                                            style={{ ...inputStyle, marginTop: '0.2rem', fontSize: '0.8rem' }}
                                                                        />
                                                                    </label>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* OPCIÓN 4: SERVICIO / LIBRE */}
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
                                                <>
                                                    <section style={cardStyle}>
                                                        <h3 style={{ marginTop: 0, fontSize: '0.98rem' }}>🚚 Reabastecer Artículo Directo (NIC 2)</h3>
                                                        {(() => {
                                                            const productosDirectos = (datos.productos || []).filter((p) => p.tipo_inventario === 'directo');
                                                            if (productosDirectos.length === 0) {
                                                                return (
                                                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
                                                                        No hay artículos de reventa directa registrados. Crea uno con el botón <strong>📦 Directo</strong> o usa insumos para artículos con receta.
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
                                                                        <input type="number" step="0.01" min="0.01" placeholder="Cantidad" required value={compraProdCantidad} onChange={(e) => setCompraProdCantidad(e.target.value)} style={inputStyle} />
                                                                        <input type="number" step="0.01" min="0" placeholder="Costo Total (Bs)" required value={compraProdCostoTotal} onChange={(e) => setCompraProdCostoTotal(e.target.value)} style={inputStyle} />
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Proveedor / Distribuidora (Opcional)"
                                                                        value={compraProdProveedor}
                                                                        onChange={(e) => setCompraProdProveedor(e.target.value)}
                                                                        style={{ ...inputStyle, fontSize: '0.8rem' }}
                                                                    />
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="NIT Proveedor (Opc.)"
                                                                            value={compraProdNit}
                                                                            onChange={(e) => setCompraProdNit(e.target.value)}
                                                                            style={{ ...inputStyle, fontSize: '0.8rem' }}
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="N° Factura (Opc.)"
                                                                            value={compraProdNroFactura}
                                                                            onChange={(e) => {
                                                                                setCompraProdNroFactura(e.target.value);
                                                                                if (e.target.value.trim() !== '') setCompraProdConFactura(true);
                                                                            }}
                                                                            style={{ ...inputStyle, fontSize: '0.8rem' }}
                                                                        />
                                                                    </div>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#1e293b', cursor: 'pointer' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={compraProdConFactura}
                                                                            onChange={(e) => setCompraProdConFactura(e.target.checked)}
                                                                        />
                                                                        <span>🧾 Compra con Factura Fiscal (Crédito Fiscal IVA)</span>
                                                                    </label>
                                                                    <button type="submit" style={{ ...btnOscuro, padding: '0.45rem', fontSize: '0.82rem' }}>Registrar Entrada CPP</button>
                                                                </form>
                                                            );
                                                        })()}
                                                    </section>

                                                    {/* FORMULARIO DE REGISTRO DE MERMAS DE PRODUCTOS DIRECTOS (FASE 3.A) */}
                                                    <section style={{ ...cardStyle, border: '1px solid #fecaca', background: '#fffdfd' }}>
                                                        <h3 style={{ marginTop: 0, fontSize: '0.98rem', color: '#991b1b' }}>
                                                            ⚠️ Registrar Merma / Baja de Producto Directo
                                                        </h3>
                                                        {(() => {
                                                            const productosDirectos = (datos.productos || []).filter((p) => p.tipo_inventario === 'directo');
                                                            if (productosDirectos.length === 0) {
                                                                return (
                                                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
                                                                        No hay productos directos registrados para dar de baja por merma.
                                                                    </p>
                                                                );
                                                            }
                                                            const prodMermaSel = productosDirectos.find((p) => String(p.id) === String(mermaProdId)) || productosDirectos[0];
                                                            const stockActualProd = Number(prodMermaSel?.stock ?? 0);
                                                            const costoUnitProd = Number(prodMermaSel?.costo ?? 0);
                                                            const cantBajaNum = Number(mermaProdCantidad) || 0;
                                                            const costoEstimadoPerdida = Number(( Math.max(0, cantBajaNum) * costoUnitProd ).toFixed(2));
                                                            const superaStock = cantBajaNum > stockActualProd;
                                                            const cantidadInvalidaMerma = mermaProdCantidad !== '' && (cantBajaNum <= 0 || superaStock);

                                                            return (
                                                                <div style={formCol}>
                                                                    <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                                        1. Seleccionar Producto Directo:
                                                                        <select
                                                                            value={mermaProdId}
                                                                            onChange={(e) => {
                                                                                setMermaProdId(e.target.value);
                                                                                setMermaProdConfirmando(false);
                                                                                setMermaProdResultado(null);
                                                                            }}
                                                                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                                                                        >
                                                                            {productosDirectos.map((p) => (
                                                                                <option key={p.id} value={p.id}>
                                                                                    {p.nombre} (Stock: {p.stock ?? 0} {p.unidad_medida || 'u.'} | CPP: Bs {Number(p.costo).toFixed(2)})
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </label>

                                                                    {/* Consulta de stock actual y costo unitario */}
                                                                    {prodMermaSel && (
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', background: '#f8fafc', padding: '0.55rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                                                                            <div>
                                                                                <span style={{ color: '#64748b' }}>Stock Actual:</span>{' '}
                                                                                <strong style={{ color: stockActualProd > 0 ? '#0f172a' : '#dc2626' }}>
                                                                                    {stockActualProd} {prodMermaSel.unidad_medida || 'u.'}
                                                                                </strong>
                                                                            </div>
                                                                            <div>
                                                                                <span style={{ color: '#64748b' }}>Costo Unit. (CPP):</span>{' '}
                                                                                <strong>Bs {costoUnitProd.toFixed(2)}</strong>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', alignItems: 'end' }}>
                                                                        <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                                            2. Cantidad a Dar de Baja:
                                                                            <input
                                                                                type="number"
                                                                                step="1"
                                                                                min="1"
                                                                                max={stockActualProd}
                                                                                placeholder={`Máx: ${stockActualProd}`}
                                                                                value={mermaProdCantidad}
                                                                                onChange={(e) => {
                                                                                    setMermaProdCantidad(e.target.value);
                                                                                    setMermaProdConfirmando(false);
                                                                                }}
                                                                                style={{
                                                                                    ...inputStyle,
                                                                                    marginTop: '0.25rem',
                                                                                    borderColor: cantidadInvalidaMerma ? '#ef4444' : '#ccc',
                                                                                    background: cantidadInvalidaMerma ? '#fef2f2' : '#fff'
                                                                                }}
                                                                            />
                                                                        </label>
                                                                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.45rem 0.6rem', textAlign: 'right' }}>
                                                                            <div style={{ fontSize: '0.7rem', color: '#991b1b', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                                                                Costo Estimado Pérdida
                                                                            </div>
                                                                            <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#b91c1c' }}>
                                                                                Bs {costoEstimadoPerdida.toFixed(2)}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {superaStock && (
                                                                        <div style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 'bold' }}>
                                                                            ⚠️ No puedes registrar una merma superior al stock disponible ({stockActualProd} {prodMermaSel?.unidad_medida || 'u.'}).
                                                                        </div>
                                                                    )}

                                                                    <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                                        3. Motivo de la Merma (Obligatorio):
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Ej. Producto vencido, envase roto, daño en almacén..."
                                                                            value={mermaProdMotivo}
                                                                            onChange={(e) => {
                                                                                setMermaProdMotivo(e.target.value);
                                                                                setMermaProdConfirmando(false);
                                                                            }}
                                                                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                                                                        />
                                                                    </label>

                                                                    {!mermaProdConfirmando ? (
                                                                        <button
                                                                            type="button"
                                                                            disabled={!prodMermaSel || stockActualProd <= 0 || cantBajaNum <= 0 || superaStock || !mermaProdMotivo || mermaProdMotivo.trim().length < 3}
                                                                            onClick={() => setMermaProdConfirmando(true)}
                                                                            style={{
                                                                                ...btnPrimario,
                                                                                background: '#dc2626',
                                                                                padding: '0.5rem',
                                                                                fontSize: '0.84rem',
                                                                                opacity: (!prodMermaSel || stockActualProd <= 0 || cantBajaNum <= 0 || superaStock || !mermaProdMotivo || mermaProdMotivo.trim().length < 3) ? 0.55 : 1,
                                                                                cursor: (!prodMermaSel || stockActualProd <= 0 || cantBajaNum <= 0 || superaStock || !mermaProdMotivo || mermaProdMotivo.trim().length < 3) ? 'not-allowed' : 'pointer'
                                                                            }}
                                                                        >
                                                                            Registrar Baja por Merma
                                                                        </button>
                                                                    ) : (
                                                                        <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: '8px', padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                                                            <div style={{ fontSize: '0.82rem', color: '#92400e', fontWeight: 'bold' }}>
                                                                                ⚠️ ¿Confirmar baja definitiva de {cantBajaNum} {prodMermaSel?.unidad_medida || 'u.'} de &ldquo;{prodMermaSel?.nombre}&rdquo;?
                                                                            </div>
                                                                            <div style={{ fontSize: '0.78rem', color: '#78350f' }}>
                                                                                Stock resultante: <strong>{stockActualProd - cantBajaNum}</strong> | Pérdida contable: <strong>Bs {costoEstimadoPerdida.toFixed(2)}</strong>
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={handleConfirmarMermaProductoDirecto}
                                                                                    style={{ ...btnPrimario, background: '#dc2626', flex: 1, padding: '0.45rem', fontSize: '0.82rem' }}
                                                                                >
                                                                                    ✅ Sí, Confirmar Merma
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setMermaProdConfirmando(false)}
                                                                                    style={{ ...btnSecundario, padding: '0.45rem 0.75rem', fontSize: '0.82rem', cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                                                                >
                                                                                    Cancelar
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {mermaProdResultado && (
                                                                        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '0.6rem', fontSize: '0.8rem', color: '#166534' }}>
                                                                            <div><strong>✅ Última merma registrada:</strong> {mermaProdResultado.productoNombre}</div>
                                                                            <div>
                                                                                Baja: <strong>-{mermaProdResultado.cantidadPerdida} {mermaProdResultado.unidadMedida}</strong> |{' '}
                                                                                Stock restante: <strong>{mermaProdResultado.stockRestante}</strong> |{' '}
                                                                                Pérdida: <strong>Bs {Number(mermaProdResultado.costoPerdida || 0).toFixed(2)}</strong>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </section>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* TABLA INVENTARIO ACTUAL DE ARTÍCULOS FILTRADA POR PESTAÑA */}
                                    <section style={{ ...cardStyle, marginTop: '0.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                                            <div>
                                                <h3 style={{ margin: 0 }}>
                                                    Catálogo de Artículos {categoriaTabActiva !== 'todas' ? `— Categoría: ${categoriaTabActiva}` : ''}
                                                </h3>
                                                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                                    {productosFiltrados.length} artículo(s) encontrado(s) de un total de {(datos.productos || []).length}
                                                </span>
                                            </div>

                                            {/* Buscador Rápido y Selector de Límite de Productos */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <div style={{ position: 'relative', minWidth: '240px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="🔍 Buscar artículo por nombre o categoría..."
                                                        value={busquedaProductos}
                                                        onChange={(e) => {
                                                            setBusquedaProductos(e.target.value);
                                                            setPaginaProductos(1);
                                                        }}
                                                        style={{ ...inputStyle, padding: '0.45rem 2rem 0.45rem 0.65rem', fontSize: '0.85rem' }}
                                                    />
                                                    {busquedaProductos && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setBusquedaProductos('');
                                                                setPaginaProductos(1);
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                right: '8px',
                                                                top: '50%',
                                                                transform: 'translateY(-50%)',
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: '#94a3b8',
                                                                cursor: 'pointer',
                                                                fontWeight: 'bold',
                                                                fontSize: '0.9rem'
                                                            }}
                                                            title="Limpiar búsqueda"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>

                                                <select
                                                    value={limitePorPaginaProductos}
                                                    onChange={(e) => {
                                                        setLimitePorPaginaProductos(Number(e.target.value));
                                                        setPaginaProductos(1);
                                                    }}
                                                    style={{ ...inputStyle, width: 'auto', padding: '0.45rem', fontSize: '0.85rem' }}
                                                    title="Artículos por página"
                                                >
                                                    <option value={5}>5 por pág.</option>
                                                    <option value={10}>10 por pág.</option>
                                                    <option value={20}>20 por pág.</option>
                                                    <option value={50}>50 por pág.</option>
                                                </select>
                                            </div>
                                        </div>

                                        {productosFiltrados.length === 0 ? (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
                                                {busquedaProductos
                                                    ? <>No se encontraron artículos que coincidan con &ldquo;<strong>{busquedaProductos}</strong>&rdquo;.</>
                                                    : 'No hay artículos registrados en esta categoría.'}
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ overflowX: 'auto' }}>
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
                                                            {productosPaginados.map((p) => {
                                                                const gananciaUni = Number(p.precio) - Number(p.costo || 0);
                                                                const stockBajo = p.tipo_inventario === 'directo' && Number(p.stock) <= Number(p.stock_minimo || 0);
                                                                return (
                                                                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                                        <td style={thTd}>#{p.id}</td>
                                                                        <td style={thTd}>
                                                                            <strong>{p.nombre}</strong>
                                                                            {p.grupos_modificadores && p.grupos_modificadores.length > 0 && (
                                                                                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                                                                                    {p.grupos_modificadores.map((g) => (
                                                                                        <span key={g.id} style={{ fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                                                                            ✨ {g.nombre}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </td>
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
                                                                            {p.tipo_inventario === 'receta'
                                                                                ? '🧪 Receta / Insumo'
                                                                                : p.tipo_inventario === 'directo'
                                                                                ? '📦 Reventa Directa'
                                                                                : p.tipo_inventario === 'combo'
                                                                                ? '🎁 Combo / Promo'
                                                                                : '✨ Libre'}
                                                                            {p.tipo_inventario === 'combo' && Number(p.limite_maximo_activo) === 1 && (
                                                                                <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: '0.2rem' }}>
                                                                                    Límite: {p.limite_unidades_restante}/{p.limite_unidades_total} u.
                                                                                </div>
                                                                            )}
                                                                            {p.tipo_inventario === 'combo' && (p.fecha_inicio_vigencia || p.fecha_fin_vigencia) && (
                                                                                <div style={{ fontSize: '0.7rem', color: p.esta_vigente === false ? '#dc2626' : '#166534', marginTop: '0.15rem' }}>
                                                                                    {p.esta_vigente === false ? `⛔ ${p.motivo_no_vigente || 'Fuera de vigencia'}` : '🟢 En vigencia'}
                                                                                </div>
                                                                            )}
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
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Barra de Paginación Limpia para Catálogo */}
                                                {totalPaginasProductos > 1 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                                            Mostrando {inicioProductos + 1} - {Math.min(inicioProductos + limitePorPaginaProductos, productosFiltrados.length)} de {productosFiltrados.length}
                                                        </span>
                                                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                                            <button
                                                                type="button"
                                                                disabled={paginaProductosValida <= 1}
                                                                onClick={() => setPaginaProductos((p) => Math.max(1, p - 1))}
                                                                style={{
                                                                    padding: '0.35rem 0.75rem',
                                                                    borderRadius: '4px',
                                                                    border: '1px solid #cbd5e1',
                                                                    background: paginaProductosValida <= 1 ? '#f1f5f9' : '#ffffff',
                                                                    color: paginaProductosValida <= 1 ? '#94a3b8' : '#0f172a',
                                                                    cursor: paginaProductosValida <= 1 ? 'not-allowed' : 'pointer',
                                                                    fontSize: '0.82rem',
                                                                    fontWeight: 'bold'
                                                                }}
                                                            >
                                                                ◀ Anterior
                                                            </button>

                                                            {Array.from({ length: totalPaginasProductos }, (_, i) => i + 1)
                                                                .filter((num) => num === 1 || num === totalPaginasProductos || Math.abs(num - paginaProductosValida) <= 1)
                                                                .reduce((acc, num, idx, arr) => {
                                                                    if (idx > 0 && num - arr[idx - 1] > 1) {
                                                                        acc.push('...');
                                                                    }
                                                                    acc.push(num);
                                                                    return acc;
                                                                }, [])
                                                                .map((item, idx) => {
                                                                    if (item === '...') {
                                                                        return <span key={`ellipsis-prod-${idx}`} style={{ padding: '0 0.25rem', color: '#94a3b8' }}>...</span>;
                                                                    }
                                                                    const esActiva = item === paginaProductosValida;
                                                                    return (
                                                                        <button
                                                                            key={item}
                                                                            type="button"
                                                                            onClick={() => setPaginaProductos(item)}
                                                                            style={{
                                                                                padding: '0.35rem 0.65rem',
                                                                                borderRadius: '4px',
                                                                                border: esActiva ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                                                background: esActiva ? '#0284c7' : '#ffffff',
                                                                                color: esActiva ? '#ffffff' : '#0f172a',
                                                                                cursor: 'pointer',
                                                                                fontSize: '0.82rem',
                                                                                fontWeight: esActiva ? 'bold' : 'normal',
                                                                                minWidth: '32px'
                                                                            }}
                                                                        >
                                                                            {item}
                                                                        </button>
                                                                    );
                                                                })}

                                                            <button
                                                                type="button"
                                                                disabled={paginaProductosValida >= totalPaginasProductos}
                                                                onClick={() => setPaginaProductos((p) => Math.min(totalPaginasProductos, p + 1))}
                                                                style={{
                                                                    padding: '0.35rem 0.75rem',
                                                                    borderRadius: '4px',
                                                                    border: '1px solid #cbd5e1',
                                                                    background: paginaProductosValida >= totalPaginasProductos ? '#f1f5f9' : '#ffffff',
                                                                    color: paginaProductosValida >= totalPaginasProductos ? '#94a3b8' : '#0f172a',
                                                                    cursor: paginaProductosValida >= totalPaginasProductos ? 'not-allowed' : 'pointer',
                                                                    fontSize: '0.82rem',
                                                                    fontWeight: 'bold'
                                                                }}
                                                            >
                                                                Siguiente ▶
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </section>
                                        </>
                                    )}
                                </div>
                            );
                        })()}

                        {/* ==========================================
                            MÓDULO 4: MATERIALES / INSUMOS (SOLO SI USA RECETAS/ENSAMBLAJE)
                           ========================================== */}
                        {seccionActiva === 'insumos' && usaRecetas && (() => {
                            const listaInsumosCompleta = datos.prediccionInsumos || [];
                            const insumosFiltrados = listaInsumosCompleta.filter((ins) => {
                                if (!busquedaInsumos.trim()) return true;
                                const termino = busquedaInsumos.toLowerCase();
                                return (
                                    (ins.nombre || '').toLowerCase().includes(termino) ||
                                    (ins.unidad || '').toLowerCase().includes(termino) ||
                                    (ins.estadoAlerta || '').toLowerCase().includes(termino)
                                );
                            });

                            const totalPaginasInsumos = Math.max(1, Math.ceil(insumosFiltrados.length / limitePorPaginaInsumos));
                            const paginaInsumosValida = Math.min(Math.max(1, paginaInsumos), totalPaginasInsumos);
                            const inicioInsumos = (paginaInsumosValida - 1) * limitePorPaginaInsumos;
                            const insumosPaginados = insumosFiltrados.slice(inicioInsumos, inicioInsumos + limitePorPaginaInsumos);

                            return (
                                <>
                                    <section style={{ ...cardStyle, marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                                            <div>
                                                <h2 style={{ margin: 0 }}>🧱 Estado de Materiales / Insumos y Punto de Reorden</h2>
                                                <span style={{ fontSize: '0.84rem', color: '#64748b' }}>
                                                    {insumosFiltrados.length} insumo(s) encontrado(s) de un total de {listaInsumosCompleta.length}
                                                </span>
                                            </div>

                                            {/* Buscador Rápido y Selector de Límite de Insumos */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <div style={{ position: 'relative', minWidth: '240px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="🔍 Buscar insumo por nombre o alerta..."
                                                        value={busquedaInsumos}
                                                        onChange={(e) => {
                                                            setBusquedaInsumos(e.target.value);
                                                            setPaginaInsumos(1);
                                                        }}
                                                        style={{ ...inputStyle, padding: '0.45rem 2rem 0.45rem 0.65rem', fontSize: '0.85rem' }}
                                                    />
                                                    {busquedaInsumos && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setBusquedaInsumos('');
                                                                setPaginaInsumos(1);
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                right: '8px',
                                                                top: '50%',
                                                                transform: 'translateY(-50%)',
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: '#94a3b8',
                                                                cursor: 'pointer',
                                                                fontWeight: 'bold',
                                                                fontSize: '0.9rem'
                                                            }}
                                                            title="Limpiar búsqueda"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>

                                                <select
                                                    value={limitePorPaginaInsumos}
                                                    onChange={(e) => {
                                                        setLimitePorPaginaInsumos(Number(e.target.value));
                                                        setPaginaInsumos(1);
                                                    }}
                                                    style={{ ...inputStyle, width: 'auto', padding: '0.45rem', fontSize: '0.85rem' }}
                                                    title="Insumos por página"
                                                >
                                                    <option value={5}>5 por pág.</option>
                                                    <option value={10}>10 por pág.</option>
                                                    <option value={20}>20 por pág.</option>
                                                    <option value={50}>50 por pág.</option>
                                                </select>
                                            </div>
                                        </div>

                                        {listaInsumosCompleta.length === 0 ? (
                                            <p style={{ color: '#666' }}>No hay materiales o insumos registrados todavía.</p>
                                        ) : insumosFiltrados.length === 0 ? (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
                                                No se encontraron insumos que coincidan con &ldquo;<strong>{busquedaInsumos}</strong>&rdquo;.
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', background: '#f8fafc' }}>
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
                                                            {insumosPaginados.map((ins) => (
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
                                                </div>

                                                {/* Barra de Paginación Limpia para Insumos */}
                                                {totalPaginasInsumos > 1 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                                            Mostrando {inicioInsumos + 1} - {Math.min(inicioInsumos + limitePorPaginaInsumos, insumosFiltrados.length)} de {insumosFiltrados.length}
                                                        </span>
                                                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                                            <button
                                                                type="button"
                                                                disabled={paginaInsumosValida <= 1}
                                                                onClick={() => setPaginaInsumos((p) => Math.max(1, p - 1))}
                                                                style={{
                                                                    padding: '0.35rem 0.75rem',
                                                                    borderRadius: '4px',
                                                                    border: '1px solid #cbd5e1',
                                                                    background: paginaInsumosValida <= 1 ? '#f1f5f9' : '#ffffff',
                                                                    color: paginaInsumosValida <= 1 ? '#94a3b8' : '#0f172a',
                                                                    cursor: paginaInsumosValida <= 1 ? 'not-allowed' : 'pointer',
                                                                    fontSize: '0.82rem',
                                                                    fontWeight: 'bold'
                                                                }}
                                                            >
                                                                ◀ Anterior
                                                            </button>

                                                            {Array.from({ length: totalPaginasInsumos }, (_, i) => i + 1)
                                                                .filter((num) => num === 1 || num === totalPaginasInsumos || Math.abs(num - paginaInsumosValida) <= 1)
                                                                .reduce((acc, num, idx, arr) => {
                                                                    if (idx > 0 && num - arr[idx - 1] > 1) {
                                                                        acc.push('...');
                                                                    }
                                                                    acc.push(num);
                                                                    return acc;
                                                                }, [])
                                                                .map((item, idx) => {
                                                                    if (item === '...') {
                                                                        return <span key={`ellipsis-ins-${idx}`} style={{ padding: '0 0.25rem', color: '#94a3b8' }}>...</span>;
                                                                    }
                                                                    const esActiva = item === paginaInsumosValida;
                                                                    return (
                                                                        <button
                                                                            key={item}
                                                                            type="button"
                                                                            onClick={() => setPaginaInsumos(item)}
                                                                            style={{
                                                                                padding: '0.35rem 0.65rem',
                                                                                borderRadius: '4px',
                                                                                border: esActiva ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                                                background: esActiva ? '#0284c7' : '#ffffff',
                                                                                color: esActiva ? '#ffffff' : '#0f172a',
                                                                                cursor: 'pointer',
                                                                                fontSize: '0.82rem',
                                                                                fontWeight: esActiva ? 'bold' : 'normal',
                                                                                minWidth: '32px'
                                                                            }}
                                                                        >
                                                                            {item}
                                                                        </button>
                                                                    );
                                                                })}

                                                            <button
                                                                type="button"
                                                                disabled={paginaInsumosValida >= totalPaginasInsumos}
                                                                onClick={() => setPaginaInsumos((p) => Math.min(totalPaginasInsumos, p + 1))}
                                                                style={{
                                                                    padding: '0.35rem 0.75rem',
                                                                    borderRadius: '4px',
                                                                    border: '1px solid #cbd5e1',
                                                                    background: paginaInsumosValida >= totalPaginasInsumos ? '#f1f5f9' : '#ffffff',
                                                                    color: paginaInsumosValida >= totalPaginasInsumos ? '#94a3b8' : '#0f172a',
                                                                    cursor: paginaInsumosValida >= totalPaginasInsumos ? 'not-allowed' : 'pointer',
                                                                    fontSize: '0.82rem',
                                                                    fontWeight: 'bold'
                                                                }}
                                                            >
                                                                Siguiente ▶
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
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
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                    NIT Proveedor (Opcional):
                                                    <input
                                                        type="text"
                                                        placeholder="NIT del proveedor"
                                                        value={compraNitProveedor}
                                                        onChange={(e) => setCompraNitProveedor(e.target.value)}
                                                        style={inputStyle}
                                                    />
                                                </label>
                                                <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                    N° Factura (Opcional):
                                                    <input
                                                        type="text"
                                                        placeholder="N° de factura"
                                                        value={compraNroFactura}
                                                        onChange={(e) => {
                                                            setCompraNroFactura(e.target.value);
                                                            if (e.target.value.trim() !== '') setCompraConFactura(true);
                                                        }}
                                                        style={inputStyle}
                                                    />
                                                </label>
                                            </div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem', color: '#1e293b', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={compraConFactura}
                                                    onChange={(e) => setCompraConFactura(e.target.checked)}
                                                />
                                                <span>🧾 Compra con Factura Fiscal (Genera Crédito Fiscal IVA)</span>
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
                                                <input type="number" step="0.0001" min="0" placeholder="Cuánto cuesta 1 unidad en Bs" value={insCostoUni} onChange={(e) => setInsCostoUni(e.target.value)} style={inputStyle} />
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

                                {/* FORMULARIO DE REGISTRO DE MERMAS DE MATERIALES / INSUMOS */}
                                <section style={{ ...cardStyle, marginTop: '1.5rem', border: '1px solid #fecaca', background: '#fffdfd' }}>
                                    <h3 style={{ marginTop: 0, color: '#991b1b' }}>⚠️ Registrar Merma / Desperdicio de Material o Insumo</h3>
                                    {(() => {
                                        const listaIns = datos.insumos || [];
                                        if (listaIns.length === 0) {
                                            return <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>No hay materiales o insumos registrados.</p>;
                                        }
                                        const insSel = listaIns.find((i) => String(i.id) === String(mermaInsId)) || listaIns[0];
                                        const stockIns = Number(insSel?.stock_actual ?? 0);
                                        const costoUnitIns = Number(insSel?.costo_por_unidad ?? 0);
                                        const cantInsNum = Number(mermaInsCantidad) || 0;
                                        const perdidaInsBs = Number((Math.max(0, cantInsNum) * costoUnitIns).toFixed(2));
                                        const superaStockIns = cantInsNum > stockIns;

                                        return (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 1.4fr auto', gap: '0.75rem', alignItems: 'end', flexWrap: 'wrap' }}>
                                                <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                    Insumo ({insSel?.unidad_medida || 'u.'}):
                                                    <select
                                                        value={mermaInsId}
                                                        onChange={(e) => {
                                                            setMermaInsId(e.target.value);
                                                            setMermaInsConfirmando(false);
                                                            setMermaInsResultado(null);
                                                        }}
                                                        style={{ ...inputStyle, marginTop: '0.25rem' }}
                                                    >
                                                        {listaIns.map((i) => (
                                                            <option key={i.id} value={i.id}>
                                                                {i.nombre} (Stock: {i.stock_actual} {i.unidad_medida} | Bs {Number(i.costo_por_unidad).toFixed(4)}/{i.unidad_medida})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                    Cantidad Perdida:
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.01"
                                                        max={stockIns}
                                                        placeholder={`Máx: ${stockIns}`}
                                                        value={mermaInsCantidad}
                                                        onChange={(e) => {
                                                            setMermaInsCantidad(e.target.value);
                                                            setMermaInsConfirmando(false);
                                                        }}
                                                        style={{ ...inputStyle, marginTop: '0.25rem', borderColor: superaStockIns ? '#ef4444' : '#ccc' }}
                                                    />
                                                </label>
                                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.45rem 0.6rem', textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#991b1b', fontWeight: 'bold', textTransform: 'uppercase' }}>Pérdida Estimada</div>
                                                    <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#b91c1c' }}>Bs {perdidaInsBs.toFixed(2)}</div>
                                                </div>
                                                <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                    Motivo de Merma (Obligatorio):
                                                    <input
                                                        type="text"
                                                        placeholder="Ej. Derrame, caducidad, merma de cocción..."
                                                        value={mermaInsMotivo}
                                                        onChange={(e) => {
                                                            setMermaInsMotivo(e.target.value);
                                                            setMermaInsConfirmando(false);
                                                        }}
                                                        style={{ ...inputStyle, marginTop: '0.25rem' }}
                                                    />
                                                </label>
                                                <div>
                                                    {!mermaInsConfirmando ? (
                                                        <button
                                                            type="button"
                                                            disabled={!insSel || stockIns <= 0 || cantInsNum <= 0 || superaStockIns || !mermaInsMotivo || mermaInsMotivo.trim().length < 3}
                                                            onClick={() => setMermaInsConfirmando(true)}
                                                            style={{
                                                                ...btnPrimario,
                                                                background: '#dc2626',
                                                                opacity: (!insSel || stockIns <= 0 || cantInsNum <= 0 || superaStockIns || !mermaInsMotivo || mermaInsMotivo.trim().length < 3) ? 0.55 : 1,
                                                                cursor: (!insSel || stockIns <= 0 || cantInsNum <= 0 || superaStockIns || !mermaInsMotivo || mermaInsMotivo.trim().length < 3) ? 'not-allowed' : 'pointer'
                                                            }}
                                                        >
                                                            Dar de Baja
                                                        </button>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                            <button
                                                                type="button"
                                                                onClick={handleConfirmarMermaInsumo}
                                                                style={{ ...btnPrimario, background: '#dc2626', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                                                            >
                                                                ✅ Confirmar (-{cantInsNum} {insSel?.unidad_medida})
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setMermaInsConfirmando(false)}
                                                                style={{ ...btnSecundario, padding: '0.5rem 0.65rem', fontSize: '0.8rem', cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {mermaInsResultado && (
                                        <div style={{ marginTop: '0.75rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '0.55rem 0.75rem', fontSize: '0.82rem', color: '#166534' }}>
                                            <strong>✅ Merma de insumo registrada:</strong> {mermaInsResultado.insumoNombre} (-{mermaInsResultado.cantidadPerdida} {mermaInsResultado.unidadMedida}) | Stock restante: <strong>{mermaInsResultado.stockRestante} {mermaInsResultado.unidadMedida}</strong> | Pérdida: <strong>Bs {Number(mermaInsResultado.costoPerdida || 0).toFixed(2)}</strong>
                                        </div>
                                    )}
                                </section>
                            </>
                        );
                    })()}

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
                                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTogglePermisoFiscalUsuario(u.id, Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1, u.nombre)}
                                                            style={{
                                                                padding: '0.3rem 0.55rem',
                                                                background: Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1 ? '#dcfce7' : '#f1f5f9',
                                                                color: Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1 ? '#166534' : '#64748b',
                                                                border: `1px solid ${Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1 ? '#86efac' : '#cbd5e1'}`,
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.76rem',
                                                                fontWeight: 'bold'
                                                            }}
                                                            title="Habilitar o deshabilitar que este usuario pueda registrar datos de factura/respaldo en ventas y egresos"
                                                        >
                                                            🧾 Respaldo Fiscal: {Number(u.puede_registrar_respaldo_fiscal ?? 1) === 1 ? 'SÍ' : 'NO'}
                                                        </button>
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

                        {/* ==========================================
                            MÓDULO: EXPORTACIÓN DE REPORTES (EXCEL, PDF, CSV)
                           ========================================== */}
                        {seccionActiva === 'exportacion' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1100px' }}>
                                {/* Encabezado de la Sección */}
                                <section style={cardStyle}>
                                    <h2 style={{ marginTop: 0, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        📥 Centro de Exportación de Reportes
                                    </h2>
                                    <p style={{ color: '#475569', fontSize: '0.92rem', margin: 0 }}>
                                        Exporta y audita los datos operativos y financieros del negocio en los 3 formatos oficiales: <strong>Excel (.xlsx)</strong>, <strong>PDF de Auditoría de Turno</strong> y <strong>CSV Contable</strong>. Puedes aplicar filtros por rango de fechas, operador y estación física de caja.
                                    </p>
                                </section>

                                {/* Filtros de Exportación */}
                                <section style={{ ...cardStyle, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📅 Filtros de Exportación (Excel y CSV)
                                        </h3>
                                        {(filtroExportDesde || filtroExportHasta || filtroExportUsuarioId || filtroExportCajaFisicaId) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFiltroExportDesde('');
                                                    setFiltroExportHasta('');
                                                    setFiltroExportUsuarioId('');
                                                    setFiltroExportCajaFisicaId('');
                                                }}
                                                style={{ padding: '0.3rem 0.65rem', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                                            >
                                                ✕ Limpiar Filtros
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                                Fecha Desde:
                                            </label>
                                            <input
                                                type="date"
                                                title="Fecha desde"
                                                value={filtroExportDesde}
                                                onChange={(e) => setFiltroExportDesde(e.target.value)}
                                                style={{ ...inputStyle, padding: '0.45rem', fontSize: '0.88rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                                Fecha Hasta:
                                            </label>
                                            <input
                                                type="date"
                                                title="Fecha hasta"
                                                value={filtroExportHasta}
                                                onChange={(e) => setFiltroExportHasta(e.target.value)}
                                                style={{ ...inputStyle, padding: '0.45rem', fontSize: '0.88rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                                Operador / Cajero:
                                            </label>
                                            <select
                                                title="Filtrar por operador"
                                                value={filtroExportUsuarioId}
                                                onChange={(e) => setFiltroExportUsuarioId(e.target.value)}
                                                style={{ ...inputStyle, padding: '0.45rem', fontSize: '0.88rem' }}
                                            >
                                                <option value="">Todos los operadores</option>
                                                {(datos.usuarios || []).map((u) => (
                                                    <option key={u.id} value={u.id}>{u.nombre}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                                Estación Física de Caja:
                                            </label>
                                            <select
                                                title="Filtrar por estación física"
                                                value={filtroExportCajaFisicaId}
                                                onChange={(e) => setFiltroExportCajaFisicaId(e.target.value)}
                                                style={{ ...inputStyle, padding: '0.45rem', fontSize: '0.88rem' }}
                                            >
                                                <option value="">Todas las estaciones</option>
                                                {(datos.cajasFisicas || []).map((cf) => (
                                                    <option key={cf.id} value={cf.id}>{cf.nombre}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    {(filtroExportDesde || filtroExportHasta || filtroExportUsuarioId || filtroExportCajaFisicaId) && (
                                        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#0369a1', background: '#e0f2fe', padding: '0.4rem 0.65rem', borderRadius: '4px' }}>
                                            ℹ️ Filtro activo: {[
                                                filtroExportDesde ? `Desde: ${filtroExportDesde}` : '',
                                                filtroExportHasta ? `Hasta: ${filtroExportHasta}` : '',
                                                filtroExportUsuarioId ? `Operador: ${(datos.usuarios || []).find(u => Number(u.id) === Number(filtroExportUsuarioId))?.nombre || filtroExportUsuarioId}` : '',
                                                filtroExportCajaFisicaId ? `Estación: ${(datos.cajasFisicas || []).find(cf => Number(cf.id) === Number(filtroExportCajaFisicaId))?.nombre || filtroExportCajaFisicaId}` : ''
                                            ].filter(Boolean).join(' | ')}
                                        </div>
                                    )}
                                </section>

                                {/* Las 3 Opciones de Formato */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1.25rem' }}>
                                    {/* Formato 1: Excel Contable (.xlsx) */}
                                    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '4px solid #16a34a' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <h3 style={{ margin: 0, color: '#166534', fontSize: '1.15rem' }}>
                                                    📊 Excel Contable (.xlsx)
                                                </h3>
                                                <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                                    10 Hojas Contables
                                                </span>
                                            </div>
                                            <p style={{ color: '#475569', fontSize: '0.86rem', lineHeight: '1.4' }}>
                                                Libro contable y de auditoría integral con 10 hojas estructuradas:
                                            </p>
                                            <ul style={{ color: '#64748b', fontSize: '0.8rem', paddingLeft: '1.2rem', margin: '0.5rem 0 1rem 0', lineHeight: '1.45' }}>
                                                <li>Movimientos y arqueos de caja auditados.</li>
                                                <li>Detalle Ventas (CMV) con prorrateo exacto de descuentos.</li>
                                                <li>Rentabilidad neta por producto y compras/mermas.</li>
                                                <li>Kardex cronológico de productos directos e insumos.</li>
                                                <li>Historial de anulaciones y resumen contable.</li>
                                            </ul>
                                        </div>
                                        <a
                                            href={`/api/reportes?formato=xlsx${filtroExportDesde ? `&desde=${filtroExportDesde}` : ''}${filtroExportHasta ? `&hasta=${filtroExportHasta}` : ''}${filtroExportUsuarioId ? `&usuarioId=${filtroExportUsuarioId}` : ''}${filtroExportCajaFisicaId ? `&cajaFisicaId=${filtroExportCajaFisicaId}` : ''}`}
                                            style={{ ...btnPrimario, background: '#16a34a', textAlign: 'center', fontSize: '0.92rem', padding: '0.75rem 1rem', display: 'block', borderRadius: '6px' }}
                                        >
                                            📊 Descargar Excel Contable (.xlsx)
                                        </a>
                                    </section>

                                    {/* Formato 2: PDF de Auditoría de Turno */}
                                    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '4px solid #dc2626' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1.15rem' }}>
                                                    📄 PDF de Auditoría de Turno
                                                </h3>
                                                <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                                    Turno #{datos.cajaAuditada?.id || '—'}
                                                </span>
                                            </div>
                                            <p style={{ color: '#475569', fontSize: '0.86rem', lineHeight: '1.4' }}>
                                                Reporte imprimible de cierre y auditoría de turno con liquidación tributaria:
                                            </p>
                                            <ul style={{ color: '#64748b', fontSize: '0.8rem', paddingLeft: '1.2rem', margin: '0.5rem 0 0.75rem 0', lineHeight: '1.45' }}>
                                                <li>Resumen ejecutivo y liquidación fiscal (IVA / IT).</li>
                                                <li>Conciliación separada de efectivo vs. QR y arqueo ciego.</li>
                                                <li>Ventas netas de descuentos y rentabilidad por producto.</li>
                                                <li>Bitácora de movimientos y ventas anuladas.</li>
                                            </ul>
                                            <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                                    Turno Seleccionado para Auditoría:
                                                </label>
                                                <select
                                                    value={datos.cajaAuditada?.id || ''}
                                                    onChange={async (e) => {
                                                        const nuevoId = e.target.value;
                                                        if (nuevoId) {
                                                            setTurnoAuditadoId(nuevoId);
                                                            await cargarTodo(nuevoId);
                                                        }
                                                    }}
                                                    style={{ ...inputStyle, padding: '0.35rem', fontSize: '0.8rem' }}
                                                >
                                                    {(datos.historialCajas || []).map((c) => (
                                                        <option key={c.id} value={c.id}>
                                                            Turno #{c.id} — {c.cajero_nombre} ({c.caja_fisica_nombre || 'Caja Principal'}) [{c.estado}]
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                exportarReportePDF({
                                                    nombreNegocio: configActual.nombre_negocio,
                                                    configuracionNegocio: configActual,
                                                    usuarioGenerador: adminAutenticado?.nombre,
                                                    cajaAuditada: datos.cajaAuditada,
                                                    estadisticas: est,
                                                    movimientos: datos.movimientos,
                                                    desglosePagos: datos.desglosePagos
                                                })
                                            }
                                            style={{ ...btnPrimario, background: '#dc2626', textAlign: 'center', fontSize: '0.92rem', padding: '0.75rem 1rem', width: '100%', cursor: 'pointer', borderRadius: '6px' }}
                                        >
                                            📄 Descargar PDF (Turno #{datos.cajaAuditada?.id || '—'})
                                        </button>
                                    </section>

                                    {/* Formato 3: CSV Contable */}
                                    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '4px solid #0284c7' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <h3 style={{ margin: 0, color: '#0369a1', fontSize: '1.15rem' }}>
                                                    📥 CSV Contable
                                                </h3>
                                                <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                                    Texto Plano UTF-8
                                                </span>
                                            </div>
                                            <p style={{ color: '#475569', fontSize: '0.86rem', lineHeight: '1.4' }}>
                                                Exportación de movimientos en formato plano delimitado por comas:
                                            </p>
                                            <ul style={{ color: '#64748b', fontSize: '0.8rem', paddingLeft: '1.2rem', margin: '0.5rem 0 1rem 0', lineHeight: '1.45' }}>
                                                <li>Compatible con cualquier hoja de cálculo o sistema contable.</li>
                                                <li>Ideal para importar a bases de datos o pipelines externos.</li>
                                                <li>Incluye desglose por tipo, monto, método de pago y cajero.</li>
                                                <li>Aplica los filtros de fecha, operador y estación física.</li>
                                            </ul>
                                        </div>
                                        <a
                                            href={`/api/reportes?formato=csv${filtroExportDesde ? `&desde=${filtroExportDesde}` : ''}${filtroExportHasta ? `&hasta=${filtroExportHasta}` : ''}${filtroExportUsuarioId ? `&usuarioId=${filtroExportUsuarioId}` : ''}${filtroExportCajaFisicaId ? `&cajaFisicaId=${filtroExportCajaFisicaId}` : ''}`}
                                            style={{ ...btnPrimario, textAlign: 'center', fontSize: '0.92rem', padding: '0.75rem 1rem', display: 'block', borderRadius: '6px' }}
                                        >
                                            📥 Descargar CSV Contable
                                        </a>
                                    </section>
                                </div>
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
