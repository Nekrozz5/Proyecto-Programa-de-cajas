'use client';

import { useState, useEffect } from 'react';

export default function AdminPage() {
    const [cargando, setCargando] = useState(true);
    const [datos, setDatos] = useState({
        cajaAbierta: null,
        estadisticas: null,
        movimientos: [],
        desglosePagos: [],
        productos: [],
        insumos: [],
        usuarios: [],
        prediccionInsumos: []
    });
    const [tendencias, setTendencias] = useState(null);
    const [adminId, setAdminId] = useState('1');
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    // Formularios de inventario híbrido
    const [prodNombre, setProdNombre] = useState('');
    const [prodPrecio, setProdPrecio] = useState('');
    const [prodCosto, setProdCosto] = useState('0');
    const [prodCategoria, setProdCategoria] = useState('General');
    const [prodStock, setProdStock] = useState('');

    // Formulario de insumo
    const [insNombre, setInsNombre] = useState('');
    const [insUnidad, setInsUnidad] = useState('litros');
    const [insStockIni, setInsStockIni] = useState('0');
    const [insCostoUni, setInsCostoUni] = useState('0');
    const [insStockSeg, setInsStockSeg] = useState('1');

    // Compra CPP y Receta
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

            setDatos(dataCaja);
            setTendencias(dataRep);

            const admins = (dataCaja.usuarios || []).filter((u) => u.rol === 'admin');
            if (admins.length > 0 && !adminId) {
                setAdminId(String(admins[0].id));
            }
            if (dataCaja.insumos?.length > 0 && !compraInsumoId) {
                setCompraInsumoId(String(dataCaja.insumos[0].id));
                setRecetaInsumoId(String(dataCaja.insumos[0].id));
            }
            if (dataCaja.productos?.length > 0 && !recetaProdId) {
                setRecetaProdId(String(dataCaja.productos[0].id));
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

    async function ejecutarAccion(payload, textoExito) {
        setMensaje(null);
        setError(null);
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

    async function handleCrearProducto(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'crear_producto',
                nombre: prodNombre,
                precio: prodPrecio,
                costo: prodCosto,
                categoria: prodCategoria,
                stock: prodStock
            },
            `Producto "${prodNombre}" creado.`
        );
        if (ok) {
            setProdNombre('');
            setProdPrecio('');
            setProdStock('');
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
                stockSeguridad: insStockSeg
            },
            `Insumo "${insNombre}" registrado.`
        );
        if (ok) {
            setInsNombre('');
            setInsStockIni('0');
            setInsCostoUni('0');
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
            'Compra registrada con Costo Promedio Ponderado (NIC 2) y recetas recalculadas.'
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
            'Ingrediente vinculado a la receta y costo del producto actualizado.'
        );
        if (ok) setRecetaCantidad('');
    }

    async function handleAnularMovimiento(movimientoId) {
        const motivo = window.prompt('Motivo de la anulación (reintegrará stock/insumos automáticamente):', 'Error de cobro');
        if (!motivo) return;
        await ejecutarAccion(
            {
                accion: 'anular',
                adminId: Number(adminId),
                movimientoId,
                motivo
            },
            `Movimiento #${movimientoId} anulado y stock reintegrado.`
        );
    }

    async function handleCrearUsuario(e) {
        e.preventDefault();
        const ok = await ejecutarAccion(
            {
                accion: 'crear_usuario',
                adminId: Number(adminId),
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
                adminId: Number(adminId),
                usuarioABorrarId: idBorrar
            },
            `Usuario #${idBorrar} dado de baja lógica.`
        );
    }

    if (cargando) {
        return <div style={{ padding: '2rem' }}>Cargando Panel de Administración...</div>;
    }

    const est = datos.estadisticas;

    return (
        <div style={{ maxWidth: '1250px', margin: '0 auto', padding: '1.5rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ margin: 0 }}>Panel de Administración y Contabilidad</h1>
                    <p style={{ margin: '0.25rem 0 0', color: '#555' }}>
                        Inventario Híbrido (NIC 2), Auditoría de Turnos, Estadísticas y Usuarios
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem' }}>
                        Admin activo:{' '}
                        <select value={adminId} onChange={(e) => setAdminId(e.target.value)} style={{ padding: '0.4rem' }}>
                            {(datos.usuarios || [])
                                .filter((u) => u.rol === 'admin')
                                .map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nombre} (#{u.id})
                                    </option>
                                ))}
                        </select>
                    </label>
                    <a href="/api/reportes?formato=csv" style={btnPrimario}>
                        Descargar CSV (Excel)
                    </a>
                    <a href="/caja" style={btnOscuro}>Ir a Caja</a>
                    <a href="/" style={btnSecundario}>Inicio</a>
                </div>
            </header>

            {error && (
                <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.85rem', borderRadius: '6px', marginBottom: '1rem' }}>
                    <strong>Error:</strong> {error}
                </div>
            )}
            {mensaje && (
                <div style={{ background: '#dcfce7', color: '#166534', padding: '0.85rem', borderRadius: '6px', marginBottom: '1rem' }}>
                    {mensaje}
                </div>
            )}

            {/* KPIs Financieros */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={kpiCard}>
                    <small>Ventas Turno Actual</small>
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

            {/* Gestión de Inventario Híbrido */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                {/* 1. Crear Producto */}
                <section style={cardStyle}>
                    <h3 style={{ marginTop: 0 }}>1. Nuevo Producto</h3>
                    <form onSubmit={handleCrearProducto} style={formCol}>
                        <input placeholder="Nombre (ej. Capuchino o Martillo)" required value={prodNombre} onChange={(e) => setProdNombre(e.target.value)} style={inputStyle} />
                        <input type="number" step="0.01" placeholder="Precio Venta (Bs)" required value={prodPrecio} onChange={(e) => setProdPrecio(e.target.value)} style={inputStyle} />
                        <input type="number" step="0.01" placeholder="Costo Inicial (Bs)" value={prodCosto} onChange={(e) => setProdCosto(e.target.value)} style={inputStyle} />
                        <input placeholder="Categoría (ej. Cafetería)" value={prodCategoria} onChange={(e) => setProdCategoria(e.target.value)} style={inputStyle} />
                        <input type="number" step="0.01" placeholder="Stock directo (vacío = venta libre)" value={prodStock} onChange={(e) => setProdStock(e.target.value)} style={inputStyle} />
                        <button type="submit" style={btnPrimario}>Guardar Producto</button>
                    </form>
                </section>

                {/* 2. Crear Insumo */}
                <section style={cardStyle}>
                    <h3 style={{ marginTop: 0 }}>2. Nuevo Insumo (Materia Prima)</h3>
                    <form onSubmit={handleCrearInsumo} style={formCol}>
                        <input placeholder="Nombre (ej. Leche Entera)" required value={insNombre} onChange={(e) => setInsNombre(e.target.value)} style={inputStyle} />
                        <input placeholder="Unidad (litros, kg, unidades)" required value={insUnidad} onChange={(e) => setInsUnidad(e.target.value)} style={inputStyle} />
                        <input type="number" step="0.01" placeholder="Stock Inicial" value={insStockIni} onChange={(e) => setInsStockIni(e.target.value)} style={inputStyle} />
                        <input type="number" step="0.01" placeholder="Costo por Unidad (Bs)" value={insCostoUni} onChange={(e) => setInsCostoUni(e.target.value)} style={inputStyle} />
                        <input type="number" step="0.01" placeholder="Stock de Seguridad" value={insStockSeg} onChange={(e) => setInsStockSeg(e.target.value)} style={inputStyle} />
                        <button type="submit" style={btnPrimario}>Registrar Insumo</button>
                    </form>
                </section>

                {/* 3. Compra Insumo (CPP) y Escandallo */}
                <section style={cardStyle}>
                    <h3 style={{ marginTop: 0 }}>3. Compra CPP y Escandallo</h3>
                    <form onSubmit={handleCompraCPP} style={{ ...formCol, marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #eee' }}>
                        <strong>Compra de Insumo (Recalcula CPP):</strong>
                        <select value={compraInsumoId} onChange={(e) => setCompraInsumoId(e.target.value)} style={inputStyle}>
                            {(datos.insumos || []).map((i) => (
                                <option key={i.id} value={i.id}>
                                    {i.nombre} (Stock: {i.stock_actual} {i.unidad_medida} | Bs {i.costo_por_unidad}/{i.unidad_medida})
                                </option>
                            ))}
                        </select>
                        <input type="number" step="0.01" placeholder="Cantidad Comprada" required value={compraCantidad} onChange={(e) => setCompraCantidad(e.target.value)} style={inputStyle} />
                        <input type="number" step="0.01" placeholder="Costo Total de la Compra (Bs)" required value={compraCostoTotal} onChange={(e) => setCompraCostoTotal(e.target.value)} style={inputStyle} />
                        <button type="submit" style={btnOscuro}>Registrar Compra CPP</button>
                    </form>

                    <form onSubmit={handleAsignarReceta} style={formCol}>
                        <strong>Asignar Ingrediente a Receta:</strong>
                        <select value={recetaProdId} onChange={(e) => setRecetaProdId(e.target.value)} style={inputStyle}>
                            {(datos.productos || []).map((p) => (
                                <option key={p.id} value={p.id}>{p.nombre} ({p.tipo_inventario})</option>
                            ))}
                        </select>
                        <select value={recetaInsumoId} onChange={(e) => setRecetaInsumoId(e.target.value)} style={inputStyle}>
                            {(datos.insumos || []).map((i) => (
                                <option key={i.id} value={i.id}>{i.nombre} ({i.unidad_medida})</option>
                            ))}
                        </select>
                        <input type="number" step="0.001" placeholder="Cantidad por unidad (ej. 0.25)" required value={recetaCantidad} onChange={(e) => setRecetaCantidad(e.target.value)} style={inputStyle} />
                        <button type="submit" style={btnPrimario}>Vincular a Receta</button>
                    </form>
                </section>
            </div>

            {/* Predicción de Compras de Insumos (ROP) */}
            <section style={{ ...cardStyle, marginBottom: '1.5rem' }}>
                <h3 style={{ marginTop: 0 }}>Estado de Insumos y Predicción de Compras (Punto de Reorden)</h3>
                {(datos.prediccionInsumos || []).length === 0 ? (
                    <p style={{ color: '#666' }}>No hay insumos registrados todavía.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                <th style={thTd}>Insumo</th>
                                <th style={thTd}>Stock Actual</th>
                                <th style={thTd}>Consumo Diario Prom.</th>
                                <th style={thTd}>Punto Reorden (ROP)</th>
                                <th style={thTd}>Compra Sugerida</th>
                                <th style={thTd}>Costo Estimado</th>
                                <th style={thTd}>Alerta</th>
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

            {/* Auditoría de Movimientos (Anulaciones) y Usuarios */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
                <section style={cardStyle}>
                    <h3 style={{ marginTop: 0 }}>Auditoría de Movimientos del Turno (Anulación con Reintegro)</h3>
                    {!(datos.movimientos || []).length ? (
                        <p style={{ color: '#666' }}>No hay movimientos activos en la caja actual.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                    <th style={thTd}>ID</th>
                                    <th style={thTd}>Tipo / Pago</th>
                                    <th style={thTd}>Monto</th>
                                    <th style={thTd}>Estado</th>
                                    <th style={thTd}>Descripción</th>
                                    <th style={thTd}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {datos.movimientos.map((m) => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={thTd}>#{m.id}</td>
                                        <td style={thTd}>{m.tipo.toUpperCase()} ({m.metodo_pago.toUpperCase()})</td>
                                        <td style={thTd}>Bs {Number(m.monto).toFixed(2)}</td>
                                        <td style={thTd}>{m.estado}</td>
                                        <td style={thTd}>{m.descripcion}</td>
                                        <td style={thTd}>
                                            {m.estado === 'completado' && (
                                                <button
                                                    onClick={() => handleAnularMovimiento(m.id)}
                                                    style={{ padding: '0.3rem 0.6rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    Anular
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>

                <section style={cardStyle}>
                    <h3 style={{ marginTop: 0 }}>Gestión de Usuarios y Roles</h3>
                    <form onSubmit={handleCrearUsuario} style={{ ...formCol, marginBottom: '1rem' }}>
                        <input placeholder="Nombre de usuario" required value={nuevoUsuarioNombre} onChange={(e) => setNuevoUsuarioNombre(e.target.value)} style={inputStyle} />
                        <input placeholder="PIN o Contraseña" required value={nuevoUsuarioPin} onChange={(e) => setNuevoUsuarioPin(e.target.value)} style={inputStyle} />
                        <select value={nuevoUsuarioRol} onChange={(e) => setNuevoUsuarioRol(e.target.value)} style={inputStyle}>
                            <option value="user">Cajero (user)</option>
                            <option value="admin">Administrador (admin)</option>
                        </select>
                        <button type="submit" style={btnPrimario}>Crear Usuario</button>
                    </form>

                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {(datos.usuarios || []).map((u) => (
                            <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                                <span>
                                    <strong>{u.nombre}</strong> ({u.rol}) — ID #{u.id}
                                </span>
                                {Number(u.id) !== Number(adminId) && (
                                    <button
                                        onClick={() => handleBorrarUsuario(u.id)}
                                        style={{ padding: '0.25rem 0.55rem', background: '#6b7280', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                        Dar de baja
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </div>
    );
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
    gap: '0.6rem'
};

const inputStyle = {
    width: '100%',
    padding: '0.5rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    boxSizing: 'border-box'
};

const btnPrimario = {
    padding: '0.6rem 1rem',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

const btnOscuro = {
    padding: '0.6rem 1rem',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none'
};

const btnSecundario = {
    padding: '0.6rem 1rem',
    background: '#e5e7eb',
    color: '#111',
    borderRadius: '6px',
    fontWeight: 'bold',
    textDecoration: 'none'
};

const thTd = {
    padding: '0.5rem 0.4rem'
};
