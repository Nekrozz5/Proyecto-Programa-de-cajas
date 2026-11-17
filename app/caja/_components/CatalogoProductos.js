'use client';

import { useState, useMemo } from 'react';
import { cardStyle, inputStyle, btnSecundario } from './cajaStyles';

export default function CatalogoProductos({
    productos = [],
    categorias = [],
    carrito = [],
    onSeleccionarProducto
}) {
    const [busquedaPOS, setBusquedaPOS] = useState('');
    const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState([]);

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

    const listaCategoriasDisponibles = useMemo(() => {
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
    }, [categorias, productos]);

    const productosSinCategoria = useMemo(() => {
        return productos.filter((p) => !p.categoria || p.categoria.trim() === '');
    }, [productos]);

    const productosFiltrados = useMemo(() => {
        return productos.filter((p) => {
            // Si es un combo con vigencia y no está vigente, no mostrarlo en el mostrador del POS
            if (p.tipo_inventario === 'combo' && p.esta_vigente === false) {
                return false;
            }

            if (busquedaPOS.trim()) {
                const termino = busquedaPOS.toLowerCase();
                const coincideNombre = (p.nombre || '').toLowerCase().includes(termino);
                const coincideCat = (p.categoria || '').toLowerCase().includes(termino);
                if (!coincideNombre && !coincideCat) return false;
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
    }, [productos, busquedaPOS, categoriasSeleccionadas]);

    function contarProductosEnCategoria(catNombre) {
        const catLower = catNombre.toLowerCase();
        return productos.filter((p) => {
            const cats = (p.categoria || '').split(',').map((c) => c.trim().toLowerCase());
            return cats.includes(catLower);
        }).length;
    }

    return (
        <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Catálogo de Productos</h2>
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {productosFiltrados.length} de {productos.length} producto(s) visible(s)
                    </span>
                </div>
                {/* Buscador Rápido en POS */}
                <div style={{ position: 'relative', minWidth: '220px' }}>
                    <input
                        type="text"
                        placeholder="🔍 Buscar producto..."
                        value={busquedaPOS}
                        onChange={(e) => setBusquedaPOS(e.target.value)}
                        style={{ ...inputStyle, padding: '0.4rem 1.8rem 0.4rem 0.65rem', fontSize: '0.84rem', margin: 0 }}
                    />
                    {busquedaPOS && (
                        <button
                            type="button"
                            onClick={() => setBusquedaPOS('')}
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
                                fontSize: '0.85rem'
                            }}
                            title="Limpiar búsqueda"
                        >
                            ✕
                        </button>
                    )}
                </div>
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
                        {busquedaPOS
                            ? <>No hay productos que coincidan con &ldquo;<strong>{busquedaPOS}</strong>&rdquo;.</>
                            : 'No hay productos registrados que coincidan con las categorías seleccionadas.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setBusquedaPOS('');
                            resetearFiltroCategorias();
                        }}
                        style={{ ...btnSecundario, padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
                    >
                        Mostrar todos los productos
                    </button>
                </div>
            ) : (
                /* Contenedor con Scroll Propio para Selección de Productos */
                <div style={{
                    maxHeight: '560px',
                    overflowY: 'auto',
                    paddingRight: '0.4rem',
                    paddingBottom: '0.5rem'
                }}>
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
                                    onClick={() => onSeleccionarProducto && onSeleccionarProducto(p)}
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
                </div>
            )}
        </section>
    );
}
