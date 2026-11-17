'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    modalOverlay,
    modalCard,
    btnPrimario,
    btnSecundario
} from './cajaStyles';

export default function ModalModificadores({
    producto,
    onClose,
    onConfirmar,
    onError,
    onLimpiarAlertas
}) {
    const [opcionesSeleccionadas, setOpcionesSeleccionadas] = useState({});

    useEffect(() => {
        if (!producto || !producto.grupos_modificadores) {
            setOpcionesSeleccionadas({});
            return;
        }

        const inicial = {};
        for (const g of producto.grupos_modificadores) {
            if (g.tipo_seleccion === 'unica') {
                const opDef = g.opciones.find((o) => o.es_default) || (g.es_obligatorio && g.opciones.length > 0 ? g.opciones[0] : null);
                if (opDef) inicial[g.id] = opDef.id;
            } else {
                const opsDef = g.opciones.filter((o) => o.es_default).map((o) => o.id);
                inicial[g.id] = opsDef;
            }
        }
        setOpcionesSeleccionadas(inicial);
    }, [producto]);

    const totalCalculado = useMemo(() => {
        if (!producto) return 0;
        let total = Number(producto.precio) || 0;
        for (const grupo of producto.grupos_modificadores || []) {
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
    }, [producto, opcionesSeleccionadas]);

    const handleConfirmar = useCallback(() => {
        if (!producto) return;
        if (typeof onLimpiarAlertas === 'function') onLimpiarAlertas();

        for (const grupo of producto.grupos_modificadores || []) {
            if (grupo.es_obligatorio) {
                const sel = opcionesSeleccionadas[grupo.id];
                const vacio = grupo.tipo_seleccion === 'unica' ? !sel : !Array.isArray(sel) || sel.length === 0;
                if (vacio) {
                    onError?.(`Debes elegir una opción obligatoria para "${grupo.nombre}".`);
                    return;
                }
            }
        }

        const opcionesElegidas = [];
        for (const grupo of producto.grupos_modificadores || []) {
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

        onConfirmar?.(producto, opcionesElegidas);
        onClose?.();
    }, [producto, opcionesSeleccionadas, onLimpiarAlertas, onError, onConfirmar, onClose]);

    if (!producto) return null;

    return (
        <div style={modalOverlay}>
            <div style={modalCard}>
                {/* Cabecera */}
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>
                            Personalizar: {producto.nombre}
                        </h3>
                        <div style={{ fontSize: '0.88rem', color: '#64748b', marginTop: '0.2rem' }}>
                            Precio base: <strong style={{ color: '#0f172a' }}>Bs {Number(producto.precio).toFixed(2)}</strong>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
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
                    {(producto.grupos_modificadores || []).map((grupo) => {
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
                            Bs {totalCalculado.toFixed(2)}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ ...btnSecundario, padding: '0.55rem 0.9rem', fontSize: '0.88rem' }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmar}
                            style={{ ...btnPrimario, padding: '0.55rem 1.2rem', fontSize: '0.92rem' }}
                        >
                            ✓ Agregar al Pedido
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
