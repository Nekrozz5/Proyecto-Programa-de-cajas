'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
        <Card className="shadow-sm border-slate-200">
            <CardHeader className="p-4 sm:p-5 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <CardTitle className="text-xl font-bold text-slate-900 tracking-tight">
                            Catálogo de Productos
                        </CardTitle>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {productosFiltrados.length} de {productos.length} producto(s) visible(s)
                        </p>
                    </div>

                    {/* Buscador Rápido en POS */}
                    <div className="relative w-full sm:w-64">
                        <Input
                            type="text"
                            placeholder="🔍 Buscar producto..."
                            value={busquedaPOS}
                            onChange={(e) => setBusquedaPOS(e.target.value)}
                            className="h-11 pl-3.5 pr-8 text-sm bg-white border-slate-300 rounded-lg focus-visible:ring-sky-500"
                        />
                        {busquedaPOS && (
                            <button
                                type="button"
                                onClick={() => setBusquedaPOS('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold p-1 rounded-full text-xs min-h-[32px] min-w-[32px] flex items-center justify-center"
                                title="Limpiar búsqueda"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 pt-0">
                {/* Barra de Categorías */}
                {(listaCategoriasDisponibles.length > 0 || productosSinCategoria.length > 0) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-700">🏷️ Categorías:</span>
                                {categoriasSeleccionadas.length > 0 && (
                                    <Badge variant="secondary" className="bg-sky-100 text-sky-800 border-sky-200 text-[11px] font-semibold">
                                        {categoriasSeleccionadas.length} seleccionada{categoriasSeleccionadas.length > 1 ? 's' : ''}
                                    </Badge>
                                )}
                            </div>
                            {categoriasSeleccionadas.length > 0 && (
                                <button
                                    type="button"
                                    onClick={resetearFiltroCategorias}
                                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 underline cursor-pointer min-h-[36px] px-2 flex items-center"
                                >
                                    Restablecer a todas
                                </button>
                            )}
                        </div>

                        <div className="flex gap-1.5 flex-wrap items-center">
                            <Button
                                type="button"
                                variant={categoriasSeleccionadas.length === 0 ? "default" : "outline"}
                                size="sm"
                                onClick={resetearFiltroCategorias}
                                className={`min-h-[44px] px-4 rounded-full text-xs font-semibold transition-all ${
                                    categoriasSeleccionadas.length === 0
                                        ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm'
                                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                }`}
                            >
                                🌐 Todas ({productos.length})
                            </Button>

                            {listaCategoriasDisponibles.map((catNombre) => {
                                const estaSeleccionada = categoriasSeleccionadas.some(
                                    (c) => c.toLowerCase() === catNombre.toLowerCase()
                                );
                                const cantidadEnCat = contarProductosEnCategoria(catNombre);

                                return (
                                    <Button
                                        key={catNombre}
                                        type="button"
                                        variant={estaSeleccionada ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => toggleFiltroCategoria(catNombre)}
                                        className={`min-h-[44px] px-3.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                            estaSeleccionada
                                                ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm'
                                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                        }`}
                                    >
                                        {estaSeleccionada && <span className="text-white">✓</span>}
                                        <span>{catNombre}</span>
                                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                                            estaSeleccionada ? 'bg-sky-700/60 text-white' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {cantidadEnCat}
                                        </span>
                                    </Button>
                                );
                            })}

                            {productosSinCategoria.length > 0 && (() => {
                                const estaSeleccionada = categoriasSeleccionadas.some(
                                    (c) => c.toLowerCase() === 'sin categoría' || c.toLowerCase() === 'sin categoria'
                                );
                                return (
                                    <Button
                                        type="button"
                                        variant={estaSeleccionada ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => toggleFiltroCategoria('Sin categoría')}
                                        className={`min-h-[44px] px-3.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                            estaSeleccionada
                                                ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm'
                                                : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                                        }`}
                                    >
                                        {estaSeleccionada && <span className="text-white">✓</span>}
                                        <span>Sin categoría</span>
                                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                                            estaSeleccionada ? 'bg-sky-700/60 text-white' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {productosSinCategoria.length}
                                        </span>
                                    </Button>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {productos.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
                        <p className="text-slate-500 text-sm">No hay productos registrados. Créalos desde el Panel Admin.</p>
                    </div>
                ) : productosFiltrados.length === 0 ? (
                    <div className="text-center py-10 px-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
                        <p className="text-slate-600 text-sm mb-3">
                            {busquedaPOS
                                ? <>No hay productos que coincidan con &ldquo;<strong>{busquedaPOS}</strong>&rdquo;.</>
                                : 'No hay productos registrados que coincidan con las categorías seleccionadas.'}
                        </p>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setBusquedaPOS('');
                                resetearFiltroCategorias();
                            }}
                            className="min-h-[44px] px-4 font-semibold text-xs"
                        >
                            Mostrar todos los productos
                        </Button>
                    </div>
                ) : (
                    /* Contenedor con Scroll Propio para Selección de Productos */
                    <div className="max-h-[620px] overflow-y-auto pr-1 pb-2">
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
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
                                        type="button"
                                        onClick={() => onSeleccionarProducto && onSeleccionarProducto(p)}
                                        disabled={sinStock}
                                        className={`relative flex flex-col justify-between text-left p-3.5 rounded-xl border transition-all duration-150 min-h-[140px] select-none ${
                                            sinStock
                                                ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                                                : cantidadEnCarrito > 0
                                                    ? 'bg-sky-50/70 border-sky-500 ring-2 ring-sky-500/20 shadow-sm cursor-pointer hover:bg-sky-50 active:scale-[0.98]'
                                                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer active:scale-[0.98]'
                                        }`}
                                    >
                                        {cantidadEnCarrito > 0 && (
                                            <Badge className="absolute top-2.5 right-2.5 bg-sky-600 hover:bg-sky-600 text-white font-bold text-[11px] px-2 py-0.5 shadow-sm">
                                                {cantidadEnCarrito} en pedido
                                            </Badge>
                                        )}

                                        <div>
                                            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide flex items-center flex-wrap gap-1 pr-14">
                                                <span>{(p.categoria && p.categoria.trim()) ? p.categoria : 'Sin categoría'}</span>
                                                <span>•</span>
                                                <span className="capitalize">{p.tipo_inventario}</span>
                                            </div>

                                            {tieneModificadores && (
                                                <div className="mt-0.5">
                                                    <Badge variant="outline" className="text-[10px] text-sky-700 bg-sky-50 border-sky-200 font-semibold px-1.5 py-0">
                                                        ✨ Con opciones
                                                    </Badge>
                                                </div>
                                            )}

                                            <div className="font-bold text-sm lg:text-base text-slate-900 mt-1.5 line-clamp-2 leading-tight">
                                                {p.nombre}
                                            </div>
                                        </div>

                                        <div className="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1">
                                            <div className="text-base lg:text-lg font-bold text-sky-600 leading-none">
                                                Bs {Number(p.precio).toFixed(2)}
                                            </div>

                                            <div className="text-[11px] font-medium">
                                                {esLibre ? (
                                                    <span className="text-emerald-700 font-medium">Disponible (Libre)</span>
                                                ) : sinStock ? (
                                                    <span className="text-rose-600 font-medium flex items-center gap-1">
                                                        ⚠️ {p.insumo_limitante ? p.insumo_limitante : 'Sin stock disponible'} {cantidadEnCarrito > 0 ? `(${cantidadEnCarrito} en pedido)` : ''}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-600">
                                                        Stock: <strong className="text-slate-800 font-semibold">{disponiblesRestantes}</strong> disp.
                                                        {p.tipo_inventario === 'combo' && Number(p.limite_maximo_activo) === 1 && (
                                                            <span className="text-sky-700 ml-1">
                                                                ({p.limite_unidades_restante} rest.)
                                                            </span>
                                                        )}
                                                        {cantidadEnCarrito > 0 && (
                                                            <span className="text-sky-700 ml-1">
                                                                (de {p.unidades_disponibles})
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
