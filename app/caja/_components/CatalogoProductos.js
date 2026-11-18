'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Tag, LayoutGrid, Package, Sparkles, Check, X, AlertTriangle, Calendar, Clock } from 'lucide-react';

function obtenerEstadoVencimiento(fechaStr) {
    if (!fechaStr) return { estado: 'normal', dias: 999, clase: '', label: '' };
    try {
        const [y, m, d] = fechaStr.split('-').map(Number);
        const fecha = new Date(y, m - 1, d);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const dias = Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        if (dias < 0) {
            return { estado: 'vencido', dias, clase: 'bg-rose-100 text-rose-800 border-rose-300', label: 'Vencido' };
        }
        if (dias <= 30) {
            return { estado: 'proximo', dias, clase: 'bg-amber-100 text-amber-900 border-amber-300 font-bold', label: `${dias}d para vencer` };
        }
        return { estado: 'normal', dias, clase: 'bg-slate-100 text-slate-700 border-slate-200', label: `Vence ${fechaStr}` };
    } catch {
        return { estado: 'normal', dias: 999, clase: '', label: '' };
    }
}

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
                const coincideLote = Array.isArray(p.lotes) && p.lotes.some((l) => (l.fecha_vencimiento || '').toLowerCase().includes(termino));
                if (!coincideNombre && !coincideCat && !coincideLote) return false;
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
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <Input
                            type="text"
                            placeholder="Buscar producto..."
                            value={busquedaPOS}
                            onChange={(e) => setBusquedaPOS(e.target.value)}
                            className="h-10 pl-9 pr-8 text-sm bg-white border-slate-300 rounded-lg focus-visible:ring-sky-500"
                        />
                        {busquedaPOS && (
                            <button
                                type="button"
                                onClick={() => setBusquedaPOS('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full text-xs min-h-[28px] min-w-[28px] flex items-center justify-center transition-colors"
                                title="Limpiar búsqueda"
                            >
                                <X className="w-3.5 h-3.5" />
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
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <Tag className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Categorías:</span>
                                </div>
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
                                className={`min-h-[40px] px-3.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                    categoriasSeleccionadas.length === 0
                                        ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm'
                                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                }`}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                <span>Todas ({productos.length})</span>
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
                                        className={`min-h-[40px] px-3.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                            estaSeleccionada
                                                ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm'
                                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                        }`}
                                    >
                                        {estaSeleccionada && <Check className="w-3.5 h-3.5 text-white" />}
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
                                        className={`min-h-[40px] px-3.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                            estaSeleccionada
                                                ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm'
                                                : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                                        }`}
                                    >
                                        {estaSeleccionada && <Check className="w-3.5 h-3.5 text-white" />}
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
                                const tieneMultiplesLotes = p.tipo_inventario === 'directo' && Array.isArray(p.lotes) && p.lotes.length > 1;
                                const lotePepsDefault = (p.lotes && p.lotes.length > 0) ? p.lotes[0] : null;
                                const prodConLotePeps = lotePepsDefault
                                    ? {
                                        ...p,
                                        loteId: lotePepsDefault.id,
                                        fechaVencimiento: lotePepsDefault.fecha_vencimiento,
                                        loteVencimiento: lotePepsDefault.fecha_vencimiento,
                                        unidades_disponibles: lotePepsDefault.stock
                                    }
                                    : p;

                                return (
                                    <div
                                        key={p.id}
                                        className={`group relative flex flex-col justify-between text-left p-3.5 rounded-xl border transition-all duration-150 min-h-[140px] select-none ${
                                            sinStock
                                                ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                                                : cantidadEnCarrito > 0
                                                    ? 'bg-sky-50/70 border-sky-500 ring-2 ring-sky-500/20 shadow-sm'
                                                    : 'bg-white border-slate-200 hover:border-sky-300 hover:shadow-md shadow-sm'
                                        }`}
                                    >
                                        {cantidadEnCarrito > 0 && (
                                            <Badge className="absolute top-2.5 right-2.5 bg-sky-600 hover:bg-sky-600 text-white font-bold text-[11px] px-2 py-0.5 shadow-sm">
                                                {cantidadEnCarrito} en pedido
                                            </Badge>
                                        )}

                                        {/* Área clickeable principal del producto */}
                                        <div
                                            onClick={() => !sinStock && onSeleccionarProducto && onSeleccionarProducto(prodConLotePeps)}
                                            className={`${sinStock ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                        >
                                            <div className="flex items-center gap-1.5 flex-wrap pr-14 mb-1">
                                                <Badge variant="outline" className="text-[10px] text-slate-600 bg-slate-50 border-slate-200 px-1.5 py-0 font-medium max-w-[130px] truncate">
                                                    {(p.categoria && p.categoria.trim()) ? p.categoria : 'Sin categoría'}
                                                </Badge>
                                                <Badge variant="secondary" className="text-[10px] text-slate-500 bg-slate-100 border-0 px-1.5 py-0 font-normal capitalize">
                                                    {p.tipo_inventario}
                                                </Badge>
                                                {tieneMultiplesLotes && (
                                                    <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-300 font-bold px-1.5 py-0 inline-flex items-center gap-1">
                                                        <Calendar className="w-2.5 h-2.5 text-amber-600" />
                                                        <span>{p.lotes.length} lotes</span>
                                                    </Badge>
                                                )}
                                            </div>

                                            {tieneModificadores && (
                                                <div className="mt-1">
                                                    <Badge variant="outline" className="text-[10px] text-sky-700 bg-sky-50 border-sky-200 font-semibold px-1.5 py-0 inline-flex items-center gap-1">
                                                        <Sparkles className="w-2.5 h-2.5 text-sky-600" />
                                                        <span>Con opciones</span>
                                                    </Badge>
                                                </div>
                                            )}

                                            {p.lotes && p.lotes.length === 1 && (() => {
                                                const estadoV = obtenerEstadoVencimiento(p.lotes[0].fecha_vencimiento);
                                                return (
                                                    <div className="mt-1">
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] font-semibold px-1.5 py-0 inline-flex items-center gap-1 ${
                                                                estadoV.estado === 'proximo'
                                                                    ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                                                    : estadoV.estado === 'vencido'
                                                                        ? 'bg-rose-100 text-rose-800 border-rose-300 font-bold'
                                                                        : 'bg-slate-50 text-slate-700 border-slate-200'
                                                            }`}
                                                        >
                                                            <Calendar className="w-2.5 h-2.5" />
                                                            <span>Vence: {p.lotes[0].fecha_vencimiento}</span>
                                                            {(estadoV.estado === 'proximo' || estadoV.estado === 'vencido') && (
                                                                <span className="font-bold underline ml-0.5">({estadoV.label})</span>
                                                            )}
                                                        </Badge>
                                                    </div>
                                                );
                                            })()}

                                            <div className="font-bold text-sm lg:text-base text-slate-900 mt-1.5 line-clamp-2 leading-tight group-hover:text-sky-700 transition-colors">
                                                {p.nombre}
                                            </div>

                                            <div className="mt-2 text-base lg:text-lg font-bold text-sky-600 leading-none">
                                                Bs {Number(p.precio).toFixed(2)}
                                            </div>
                                        </div>

                                        {/* Selector de Lotes Diferenciados por Fecha de Vencimiento */}
                                        {tieneMultiplesLotes ? (
                                            <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1.5">
                                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3 text-slate-400" />
                                                        <span>Lotes por Vencimiento:</span>
                                                    </span>
                                                    <span className="text-[9px] text-sky-700 font-semibold lowercase">orden PEPS</span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    {p.lotes.map((lote) => {
                                                        const estadoV = obtenerEstadoVencimiento(lote.fecha_vencimiento);
                                                        const enCarritoLote = carrito
                                                            .filter((it) => it.productoId === p.id && it.loteId === lote.id)
                                                            .reduce((sum, it) => sum + (Number(it.cantidad) || 0), 0);
                                                        const dispLote = Math.max(0, lote.stock - enCarritoLote);
                                                        const sinStockLote = dispLote <= 0;

                                                        return (
                                                            <button
                                                                key={lote.id}
                                                                type="button"
                                                                disabled={sinStockLote}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onSeleccionarProducto && onSeleccionarProducto({
                                                                        ...p,
                                                                        loteId: lote.id,
                                                                        fechaVencimiento: lote.fecha_vencimiento,
                                                                        loteVencimiento: lote.fecha_vencimiento,
                                                                        unidades_disponibles: lote.stock
                                                                    });
                                                                }}
                                                                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                                                                    sinStockLote
                                                                        ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                                                                        : enCarritoLote > 0
                                                                            ? 'bg-sky-50 border-sky-400 text-sky-950 font-semibold ring-1 ring-sky-400/40'
                                                                            : estadoV.estado === 'proximo'
                                                                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300 font-medium cursor-pointer shadow-xs'
                                                                                : estadoV.estado === 'vencido'
                                                                                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-950 border-rose-300 font-medium cursor-pointer shadow-xs'
                                                                                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 cursor-pointer shadow-xs'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                                                                        estadoV.estado === 'vencido'
                                                                            ? 'bg-rose-500'
                                                                            : estadoV.estado === 'proximo'
                                                                                ? 'bg-amber-500 animate-pulse'
                                                                                : 'bg-emerald-500'
                                                                    }`} />
                                                                    <span className="truncate font-semibold">{lote.fecha_vencimiento}</span>
                                                                    {(estadoV.estado === 'proximo' || estadoV.estado === 'vencido') && (
                                                                        <span className={`text-[9px] px-1 py-0.5 rounded font-bold uppercase shrink-0 ${
                                                                            estadoV.estado === 'vencido'
                                                                                ? 'bg-rose-200 text-rose-900'
                                                                                : 'bg-amber-200 text-amber-950'
                                                                        }`}>
                                                                            {estadoV.label}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-[11px] font-bold text-slate-800 shrink-0 ml-1">
                                                                    {sinStockLote ? 'Agotado' : `${dispLote} disp.`}
                                                                    {enCarritoLote > 0 && (
                                                                        <span className="text-sky-600 ml-1 font-bold">({enCarritoLote})</span>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1">
                                                <div className="text-[11px] font-medium">
                                                    {esLibre ? (
                                                        <span className="text-emerald-700 font-medium">Disponible (Libre)</span>
                                                    ) : sinStock ? (
                                                        <span className="text-rose-600 font-medium flex items-center gap-1">
                                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                                                            <span>{p.insumo_limitante ? p.insumo_limitante : 'Sin stock disponible'} {cantidadEnCarrito > 0 ? `(${cantidadEnCarrito} en pedido)` : ''}</span>
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
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
