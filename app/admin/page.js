'use client';

import { useState, useEffect } from 'react';

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

    // Sesión obligatoria de Administrador
    const [adminAutenticado, setAdminAutenticado] = useState(null);
    const [loginAdminId, setLoginAdminId] = useState('');
    const [loginAdminPin, setLoginAdminPin] = useState('');

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

    // Formularios de Catálogo de Artículos / Productos
    const [prodNombre, setProdNombre] = useState('');
    const [prodPrecio, setProdPrecio] = useState('');
    const [prodCosto, setProdCosto] = useState('0');
    const [prodCategoria, setProdCategoria] = useState('General');
    const [prodUnidad, setProdUnidad] = useState('unidades');
    const [prodStock, setProdStock] = useState('');
    const [prodStockMinimo, setProdStockMinimo] = useState('2');
    const [prodFechaVencimiento, setProdFechaVencimiento] = useState('');

    // Reabastecimiento de Artículo Directo (con CPP)
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
    const [insFechaVencimiento, setInsFechaVencimiento] = useState('');

    // Compra CPP de Insumo y Receta / Ensamblaje
    const [compraInsumoId, setCompraInsumoId] = useState('');
    const [compraCantidad, setCompraCantidad] = useState('');
    const [compraCostoTotal, setCompraCostoTotal] = useState('');

    const [recetaProdId, setRecetaProdId] = useState('');
    const [recetaInsumoId, setRecetaInsumoId] = useState('');
    const [recetaCantidad, setRecetaCantidad] = useState('');

    // Nuevo usuario
    const [nuevoUsuarioNombre, setNuevoUsuarioNombre] = useState('');
    const [nuevoUsuarioPin, setNuevoUsuarioPin] = useState('');
    const [nuevoUsuarioRol, setNuevoUsuarioRol] = useState('user');

    // Estados para formularios en línea (sin window.prompt)
    const [cajaAReabrirId, setCajaAReabrirId] = useState(null);
    const [motivoReapertura, setMotivoReapertura] = useState('Reconteo / Corrección de cierre');

    const [movimientoAAnularId, setMovimientoAAnularId] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('Error de cobro');

    const [usuarioCambioPin, setUsuarioCambioPin] = useState(null);
    const [pinActualInput, setPinActualInput] = useState('');
    const [nuevoPinInput, setNuevoPinInput] = useState('');

    async function cargarTodo() {
        try {
            setCargando(true);
            const [resCaja, resRep] = await Promise.all([
                fetch('/api/caja'),
                fetch('/api/reportes')
            ]);
            const dataCaja = await resCaja.json();
            const dataRep = await resRep.json();

            if (!resCaja.ok) throw new Error(dataCaja.error || 'Error al consultar /api/caja');
            if (!resRep.ok) throw new Error(dataRep.error || 'Error al consultar /api/reportes');

            if (!dataCaja.configuracionNegocio || Number(dataCaja.configuracionNegocio.configurado) === 0 || (dataCaja.usuarios || []).length === 0) {
                window.location.href = '/';
                return;
            }

            setDatos(dataCaja);
            setTendencias(dataRep);

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
            }
            if (dataCaja.productos?.length > 0) {
                if (!recetaProdId) setRecetaProdId(String(dataCaja.productos[0].id));
                if (!compraProdId) setCompraProdId(String(dataCaja.productos[0].id));
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
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'login',
                    usuarioId: Number(loginAdminId),
                    pin: loginAdminPin
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (data.usuario.rol !== 'admin' && data.usuario.rol !== 'superadmin') {
                throw new Error('Acceso denegado: este panel es exclusivo para Administradores y Super Admin.');
            }
            setAdminAutenticado(data.usuario);
            setLoginAdminPin('');
        } catch (err) {
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
                adminId: adminAutenticado.id,
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
                adminId: adminAutenticado.id,
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
                usuarioId: adminAutenticado.id,
                montoInicial: Number(nuevoFondoInicial)
            },
            'Nuevo turno de caja habilitado por el Administrador.'
        );
    }

    async function handleCrearProducto(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'crear_producto',
                nombre: prodNombre,
                precio: prodPrecio,
                costo: prodCosto,
                categoria: prodCategoria,
                unidadMedida: prodUnidad,
                stock: cfgUsaStockDirecto ? prodStock : null,
                stockMinimo: cfgUsaStockDirecto ? prodStockMinimo : 0,
                fechaVencimiento: cfgUsaVencimiento ? prodFechaVencimiento : null
            },
            `Artículo "${prodNombre}" registrado en el catálogo.`
        );
        if (ok) {
            setProdNombre('');
            setProdPrecio('');
            setProdStock('');
            setProdFechaVencimiento('');
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
        const ok = await ejecutarAccion(
            {
                accion: 'crear_insumo',
                nombre: insNombre,
                unidadMedida: insUnidad,
                stockInicial: insStockIni,
                costoPorUnidad: insCostoUni,
                stockSeguridad: insStockSeg,
                fechaVencimiento: cfgUsaVencimiento ? insFechaVencimiento : null
            },
            `Material / Insumo "${insNombre}" registrado.`
        );
        if (ok) {
            setInsNombre('');
            setInsStockIni('0');
            setInsCostoUni('0');
            setInsFechaVencimiento('');
        }
    }

    async function handleCompraCPP(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'comprar_insumo',
                insumoId: compraInsumoId,
                cantidadComprada: compraCantidad,
                costoTotalCompra: compraCostoTotal,
                motivo: 'Compra con Costo Promedio Ponderado'
            },
            'Compra registrada con Costo Promedio Ponderado (NIC 2) y costos de ensamblaje/recetas recalculados.'
        );
        if (ok) {
            setCompraCantidad('');
            setCompraCostoTotal('');
        }
    }

    async function handleAsignarReceta(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'asignar_receta',
                productoId: recetaProdId,
                insumoId: recetaInsumoId,
                cantidadRequerida: recetaCantidad
            },
            'Material / ingrediente vinculado al producto y costo recalculado.'
        );
        if (ok) setRecetaCantidad('');
    }

    async function confirmarAnularMovimiento(movimientoId) {
        if (!motivoAnulacion.trim()) {
            setError('Debes ingresar el motivo de la anulación.');
            return;
        }
        const ok = await ejecutarAccion(
            {
                accion: 'anular',
                adminId: adminAutenticado.id,
                movimientoId,
                motivo: motivoAnulacion.trim()
            },
            `Movimiento #${movimientoId} anulado y stock reintegrado.`
        );
        if (ok) {
            setMovimientoAAnularId(null);
            setMotivoAnulacion('Error de cobro');
        }
    }

    async function handleCrearUsuario(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'crear_usuario',
                adminId: adminAutenticado.id,
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
                adminId: adminAutenticado.id,
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
                ejecutorId: adminAutenticado.id,
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

    const NIVEL_ROL = { user: 1, admin: 2, superadmin: 3 };
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
                            Administrador:
                            <select value={loginAdminId} onChange={(e) => setLoginAdminId(e.target.value)} style={inputStyle}>
                                {listaAdmins.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.nombre} ({a.rol === 'superadmin' ? 'Super Admin' : 'Admin'})
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            PIN de Acceso:
                            <input
                                type="password"
                                placeholder="PIN (por defecto: 1234)"
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
    const mostrarAsistenteConfig = esPrimeraEjecucion || seccionActiva === 'configuracion';

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
                        {adminAutenticado.rol === 'superadmin' ? '👑 ' : '🛡️ '}
                        {adminAutenticado.nombre}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                        Rango: {adminAutenticado.rol.toUpperCase()}
                    </div>
                    <button
                        onClick={() => setAdminAutenticado(null)}
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
                        onClick={() => { limpiarAlertas(); setSeccionActiva('configuracion'); }}
                        style={navBtnStyle(mostrarAsistenteConfig)}
                    >
                        ⚙️ Modalidad del Negocio
                    </button>
                </nav>

                {/* Accesos Rápidos Inferiores */}
                <div style={{ padding: '1rem', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <a href="/api/reportes?formato=csv" style={{ ...btnPrimario, textAlign: 'center', fontSize: '0.84rem' }}>
                        📥 Descargar CSV (Excel)
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
                                                                                onClick={() => confirmarAnularMovimiento(m.id)}
                                                                                style={{ padding: '0.25rem 0.5rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                                                                            >
                                                                                Confirmar
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setMovimientoAAnularId(null)}
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
                                                                            setMotivoAnulacion('Error de cobro');
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
                        {seccionActiva === 'catalogo' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <section style={cardStyle}>
                                    <h3 style={{ marginTop: 0 }}>📦 Registrar Nuevo Artículo / Producto</h3>
                                    <form onSubmit={handleCrearProducto} style={formCol}>
                                        <input placeholder="Nombre del artículo (ej. Pastilla de freno, SSD 1TB, Café)" required value={prodNombre} onChange={(e) => setProdNombre(e.target.value)} style={inputStyle} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <input type="number" step="0.01" placeholder="Precio Venta (Bs)" required value={prodPrecio} onChange={(e) => setProdPrecio(e.target.value)} style={inputStyle} />
                                            <input type="number" step="0.01" placeholder="Costo Unitario (Bs)" value={prodCosto} onChange={(e) => setProdCosto(e.target.value)} style={inputStyle} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <input placeholder="Categoría (ej. Repuestos, Hardware)" value={prodCategoria} onChange={(e) => setProdCategoria(e.target.value)} style={inputStyle} />
                                            <input placeholder="Unidad (unidades, metros, kg, pares)" value={prodUnidad} onChange={(e) => setProdUnidad(e.target.value)} style={inputStyle} />
                                        </div>

                                        {usaStockDirecto && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                <input type="number" step="0.01" placeholder="Cantidad / Stock Inicial (vacío = libre)" value={prodStock} onChange={(e) => setProdStock(e.target.value)} style={inputStyle} />
                                                <input type="number" step="0.01" placeholder="Stock Mínimo de Alerta" value={prodStockMinimo} onChange={(e) => setProdStockMinimo(e.target.value)} style={inputStyle} />
                                            </div>
                                        )}

                                        {usaVencimiento && (
                                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                Fecha de Vencimiento del Lote:
                                                <input type="date" value={prodFechaVencimiento} onChange={(e) => setProdFechaVencimiento(e.target.value)} style={inputStyle} />
                                            </label>
                                        )}

                                        <button type="submit" style={btnPrimario}>Guardar en Catálogo</button>
                                    </form>
                                </section>

                                {/* Si usa Recetas/Ensamblaje muestra el constructor BOM; si no, muestra Reabastecimiento Directo con CPP */}
                                {usaRecetas ? (
                                    <section style={cardStyle}>
                                        <h3 style={{ marginTop: 0 }}>🔩 Ensamblaje / Receta de Materiales (BOM)</h3>
                                        <p style={{ color: '#555', fontSize: '0.88rem', marginTop: 0 }}>
                                            Define qué materiales, piezas o insumos componen este producto. El costo se recalcula automáticamente por Costo Promedio Ponderado.
                                        </p>
                                        <form onSubmit={handleAsignarReceta} style={formCol}>
                                            <label>
                                                Producto Final:
                                                <select value={recetaProdId} onChange={(e) => setRecetaProdId(e.target.value)} style={inputStyle}>
                                                    {(datos.productos || []).map((p) => (
                                                        <option key={p.id} value={p.id}>{p.nombre} ({p.tipo_inventario})</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label>
                                                Material / Componente / Insumo:
                                                <select value={recetaInsumoId} onChange={(e) => setRecetaInsumoId(e.target.value)} style={inputStyle}>
                                                    {(datos.insumos || []).map((i) => (
                                                        <option key={i.id} value={i.id}>{i.nombre} ({i.unidad_medida})</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label>
                                                Cantidad requerida por unidad:
                                                <input type="number" step="0.001" placeholder="Ej. 2 unidades o 0.5 metros" required value={recetaCantidad} onChange={(e) => setRecetaCantidad(e.target.value)} style={inputStyle} />
                                            </label>
                                            <button type="submit" style={btnPrimario}>Vincular Material al Producto</button>
                                        </form>
                                    </section>
                                ) : usaStockDirecto ? (
                                    <section style={cardStyle}>
                                        <h3 style={{ marginTop: 0 }}>🚚 Reabastecer Artículo (Compra con Costo Promedio NIC 2)</h3>
                                        <p style={{ color: '#555', fontSize: '0.88rem', marginTop: 0 }}>
                                            Ingresa mercadería nueva de tus proveedores. Suma al stock disponible y recalcula automáticamente el Costo Promedio Ponderado del artículo.
                                        </p>
                                        <form onSubmit={handleComprarProductoDirecto} style={formCol}>
                                            <label>
                                                Artículo a Reabastecer:
                                                <select value={compraProdId} onChange={(e) => setCompraProdId(e.target.value)} style={inputStyle}>
                                                    {(datos.productos || []).map((p) => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.nombre} (Stock actual: {p.stock ?? 0} {p.unidad_medida || 'u.'} | Costo: Bs {Number(p.costo).toFixed(2)})
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <input type="number" step="0.01" placeholder="Cantidad Comprada que entra a almacén" required value={compraProdCantidad} onChange={(e) => setCompraProdCantidad(e.target.value)} style={inputStyle} />
                                            <input type="number" step="0.01" placeholder="Costo Total Pagado al Proveedor (Bs)" required value={compraProdCostoTotal} onChange={(e) => setCompraProdCostoTotal(e.target.value)} style={inputStyle} />
                                            {usaVencimiento && (
                                                <label style={{ fontSize: '0.85rem' }}>
                                                    Nueva Fecha de Vencimiento del Lote:
                                                    <input type="date" value={compraProdVencimiento} onChange={(e) => setCompraProdVencimiento(e.target.value)} style={inputStyle} />
                                                </label>
                                            )}
                                            <button type="submit" style={btnOscuro}>Registrar Entrada de Mercadería</button>
                                        </form>
                                    </section>
                                ) : null}

                                <section style={{ ...cardStyle, gridColumn: '1 / -1' }}>
                                    <h3 style={{ marginTop: 0 }}>Inventario Actual de Artículos</h3>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                                <th style={thTd}>ID</th>
                                                <th style={thTd}>Artículo</th>
                                                <th style={thTd}>Categoría</th>
                                                <th style={thTd}>Modalidad</th>
                                                <th style={thTd}>Precio Venta</th>
                                                <th style={thTd}>Costo Promedio</th>
                                                <th style={thTd}>Stock / Disponibilidad</th>
                                                {usaVencimiento && <th style={thTd}>Fecha Vencimiento</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(datos.productos || []).map((p) => {
                                                const stockBajo = p.tipo_inventario === 'directo' && Number(p.stock) <= Number(p.stock_minimo || 0);
                                                return (
                                                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                        <td style={thTd}>#{p.id}</td>
                                                        <td style={thTd}><strong>{p.nombre}</strong></td>
                                                        <td style={thTd}>{p.categoria}</td>
                                                        <td style={thTd}>{p.tipo_inventario}</td>
                                                        <td style={thTd}>Bs {Number(p.precio).toFixed(2)}</td>
                                                        <td style={thTd}>Bs {Number(p.costo).toFixed(2)}</td>
                                                        <td style={{ ...thTd, fontWeight: 'bold', color: stockBajo ? '#b91c1c' : '#166534' }}>
                                                            {p.tipo_inventario === 'libre' || p.unidades_disponibles === null
                                                                ? 'Libre (Servicio)'
                                                                : `${p.unidades_disponibles} ${p.unidad_medida || 'u.'} ${stockBajo ? '⚠️ (Reponer)' : ''}`}
                                                        </td>
                                                        {usaVencimiento && (
                                                            <td style={thTd}>
                                                                {p.fecha_vencimiento || 'Sin fecha'}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </section>
                            </div>
                        )}

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
                                            <label>
                                                Seleccionar Material / Insumo:
                                                <select value={compraInsumoId} onChange={(e) => setCompraInsumoId(e.target.value)} style={inputStyle}>
                                                    {(datos.insumos || []).map((i) => (
                                                        <option key={i.id} value={i.id}>
                                                            {i.nombre} (Stock: {i.stock_actual} {i.unidad_medida} | Bs {i.costo_por_unidad}/{i.unidad_medida})
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <input type="number" step="0.01" placeholder="Cantidad Comprada" required value={compraCantidad} onChange={(e) => setCompraCantidad(e.target.value)} style={inputStyle} />
                                            <input type="number" step="0.01" placeholder="Costo Total de la Compra (Bs)" required value={compraCostoTotal} onChange={(e) => setCompraCostoTotal(e.target.value)} style={inputStyle} />
                                            <button type="submit" style={btnOscuro}>Registrar Compra y Actualizar Costos</button>
                                        </form>
                                    </section>

                                    <section style={cardStyle}>
                                        <h3 style={{ marginTop: 0 }}>Registrar Nuevo Material / Insumo</h3>
                                        <form onSubmit={handleCrearInsumo} style={formCol}>
                                            <input placeholder="Nombre (ej. Tablero Melamina, Memoria RAM, Leche)" required value={insNombre} onChange={(e) => setInsNombre(e.target.value)} style={inputStyle} />
                                            <input placeholder="Unidad (unidades, metros, litros, kg)" required value={insUnidad} onChange={(e) => setInsUnidad(e.target.value)} style={inputStyle} />
                                            <input type="number" step="0.01" placeholder="Stock Inicial" value={insStockIni} onChange={(e) => setInsStockIni(e.target.value)} style={inputStyle} />
                                            <input type="number" step="0.01" placeholder="Costo por Unidad (Bs)" value={insCostoUni} onChange={(e) => setInsCostoUni(e.target.value)} style={inputStyle} />
                                            <input type="number" step="0.01" placeholder="Stock de Seguridad" value={insStockSeg} onChange={(e) => setInsStockSeg(e.target.value)} style={inputStyle} />
                                            {usaVencimiento && (
                                                <label style={{ fontSize: '0.85rem' }}>
                                                    Fecha de Vencimiento:
                                                    <input type="date" value={insFechaVencimiento} onChange={(e) => setInsFechaVencimiento(e.target.value)} style={inputStyle} />
                                                </label>
                                            )}
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
                                            {adminAutenticado.rol === 'superadmin' && (
                                                <option value="admin">Administrador (admin) — Exclusivo Super Admin</option>
                                            )}
                                        </select>
                                        <button type="submit" style={btnPrimario}>Crear Usuario</button>
                                    </form>
                                </section>

                                <section style={cardStyle}>
                                    <h3 style={{ marginTop: 0 }}>Directorio de Usuarios y Control de PIN</h3>
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
