'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { SlidersHorizontal, Check, RefreshCw, X } from 'lucide-react';

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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-[540px] w-full max-h-[92vh] flex flex-col overflow-hidden">
                {/* Cabecera */}
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <SlidersHorizontal className="w-5 h-5 text-sky-600" />
                            <span>Personalizar: {producto.nombre}</span>
                        </h3>
                        <div className="text-xs text-slate-500 mt-0.5">
                            Precio base: <strong className="text-slate-800">Bs {Number(producto.precio).toFixed(2)}</strong>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md p-1.5 transition-colors cursor-pointer"
                        aria-label="Cerrar modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Lista de grupos de opciones */}
                <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-slate-800">
                    {(producto.grupos_modificadores || []).map((grupo) => {
                        const seleccion = opcionesSeleccionadas[grupo.id];
                        return (
                            <div key={grupo.id} className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-sm text-slate-900">
                                        {grupo.nombre}
                                    </span>
                                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${
                                        grupo.es_obligatorio
                                            ? 'bg-rose-100 text-rose-800 border-rose-200'
                                            : 'bg-sky-100 text-sky-800 border-sky-200'
                                    }`}>
                                        {grupo.tipo_seleccion === 'unica' ? (
                                            <>
                                                <RefreshCw className="w-3 h-3" />
                                                <span>Una sola opción</span>
                                            </>
                                        ) : (
                                            <>
                                                <SlidersHorizontal className="w-3 h-3" />
                                                <span>Múltiples extras</span>
                                            </>
                                        )}
                                        {grupo.es_obligatorio ? ' • Obligatorio' : ''}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                                                className={`p-2.5 rounded-lg text-left transition-all cursor-pointer flex flex-col justify-between ${
                                                    esSeleccionado
                                                        ? 'border-2 border-sky-600 bg-sky-50/90 text-sky-950 font-bold shadow-xs'
                                                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 font-medium'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-1">
                                                    <span className="text-xs sm:text-sm line-clamp-2">{op.nombre}</span>
                                                    {esSeleccionado && (
                                                        <Check className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                                                    )}
                                                </div>
                                                <div className={`text-xs mt-1.5 font-bold ${
                                                    Number(op.precio_adicional || 0) > 0 ? 'text-emerald-700' : 'text-slate-400 font-normal'
                                                }`}>
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
                <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                    <div>
                        <div className="text-xs text-slate-500">Total ítem con opciones:</div>
                        <div className="text-xl font-black text-slate-900">
                            Bs {totalCalculado.toFixed(2)}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmar}
                            className="px-5 py-2 text-sm font-bold rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                            <Check className="w-4 h-4" />
                            <span>Agregar al Pedido</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
