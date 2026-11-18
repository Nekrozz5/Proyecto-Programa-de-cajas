'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
    Settings, 
    Package, 
    Calendar, 
    Boxes, 
    Coffee, 
    Receipt 
} from 'lucide-react';
import {
    guardarConfiguracionAction,
    guardarConfiguracionContableAction
} from '../../../server/actions/admin.actions';

export default function TabConfigFiscal({
    datos,
    esPrimeraEjecucion,
    onConfiguracionGuardada,
    cargarTodo,
    setMensaje,
    setError,
    limpiarAlertas
}) {
    const configActual = datos?.configuracionNegocio || {};

    // Estado Modalidad del Inventario
    const [cfgNombreNegocio, setCfgNombreNegocio] = useState(configActual.nombre_negocio || 'Mi Negocio');
    const [cfgModalidadNombre, setCfgModalidadNombre] = useState(configActual.modalidad_nombre || 'Venta Directa de Artículos No Perecederos');
    const [cfgUsaStockDirecto, setCfgUsaStockDirecto] = useState(Boolean(configActual.usa_stock_directo ?? true));
    const [cfgUsaVencimiento, setCfgUsaVencimiento] = useState(Boolean(configActual.usa_vencimiento ?? false));
    const [cfgUsaRecetas, setCfgUsaRecetas] = useState(Boolean(configActual.usa_recetas_ensamblaje ?? false));

    // Estado Configuración Contable y Régimen Tributario
    const [cfgNitNegocio, setCfgNitNegocio] = useState(configActual.nit_negocio || '');
    const [cfgRegimenTributario, setCfgRegimenTributario] = useState(configActual.regimen_tributario || 'simplificado_control_interno');
    const [cfgEmiteFactura, setCfgEmiteFactura] = useState(Boolean(configActual.emite_factura));
    const [cfgIvaPorcentaje, setCfgIvaPorcentaje] = useState(String(configActual.iva_porcentaje ?? 13));
    const [cfgItPorcentaje, setCfgItPorcentaje] = useState(String(configActual.it_porcentaje ?? 3));
    const [cfgItBase, setCfgItBase] = useState(configActual.it_base || 'todas_las_ventas');
    const [cfgUsaRespaldoComprasEgresos, setCfgUsaRespaldoComprasEgresos] = useState(Boolean(configActual.usa_respaldo_compras_egresos ?? true));

    function aplicarPlantillaModalidad(tipo) {
        if (tipo === 'no_perecedero') {
            setCfgModalidadNombre('Venta Directa de Artículos No Perecederos');
            setCfgUsaStockDirecto(true);
            setCfgUsaVencimiento(false);
            setCfgUsaRecetas(false);
        } else if (tipo === 'perecedero') {
            setCfgModalidadNombre('Venta de Productos con Fecha de Vencimiento');
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
        }
    }

    async function handleGuardarConfiguracion(e) {
        e.preventDefault();
        limpiarAlertas?.();
        try {
            const res = await guardarConfiguracionAction({
                nombreNegocio: cfgNombreNegocio,
                modalidadNombre: cfgModalidadNombre,
                usaStockDirecto: cfgUsaStockDirecto,
                usaVencimiento: cfgUsaVencimiento,
                usaRecetasEnsamblaje: cfgUsaRecetas
            });

            if (!res.ok) throw new Error(res.error || 'Error al guardar configuración de modalidad.');

            setMensaje?.(`Configuración de inventario guardada (${cfgModalidadNombre}). Los módulos se adaptaron automáticamente.`);
            await cargarTodo?.();
            onConfiguracionGuardada?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleGuardarConfiguracionContable(e) {
        e.preventDefault();
        limpiarAlertas?.();
        try {
            const res = await guardarConfiguracionContableAction({
                nombreNegocio: cfgNombreNegocio,
                nitNegocio: cfgNitNegocio,
                regimenTributario: cfgRegimenTributario,
                emiteFactura: cfgEmiteFactura,
                ivaPorcentaje: Number(cfgIvaPorcentaje || 13),
                itPorcentaje: Number(cfgItPorcentaje || 3),
                itBase: cfgItBase,
                usaRespaldoComprasEgresos: cfgUsaRespaldoComprasEgresos
            });

            if (!res.ok) throw new Error(res.error || 'Error al guardar la configuración contable.');

            setMensaje?.(`Configuración contable actualizada (${cfgRegimenTributario === 'regimen_general' ? 'Régimen General con Facturación' : 'Control Interno / Régimen Simplificado'}).`);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    return (
        <div className="flex flex-col gap-6 max-w-4xl">
            {/* ASISTENTE DE MODALIDAD DEL NEGOCIO */}
            <section className="bg-white p-5 rounded-lg border-2 border-sky-600 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900 mt-0 mb-1.5 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-sky-600" />
                    <span>
                        {esPrimeraEjecucion
                            ? 'Configuración Inicial del Sistema (Primera Ejecución)'
                            : 'Configurar Modalidad de Funcionamiento del Inventario'}
                    </span>
                </h2>
                <p className="text-slate-600 text-sm mb-4">
                    Selecciona cómo funciona el inventario de tu negocio. El sistema activará u ocultará automáticamente los campos de <strong>Fechas de Vencimiento</strong> y de <strong>Ensamblaje / Recetas de Materiales</strong> según tu modalidad.
                </p>

                {/* 4 Plantillas por Funcionamiento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <button
                        type="button"
                        onClick={() => aplicarPlantillaModalidad('no_perecedero')}
                        className={`flex flex-col gap-1 text-left p-3.5 rounded-lg cursor-pointer transition-all border ${
                            cfgUsaStockDirecto && !cfgUsaVencimiento && !cfgUsaRecetas
                                ? 'border-2 border-sky-600 bg-sky-50 shadow-sm'
                                : 'border-slate-300 bg-white hover:border-slate-400'
                        }`}
                    >
                        <div className="flex items-center gap-1.5">
                            <Package className="w-4 h-4 text-slate-700" />
                            <strong className="text-sm text-slate-900">1. Artículos No Perecederos</strong>
                        </div>
                        <span className="text-xs text-slate-600">
                            Compra y venta directa sin fecha de vencimiento ni recetas.
                        </span>
                        <small className="text-sky-600 text-[11px] mt-auto font-medium">Ej: Repuestos de auto, ferretería, PC.</small>
                    </button>

                    <button
                        type="button"
                        onClick={() => aplicarPlantillaModalidad('perecedero')}
                        className={`flex flex-col gap-1 text-left p-3.5 rounded-lg cursor-pointer transition-all border ${
                            cfgUsaStockDirecto && cfgUsaVencimiento && !cfgUsaRecetas
                                ? 'border-2 border-sky-600 bg-sky-50 shadow-sm'
                                : 'border-slate-300 bg-white hover:border-slate-400'
                        }`}
                    >
                        <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-slate-700" />
                            <strong className="text-sm text-slate-900">2. Productos con Vencimiento</strong>
                        </div>
                        <span className="text-xs text-slate-600">
                            Compra y venta directa controlando lote y caducidad.
                        </span>
                        <small className="text-sky-600 text-[11px] mt-auto font-medium">Ej: Minimarket, farmacia, supermercado.</small>
                    </button>

                    <button
                        type="button"
                        onClick={() => aplicarPlantillaModalidad('ensamblaje_no_perecedero')}
                        className={`flex flex-col gap-1 text-left p-3.5 rounded-lg cursor-pointer transition-all border ${
                            cfgUsaStockDirecto && !cfgUsaVencimiento && cfgUsaRecetas
                                ? 'border-2 border-sky-600 bg-sky-50 shadow-sm'
                                : 'border-slate-300 bg-white hover:border-slate-400'
                        }`}
                    >
                        <div className="flex items-center gap-1.5">
                            <Boxes className="w-4 h-4 text-slate-700" />
                            <strong className="text-sm text-slate-900">3. Ensamblaje / Fabricación</strong>
                        </div>
                        <span className="text-xs text-slate-600">
                            Une piezas o materiales no perecederos para armar productos.
                        </span>
                        <small className="text-sky-600 text-[11px] mt-auto font-medium">Ej: Carpintería, armado de PCs, talleres.</small>
                    </button>

                    <button
                        type="button"
                        onClick={() => aplicarPlantillaModalidad('elaboracion_perecedera')}
                        className={`flex flex-col gap-1 text-left p-3.5 rounded-lg cursor-pointer transition-all border ${
                            cfgUsaStockDirecto && cfgUsaVencimiento && cfgUsaRecetas
                                ? 'border-2 border-sky-600 bg-sky-50 shadow-sm'
                                : 'border-slate-300 bg-white hover:border-slate-400'
                        }`}
                    >
                        <div className="flex items-center gap-1.5">
                            <Coffee className="w-4 h-4 text-slate-700" />
                            <strong className="text-sm text-slate-900">4. Elaboración Perecedera</strong>
                        </div>
                        <span className="text-xs text-slate-600">
                            Recetas con ingredientes que tienen caducidad.
                        </span>
                        <small className="text-sky-600 text-[11px] mt-auto font-medium">Ej: Cafetería, restaurante, panadería.</small>
                    </button>
                </div>

                <form onSubmit={handleGuardarConfiguracion} className="flex flex-col gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="text-sm font-semibold text-slate-800 flex flex-col gap-1">
                            Nombre del Negocio:
                            <Input
                                type="text"
                                required
                                value={cfgNombreNegocio}
                                onChange={(e) => setCfgNombreNegocio(e.target.value)}
                                className="bg-white"
                            />
                        </label>
                        <label className="text-sm font-semibold text-slate-800 flex flex-col gap-1">
                            Descripción de la Modalidad:
                            <Input
                                type="text"
                                required
                                value={cfgModalidadNombre}
                                onChange={(e) => setCfgModalidadNombre(e.target.value)}
                                className="bg-white"
                            />
                        </label>
                    </div>

                    <div className="flex flex-col gap-2.5 pt-2">
                        <strong className="text-sm text-slate-800">Interruptores de Funcionalidades de Inventario:</strong>
                        <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700">
                            <input
                                type="checkbox"
                                checked={cfgUsaStockDirecto}
                                onChange={(e) => setCfgUsaStockDirecto(e.target.checked)}
                                className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>
                                <strong>Control de Stock Directo por Artículo:</strong> Descuenta unidades/medidas al vender, alerta stock mínimo y recalcula Costo Promedio Ponderado al reabastecer artículos.
                            </span>
                        </label>

                        <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700">
                            <input
                                type="checkbox"
                                checked={cfgUsaVencimiento}
                                onChange={(e) => setCfgUsaVencimiento(e.target.checked)}
                                className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>
                                <strong>Control de Fechas de Vencimiento:</strong> Solicita fecha de caducidad al registrar o comprar artículos/insumos (desactívalo para madera, repuestos de auto, piezas de PC o ferretería).
                            </span>
                        </label>

                        <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700">
                            <input
                                type="checkbox"
                                checked={cfgUsaRecetas}
                                onChange={(e) => setCfgUsaRecetas(e.target.checked)}
                                className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>
                                <strong>Control de Ensamblaje / Recetas de Materiales (BOM):</strong> Habilita la bolsa de materiales/insumos para productos que se fabrican o ensamblan a partir de componentes.
                            </span>
                        </label>
                    </div>

                    <Button type="submit" className="self-start bg-sky-600 hover:bg-sky-700 text-white font-bold mt-2">
                        Guardar Modalidad y Continuar
                    </Button>
                </form>
            </section>

            {/* SECCIÓN CONFIGURACIÓN CONTABLE Y RÉGIMEN FISCAL */}
            <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                    <h3 className="text-lg font-bold text-slate-900 m-0 flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-slate-700" />
                        <span>Régimen Tributario y Configuración Fiscal (Bolivia)</span>
                    </h3>
                    <Badge
                        variant="outline"
                        className={
                            cfgRegimenTributario === 'regimen_general'
                                ? 'bg-blue-50 text-blue-800 border-blue-300 font-semibold'
                                : 'bg-amber-50 text-amber-800 border-amber-300 font-semibold'
                        }
                    >
                        {cfgRegimenTributario === 'regimen_general'
                            ? 'Régimen General (IVA / IT)'
                            : 'Régimen Simplificado (Sin IVA)'}
                    </Badge>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                    Define las tasas tributarias aplicadas a los movimientos del negocio. Puedes alternar entre <strong>Control Interno (RTS)</strong> y <strong>Régimen General (IVA / IT)</strong>.
                </p>

                <form onSubmit={handleGuardarConfiguracionContable} className="flex flex-col gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <label className="text-sm font-semibold text-slate-800 flex flex-col gap-1">
                            Régimen del Negocio:
                            <select
                                value={cfgRegimenTributario}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setCfgRegimenTributario(val);
                                    setCfgEmiteFactura(val === 'regimen_general');
                                }}
                                className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-950"
                            >
                                <option value="simplificado_control_interno">Control Interno / Régimen Simplificado (Sin IVA)</option>
                                <option value="regimen_general">Régimen General (Facturación IVA / IT)</option>
                            </select>
                        </label>

                        <label className="text-sm font-semibold text-slate-800 flex flex-col gap-1">
                            NIT del Establecimiento (Opcional):
                            <Input
                                type="text"
                                placeholder="Ej. 1029384015"
                                value={cfgNitNegocio}
                                onChange={(e) => setCfgNitNegocio(e.target.value)}
                                className="bg-white"
                            />
                        </label>

                        {cfgRegimenTributario === 'regimen_general' && (
                            <>
                                <label className="text-sm font-semibold text-slate-800 flex flex-col gap-1">
                                    Alícuota IVA (%):
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={cfgIvaPorcentaje}
                                        onChange={(e) => setCfgIvaPorcentaje(e.target.value)}
                                        className="bg-white"
                                    />
                                </label>
                                <label className="text-sm font-semibold text-slate-800 flex flex-col gap-1">
                                    Alícuota IT (%):
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={cfgItPorcentaje}
                                        onChange={(e) => setCfgItPorcentaje(e.target.value)}
                                        className="bg-white"
                                    />
                                </label>
                                <label className="text-sm font-semibold text-slate-800 flex flex-col gap-1">
                                    Base Imponible del IT:
                                    <select
                                        value={cfgItBase}
                                        onChange={(e) => setCfgItBase(e.target.value)}
                                        className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-950"
                                    >
                                        <option value="todas_las_ventas">Todas las ventas (Facturadas y no facturadas)</option>
                                        <option value="solo_facturadas">Solo ventas formalmente facturadas</option>
                                    </select>
                                </label>
                            </>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-5 items-center pt-1">
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={cfgEmiteFactura}
                                onChange={(e) => setCfgEmiteFactura(e.target.checked)}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>Habilitar emisión de Factura Formal (con NIT/CI y Razón Social)</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={cfgUsaRespaldoComprasEgresos}
                                onChange={(e) => setCfgUsaRespaldoComprasEgresos(e.target.checked)}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>Permitir registrar factura en Compras y Gastos (Crédito Fiscal)</span>
                        </label>
                    </div>

                    <Button type="submit" className="self-start bg-slate-900 hover:bg-slate-800 text-white font-bold mt-2">
                        Actualizar Configuración Contable
                    </Button>
                </form>
            </section>
        </div>
    );
}
