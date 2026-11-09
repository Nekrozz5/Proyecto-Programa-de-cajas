'use client';

import { useState, useEffect } from 'react';

export default function HomePage() {
    const [cargando, setCargando] = useState(true);
    const [config, setConfig] = useState(null);
    const [usuariosCount, setUsuariosCount] = useState(0);

    // Estado del Asistente de Primera Ejecución (3 pasos)
    const [paso, setPaso] = useState(1); // 1: Modalidad | 2: Nombre Empresa | 3: Crear Super Admin
    const [modalidadNombre, setModalidadNombre] = useState('Venta Directa de Artículos No Perecederos');
    const [usaStockDirecto, setUsaStockDirecto] = useState(true);
    const [usaVencimiento, setUsaVencimiento] = useState(false);
    const [usaRecetas, setUsaRecetas] = useState(false);

    const [nombreNegocio, setNombreNegocio] = useState('');
    const [adminNombre, setAdminNombre] = useState('');
    const [adminPin, setAdminPin] = useState('');

    const [error, setError] = useState(null);
    const [guardando, setGuardando] = useState(false);

    async function verificarEstadoInicial() {
        try {
            setCargando(true);
            const res = await fetch('/api/caja');
            const data = await res.json();
            if (res.ok) {
                setConfig(data.configuracionNegocio || null);
                setUsuariosCount((data.usuarios || []).length);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    }

    useEffect(() => {
        verificarEstadoInicial();
    }, []);

    function seleccionarModalidad(tipo) {
        if (tipo === 'no_perecedero') {
            setModalidadNombre('Venta Directa de Artículos No Perecederos');
            setUsaStockDirecto(true);
            setUsaVencimiento(false);
            setUsaRecetas(false);
        } else if (tipo === 'perecedero') {
            setModalidadNombre('Venta Directa de Productos con Fecha de Vencimiento');
            setUsaStockDirecto(true);
            setUsaVencimiento(true);
            setUsaRecetas(false);
        } else if (tipo === 'ensamblaje_no_perecedero') {
            setModalidadNombre('Producción / Ensamblaje con Materiales No Perecederos');
            setUsaStockDirecto(true);
            setUsaVencimiento(false);
            setUsaRecetas(true);
        } else if (tipo === 'elaboracion_perecedera') {
            setModalidadNombre('Elaboración con Recetas e Insumos Perecederos');
            setUsaStockDirecto(true);
            setUsaVencimiento(true);
            setUsaRecetas(true);
        }
    }

    async function finalizarInstalacion(e) {
        e.preventDefault();
        setError(null);
        setGuardando(true);
        try {
            const res = await fetch('/api/caja', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'instalacion_inicial',
                    nombreNegocio,
                    modalidadNombre,
                    usaStockDirecto,
                    usaVencimiento,
                    usaRecetasEnsamblaje: usaRecetas,
                    adminNombre,
                    adminPin
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al inicializar el sistema');
            await verificarEstadoInicial();
        } catch (err) {
            setError(err.message);
        } finally {
            setGuardando(false);
        }
    }

    if (cargando) {
        return (
            <main style={{ padding: '3rem', textAlign: 'center' }}>
                <p>Verificando estado del sistema...</p>
            </main>
        );
    }

    const requierePrimeraEjecucion = !config || Number(config.configurado) === 0 || usuariosCount === 0;

    // ASISTENTE PASO A PASO EN LA PRIMERA EJECUCIÓN DEL PROGRAMA
    if (requierePrimeraEjecucion) {
        return (
            <main style={{ maxWidth: '820px', margin: '2.5rem auto', padding: '1.5rem' }}>
                <div style={{ background: '#fff', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', border: '2px solid #0284c7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                        <div>
                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.25rem 0.65rem', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                Instalación Inicial • Paso {paso} de 3
                            </span>
                            <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.5rem' }}>
                                Configuración de Primera Ejecución
                            </h1>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {[1, 2, 3].map((num) => (
                                <div
                                    key={num}
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        background: paso >= num ? '#0284c7' : '#e2e8f0',
                                        color: paso >= num ? '#fff' : '#64748b'
                                    }}
                                >
                                    {num}
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.85rem', borderRadius: '6px', marginBottom: '1rem' }}>
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    {/* PASO 1: MODALIDAD DE FUNCIONAMIENTO (ADAPTACIÓN AUTOMÁTICA DE INTERFAZ) */}
                    {paso === 1 && (
                        <div>
                            <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>
                                Paso 1: ¿Cómo funciona el inventario de tu negocio?
                            </h2>
                            <p style={{ color: '#475569', fontSize: '0.92rem' }}>
                                Esto adaptará automáticamente la interfaz del programa para mostrar solo las funciones que necesitas:
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1.25rem' }}>
                                <button
                                    type="button"
                                    onClick={() => seleccionarModalidad('no_perecedero')}
                                    style={cardSelectStyle(usaStockDirecto && !usaVencimiento && !usaRecetas)}
                                >
                                    <strong>🔧 Artículos No Perecederos (Sin vencimiento ni receta)</strong>
                                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                                        Compra y venta directa de artículos por unidad, metro o kilo con Costo Promedio Ponderado.
                                    </span>
                                    <small style={{ color: '#0284c7' }}>Ej: Repuestos de auto, piezas de PC, ferretería, maderera.</small>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => seleccionarModalidad('perecedero')}
                                    style={cardSelectStyle(usaStockDirecto && usaVencimiento && !usaRecetas)}
                                >
                                    <strong>🛒 Productos Perecederos (Con fecha de vencimiento)</strong>
                                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                                        Compra y venta directa solicitando fecha de vencimiento y cantidad por lote.
                                    </span>
                                    <small style={{ color: '#0284c7' }}>Ej: Supermercado, minimarket, farmacia.</small>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => seleccionarModalidad('ensamblaje_no_perecedero')}
                                    style={cardSelectStyle(usaStockDirecto && !usaVencimiento && usaRecetas)}
                                >
                                    <strong>🪚 Ensamblaje / Fabricación (Sin fecha de vencimiento)</strong>
                                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                                        Usa materiales o piezas no perecederas que se unen para armar un producto final.
                                    </span>
                                    <small style={{ color: '#0284c7' }}>Ej: Carpintería/muebles, ensamblaje de PCs, taller.</small>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => seleccionarModalidad('elaboracion_perecedera')}
                                    style={cardSelectStyle(usaStockDirecto && usaVencimiento && usaRecetas)}
                                >
                                    <strong>☕ Elaboración con Recetas y Vencimiento</strong>
                                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                                        Recetas de preparación con insumos que tienen control de caducidad.
                                    </span>
                                    <small style={{ color: '#0284c7' }}>Ej: Restaurante, cafetería, panadería, pastelería.</small>
                                </button>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                                <strong>Ajuste fino de funciones activas:</strong>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input type="checkbox" checked={usaStockDirecto} onChange={(e) => setUsaStockDirecto(e.target.checked)} />
                                    Control de Stock Directo y Cantidad por Artículo
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input type="checkbox" checked={usaVencimiento} onChange={(e) => setUsaVencimiento(e.target.checked)} />
                                    Solicitar Fecha de Vencimiento en Artículos / Lotes
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input type="checkbox" checked={usaRecetas} onChange={(e) => setUsaRecetas(e.target.checked)} />
                                    Habilitar Recetas / Ensamblaje de Materiales (BOM)
                                </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setPaso(2)} style={btnPrimario}>
                                    Siguiente: Nombre de la Empresa →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* PASO 2: NOMBRE DE LA EMPRESA */}
                    {paso === 2 && (
                        <div>
                            <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>
                                Paso 2: Nombre de tu Empresa o Negocio
                            </h2>
                            <p style={{ color: '#475569', fontSize: '0.92rem' }}>
                                Este nombre aparecerá en el encabezado del sistema y en el panel de control.
                            </p>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.4rem' }}>
                                    Nombre de la Empresa:
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej. Ferretería Central, Autopartes Norte, Minimarket El Sol..."
                                    value={nombreNegocio}
                                    onChange={(e) => setNombreNegocio(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <button type="button" onClick={() => setPaso(1)} style={btnSecundario}>
                                    ← Volver al Paso 1
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!nombreNegocio.trim()) {
                                            setError('Por favor ingresa el nombre de tu empresa.');
                                            return;
                                        }
                                        setError(null);
                                        setPaso(3);
                                    }}
                                    style={btnPrimario}
                                >
                                    Siguiente: Crear Super Admin →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* PASO 3: CREAR EL PRIMER SUPER ADMIN */}
                    {paso === 3 && (
                        <form onSubmit={finalizarInstalacion}>
                            <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>
                                Paso 3: Crear la Cuenta del Primer Super Admin
                            </h2>
                            <p style={{ color: '#475569', fontSize: '0.92rem' }}>
                                El <strong>Super Admin</strong> tiene el rango máximo del sistema: puede crear Administradores y Cajeros, auditar arqueos ciegos y cambiar contraseñas de cualquier usuario inferior.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                <label style={{ fontWeight: 'bold' }}>
                                    Nombre del Propietario / Super Admin:
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej. Carlos (Dueño)"
                                        value={adminNombre}
                                        onChange={(e) => setAdminNombre(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>

                                <label style={{ fontWeight: 'bold' }}>
                                    PIN o Contraseña de Acceso:
                                    <input
                                        type="password"
                                        required
                                        placeholder="Crea tu PIN o contraseña secreta"
                                        value={adminPin}
                                        onChange={(e) => setAdminPin(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <button type="button" onClick={() => setPaso(2)} style={btnSecundario}>
                                    ← Volver al Paso 2
                                </button>
                                <button type="submit" disabled={guardando} style={{ ...btnPrimario, background: '#16a34a' }}>
                                    {guardando ? 'Guardando configuración...' : '✅ Finalizar Configuración e Iniciar Sistema'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </main>
        );
    }

    // PANTALLA NORMAL DE INICIO UNA VEZ CONFIGURADO EL SISTEMA
    return (
        <main style={{ maxWidth: '680px', margin: '4rem auto', padding: '2rem', textAlign: 'center', background: '#fff', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.3rem 0.75rem', borderRadius: '99px', fontSize: '0.82rem', fontWeight: 'bold' }}>
                {config.modalidad_nombre}
            </span>
            <h1 style={{ margin: '0.75rem 0 0.25rem', fontSize: '2rem' }}>
                {config.nombre_negocio}
            </h1>
            <p style={{ color: '#64748b', marginBottom: '2rem' }}>
                Sistema de Punto de Venta, Arqueo Ciego e Inventario Adaptativo
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <a
                    href="/caja"
                    style={{ padding: '0.85rem 1.75rem', background: '#0070f3', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}
                >
                    🛒 Ir a Caja (Ventas)
                </a>
                <a
                    href="/admin"
                    style={{ padding: '0.85rem 1.75rem', background: '#1e293b', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}
                >
                    🛡️ Panel de Administración
                </a>
            </div>
        </main>
    );
}

function cardSelectStyle(activo) {
    return {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        textAlign: 'left',
        padding: '0.9rem',
        borderRadius: '8px',
        border: activo ? '2px solid #0284c7' : '1px solid #cbd5e1',
        background: activo ? '#f0f9ff' : '#fff',
        cursor: 'pointer'
    };
}

const inputStyle = {
    width: '100%',
    padding: '0.65rem',
    marginTop: '0.35rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.95rem',
    boxSizing: 'border-box'
};

const btnPrimario = {
    padding: '0.7rem 1.35rem',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.95rem'
};

const btnSecundario = {
    padding: '0.7rem 1.35rem',
    background: '#e2e8f0',
    color: '#1e293b',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.95rem'
};
