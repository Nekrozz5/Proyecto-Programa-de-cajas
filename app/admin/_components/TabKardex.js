'use client';

import { useState } from 'react';
import { cardStyle, formCol, inputStyle, btnPrimario, btnOscuro, btnSecundario, thTd } from './adminStyles';
import {
    crearInsumoAction,
    comprarInsumoAction,
    mermaInsumoAction,
    verificarIntegridadKardexAction
} from '../../../server/actions/inventario.actions';

export default function TabKardex({
    datos,
    cargarTodo,
    setMensaje,
    setError,
    limpiarAlertas
}) {
    // Buscador y Paginación de Insumos
    const [busquedaInsumos, setBusquedaInsumos] = useState('');
    const [paginaInsumos, setPaginaInsumos] = useState(1);
    const [limitePorPaginaInsumos, setLimitePorPaginaInsumos] = useState(10);

    // Registro de nuevo insumo
    const [insNombre, setInsNombre] = useState('');
    const [insUnidad, setInsUnidad] = useState('unidades');
    const [insStockIni, setInsStockIni] = useState('0');
    const [insCostoUni, setInsCostoUni] = useState('0');
    const [insStockSeg, setInsStockSeg] = useState('0');
    const [insTieneVencimiento, setInsTieneVencimiento] = useState(false);
    const [insFechaVencimiento, setInsFechaVencimiento] = useState('');
    const [insProveedor, setInsProveedor] = useState('');

    // Compra de insumo con CPP
    const [compraInsumoId, setCompraInsumoId] = useState(datos?.insumos?.[0]?.id || '');
    const [compraDistribuidora, setCompraDistribuidora] = useState('');
    const [compraNitProveedor, setCompraNitProveedor] = useState('');
    const [compraNroFactura, setCompraNroFactura] = useState('');
    const [compraConFactura, setCompraConFactura] = useState(false);
    const [compraCantidad, setCompraCantidad] = useState('');
    const [compraCostoTotal, setCompraCostoTotal] = useState('');

    // Merma de insumo
    const [mermaInsId, setMermaInsId] = useState(datos?.insumos?.[0]?.id || '');
    const [mermaInsCantidad, setMermaInsCantidad] = useState('');
    const [mermaInsMotivo, setMermaInsMotivo] = useState('');
    const [mermaInsConfirmando, setMermaInsConfirmando] = useState(false);
    const [mermaInsResultado, setMermaInsResultado] = useState(null);

    // Verificación de Integridad Kardex
    const [resultadoIntegridadKardex, setResultadoIntegridadKardex] = useState(null);

    // Filtro y Paginación de Insumos
    const listaInsumosCompleta = datos?.prediccionInsumos || [];
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

    async function handleCrearInsumo(e) {
        e.preventDefault();
        limpiarAlertas?.();
        try {
            const distLimpia = insProveedor.trim();
            const res = await crearInsumoAction({
                nombre: insNombre.trim(),
                unidadMedida: insUnidad,
                stockInicial: Number(insStockIni || 0),
                costoPorUnidad: Number(insCostoUni || 0),
                stockSeguridad: Number(insStockSeg || 0),
                fechaVencimiento: insTieneVencimiento && insFechaVencimiento ? insFechaVencimiento : null,
                proveedor: distLimpia || null
            });

            if (!res.ok) throw new Error(res.error || 'Error al crear el insumo.');

            setMensaje?.(`Material / Insumo "${insNombre}" registrado exitosamente.`);
            setInsNombre('');
            setInsStockIni('0');
            setInsCostoUni('0');
            setInsStockSeg('0');
            setInsTieneVencimiento(false);
            setInsFechaVencimiento('');
            setInsProveedor('');
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleCompraCPP(e) {
        e.preventDefault();
        limpiarAlertas?.();
        try {
            const distLimpia = compraDistribuidora.trim();
            const motivoCompra = distLimpia ? `Distribuidora: ${distLimpia}` : 'Compra con Costo Promedio Ponderado';

            const res = await comprarInsumoAction({
                insumoId: Number(compraInsumoId || datos?.insumos?.[0]?.id),
                cantidadComprada: Number(compraCantidad),
                costoTotalCompra: Number(compraCostoTotal),
                distribuidora: distLimpia || null,
                proveedorNit: compraNitProveedor.trim() || null,
                nroFacturaCompra: compraNroFactura.trim() || null,
                conFactura: compraConFactura,
                motivo: motivoCompra
            });

            if (!res.ok) throw new Error(res.error || 'Error al registrar la compra.');

            setMensaje?.('Compra registrada con Costo Promedio Ponderado (NIC 2) y costos de ensamblaje/recetas recalculados.');
            setCompraCantidad('');
            setCompraCostoTotal('');
            setCompraDistribuidora('');
            setCompraNitProveedor('');
            setCompraNroFactura('');
            setCompraConFactura(false);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleConfirmarMermaInsumo() {
        limpiarAlertas?.();
        try {
            const listaIns = datos?.insumos || [];
            const insSel = listaIns.find((i) => String(i.id) === String(mermaInsId || listaIns[0]?.id));
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

            const res = await mermaInsumoAction({
                insumoId: Number(insSel.id),
                cantidadPerdida: cant,
                motivo: mermaInsMotivo.trim()
            });

            if (!res.ok) throw new Error(res.error || 'Error al registrar la merma de insumo.');

            const mermaData = res.data?.merma || {};
            setMermaInsResultado({
                insumoNombre: insSel.nombre,
                cantidadPerdida: cant,
                unidadMedida: insSel.unidad_medida || 'unidades',
                stockRestante: mermaData.stockRestante ?? (Number(insSel.stock_actual) - cant),
                costoPerdida: mermaData.costoPerdida ?? (cant * Number(insSel.costo_por_unidad)),
                motivo: mermaInsMotivo.trim()
            });

            setMermaInsCantidad('');
            setMermaInsMotivo('');
            setMermaInsConfirmando(false);
            setMensaje?.(`✅ Merma de insumo registrada: -${cant} ${insSel.unidad_medida} de "${insSel.nombre}".`);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
            setMermaInsConfirmando(false);
        }
    }

    async function handleVerificarIntegridadKardex() {
        limpiarAlertas?.();
        try {
            const res = await verificarIntegridadKardexAction();
            if (!res.ok) throw new Error(res.error || 'Error al verificar la integridad del Kardex.');

            setResultadoIntegridadKardex(res.data);
            if (res.data?.integro) {
                setMensaje?.('✅ Verificación de Kardex completada: 100% íntegro (stock real coincide con los saldos acumulados de Kardex en productos directos e insumos).');
            } else {
                setError?.('⚠️ Se detectaron discrepancias en la conciliación del Kardex. Revisa el detalle en pantalla.');
            }
        } catch (err) {
            setError?.(err.message);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* SECCIÓN PUNTO DE REORDEN Y ESTADO DE INSUMOS */}
            <section style={cardStyle}>
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

                        {/* Barra de Paginación */}
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

            {/* FORMULARIOS DE COMPRA Y CREACIÓN DE INSUMOS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                <section style={cardStyle}>
                    <h3 style={{ marginTop: 0 }}>Registrar Compra de Material / Insumo (CPP - NIC 2)</h3>
                    <form onSubmit={handleCompraCPP} style={formCol}>
                        <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                            Seleccionar Material / Insumo:
                            <select value={compraInsumoId} onChange={(e) => setCompraInsumoId(e.target.value)} style={inputStyle}>
                                {(datos?.insumos || []).map((i) => (
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
                                id="checkInsVencimientoTab"
                                checked={insTieneVencimiento}
                                onChange={(e) => {
                                    setInsTieneVencimiento(e.target.checked);
                                    if (!e.target.checked) setInsFechaVencimiento('');
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <label htmlFor="checkInsVencimientoTab" style={{ fontSize: '0.85rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
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
                                placeholder="Nombre de proveedor"
                                value={insProveedor}
                                onChange={(e) => setInsProveedor(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                        <button type="submit" style={btnPrimario}>Crear Material / Insumo</button>
                    </form>
                </section>
            </div>

            {/* FORMULARIO DE MERMAS DE INSUMOS */}
            <section style={{ ...cardStyle, border: '1px solid #fecaca', background: '#fffdfd' }}>
                <h3 style={{ marginTop: 0, color: '#991b1b' }}>⚠️ Registrar Merma / Desperdicio de Material o Insumo</h3>
                {(() => {
                    const listaIns = datos?.insumos || [];
                    if (listaIns.length === 0) {
                        return <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>No hay materiales o insumos registrados.</p>;
                    }
                    const insSel = listaIns.find((i) => String(i.id) === String(mermaInsId || listaIns[0]?.id)) || listaIns[0];
                    const stockIns = Number(insSel?.stock_actual ?? 0);
                    const costoUnitIns = Number(insSel?.costo_por_unidad ?? 0);
                    const cantInsNum = Number(mermaInsCantidad) || 0;
                    const perdidaInsBs = Number((Math.max(0, cantInsNum) * costoUnitIns).toFixed(2));
                    const superaStockIns = cantInsNum > stockIns;

                    return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                            <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                Insumo ({insSel?.unidad_medida || 'u.'}):
                                <select
                                    value={mermaInsId || insSel?.id}
                                    onChange={(e) => {
                                        setMermaInsId(e.target.value);
                                        setMermaInsConfirmando(false);
                                        setMermaInsResultado(null);
                                    }}
                                    style={{ ...inputStyle, marginTop: '0.25rem' }}
                                >
                                    {listaIns.map((i) => (
                                        <option key={i.id} value={i.id}>
                                            {i.nombre} (Stock: {i.stock_actual} {i.unidad_medida})
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

            {/* VERIFICACIÓN DE INTEGRIDAD KARDEX */}
            <section style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>🛡️ Verificación de Integridad del Kardex (NIC 2)</h3>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                            Comprueba que el stock físico actual coincida exactamente con la reconstrucción matemática de los movimientos de Kardex.
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
                            Productos directos auditados: <strong>{resultadoIntegridadKardex.totalProductosAuditados ?? 0}</strong> |{' '}
                            Insumos auditados: <strong>{resultadoIntegridadKardex.integridadInsumos?.totalInsumosAuditados ?? resultadoIntegridadKardex.insumos?.totalInsumosAuditados ?? 0}</strong>
                        </div>
                    </div>
                )}
            </section>

            {/* TABLA KARDEX CRONOLÓGICO DE PRODUCTOS DIRECTOS */}
            <section style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>📦 Kardex Cronológico de Productos Directos</h3>
                {(datos?.kardexDetallado?.kardexProductosDirectos || []).length === 0 ? (
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
                                {(datos?.kardexDetallado?.kardexProductosDirectos || []).map((k) => (
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

            {/* TABLA KARDEX CRONOLÓGICO DE INSUMOS */}
            <section style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>🧱 Kardex Cronológico de Materiales e Insumos</h3>
                {(datos?.kardexDetallado?.kardexInsumos || []).length === 0 ? (
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
                                {(datos?.kardexDetallado?.kardexInsumos || []).map((k) => (
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
    );
}
