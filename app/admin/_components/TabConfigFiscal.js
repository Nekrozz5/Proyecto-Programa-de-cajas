'use client';

import { useState } from 'react';
import { cardStyle, btnPrimario, inputStyle, plantillaBtnStyle } from './adminStyles';
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '900px' }}>
            {/* ASISTENTE DE MODALIDAD DEL NEGOCIO */}
            <section style={{ ...cardStyle, border: '2px solid #0284c7' }}>
                <h2 style={{ marginTop: 0 }}>
                    {esPrimeraEjecucion
                        ? '🚀 Configuración Inicial del Sistema (Primera Ejecución)'
                        : '⚙️ Configurar Modalidad de Funcionamiento del Inventario'}
                </h2>
                <p style={{ color: '#475569', fontSize: '0.92rem' }}>
                    Selecciona cómo funciona el inventario de tu negocio. El sistema activará u ocultará automáticamente los campos de <strong>Fechas de Vencimiento</strong> y de <strong>Ensamblaje / Recetas de Materiales</strong> según tu modalidad.
                </p>

                {/* 4 Plantillas por Funcionamiento */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <button
                        type="button"
                        onClick={() => aplicarPlantillaModalidad('no_perecedero')}
                        style={plantillaBtnStyle(cfgUsaStockDirecto && !cfgUsaVencimiento && !cfgUsaRecetas)}
                    >
                        <strong>🔧 1. Artículos No Perecederos</strong>
                        <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                            Compra y venta directa sin fecha de vencimiento ni recetas.
                        </span>
                        <small style={{ color: '#0284c7' }}>Ej: Repuestos de auto, piezas de PC, ferretería, venta de madera.</small>
                    </button>

                    <button
                        type="button"
                        onClick={() => aplicarPlantillaModalidad('perecedero')}
                        style={plantillaBtnStyle(cfgUsaStockDirecto && cfgUsaVencimiento && !cfgUsaRecetas)}
                    >
                        <strong>🛒 2. Productos con Vencimiento</strong>
                        <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                            Compra y venta directa controlando lote y fecha de caducidad.
                        </span>
                        <small style={{ color: '#0284c7' }}>Ej: Minimarket, supermercado, farmacia, insumos médicos.</small>
                    </button>

                    <button
                        type="button"
                        onClick={() => aplicarPlantillaModalidad('ensamblaje_no_perecedero')}
                        style={plantillaBtnStyle(cfgUsaStockDirecto && !cfgUsaVencimiento && cfgUsaRecetas)}
                    >
                        <strong>🪚 3. Ensamblaje / Fabricación (Sin Vencimiento)</strong>
                        <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                            Une piezas o materiales no perecederos para crear un producto.
                        </span>
                        <small style={{ color: '#0284c7' }}>Ej: Carpintería/mueblería, armado de PCs, talleres.</small>
                    </button>

                    <button
                        type="button"
                        onClick={() => aplicarPlantillaModalidad('elaboracion_perecedera')}
                        style={plantillaBtnStyle(cfgUsaStockDirecto && cfgUsaVencimiento && cfgUsaRecetas)}
                    >
                        <strong>☕ 4. Elaboración Perecedera (Con Receta y Vencimiento)</strong>
                        <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                            Recetas con ingredientes que tienen fecha de vencimiento.
                        </span>
                        <small style={{ color: '#0284c7' }}>Ej: Cafetería, restaurante, panadería, pastelería.</small>
                    </button>
                </div>

                <form onSubmit={handleGuardarConfiguracion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                            Nombre del Negocio:
                            <input
                                type="text"
                                required
                                value={cfgNombreNegocio}
                                onChange={(e) => setCfgNombreNegocio(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                        <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                            Descripción de la Modalidad:
                            <input
                                type="text"
                                required
                                value={cfgModalidadNombre}
                                onChange={(e) => setCfgModalidadNombre(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <strong>Interruptores de Funcionalidades de Inventario:</strong>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={cfgUsaStockDirecto}
                                onChange={(e) => setCfgUsaStockDirecto(e.target.checked)}
                            />
                            <span>
                                <strong>Control de Stock Directo por Artículo:</strong> Descuenta unidades/medidas al vender, alerta stock mínimo y recalcula Costo Promedio Ponderado al reabastecer artículos.
                            </span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={cfgUsaVencimiento}
                                onChange={(e) => setCfgUsaVencimiento(e.target.checked)}
                            />
                            <span>
                                <strong>Control de Fechas de Vencimiento:</strong> Solicita fecha de caducidad al registrar o comprar artículos/insumos (desactívalo para madera, repuestos de auto, piezas de PC o ferretería).
                            </span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={cfgUsaRecetas}
                                onChange={(e) => setCfgUsaRecetas(e.target.checked)}
                            />
                            <span>
                                <strong>Control de Ensamblaje / Recetas de Materiales (BOM):</strong> Habilita la bolsa de materiales/insumos para productos que se fabrican o ensamblan a partir de componentes.
                            </span>
                        </label>
                    </div>

                    <button type="submit" style={{ ...btnPrimario, alignSelf: 'flex-start' }}>
                        Guardar Modalidad y Continuar
                    </button>
                </form>
            </section>

            {/* SECCIÓN CONFIGURACIÓN CONTABLE Y RÉGIMEN FISCAL */}
            <section style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>🧾 Régimen Tributario y Configuración Fiscal (Bolivia)</h3>
                <p style={{ color: '#475569', fontSize: '0.9rem' }}>
                    Define las tasas tributarias aplicadas a los movimientos del negocio. Puedes alternar entre <strong>Control Interno (RTS)</strong> y <strong>Régimen General (IVA / IT)</strong>.
                </p>

                <form onSubmit={handleGuardarConfiguracionContable} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                            Régimen del Negocio:
                            <select
                                value={cfgRegimenTributario}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setCfgRegimenTributario(val);
                                    setCfgEmiteFactura(val === 'regimen_general');
                                }}
                                style={inputStyle}
                            >
                                <option value="simplificado_control_interno">📋 Control Interno / Régimen Simplificado (Sin IVA)</option>
                                <option value="regimen_general">🏛️ Régimen General (Facturación IVA / IT)</option>
                            </select>
                        </label>

                        <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                            NIT del Establecimiento (Opcional):
                            <input
                                type="text"
                                placeholder="Ej. 1029384015"
                                value={cfgNitNegocio}
                                onChange={(e) => setCfgNitNegocio(e.target.value)}
                                style={inputStyle}
                            />
                        </label>

                        {cfgRegimenTributario === 'regimen_general' && (
                            <>
                                <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                                    Alícuota IVA (%):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={cfgIvaPorcentaje}
                                        onChange={(e) => setCfgIvaPorcentaje(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                                    Alícuota IT (%):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={cfgItPorcentaje}
                                        onChange={(e) => setCfgItPorcentaje(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                                    Base Imponible del IT:
                                    <select
                                        value={cfgItBase}
                                        onChange={(e) => setCfgItBase(e.target.value)}
                                        style={inputStyle}
                                    >
                                        <option value="todas_las_ventas">Todas las ventas (Facturadas y no facturadas)</option>
                                        <option value="solo_facturadas">Solo ventas formalmente facturadas</option>
                                    </select>
                                </label>
                            </>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={cfgEmiteFactura}
                                onChange={(e) => setCfgEmiteFactura(e.target.checked)}
                            />
                            <span>Habilitar emisión de Factura Formal (con NIT/CI y Razón Social)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={cfgUsaRespaldoComprasEgresos}
                                onChange={(e) => setCfgUsaRespaldoComprasEgresos(e.target.checked)}
                            />
                            <span>Permitir registrar factura en Compras y Gastos (Crédito Fiscal)</span>
                        </label>
                    </div>

                    <button type="submit" style={{ ...btnPrimario, alignSelf: 'flex-start' }}>
                        Actualizar Configuración Contable
                    </button>
                </form>
            </section>
        </div>
    );
}
