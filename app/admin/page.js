'use client';

import { useState, useEffect } from 'react';
import TabResumen from './_components/TabResumen';
import TabTurnosArqueos from './_components/TabTurnosArqueos';
import TabCatalogo from './_components/TabCatalogo';
import TabKardex from './_components/TabKardex';
import TabUsuariosCajas from './_components/TabUsuariosCajas';
import TabConfigFiscal from './_components/TabConfigFiscal';
import TabExportacion from './_components/TabExportacion';
import {
    cardStyle,
    formCol,
    inputStyle,
    btnPrimario,
    btnSecundario,
    btnOscuro,
    sidebarStyle,
    navBtnStyle
} from './_components/adminStyles';

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

    // Sesión obligatoria de Administrador
    const [adminAutenticado, setAdminAutenticado] = useState(null);
    const [loginAdminPin, setLoginAdminPin] = useState('');
    const [loginAdminNombreManual, setLoginAdminNombreManual] = useState('');

    // Turno auditado seleccionado
    const [turnoAuditadoId, setTurnoAuditadoId] = useState(null);

    // Mensajes y Alertas Globales
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    function limpiarAlertas() {
        setMensaje(null);
        setError(null);
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
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    }

    useEffect(() => {
        cargarTodo();
    }, []);

    // Cierre automático de sesión por inactividad para developer y administradores
    useEffect(() => {
        if (!adminAutenticado) return;

        const MINUTOS_INACTIVIDAD = adminAutenticado.rol === 'developer' ? 15 : 20;
        const TIEMPO_LIMITE_MS = MINUTOS_INACTIVIDAD * 60 * 1000;
        let timerInactividad = null;

        const reiniciarTemporizador = () => {
            if (timerInactividad) clearTimeout(timerInactividad);
            timerInactividad = setTimeout(async () => {
                try {
                    await fetch('/api/auth', {
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

    async function handleLoginAdmin(e) {
        e.preventDefault();
        limpiarAlertas();
        try {
            const payload = {
                accion: 'login',
                nombreUsuario: loginAdminNombreManual.trim(),
                pin: loginAdminPin
            };

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (!['admin', 'superadmin', 'developer'].includes(data.usuario.rol)) {
                await fetch('/api/auth', {
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

    async function handleLogout() {
        try {
            await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'logout' })
            });
        } catch (err) {
            console.error('Error al cerrar sesión:', err);
        }
        setAdminAutenticado(null);
    }

    async function seleccionarTurnoParaAuditar(cajaId) {
        setTurnoAuditadoId(cajaId);
        await cargarTodo(cajaId);
        setMensaje(`Auditando Turno #${cajaId}. Los indicadores, movimientos y el botón de descarga PDF ahora apuntan a este turno.`);
    }

    if (cargando) {
        return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Cargando Panel de Administración...</div>;
    }

    // 1. PANTALLA DE LOGIN SI NO HAY SESIÓN ADMINISTRATIVA
    if (!adminAutenticado) {
        return (
            <div style={{ maxWidth: '460px', margin: '3rem auto', padding: '1.5rem', fontFamily: 'sans-serif' }}>
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
    const usaRecetas = Boolean(configActual.usa_recetas_ensamblaje);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9', fontFamily: 'sans-serif' }}>
            {/* BARRA LATERAL IZQUIERDA (SIDEBAR) */}
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
                        onClick={handleLogout}
                        style={{ width: '100%', padding: '0.35rem', background: '#475569', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                        Cerrar Sesión Admin
                    </button>
                </div>

                {/* Menú de Módulos */}
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

                {/* MODALIDAD / ASISTENTE INICIAL O CONFIGURACIÓN */}
                {mostrarAsistenteConfig ? (
                    <TabConfigFiscal
                        datos={datos}
                        esPrimeraEjecucion={esPrimeraEjecucion}
                        onConfiguracionGuardada={() => {
                            if (seccionActiva === 'configuracion') setSeccionActiva('catalogo');
                        }}
                        cargarTodo={cargarTodo}
                        setMensaje={setMensaje}
                        setError={setError}
                        limpiarAlertas={limpiarAlertas}
                    />
                ) : (
                    <>
                        {/* MÓDULO 1: ARQUEOS Y CIERRES */}
                        {seccionActiva === 'arqueos' && (
                            <TabTurnosArqueos
                                datos={datos}
                                seleccionarTurnoParaAuditar={seleccionarTurnoParaAuditar}
                                cargarTodo={cargarTodo}
                                setMensaje={setMensaje}
                                setError={setError}
                                limpiarAlertas={limpiarAlertas}
                            />
                        )}

                        {/* MÓDULO 2: VENTAS, KPIs Y ANULACIONES */}
                        {seccionActiva === 'ventas' && (
                            <TabResumen
                                datos={datos}
                                tendencias={tendencias}
                                cargarTodo={cargarTodo}
                                setMensaje={setMensaje}
                                setError={setError}
                                limpiarAlertas={limpiarAlertas}
                            />
                        )}

                        {/* MÓDULO 3: CATÁLOGO, STOCK Y ENSAMBLAJE */}
                        {seccionActiva === 'catalogo' && (
                            <TabCatalogo
                                datos={datos}
                                cargarTodo={cargarTodo}
                                setMensaje={setMensaje}
                                setError={setError}
                                limpiarAlertas={limpiarAlertas}
                                setSeccionActiva={setSeccionActiva}
                            />
                        )}

                        {/* MÓDULO 4: MATERIALES / INSUMOS */}
                        {seccionActiva === 'insumos' && usaRecetas && (
                            <TabKardex
                                datos={datos}
                                cargarTodo={cargarTodo}
                                setMensaje={setMensaje}
                                setError={setError}
                                limpiarAlertas={limpiarAlertas}
                            />
                        )}

                        {/* MÓDULO 5: USUARIOS, JERARQUÍA Y ROLES */}
                        {seccionActiva === 'usuarios' && (
                            <TabUsuariosCajas
                                datos={datos}
                                adminAutenticado={adminAutenticado}
                                cargarTodo={cargarTodo}
                                setMensaje={setMensaje}
                                setError={setError}
                                limpiarAlertas={limpiarAlertas}
                            />
                        )}

                        {/* MÓDULO 6: EXPORTACIÓN DE REPORTES (EXCEL, PDF, CSV) */}
                        {seccionActiva === 'exportacion' && (
                            <TabExportacion
                                datos={datos}
                                adminAutenticado={adminAutenticado}
                                turnoAuditadoId={turnoAuditadoId}
                                setTurnoAuditadoId={setTurnoAuditadoId}
                                cargarTodo={cargarTodo}
                            />
                        )}

                        {/* MÓDULO 7: CONFIGURACIÓN FISCAL Y MODALIDAD */}
                        {seccionActiva === 'configuracion' && (
                            <TabConfigFiscal
                                datos={datos}
                                esPrimeraEjecucion={esPrimeraEjecucion}
                                onConfiguracionGuardada={() => setSeccionActiva('catalogo')}
                                cargarTodo={cargarTodo}
                                setMensaje={setMensaje}
                                setError={setError}
                                limpiarAlertas={limpiarAlertas}
                            />
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
