'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
        <div className="flex flex-col gap-6">
            {/* SECCIÓN PUNTO DE REORDEN Y ESTADO DE INSUMOS */}
            <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 m-0">🧱 Estado de Materiales / Insumos y Punto de Reorden</h2>
                        <span className="text-xs text-slate-500">
                            {insumosFiltrados.length} insumo(s) encontrado(s) de un total de {listaInsumosCompleta.length}
                        </span>
                    </div>

                    {/* Buscador Rápido y Selector de Límite de Insumos */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative min-w-[240px]">
                            <Input
                                type="text"
                                placeholder="🔍 Buscar insumo por nombre o alerta..."
                                value={busquedaInsumos}
                                onChange={(e) => {
                                    setBusquedaInsumos(e.target.value);
                                    setPaginaInsumos(1);
                                }}
                                className="h-9 pr-8 text-xs bg-white"
                            />
                            {busquedaInsumos && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBusquedaInsumos('');
                                        setPaginaInsumos(1);
                                    }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs"
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
                            className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs shadow-sm focus:outline-none"
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
                    <p className="text-slate-500 text-sm">No hay materiales o insumos registrados todavía.</p>
                ) : insumosFiltrados.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg text-sm">
                        No se encontraron insumos que coincidan con &ldquo;<strong>{busquedaInsumos}</strong>&rdquo;.
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        <TableHead className="font-bold text-slate-900">Material / Insumo</TableHead>
                                        <TableHead className="font-bold text-slate-900">Stock Actual</TableHead>
                                        <TableHead className="font-bold text-slate-900">Consumo Diario Prom.</TableHead>
                                        <TableHead className="font-bold text-slate-900">Punto Reorden (ROP)</TableHead>
                                        <TableHead className="font-bold text-slate-900">Compra Sugerida</TableHead>
                                        <TableHead className="font-bold text-slate-900">Costo Estimado</TableHead>
                                        <TableHead className="font-bold text-slate-900">Estado / Alerta</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {insumosPaginados.map((ins) => (
                                        <TableRow key={ins.insumoId}>
                                            <TableCell className="font-bold text-slate-900">{ins.nombre}</TableCell>
                                            <TableCell>{ins.stockActual} {ins.unidad}</TableCell>
                                            <TableCell>{ins.consumoPromedioDiario} {ins.unidad}/día</TableCell>
                                            <TableCell>{ins.puntoReordenROP} {ins.unidad}</TableCell>
                                            <TableCell>{ins.cantidadSugeridaCompra} {ins.unidad}</TableCell>
                                            <TableCell>Bs {ins.costoEstimadoCompra.toFixed(2)}</TableCell>
                                            <TableCell>
                                                {ins.estadoAlerta === 'OK' ? (
                                                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 font-bold text-xs">
                                                        OK
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100 border border-red-300 font-bold text-xs">
                                                        {ins.estadoAlerta}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Barra de Paginación */}
                        {totalPaginasInsumos > 1 && (
                            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200 flex-wrap gap-2">
                                <span className="text-xs text-slate-500">
                                    Mostrando {inicioInsumos + 1} - {Math.min(inicioInsumos + limitePorPaginaInsumos, insumosFiltrados.length)} de {insumosFiltrados.length}
                                </span>
                                <div className="flex gap-1.5 items-center">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={paginaInsumosValida <= 1}
                                        onClick={() => setPaginaInsumos((p) => Math.max(1, p - 1))}
                                        className="h-7 text-xs"
                                    >
                                        ◀ Anterior
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={paginaInsumosValida >= totalPaginasInsumos}
                                        onClick={() => setPaginaInsumos((p) => Math.min(totalPaginasInsumos, p + 1))}
                                        className="h-7 text-xs"
                                    >
                                        Siguiente ▶
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </section>

            {/* FORMULARIOS DE COMPRA Y CREACIÓN DE INSUMOS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                    <h3 className="text-lg font-bold text-slate-900 m-0">Registrar Compra de Material / Insumo (CPP - NIC 2)</h3>
                    <form onSubmit={handleCompraCPP} className="flex flex-col gap-3">
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Seleccionar Material / Insumo:
                            <select value={compraInsumoId} onChange={(e) => setCompraInsumoId(e.target.value)} className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none">
                                {(datos?.insumos || []).map((i) => (
                                    <option key={i.id} value={i.id}>
                                        {i.nombre} (Stock: {i.stock_actual} {i.unidad_medida})
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Nombre de la distribuidora:
                            <Input
                                type="text"
                                placeholder="Nombre de la distribuidora"
                                value={compraDistribuidora}
                                onChange={(e) => setCompraDistribuidora(e.target.value)}
                                className="bg-white"
                            />
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                NIT Proveedor (Opcional):
                                <Input
                                    type="text"
                                    placeholder="NIT del proveedor"
                                    value={compraNitProveedor}
                                    onChange={(e) => setCompraNitProveedor(e.target.value)}
                                    className="bg-white"
                                />
                            </label>
                            <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                N° Factura (Opcional):
                                <Input
                                    type="text"
                                    placeholder="N° de factura"
                                    value={compraNroFactura}
                                    onChange={(e) => {
                                        setCompraNroFactura(e.target.value);
                                        if (e.target.value.trim() !== '') setCompraConFactura(true);
                                    }}
                                    className="bg-white"
                                />
                            </label>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer pt-1">
                            <input
                                type="checkbox"
                                checked={compraConFactura}
                                onChange={(e) => setCompraConFactura(e.target.checked)}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>🧾 Compra con Factura Fiscal (Genera Crédito Fiscal IVA)</span>
                        </label>
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Cantidad Comprada (según su unidad de medida):
                            <Input type="number" step="0.01" placeholder="Ej. 10" required value={compraCantidad} onChange={(e) => setCompraCantidad(e.target.value)} className="bg-white" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Costo Total Pagado por la Compra (Bs):
                            <Input type="number" step="0.01" placeholder="Ej. 150.00" required value={compraCostoTotal} onChange={(e) => setCompraCostoTotal(e.target.value)} className="bg-white" />
                        </label>
                        <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white font-bold mt-1">
                            Registrar Compra y Actualizar Costos
                        </Button>
                    </form>
                </section>

                <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                    <h3 className="text-lg font-bold text-slate-900 m-0">Registrar Nuevo Material / Insumo</h3>
                    <form onSubmit={handleCrearInsumo} className="flex flex-col gap-3">
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Nombre del Material, Pieza o Ingrediente:
                            <Input placeholder="Nombre del material o insumo" required value={insNombre} onChange={(e) => setInsNombre(e.target.value)} className="bg-white" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Unidad de Medida (Sistema Métrico o Unidades):
                            <select value={insUnidad} onChange={(e) => setInsUnidad(e.target.value)} className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none">
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
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Stock Inicial Disponible en Almacén:
                            <Input type="number" step="0.01" min="0" placeholder="Cantidad actual (0 si aún no compraste)" value={insStockIni} onChange={(e) => setInsStockIni(e.target.value)} className="bg-white" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Costo por unidad (Bs):
                            <Input type="number" step="0.0001" min="0" placeholder="Cuánto cuesta 1 unidad en Bs" value={insCostoUni} onChange={(e) => setInsCostoUni(e.target.value)} className="bg-white" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Stock de Seguridad (Reserva mínima para alerta de reposición):
                            <Input type="number" step="0.01" min="0" placeholder="Cantidad mínima antes de alertar" value={insStockSeg} onChange={(e) => setInsStockSeg(e.target.value)} className="bg-white" />
                        </label>
                        <div className="flex items-center gap-2 py-0.5">
                            <input
                                type="checkbox"
                                id="checkInsVencimientoTab"
                                checked={insTieneVencimiento}
                                onChange={(e) => {
                                    setInsTieneVencimiento(e.target.checked);
                                    if (!e.target.checked) setInsFechaVencimiento('');
                                }}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                            />
                            <label htmlFor="checkInsVencimientoTab" className="text-xs font-medium text-slate-700 cursor-pointer">
                                ¿Tiene fecha de vencimiento?
                            </label>
                        </div>
                        {insTieneVencimiento && (
                            <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                Fecha de Vencimiento:
                                <Input type="date" required={insTieneVencimiento} value={insFechaVencimiento} onChange={(e) => setInsFechaVencimiento(e.target.value)} className="bg-white" />
                            </label>
                        )}
                        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                            Proveedor:
                            <Input
                                type="text"
                                placeholder="Nombre de proveedor"
                                value={insProveedor}
                                onChange={(e) => setInsProveedor(e.target.value)}
                                className="bg-white"
                            />
                        </label>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold mt-1">
                            Crear Material / Insumo
                        </Button>
                    </form>
                </section>
            </div>

            {/* FORMULARIO DE MERMAS DE INSUMOS */}
            <section className="bg-red-50/40 p-5 rounded-lg border border-red-200 shadow-sm flex flex-col gap-3">
                <h3 className="text-lg font-bold text-red-800 m-0">⚠️ Registrar Merma / Desperdicio de Material o Insumo</h3>
                {(() => {
                    const listaIns = datos?.insumos || [];
                    if (listaIns.length === 0) {
                        return <p className="m-0 text-slate-500 text-xs">No hay materiales o insumos registrados.</p>;
                    }
                    const insSel = listaIns.find((i) => String(i.id) === String(mermaInsId || listaIns[0]?.id)) || listaIns[0];
                    const stockIns = Number(insSel?.stock_actual ?? 0);
                    const costoUnitIns = Number(insSel?.costo_por_unidad ?? 0);
                    const cantInsNum = Number(mermaInsCantidad) || 0;
                    const perdidaInsBs = Number((Math.max(0, cantInsNum) * costoUnitIns).toFixed(2));
                    const superaStockIns = cantInsNum > stockIns;

                    return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
                            <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                Insumo ({insSel?.unidad_medida || 'u.'}):
                                <select
                                    value={mermaInsId || insSel?.id}
                                    onChange={(e) => {
                                        setMermaInsId(e.target.value);
                                        setMermaInsConfirmando(false);
                                        setMermaInsResultado(null);
                                    }}
                                    className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-xs shadow-sm focus:outline-none"
                                >
                                    {listaIns.map((i) => (
                                        <option key={i.id} value={i.id}>
                                            {i.nombre} (Stock: {i.stock_actual} {i.unidad_medida})
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                Cantidad Perdida:
                                <Input
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
                                    className={`bg-white h-9 text-xs ${superaStockIns ? 'border-red-500' : ''}`}
                                />
                            </label>
                            <div className="bg-red-50 border border-red-200 rounded-md p-2 text-right h-9 flex flex-col justify-center">
                                <div className="text-[10px] text-red-800 font-bold uppercase">Pérdida Estimada</div>
                                <div className="text-sm font-bold text-red-700">Bs {perdidaInsBs.toFixed(2)}</div>
                            </div>
                            <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                Motivo de Merma (Obligatorio):
                                <Input
                                    type="text"
                                    placeholder="Ej. Derrame, caducidad..."
                                    value={mermaInsMotivo}
                                    onChange={(e) => {
                                        setMermaInsMotivo(e.target.value);
                                        setMermaInsConfirmando(false);
                                    }}
                                    className="bg-white h-9 text-xs"
                                />
                            </label>
                            <div>
                                {!mermaInsConfirmando ? (
                                    <Button
                                        type="button"
                                        disabled={!insSel || stockIns <= 0 || cantInsNum <= 0 || superaStockIns || !mermaInsMotivo || mermaInsMotivo.trim().length < 3}
                                        onClick={() => setMermaInsConfirmando(true)}
                                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-9 text-xs disabled:opacity-50"
                                    >
                                        Dar de Baja
                                    </Button>
                                ) : (
                                    <div className="flex gap-1.5">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleConfirmarMermaInsumo}
                                            className="h-9 text-xs bg-red-600 hover:bg-red-700 text-white font-bold flex-1"
                                        >
                                            ✅ Confirmar (-{cantInsNum})
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setMermaInsConfirmando(false)}
                                            className="h-9 text-xs"
                                        >
                                            Cancelar
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
                {mermaInsResultado && (
                    <div className="mt-1 bg-emerald-50 border border-emerald-200 rounded-md p-2.5 text-xs text-emerald-800">
                        <strong>✅ Merma de insumo registrada:</strong> {mermaInsResultado.insumoNombre} (-{mermaInsResultado.cantidadPerdida} {mermaInsResultado.unidadMedida}) | Stock restante: <strong>{mermaInsResultado.stockRestante} {mermaInsResultado.unidadMedida}</strong> | Pérdida: <strong>Bs {Number(mermaInsResultado.costoPerdida || 0).toFixed(2)}</strong>
                    </div>
                )}
            </section>

            {/* VERIFICACIÓN DE INTEGRIDAD KARDEX */}
            <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-center flex-wrap gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 m-0">🛡️ Verificación de Integridad del Kardex (NIC 2)</h3>
                        <p className="text-xs text-slate-500 m-0 mt-0.5">
                            Comprueba que el stock físico actual coincida exactamente con la reconstrucción matemática de los movimientos de Kardex.
                        </p>
                    </div>
                    <Button
                        type="button"
                        onClick={handleVerificarIntegridadKardex}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs"
                    >
                        🔍 Auditar Integridad del Kardex Ahora
                    </Button>
                </div>
                {resultadoIntegridadKardex && (
                    <div className={`p-3 rounded-lg border text-xs ${
                        resultadoIntegridadKardex.integro
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                        <strong className="text-sm">
                            {resultadoIntegridadKardex.integro
                                ? '✅ Estado: 100% ÍNTEGRO'
                                : '⚠️ Estado: Discrepancias detectadas'}
                        </strong>
                        <div className="mt-1 text-slate-700">
                            Productos directos auditados: <strong>{resultadoIntegridadKardex.totalProductosAuditados ?? 0}</strong> |{' '}
                            Insumos auditados: <strong>{resultadoIntegridadKardex.integridadInsumos?.totalInsumosAuditados ?? resultadoIntegridadKardex.insumos?.totalInsumosAuditados ?? 0}</strong>
                        </div>
                    </div>
                )}
            </section>

            {/* TABLA KARDEX CRONOLÓGICO DE PRODUCTOS DIRECTOS */}
            <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                <h3 className="text-lg font-bold text-slate-900 m-0">📦 Kardex Cronológico de Productos Directos</h3>
                {(datos?.kardexDetallado?.kardexProductosDirectos || []).length === 0 ? (
                    <p className="text-slate-500 text-xs">No hay movimientos de Kardex de productos directos registrados.</p>
                ) : (
                    <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-lg">
                        <Table className="text-xs">
                            <TableHeader className="sticky top-0 bg-slate-50">
                                <TableRow>
                                    <TableHead className="font-bold text-slate-900">ID</TableHead>
                                    <TableHead className="font-bold text-slate-900">Fecha / Hora</TableHead>
                                    <TableHead className="font-bold text-slate-900">Producto Directo</TableHead>
                                    <TableHead className="font-bold text-slate-900">Tipo</TableHead>
                                    <TableHead className="font-bold text-slate-900 text-right">Cantidad</TableHead>
                                    <TableHead className="font-bold text-slate-900 text-right">Stock Resultante</TableHead>
                                    <TableHead className="font-bold text-slate-900 text-right">Costo Unit.</TableHead>
                                    <TableHead className="font-bold text-slate-900 text-right">CPP Resultante</TableHead>
                                    <TableHead className="font-bold text-slate-900 text-right">Costo Total</TableHead>
                                    <TableHead className="font-bold text-slate-900">Motivo / Comprobante</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(datos?.kardexDetallado?.kardexProductosDirectos || []).map((k) => (
                                    <TableRow key={k.id}>
                                        <TableCell>#{k.id}</TableCell>
                                        <TableCell>{k.fecha_hora_local}</TableCell>
                                        <TableCell className="font-bold">{k.producto_nombre}</TableCell>
                                        <TableCell>
                                            {k.tipo === 'merma' ? (
                                                <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100 font-bold text-[10px]">
                                                    MERMA
                                                </Badge>
                                            ) : k.tipo === 'venta' ? (
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 font-bold text-[10px]">
                                                    VENTA
                                                </Badge>
                                            ) : k.tipo === 'compra' ? (
                                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-bold text-[10px]">
                                                    COMPRA
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="font-bold text-[10px]">
                                                    {k.tipo.toUpperCase()}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-bold">
                                            {k.tipo === 'merma' || k.tipo === 'venta' ? `-${k.cantidad}` : `+${k.cantidad}`} {k.unidad_medida || 'u.'}
                                        </TableCell>
                                        <TableCell className="text-right font-bold">{k.stock_resultante}</TableCell>
                                        <TableCell className="text-right">Bs {Number(k.costo_unitario || 0).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">Bs {Number(k.costo_promedio_resultante || 0).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">Bs {Number(k.costo_total || 0).toFixed(2)}</TableCell>
                                        <TableCell>
                                            {k.motivo}
                                            {k.nro_factura_compra ? ` (Fact. #${k.nro_factura_compra})` : ''}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>

            {/* TABLA KARDEX CRONOLÓGICO DE INSUMOS */}
            <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                <h3 className="text-lg font-bold text-slate-900 m-0">🧱 Kardex Cronológico de Materiales e Insumos</h3>
                {(datos?.kardexDetallado?.kardexInsumos || []).length === 0 ? (
                    <p className="text-slate-500 text-xs">No hay movimientos de Kardex de insumos registrados.</p>
                ) : (
                    <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-lg">
                        <Table className="text-xs">
                            <TableHeader className="sticky top-0 bg-slate-50">
                                <TableRow>
                                    <TableHead className="font-bold text-slate-900">ID</TableHead>
                                    <TableHead className="font-bold text-slate-900">Fecha / Hora</TableHead>
                                    <TableHead className="font-bold text-slate-900">Insumo</TableHead>
                                    <TableHead className="font-bold text-slate-900">Tipo</TableHead>
                                    <TableHead className="font-bold text-slate-900 text-right">Cantidad</TableHead>
                                    <TableHead className="font-bold text-slate-900 text-right">Stock Resultante</TableHead>
                                    <TableHead className="font-bold text-slate-900 text-right">CPP Resultante</TableHead>
                                    <TableHead className="font-bold text-slate-900 text-right">Costo Total</TableHead>
                                    <TableHead className="font-bold text-slate-900">Motivo / Proveedor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(datos?.kardexDetallado?.kardexInsumos || []).map((k) => (
                                    <TableRow key={k.id}>
                                        <TableCell>#{k.id}</TableCell>
                                        <TableCell>{k.fecha_hora_local}</TableCell>
                                        <TableCell className="font-bold">{k.insumo_nombre}</TableCell>
                                        <TableCell>
                                            {k.tipo === 'merma' ? (
                                                <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100 font-bold text-[10px]">
                                                    MERMA
                                                </Badge>
                                            ) : k.tipo === 'consumo_venta' ? (
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 font-bold text-[10px]">
                                                    CONSUMO VENTA
                                                </Badge>
                                            ) : k.tipo === 'compra' ? (
                                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-bold text-[10px]">
                                                    COMPRA
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="font-bold text-[10px]">
                                                    {k.tipo.toUpperCase()}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-bold">
                                            {k.tipo === 'merma' || k.tipo === 'consumo_venta' ? `-${k.cantidad}` : `+${k.cantidad}`} {k.unidad_medida}
                                        </TableCell>
                                        <TableCell className="text-right font-bold">{Number(k.stock_resultante ?? 0).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">Bs {Number(k.costo_promedio_resultante ?? 0).toFixed(4)}</TableCell>
                                        <TableCell className="text-right">Bs {Number(k.costo_total || 0).toFixed(2)}</TableCell>
                                        <TableCell>
                                            {k.motivo}
                                            {k.nro_factura_compra ? ` (Fact. #${k.nro_factura_compra})` : ''}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>
        </div>
    );
}
