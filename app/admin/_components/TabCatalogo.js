'use client';

import { useState } from 'react';
import { cardStyle, formCol, inputStyle, btnPrimario, btnOscuro, btnSecundario, thTd } from './adminStyles';
import TabKardex from './TabKardex';
import {
    crearCategoriaAction,
    crearProductoAction,
    crearGrupoModificadorAction,
    eliminarGrupoModificadorAction,
    asignarModificadoresProductoAction
} from '../../../server/actions/catalogo.actions';
import {
    comprarProductoDirectoAction,
    mermaProductoDirectoAction
} from '../../../server/actions/inventario.actions';

export function obtenerUnidadesCompatibles(unidadBase) {
    const u = String(unidadBase || 'unidades').trim().toLowerCase();
    if (['kilos', 'kg', 'gramos', 'g', 'miligramos', 'mg'].includes(u)) {
        return [
            { valor: 'kilos', etiqueta: 'Kilos (kg)' },
            { valor: 'gramos', etiqueta: 'Gramos (g)' },
            { valor: 'miligramos', etiqueta: 'Miligramos (mg)' }
        ];
    }
    if (['litros', 'l', 'mililitros', 'ml'].includes(u)) {
        return [
            { valor: 'litros', etiqueta: 'Litros (L)' },
            { valor: 'mililitros', etiqueta: 'Mililitros (ml)' }
        ];
    }
    if (['metros', 'm', 'centimetros', 'cm'].includes(u)) {
        return [
            { valor: 'metros', etiqueta: 'Metros (m)' },
            { valor: 'centimetros', etiqueta: 'Centímetros (cm)' }
        ];
    }
    return [{ valor: unidadBase || 'unidades', etiqueta: `Unidades (${unidadBase || 'unidades'})` }];
}

export function convertirMedidaReceta(cantidad, unidadOrigen, unidadDestino) {
    const num = Number(cantidad);
    if (!num || isNaN(num) || !unidadOrigen || !unidadDestino) return null;
    const factores = {
        kilos: 1000, kg: 1000, gramos: 1, g: 1, miligramos: 0.001, mg: 0.001,
        litros: 1000, l: 1000, mililitros: 1, ml: 1,
        metros: 100, m: 100, centimetros: 1, cm: 1,
        unidades: 1
    };
    const uOrig = String(unidadOrigen).trim().toLowerCase();
    const uDest = String(unidadDestino).trim().toLowerCase();
    if (uOrig === uDest) return num;
    if (!factores[uOrig] || !factores[uDest]) return num;
    return Number(((num * factores[uOrig]) / factores[uDest]).toFixed(6));
}

export default function TabCatalogo({
    datos,
    cargarTodo,
    setMensaje,
    setError,
    limpiarAlertas,
    setSeccionActiva
}) {
    const configActual = datos?.configuracionNegocio || {};
    const usaStockDirecto = Boolean(configActual.usa_stock_directo ?? true);
    const usaVencimiento = Boolean(configActual.usa_vencimiento ?? false);

    // Sub-sección interna de Catálogo
    const [subSeccionCatalogo, setSubSeccionCatalogo] = useState('articulos'); // 'articulos' | 'modificadores' | 'kardex'

    // Categorías y Pestañas
    const [categoriaTabActiva, setCategoriaTabActiva] = useState('todas');
    const [mostrarModalNuevaCat, setMostrarModalNuevaCat] = useState(false);
    const [nuevaCatNombre, setNuevaCatNombre] = useState('');

    // Buscador y Paginación
    const [busquedaProductos, setBusquedaProductos] = useState('');
    const [paginaProductos, setPaginaProductos] = useState(1);
    const [limitePorPaginaProductos, setLimitePorPaginaProductos] = useState(10);

    // Formulario de Registro de Producto
    const [prodNombre, setProdNombre] = useState('');
    const [prodPrecio, setProdPrecio] = useState('');
    const [prodCategorias, setProdCategorias] = useState([]);
    const [tipoComposicion, setTipoComposicion] = useState('directo'); // 'directo' | 'unitario' | 'receta' | 'libre' | 'combo'
    const [prodDirectoStockIni, setProdDirectoStockIni] = useState('0');
    const [prodDirectoCostoIni, setProdDirectoCostoIni] = useState('0');
    const [prodDirectoStockMin, setProdDirectoStockMin] = useState('2');
    const [prodDirectoUnidad, setProdDirectoUnidad] = useState('unidades');
    const [prodDirectoVencimiento, setProdDirectoVencimiento] = useState('');
    const [insumoUnitarioId, setInsumoUnitarioId] = useState('');
    const [filasReceta, setFilasReceta] = useState([{ insumoId: '', cantidad: '', unidadReceta: '' }]);
    const [filasCombo, setFilasCombo] = useState([{ productoId: '', cantidad: '1' }]);
    const [comboModoLimite, setComboModoLimite] = useState('sin_limite');
    const [comboCantidadMaxima, setComboCantidadMaxima] = useState('50');
    const [comboUsaVigencia, setComboUsaVigencia] = useState(false);
    const [comboFechaInicio, setComboFechaInicio] = useState('');
    const [comboFechaFin, setComboFechaFin] = useState('');

    // Reabastecimiento de Artículo Directo (CPP)
    const [compraProdId, setCompraProdId] = useState('');
    const [compraProdCantidad, setCompraProdCantidad] = useState('');
    const [compraProdCostoTotal, setCompraProdCostoTotal] = useState('');
    const [compraProdProveedor, setCompraProdProveedor] = useState('');
    const [compraProdNit, setCompraProdNit] = useState('');
    const [compraProdNroFactura, setCompraProdNroFactura] = useState('');
    const [compraProdConFactura, setCompraProdConFactura] = useState(false);

    // Mermas de Productos Directos
    const [mermaProdId, setMermaProdId] = useState('');
    const [mermaProdCantidad, setMermaProdCantidad] = useState('');
    const [mermaProdMotivo, setMermaProdMotivo] = useState('');
    const [mermaProdConfirmando, setMermaProdConfirmando] = useState(false);
    const [mermaProdResultado, setMermaProdResultado] = useState(null);

    // Grupos de Modificadores
    const [nombreGrupoMod, setNombreGrupoMod] = useState('');
    const [tipoSeleccionGrupoMod, setTipoSeleccionGrupoMod] = useState('unica');
    const [esObligatorioGrupoMod, setEsObligatorioGrupoMod] = useState(false);
    const [opcionesGrupoMod, setOpcionesGrupoMod] = useState([
        { nombre: '', insumoId: '', cantidadInsumo: '0.2', precioAdicional: '0', insumoReemplazadoId: '', esDefault: false }
    ]);
    const [productoAsignarModId, setProductoAsignarModId] = useState('');
    const [gruposAsignarIds, setGruposAsignarIds] = useState([]);

    // Cálculo dinámico de costo y ganancia estimada
    const insumoUnitarioSeleccionado = (datos?.insumos || []).find((i) => String(i.id) === String(insumoUnitarioId));
    let costoEstimado = 0;
    if (tipoComposicion === 'directo') {
        costoEstimado = Number(prodDirectoCostoIni || 0);
    } else if (tipoComposicion === 'unitario') {
        costoEstimado = insumoUnitarioSeleccionado ? Number(insumoUnitarioSeleccionado.costo_por_unidad || 0) : 0;
    } else if (tipoComposicion === 'receta') {
        for (const f of filasReceta) {
            if (!f.insumoId || !f.cantidad) continue;
            const ins = (datos?.insumos || []).find((i) => String(i.id) === String(f.insumoId));
            if (!ins) continue;
            const cant = Number(f.cantidad) || 0;
            const convertida = f.unidadReceta
                ? convertirMedidaReceta(cant, f.unidadReceta, ins.unidad_medida)
                : cant;
            if (convertida !== null) {
                costoEstimado += convertida * Number(ins.costo_por_unidad || 0);
            }
        }
    } else if (tipoComposicion === 'combo') {
        for (const f of filasCombo) {
            if (!f.productoId || !f.cantidad) continue;
            const prodComp = (datos?.productos || []).find((p) => String(p.id) === String(f.productoId));
            if (!prodComp) continue;
            const cant = Number(f.cantidad) || 0;
            costoEstimado += cant * Number(prodComp.costo || 0);
        }
    }
    const gananciaEstimada = Number(prodPrecio || 0) - costoEstimado;
    const margenPorcentaje = Number(prodPrecio) > 0 ? (gananciaEstimada / Number(prodPrecio)) * 100 : 0;

    // Filtros de Productos
    const productosFiltrados = (datos?.productos || []).filter((p) => {
        if (categoriaTabActiva !== 'todas') {
            const cats = (p.categoria || '').split(',').map((c) => c.trim().toLowerCase());
            if (!cats.includes(categoriaTabActiva.toLowerCase())) return false;
        }
        if (busquedaProductos.trim()) {
            const term = busquedaProductos.toLowerCase();
            const enNombre = (p.nombre || '').toLowerCase().includes(term);
            const enCat = (p.categoria || '').toLowerCase().includes(term);
            const enTipo = (p.tipo_inventario || '').toLowerCase().includes(term);
            if (!enNombre && !enCat && !enTipo) return false;
        }
        return true;
    });

    const totalPaginasProductos = Math.max(1, Math.ceil(productosFiltrados.length / limitePorPaginaProductos));
    const paginaProductosValida = Math.min(Math.max(1, paginaProductos), totalPaginasProductos);
    const inicioProductos = (paginaProductosValida - 1) * limitePorPaginaProductos;
    const productosPaginados = productosFiltrados.slice(inicioProductos, inicioProductos + limitePorPaginaProductos);

    // Helpers de Categorías
    function toggleCategoriaProducto(nomCat) {
        if (!nomCat) return;
        setProdCategorias((prev) => {
            const existe = prev.some((c) => c.toLowerCase() === nomCat.toLowerCase());
            return existe ? prev.filter((c) => c.toLowerCase() !== nomCat.toLowerCase()) : [...prev, nomCat];
        });
    }

    async function handleCrearCategoria(e) {
        e?.preventDefault();
        const nom = nuevaCatNombre.trim();
        if (!nom) return;
        if (nom.toLowerCase() === 'todas') {
            setError?.('No puedes crear una categoría llamada "Todas".');
            return;
        }
        limpiarAlertas?.();
        try {
            const res = await crearCategoriaAction({ nombre: nom });
            if (!res.ok) throw new Error(res.error || 'Error al crear la categoría.');
            setMensaje?.(`Categoría "${nom}" creada exitosamente.`);
            setNuevaCatNombre('');
            setMostrarModalNuevaCat(false);
            setCategoriaTabActiva(nom);
            setProdCategorias((prev) => {
                const existe = prev.some((c) => c.toLowerCase() === nom.toLowerCase());
                return existe ? prev : [...prev, nom];
            });
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    // Helpers de Recetas
    function agregarFilaReceta() {
        if (filasReceta.length >= 30) {
            setError?.('Límite alcanzado: una receta no puede tener más de 30 insumos.');
            return;
        }
        const primerInsumo = (datos?.insumos || [])[0];
        setFilasReceta([
            ...filasReceta,
            {
                insumoId: primerInsumo ? String(primerInsumo.id) : '',
                cantidad: '',
                unidadReceta: primerInsumo ? primerInsumo.unidad_medida : 'unidades'
            }
        ]);
    }

    function quitarFilaReceta(index) {
        if (filasReceta.length <= 1) return;
        setFilasReceta(filasReceta.filter((_, i) => i !== index));
    }

    function cambiarFilaReceta(index, campo, valor) {
        const copia = [...filasReceta];
        copia[index] = { ...copia[index], [campo]: valor };
        if (campo === 'insumoId') {
            const ins = (datos?.insumos || []).find((i) => String(i.id) === String(valor));
            if (ins) {
                copia[index].unidadReceta = ins.unidad_medida;
            }
        }
        setFilasReceta(copia);
    }

    // Helpers de Modificadores
    function agregarOpcionGrupoMod() {
        const primerInsumo = (datos?.insumos || [])[0];
        setOpcionesGrupoMod((prev) => [
            ...prev,
            {
                nombre: '',
                insumoId: primerInsumo ? String(primerInsumo.id) : '',
                cantidadInsumo: '0.2',
                precioAdicional: '0',
                insumoReemplazadoId: '',
                esDefault: false
            }
        ]);
    }

    function quitarOpcionGrupoMod(idx) {
        if (opcionesGrupoMod.length <= 1) return;
        setOpcionesGrupoMod((prev) => prev.filter((_, i) => i !== idx));
    }

    function cambiarOpcionGrupoMod(idx, campo, valor) {
        const copia = [...opcionesGrupoMod];
        copia[idx] = { ...copia[idx], [campo]: valor };
        setOpcionesGrupoMod(copia);
    }

    function toggleGrupoAsignar(grupoId) {
        const idNum = Number(grupoId);
        setGruposAsignarIds((prev) =>
            prev.includes(idNum) ? prev.filter((id) => id !== idNum) : [...prev, idNum]
        );
    }

    async function handleCrearGrupoModificador(e) {
        e.preventDefault();
        limpiarAlertas?.();
        const nom = nombreGrupoMod.trim();
        if (!nom) {
            setError?.('Ingresa un nombre para el grupo de modificadores.');
            return;
        }
        const opsValidadas = opcionesGrupoMod
            .filter((o) => o.nombre && o.nombre.trim())
            .map((o) => ({
                nombre: o.nombre.trim(),
                insumoId: o.insumoId ? Number(o.insumoId) : null,
                cantidadInsumo: Number(o.cantidadInsumo || 0),
                precioAdicional: Number(o.precioAdicional || 0),
                insumoReemplazadoId: o.insumoReemplazadoId ? Number(o.insumoReemplazadoId) : null,
                esDefault: Boolean(o.esDefault)
            }));

        if (opsValidadas.length === 0) {
            setError?.('Debes agregar al menos una opción válida para el grupo.');
            return;
        }

        try {
            const res = await crearGrupoModificadorAction({
                nombre: nom,
                tipoSeleccion: tipoSeleccionGrupoMod,
                esObligatorio: esObligatorioGrupoMod,
                opciones: opsValidadas
            });
            if (!res.ok) throw new Error(res.error || 'Error al crear grupo de modificadores.');
            setMensaje?.(`Grupo "${nom}" creado exitosamente con ${opsValidadas.length} opción(es).`);
            setNombreGrupoMod('');
            setTipoSeleccionGrupoMod('unica');
            setEsObligatorioGrupoMod(false);
            const primerInsumo = (datos?.insumos || [])[0];
            setOpcionesGrupoMod([
                {
                    nombre: '',
                    insumoId: primerInsumo ? String(primerInsumo.id) : '',
                    cantidadInsumo: '0.2',
                    precioAdicional: '0',
                    insumoReemplazadoId: '',
                    esDefault: false
                }
            ]);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleEliminarGrupoModificador(grupoId, nombre) {
        if (!confirm(`¿Eliminar el grupo "${nombre}"? Sus opciones no se ofrecerán en nuevas ventas.`)) return;
        limpiarAlertas?.();
        try {
            const res = await eliminarGrupoModificadorAction({ grupoId });
            if (!res.ok) throw new Error(res.error || 'Error al eliminar grupo de modificadores.');
            setMensaje?.(`Grupo de complementos "${nombre}" eliminado.`);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    async function handleGuardarAsignacionModificadores(e) {
        e.preventDefault();
        limpiarAlertas?.();
        if (!productoAsignarModId) {
            setError?.('Selecciona un producto con receta para asignarle grupos de complementos.');
            return;
        }
        try {
            const res = await asignarModificadoresProductoAction({
                productoId: Number(productoAsignarModId),
                grupoIds: gruposAsignarIds
            });
            if (!res.ok) throw new Error(res.error || 'Error al asignar modificadores al producto.');
            setMensaje?.('Grupos de complementos asignados al producto exitosamente.');
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    // Creación de Producto
    async function handleCrearProducto(e) {
        e.preventDefault();
        limpiarAlertas?.();

        const catFinal = prodCategorias.join(', ');
        const payload = {
            nombre: prodNombre.trim(),
            precio: Number(prodPrecio),
            categoria: catFinal,
            tipoComposicion
        };

        if (tipoComposicion === 'directo') {
            payload.stockInicial = Number(prodDirectoStockIni || 0);
            payload.costoInicial = Number(prodDirectoCostoIni || 0);
            payload.stockMinimo = Number(prodDirectoStockMin || 2);
            payload.unidadMedida = prodDirectoUnidad || 'unidades';
            payload.fechaVencimiento = usaVencimiento && prodDirectoVencimiento ? prodDirectoVencimiento : null;
        } else if (tipoComposicion === 'unitario') {
            if (!insumoUnitarioId) {
                setError?.('Por favor selecciona el insumo de inventario para la venta unitaria.');
                return;
            }
            payload.insumoUnitarioId = Number(insumoUnitarioId);
        } else if (tipoComposicion === 'receta') {
            const insumosLimpio = filasReceta.filter((f) => f.insumoId && Number(f.cantidad) > 0);
            if (insumosLimpio.length === 0) {
                setError?.('Debes agregar al menos un insumo con cantidad mayor a 0 para la receta.');
                return;
            }
            if (insumosLimpio.length > 30) {
                setError?.('Límite excedido: No se pueden agregar más de 30 insumos en una receta.');
                return;
            }
            payload.insumosReceta = insumosLimpio;
        } else if (tipoComposicion === 'combo') {
            const componentesLimpio = filasCombo.filter((f) => f.productoId && Number(f.cantidad) > 0);
            if (componentesLimpio.length === 0) {
                setError?.('Debes agregar al menos un producto componente con cantidad mayor a 0 para el combo.');
                return;
            }
            payload.componentesCombo = componentesLimpio;
            payload.limiteMaximoActivo = comboModoLimite === 'cantidad_maxima';
            if (payload.limiteMaximoActivo) {
                const maxVal = Number(comboCantidadMaxima);
                if (!Number.isFinite(maxVal) || maxVal <= 0) {
                    setError?.('Debes indicar una cantidad máxima válida mayor a 0.');
                    return;
                }
                payload.limiteUnidadesTotal = maxVal;
            }
            if (comboUsaVigencia) {
                payload.fechaInicioVigencia = comboFechaInicio ? new Date(comboFechaInicio).toISOString() : null;
                payload.fechaFinVigencia = comboFechaFin ? new Date(comboFechaFin).toISOString() : null;
                if (payload.fechaInicioVigencia && payload.fechaFinVigencia && new Date(payload.fechaInicioVigencia) > new Date(payload.fechaFinVigencia)) {
                    setError?.('La fecha y hora de inicio no puede ser posterior a la fecha final.');
                    return;
                }
            } else {
                payload.fechaInicioVigencia = null;
                payload.fechaFinVigencia = null;
            }
        }

        try {
            const res = await crearProductoAction(payload);
            if (!res.ok) throw new Error(res.error || 'Error al crear producto.');
            setMensaje?.(`Artículo "${prodNombre}" registrado en el catálogo con costo y stock automáticos.`);
            setProdNombre('');
            setProdPrecio('');
            setProdDirectoStockIni('0');
            setProdDirectoCostoIni('0');
            setProdDirectoStockMin('2');
            setProdDirectoUnidad('unidades');
            setProdDirectoVencimiento('');
            setInsumoUnitarioId('');
            setFilasReceta([{ insumoId: '', cantidad: '', unidadReceta: '' }]);
            setFilasCombo([{ productoId: '', cantidad: '1' }]);
            setComboModoLimite('sin_limite');
            setComboCantidadMaxima('50');
            setComboUsaVigencia(false);
            setComboFechaInicio('');
            setComboFechaFin('');
            setProdCategorias(categoriaTabActiva !== 'todas' ? [categoriaTabActiva] : []);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    // Compra Directa
    async function handleComprarProductoDirecto(e) {
        e.preventDefault();
        limpiarAlertas?.();
        try {
            const res = await comprarProductoDirectoAction({
                productoId: Number(compraProdId),
                cantidadComprada: Number(compraProdCantidad),
                costoTotalCompra: Number(compraProdCostoTotal),
                fechaVencimiento: usaVencimiento ? compraProdVencimiento : null,
                proveedorNombre: compraProdProveedor.trim() || null,
                proveedorNit: compraProdNit.trim() || null,
                nroFacturaCompra: compraProdNroFactura.trim() || null,
                conFactura: compraProdConFactura
            });
            if (!res.ok) throw new Error(res.error || 'Error al registrar compra directa.');
            setMensaje?.('Entrada de stock registrada con Costo Promedio Ponderado (NIC 2) sobre el artículo.');
            setCompraProdCantidad('');
            setCompraProdCostoTotal('');
            setCompraProdProveedor('');
            setCompraProdNit('');
            setCompraProdNroFactura('');
            setCompraProdConFactura(false);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        }
    }

    // Merma Directa
    async function handleConfirmarMermaProductoDirecto() {
        limpiarAlertas?.();
        try {
            const prodSel = (datos?.productos || []).find((p) => String(p.id) === String(mermaProdId));
            if (!prodSel) throw new Error('Selecciona un producto directo válido.');
            const cant = Number(mermaProdCantidad);
            if (!Number.isFinite(cant) || cant <= 0) {
                throw new Error('La cantidad de merma debe ser mayor a 0.');
            }
            if (cant > Number(prodSel.stock || 0)) {
                throw new Error(`No puedes dar de baja ${cant} unidades porque el stock disponible es ${prodSel.stock}.`);
            }
            if (!mermaProdMotivo || mermaProdMotivo.trim().length < 3) {
                throw new Error('Ingresa un motivo descriptivo para la merma (mínimo 3 caracteres).');
            }

            const res = await mermaProductoDirectoAction({
                productoId: Number(mermaProdId),
                cantidadPerdida: cant,
                motivo: mermaProdMotivo.trim()
            });

            if (!res.ok) throw new Error(res.error || 'Error al registrar la merma.');

            const data = res.data?.mermaProducto || {};
            setMermaProdResultado({
                productoNombre: prodSel.nombre,
                cantidadPerdida: cant,
                unidadMedida: prodSel.unidad_medida || 'unidades',
                stockRestante: data.stockRestante ?? (Number(prodSel.stock) - cant),
                costoUnitario: data.costoUnitario ?? Number(prodSel.costo),
                costoPerdida: data.costoPerdida ?? (cant * Number(prodSel.costo)),
                motivo: mermaProdMotivo.trim()
            });
            setMermaProdCantidad('');
            setMermaProdMotivo('');
            setMermaProdConfirmando(false);
            setMensaje?.(`✅ Merma registrada: -${cant} ${prodSel.unidad_medida || 'u.'} de "${prodSel.nombre}".`);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
            setMermaProdConfirmando(false);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* SELECTOR DE SUB-SECCIÓN: ARTÍCULOS, MODIFICADORES O KARDEX */}
            <div style={{ display: 'flex', gap: '0.5rem', background: '#e2e8f0', padding: '0.35rem', borderRadius: '8px', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={() => setSubSeccionCatalogo('articulos')}
                    style={{
                        padding: '0.45rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontWeight: 'bold',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        background: subSeccionCatalogo === 'articulos' ? '#ffffff' : 'transparent',
                        color: subSeccionCatalogo === 'articulos' ? '#0f172a' : '#64748b',
                        boxShadow: subSeccionCatalogo === 'articulos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    📦 Artículos y Catálogo ({(datos?.productos || []).length})
                </button>
                <button
                    type="button"
                    onClick={() => setSubSeccionCatalogo('modificadores')}
                    style={{
                        padding: '0.45rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontWeight: 'bold',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        background: subSeccionCatalogo === 'modificadores' ? '#ffffff' : 'transparent',
                        color: subSeccionCatalogo === 'modificadores' ? '#0284c7' : '#64748b',
                        boxShadow: subSeccionCatalogo === 'modificadores' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    ✨ Complementos y Modificadores ({(datos?.gruposModificadores || []).length})
                </button>
                <button
                    type="button"
                    onClick={() => setSubSeccionCatalogo('kardex')}
                    style={{
                        padding: '0.45rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontWeight: 'bold',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        background: subSeccionCatalogo === 'kardex' ? '#ffffff' : 'transparent',
                        color: subSeccionCatalogo === 'kardex' ? '#15803d' : '#64748b',
                        boxShadow: subSeccionCatalogo === 'kardex' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    📜 Kardex Cronológico e Integridad
                </button>
            </div>

            {/* VISTA 1: KARDEX */}
            {subSeccionCatalogo === 'kardex' ? (
                <TabKardex
                    datos={datos}
                    cargarTodo={cargarTodo}
                    setMensaje={setMensaje}
                    setError={setError}
                    limpiarAlertas={limpiarAlertas}
                />
            ) : subSeccionCatalogo === 'modificadores' ? (
                /* VISTA 2: MODIFICADORES */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
                    {/* CREAR NUEVO GRUPO */}
                    <section style={cardStyle}>
                        <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>✨ Crear Grupo de Complementos / Modificadores</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                            Configura grupos como <em>"Tipo de Leche"</em> (reemplazo) o <em>"Extras / Jarabes"</em> (adiciones) con sus precios e insumos.
                        </p>

                        <form onSubmit={handleCrearGrupoModificador} style={formCol}>
                            <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                Nombre del Grupo:
                                <input
                                    type="text"
                                    placeholder="Ej. Tipo de Leche, Extras / Jarabes, Adicionales"
                                    required
                                    value={nombreGrupoMod}
                                    onChange={(e) => setNombreGrupoMod(e.target.value)}
                                    style={inputStyle}
                                />
                            </label>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.2rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 'bold' }}>Tipo de Selección:</label>
                                    <select
                                        value={tipoSeleccionGrupoMod}
                                        onChange={(e) => setTipoSeleccionGrupoMod(e.target.value)}
                                        style={inputStyle}
                                    >
                                        <option value="unica">🔘 Selección Única (Excluyente / Reemplazo)</option>
                                        <option value="multiple">☑️ Múltiples Opciones (Extras / Agregados)</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', marginTop: '1.4rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={esObligatorioGrupoMod}
                                            onChange={(e) => setEsObligatorioGrupoMod(e.target.checked)}
                                        />
                                        <strong>¿Obligatorio al cobrar?</strong>
                                    </label>
                                </div>
                            </div>

                            {/* OPCIONES DEL GRUPO */}
                            <div style={{ marginTop: '0.75rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                                        Opciones del Grupo ({opcionesGrupoMod.length})
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        Insumo, cantidad y recargo al cliente
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                    {opcionesGrupoMod.map((op, idx) => {
                                        const insumoActual = (datos?.insumos || []).find((i) => String(i.id) === String(op.insumoId));
                                        return (
                                            <div key={idx} style={{ background: '#fff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Nombre de la opción (Ej. Leche de Almendras, Shot Extra)"
                                                        required
                                                        value={op.nombre}
                                                        onChange={(e) => cambiarOpcionGrupoMod(idx, 'nombre', e.target.value)}
                                                        style={{ ...inputStyle, margin: 0, flex: 2 }}
                                                    />
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1 }}>
                                                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>+Bs</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            placeholder="0.00"
                                                            value={op.precioAdicional}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'precioAdicional', e.target.value)}
                                                            style={{ ...inputStyle, margin: 0 }}
                                                            title="Recargo adicional para el cliente"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => quitarOpcionGrupoMod(idx)}
                                                        disabled={opcionesGrupoMod.length <= 1}
                                                        style={{
                                                            background: '#fee2e2',
                                                            color: '#b91c1c',
                                                            border: '1px solid #fecaca',
                                                            borderRadius: '4px',
                                                            padding: '0.4rem 0.6rem',
                                                            cursor: opcionesGrupoMod.length <= 1 ? 'not-allowed' : 'pointer',
                                                            fontSize: '0.85rem'
                                                        }}
                                                        title="Quitar opción"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.4rem', alignItems: 'center', fontSize: '0.8rem' }}>
                                                    <div>
                                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Insumo que descuenta:</span>
                                                        <select
                                                            value={op.insumoId}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'insumoId', e.target.value)}
                                                            style={{ ...inputStyle, margin: 0, fontSize: '0.8rem', padding: '0.35rem' }}
                                                        >
                                                            <option value="">-- Sin insumo físico --</option>
                                                            {(datos?.insumos || []).map((ins) => (
                                                                <option key={ins.id} value={ins.id}>
                                                                    {ins.nombre} ({ins.unidad_medida})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Cantidad ({insumoActual?.unidad_medida || 'u.'}):</span>
                                                        <input
                                                            type="number"
                                                            step="0.001"
                                                            min="0"
                                                            placeholder="0.2"
                                                            value={op.cantidadInsumo}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'cantidadInsumo', e.target.value)}
                                                            style={{ ...inputStyle, margin: 0, fontSize: '0.8rem', padding: '0.35rem' }}
                                                        />
                                                    </div>

                                                    <div>
                                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Insumo que sustituye:</span>
                                                        <select
                                                            value={op.insumoReemplazadoId}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'insumoReemplazadoId', e.target.value)}
                                                            style={{ ...inputStyle, margin: 0, fontSize: '0.8rem', padding: '0.35rem' }}
                                                        >
                                                            <option value="">-- Ninguno (Es extra/adicional) --</option>
                                                            {(datos?.insumos || []).map((ins) => (
                                                                <option key={ins.id} value={ins.id}>
                                                                    Sustituye a: {ins.nombre}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '1rem', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={op.esDefault}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'esDefault', e.target.checked)}
                                                        />
                                                        <span style={{ fontSize: '0.72rem', color: '#334155' }}>Por defecto</span>
                                                    </label>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <button
                                        type="button"
                                        onClick={agregarOpcionGrupoMod}
                                        style={{
                                            width: '100%',
                                            padding: '0.45rem',
                                            background: '#f1f5f9',
                                            color: '#0284c7',
                                            border: '1px dashed #cbd5e1',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '0.82rem',
                                            fontWeight: 'bold'
                                        }}
                                    >
                                        ➕ Agregar otra opción al grupo
                                    </button>
                                </div>
                            </div>

                            <button type="submit" style={{ ...btnPrimario, marginTop: '0.75rem', padding: '0.7rem' }}>
                                ✅ Guardar Grupo de Modificadores
                            </button>
                        </form>
                    </section>

                    {/* ASIGNACIÓN A PRODUCTOS Y LISTADO EXISTENTE */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <section style={cardStyle}>
                            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>🔗 Asignar a Productos con Receta</h3>
                            <p style={{ color: '#64748b', fontSize: '0.84rem', marginTop: 0 }}>
                                Indica qué productos con receta ofrecerán estos modificadores en la pantalla de cobro.
                            </p>

                            <form onSubmit={handleGuardarAsignacionModificadores} style={formCol}>
                                <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                    Selecciona el Producto con Receta:
                                    <select
                                        value={productoAsignarModId}
                                        onChange={(e) => {
                                            const pId = e.target.value;
                                            setProductoAsignarModId(pId);
                                            const prod = (datos?.productos || []).find((p) => String(p.id) === String(pId));
                                            setGruposAsignarIds(prod?.grupos_modificadores_ids || []);
                                        }}
                                        style={inputStyle}
                                        required
                                    >
                                        <option value="">-- Elige un producto con receta --</option>
                                        {(datos?.productos || [])
                                            .filter((p) => p.tipo_inventario === 'receta')
                                            .map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.nombre} (Bs {Number(p.precio).toFixed(2)})
                                                </option>
                                            ))}
                                    </select>
                                </label>

                                {productoAsignarModId && (
                                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '0.4rem' }}>
                                            Grupos que aplican a este producto:
                                        </div>
                                        {(datos?.gruposModificadores || []).length === 0 ? (
                                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>No hay grupos creados todavía.</p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                {(datos?.gruposModificadores || []).map((g) => (
                                                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', color: '#334155', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={gruposAsignarIds.includes(g.id)}
                                                            onChange={() => toggleGrupoAsignar(g.id)}
                                                        />
                                                        <strong>{g.nombre}</strong>
                                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            ({g.tipo_seleccion === 'unica' ? 'Única' : 'Múltiple'} • {g.opciones?.length || 0} opciones)
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button type="submit" disabled={!productoAsignarModId} style={{ ...btnOscuro, padding: '0.5rem', fontSize: '0.85rem' }}>
                                    Guardar Asignación
                                </button>
                            </form>
                        </section>

                        <section style={cardStyle}>
                            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>
                                📋 Grupos Registrados ({(datos?.gruposModificadores || []).length})
                            </h3>
                            {(datos?.gruposModificadores || []).length === 0 ? (
                                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>No hay grupos registrados.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {(datos?.gruposModificadores || []).map((g) => (
                                        <div key={g.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', background: '#f8fafc' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 'bold', fontSize: '0.92rem', color: '#0f172a' }}>
                                                    {g.nombre}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleEliminarGrupoModificador(g.id, g.nombre)}
                                                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}
                                                    title="Eliminar grupo"
                                                >
                                                    🗑️ Eliminar
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                                                {g.tipo_seleccion === 'unica' ? '🔘 Selección única' : '☑️ Selección múltiple'}
                                                {g.es_obligatorio ? ' • Obligatorio' : ' • Opcional'}
                                            </div>
                                            <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                {(g.opciones || []).map((op) => (
                                                    <span
                                                        key={op.id}
                                                        style={{
                                                            fontSize: '0.72rem',
                                                            background: '#ffffff',
                                                            border: '1px solid #cbd5e1',
                                                            padding: '0.15rem 0.45rem',
                                                            borderRadius: '4px',
                                                            color: '#334155'
                                                        }}
                                                    >
                                                        {op.nombre} {Number(op.precio_adicional || 0) > 0 ? `(+Bs ${Number(op.precio_adicional).toFixed(2)})` : ''}
                                                        {op.insumo_reemplazado_nombre ? ` (Sustituye: ${op.insumo_reemplazado_nombre})` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            ) : (
                /* VISTA 3: ARTÍCULOS */
                <>
                    {/* BARRA DE CATEGORÍAS */}
                    <div style={{ background: '#fff', padding: '0.85rem 1.25rem', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', marginRight: '0.25rem' }}>
                                Categorías:
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setCategoriaTabActiva('todas');
                                    setPaginaProductos(1);
                                }}
                                style={{
                                    padding: '0.4rem 0.9rem',
                                    borderRadius: '999px',
                                    border: 'none',
                                    fontWeight: 'bold',
                                    fontSize: '0.84rem',
                                    cursor: 'pointer',
                                    background: categoriaTabActiva === 'todas' ? '#0284c7' : '#f1f5f9',
                                    color: categoriaTabActiva === 'todas' ? '#fff' : '#334155'
                                }}
                            >
                                🌐 Todas ({(datos?.productos || []).length})
                            </button>
                            {(datos?.categorias || []).map((cat) => {
                                const cant = (datos?.productos || []).filter((p) => {
                                    const cats = (p.categoria || '').split(',').map((c) => c.trim().toLowerCase());
                                    return cats.includes(cat.nombre?.toLowerCase());
                                }).length;
                                const activa = categoriaTabActiva.toLowerCase() === cat.nombre?.toLowerCase();
                                return (
                                    <button
                                        key={cat.id || cat.nombre}
                                        type="button"
                                        onClick={() => {
                                            setCategoriaTabActiva(cat.nombre);
                                            setProdCategorias([cat.nombre]);
                                            setPaginaProductos(1);
                                        }}
                                        style={{
                                            padding: '0.4rem 0.9rem',
                                            borderRadius: '999px',
                                            border: 'none',
                                            fontWeight: 'bold',
                                            fontSize: '0.84rem',
                                            cursor: 'pointer',
                                            background: activa ? '#0284c7' : '#f1f5f9',
                                            color: activa ? '#fff' : '#334155'
                                        }}
                                    >
                                        🏷️ {cat.nombre} ({cant})
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() => setMostrarModalNuevaCat(!mostrarModalNuevaCat)}
                                style={{
                                    padding: '0.35rem 0.8rem',
                                    borderRadius: '999px',
                                    border: '1px dashed #0284c7',
                                    background: '#f0f9ff',
                                    color: '#0284c7',
                                    fontWeight: 'bold',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer'
                                }}
                            >
                                ➕ {mostrarModalNuevaCat ? 'Cancelar' : 'Nueva Categoría'}
                            </button>
                        </div>

                        {mostrarModalNuevaCat && (
                            <form onSubmit={handleCrearCategoria} style={{ marginTop: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                <input
                                    type="text"
                                    placeholder="Nombre de la nueva categoría (Ej. Bebidas, Repuestos, Postres)"
                                    required
                                    value={nuevaCatNombre}
                                    onChange={(e) => setNuevaCatNombre(e.target.value)}
                                    style={{ ...inputStyle, margin: 0, flex: 1 }}
                                />
                                <button type="submit" style={{ ...btnPrimario, padding: '0.55rem 1rem' }}>
                                    Guardar Categoría
                                </button>
                            </form>
                        )}
                    </div>

                    {/* CUERPO PRINCIPAL DEL CATÁLOGO */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
                        {/* FORMULARIO DE REGISTRO */}
                        <section style={cardStyle}>
                            <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>📦 Registrar Artículo / Producto</h3>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '1rem' }}>
                                El costo y la disponibilidad se calculan matemáticamente de forma automática a partir de los insumos seleccionados.
                            </p>

                            <form onSubmit={handleCrearProducto} style={formCol}>
                                <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                    Nombre del Artículo / Producto:
                                    <input
                                        placeholder="Ej. Café Capuchino, Filtro de Aceite, Tarta de Chocolate"
                                        required
                                        value={prodNombre}
                                        onChange={(e) => setProdNombre(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>

                                <label style={{ fontSize: '0.85rem', color: '#334155' }}>
                                    Precio de Venta al Público (Bs):
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        placeholder="Ej. 25.00"
                                        required
                                        value={prodPrecio}
                                        onChange={(e) => setProdPrecio(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>

                                {/* BARRA DE ASIGNACIÓN MÚLTIPLE DE CATEGORÍAS */}
                                <div style={{ marginTop: '0.2rem', marginBottom: '0.4rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                                            Categorías del Producto:
                                        </span>
                                    </div>

                                    <div style={{
                                        display: 'flex',
                                        gap: '0.45rem',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        padding: '0.65rem 0.85rem',
                                        background: '#f8fafc',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        minHeight: '44px'
                                    }}>
                                        {(!datos?.categorias || datos.categorias.length === 0) ? (
                                            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                                Aún no hay categorías registradas.
                                            </div>
                                        ) : (
                                            datos.categorias.map((cat) => {
                                                const seleccionada = prodCategorias.some(
                                                    (c) => c.toLowerCase() === cat.nombre?.toLowerCase()
                                                );
                                                return (
                                                    <button
                                                        key={cat.id || cat.nombre}
                                                        type="button"
                                                        onClick={() => toggleCategoriaProducto(cat.nombre)}
                                                        style={{
                                                            padding: '0.35rem 0.8rem',
                                                            borderRadius: '999px',
                                                            border: seleccionada ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                            fontWeight: 'bold',
                                                            fontSize: '0.82rem',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.35rem',
                                                            background: seleccionada ? '#0284c7' : '#ffffff',
                                                            color: seleccionada ? '#ffffff' : '#334155',
                                                            boxShadow: seleccionada ? '0 1px 2px rgba(2,132,199,0.2)' : 'none'
                                                        }}
                                                    >
                                                        <span>{seleccionada ? '✓' : '🏷️'}</span>
                                                        <span>{cat.nombre}</span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                    {prodCategorias.length > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem' }}>
                                            <span style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: 500 }}>
                                                Asignadas: <strong>{prodCategorias.join(', ')}</strong>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setProdCategorias([])}
                                                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                                            >
                                                Limpiar selección
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* MODO DE COMPOSICIÓN */}
                                <div style={{ marginTop: '0.4rem' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '0.4rem' }}>
                                        Composición y Origen de Inventario:
                                    </span>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: '0.35rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setTipoComposicion('directo')}
                                            style={{
                                                padding: '0.55rem 0.35rem',
                                                borderRadius: '8px',
                                                border: tipoComposicion === 'directo' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                background: tipoComposicion === 'directo' ? '#f0f9ff' : '#fff',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                fontSize: '0.78rem'
                                            }}
                                        >
                                            <strong>📦 Directo</strong>
                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>Stock propio</div>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setTipoComposicion('unitario')}
                                            style={{
                                                padding: '0.55rem 0.35rem',
                                                borderRadius: '8px',
                                                border: tipoComposicion === 'unitario' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                background: tipoComposicion === 'unitario' ? '#f0f9ff' : '#fff',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                fontSize: '0.78rem'
                                            }}
                                        >
                                            <strong>🔗 Unitario</strong>
                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>1 a 1 Insumo</div>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setTipoComposicion('receta')}
                                            style={{
                                                padding: '0.55rem 0.35rem',
                                                borderRadius: '8px',
                                                border: tipoComposicion === 'receta' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                background: tipoComposicion === 'receta' ? '#f0f9ff' : '#fff',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                fontSize: '0.78rem'
                                            }}
                                        >
                                            <strong>🧪 Receta</strong>
                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>Insumos</div>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setTipoComposicion('combo')}
                                            style={{
                                                padding: '0.55rem 0.35rem',
                                                borderRadius: '8px',
                                                border: tipoComposicion === 'combo' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                background: tipoComposicion === 'combo' ? '#f0f9ff' : '#fff',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                fontSize: '0.78rem'
                                            }}
                                        >
                                            <strong>🎁 Combo</strong>
                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>Agrupa</div>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setTipoComposicion('libre')}
                                            style={{
                                                padding: '0.55rem 0.35rem',
                                                borderRadius: '8px',
                                                border: tipoComposicion === 'libre' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                                background: tipoComposicion === 'libre' ? '#f0f9ff' : '#fff',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                fontSize: '0.78rem'
                                            }}
                                        >
                                            <strong>✨ Libre</strong>
                                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>Servicio</div>
                                        </button>
                                    </div>
                                </div>

                                {/* CAMPOS ESPECÍFICOS POR TIPO */}
                                {tipoComposicion === 'directo' && (
                                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                Stock Inicial:
                                                <input
                                                    type="number"
                                                    step="1"
                                                    min="0"
                                                    required
                                                    value={prodDirectoStockIni}
                                                    onChange={(e) => setProdDirectoStockIni(e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </label>
                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                Costo Inicial (Bs):
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    required
                                                    value={prodDirectoCostoIni}
                                                    onChange={(e) => setProdDirectoCostoIni(e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </label>
                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                Stock Mínimo (Alerta):
                                                <input
                                                    type="number"
                                                    step="1"
                                                    min="0"
                                                    value={prodDirectoStockMin}
                                                    onChange={(e) => setProdDirectoStockMin(e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </label>
                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                Unidad de Medida:
                                                <input
                                                    type="text"
                                                    value={prodDirectoUnidad}
                                                    onChange={(e) => setProdDirectoUnidad(e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </label>
                                        </div>
                                        {usaVencimiento && (
                                            <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                Fecha de Vencimiento (Opcional):
                                                <input
                                                    type="date"
                                                    value={prodDirectoVencimiento}
                                                    onChange={(e) => setProdDirectoVencimiento(e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </label>
                                        )}
                                    </div>
                                )}

                                {tipoComposicion === 'unitario' && (
                                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <label style={{ fontSize: '0.84rem', color: '#334155' }}>
                                            Selecciona el Insumo del Inventario:
                                            <select
                                                required
                                                value={insumoUnitarioId}
                                                onChange={(e) => setInsumoUnitarioId(e.target.value)}
                                                style={inputStyle}
                                            >
                                                <option value="">-- Elige el insumo/artículo a vender --</option>
                                                {(datos?.insumos || []).map((ins) => (
                                                    <option key={ins.id} value={ins.id}>
                                                        {ins.nombre} (Stock: {ins.stock_actual} {ins.unidad_medida} | Costo: Bs {Number(ins.costo_por_unidad).toFixed(2)})
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                )}

                                {tipoComposicion === 'receta' && (
                                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.84rem', fontWeight: 'bold', color: '#334155' }}>
                                                Insumos y Materiales de la Receta:
                                            </span>
                                            <span style={{ fontSize: '0.78rem', color: filasReceta.length >= 30 ? '#dc2626' : '#0284c7', fontWeight: 'bold' }}>
                                                {filasReceta.length} / 30 insumos
                                            </span>
                                        </div>

                                        {filasReceta.map((fila, index) => {
                                            const insSel = (datos?.insumos || []).find((i) => String(i.id) === String(fila.insumoId));
                                            const unidadAlm = insSel ? insSel.unidad_medida : 'unidades';
                                            const opcionesComp = obtenerUnidadesCompatibles(unidadAlm);
                                            return (
                                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 34px', gap: '0.4rem', marginBottom: '0.45rem', alignItems: 'center' }}>
                                                    <select
                                                        required
                                                        value={fila.insumoId}
                                                        onChange={(e) => cambiarFilaReceta(index, 'insumoId', e.target.value)}
                                                        style={{ ...inputStyle, margin: 0, fontSize: '0.82rem' }}
                                                    >
                                                        <option value="">-- Insumo --</option>
                                                        {(datos?.insumos || []).map((i) => (
                                                            <option key={i.id} value={i.id}>
                                                                {i.nombre} ({i.unidad_medida})
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        min="0.001"
                                                        required
                                                        placeholder="Cantidad"
                                                        value={fila.cantidad}
                                                        onChange={(e) => cambiarFilaReceta(index, 'cantidad', e.target.value)}
                                                        style={{ ...inputStyle, margin: 0, fontSize: '0.82rem' }}
                                                    />

                                                    <select
                                                        value={fila.unidadReceta || unidadAlm}
                                                        onChange={(e) => cambiarFilaReceta(index, 'unidadReceta', e.target.value)}
                                                        style={{ ...inputStyle, margin: 0, fontSize: '0.82rem' }}
                                                    >
                                                        {opcionesComp.map((o) => (
                                                            <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                                                        ))}
                                                    </select>

                                                    <button
                                                        type="button"
                                                        disabled={filasReceta.length <= 1}
                                                        onClick={() => quitarFilaReceta(index)}
                                                        style={{
                                                            padding: '0.4rem',
                                                            background: filasReceta.length <= 1 ? '#e2e8f0' : '#fee2e2',
                                                            color: filasReceta.length <= 1 ? '#94a3b8' : '#b91c1c',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: filasReceta.length <= 1 ? 'not-allowed' : 'pointer',
                                                            fontWeight: 'bold'
                                                        }}
                                                        title="Quitar este insumo"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            );
                                        })}

                                        <button
                                            type="button"
                                            disabled={filasReceta.length >= 30}
                                            onClick={agregarFilaReceta}
                                            style={{
                                                width: '100%',
                                                marginTop: '0.25rem',
                                                padding: '0.4rem',
                                                background: '#f1f5f9',
                                                color: '#0284c7',
                                                border: '1px dashed #cbd5e1',
                                                borderRadius: '6px',
                                                cursor: filasReceta.length >= 30 ? 'not-allowed' : 'pointer',
                                                fontSize: '0.82rem',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            ➕ Agregar otro insumo a la receta ({filasReceta.length}/30)
                                        </button>
                                    </div>
                                )}

                                {tipoComposicion === 'combo' && (
                                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.84rem', fontWeight: 'bold', color: '#334155' }}>
                                                Productos Componentes del Combo:
                                            </span>
                                            <span style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 'bold' }}>
                                                {filasCombo.length} / 20 productos
                                            </span>
                                        </div>

                                        {filasCombo.map((fila, index) => (
                                            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 34px', gap: '0.4rem', alignItems: 'center' }}>
                                                <select
                                                    required
                                                    value={fila.productoId}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFilasCombo((prev) => prev.map((f, i) => i === index ? { ...f, productoId: val } : f));
                                                    }}
                                                    style={{ ...inputStyle, padding: '0.4rem', fontSize: '0.82rem' }}
                                                >
                                                    <option value="">-- Selecciona producto --</option>
                                                    {(datos?.productos || [])
                                                        .filter((p) => p.tipo_inventario !== 'combo')
                                                        .map((prod) => (
                                                            <option key={prod.id} value={prod.id}>
                                                                {prod.nombre} (Costo: Bs {Number(prod.costo || 0).toFixed(2)} | {prod.tipo_inventario})
                                                            </option>
                                                        ))}
                                                </select>
                                                <input
                                                    type="number"
                                                    step="1"
                                                    min="1"
                                                    required
                                                    placeholder="Cantidad"
                                                    value={fila.cantidad}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFilasCombo((prev) => prev.map((f, i) => i === index ? { ...f, cantidad: val } : f));
                                                    }}
                                                    style={{ ...inputStyle, padding: '0.4rem', fontSize: '0.82rem' }}
                                                />
                                                <button
                                                    type="button"
                                                    disabled={filasCombo.length <= 1}
                                                    onClick={() => {
                                                        if (filasCombo.length <= 1) return;
                                                        setFilasCombo((prev) => prev.filter((_, i) => i !== index));
                                                    }}
                                                    style={{
                                                        padding: '0.4rem',
                                                        background: filasCombo.length <= 1 ? '#e2e8f0' : '#fee2e2',
                                                        color: filasCombo.length <= 1 ? '#94a3b8' : '#b91c1c',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: filasCombo.length <= 1 ? 'not-allowed' : 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                    title="Quitar este componente"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}

                                        <button
                                            type="button"
                                            disabled={filasCombo.length >= 20}
                                            onClick={() => setFilasCombo((prev) => [...prev, { productoId: '', cantidad: '1' }])}
                                            style={{
                                                width: '100%',
                                                padding: '0.4rem',
                                                background: '#f1f5f9',
                                                color: '#0284c7',
                                                border: '1px dashed #cbd5e1',
                                                borderRadius: '6px',
                                                cursor: filasCombo.length >= 20 ? 'not-allowed' : 'pointer',
                                                fontSize: '0.82rem',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            ➕ Agregar otro producto al combo ({filasCombo.length}/20)
                                        </button>

                                        {/* Modo de Límite */}
                                        <div style={{ marginTop: '0.4rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
                                            <span style={{ fontSize: '0.84rem', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
                                                Modo de Límite de Venta:
                                            </span>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', background: '#fff', padding: '0.5rem', borderRadius: '6px', border: comboModoLimite === 'sin_limite' ? '2px solid #0284c7' : '1px solid #cbd5e1', cursor: 'pointer' }}>
                                                    <input
                                                        type="radio"
                                                        name="modo_combo"
                                                        checked={comboModoLimite === 'sin_limite'}
                                                        onChange={() => setComboModoLimite('sin_limite')}
                                                    />
                                                    <span><strong>Sin límite</strong></span>
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', background: '#fff', padding: '0.5rem', borderRadius: '6px', border: comboModoLimite === 'cantidad_maxima' ? '2px solid #0284c7' : '1px solid #cbd5e1', cursor: 'pointer' }}>
                                                    <input
                                                        type="radio"
                                                        name="modo_combo"
                                                        checked={comboModoLimite === 'cantidad_maxima'}
                                                        onChange={() => setComboModoLimite('cantidad_maxima')}
                                                    />
                                                    <span><strong>Cantidad máxima</strong></span>
                                                </label>
                                            </div>

                                            {comboModoLimite === 'cantidad_maxima' && (
                                                <div style={{ marginBottom: '0.5rem' }}>
                                                    <label style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                        Número máximo de combos a vender:
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            step="1"
                                                            required
                                                            value={comboCantidadMaxima}
                                                            onChange={(e) => setComboCantidadMaxima(e.target.value)}
                                                            style={{ ...inputStyle, marginTop: '0.2rem' }}
                                                        />
                                                    </label>
                                                </div>
                                            )}
                                        </div>

                                        {/* Vigencia Temporal */}
                                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={comboUsaVigencia}
                                                    onChange={(e) => setComboUsaVigencia(e.target.checked)}
                                                />
                                                Programar vigencia temporal (Fecha y Hora)
                                            </label>

                                            {comboUsaVigencia && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.4rem' }}>
                                                    <label style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                        Válido Desde:
                                                        <input
                                                            type="datetime-local"
                                                            value={comboFechaInicio}
                                                            onChange={(e) => setComboFechaInicio(e.target.value)}
                                                            style={{ ...inputStyle, marginTop: '0.2rem', fontSize: '0.8rem' }}
                                                        />
                                                    </label>
                                                    <label style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                        Válido Hasta:
                                                        <input
                                                            type="datetime-local"
                                                            value={comboFechaFin}
                                                            onChange={(e) => setComboFechaFin(e.target.value)}
                                                            style={{ ...inputStyle, marginTop: '0.2rem', fontSize: '0.8rem' }}
                                                        />
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {tipoComposicion === 'libre' && (
                                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.82rem', color: '#64748b' }}>
                                        ✨ <em>Este producto se registrará como servicio o venta libre sin descontar stock físico del inventario.</em>
                                    </div>
                                )}

                                {/* Panel de cálculo en vivo */}
                                <div style={{ background: '#f0fdf4', padding: '0.85rem', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-around', alignItems: 'center', textAlign: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', fontWeight: 'bold' }}>Costo Calculado</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#15803d' }}>
                                            Bs {costoEstimado.toFixed(2)}
                                        </div>
                                    </div>
                                    <div style={{ borderLeft: '1px solid #86efac', height: '35px' }} />
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', fontWeight: 'bold' }}>Ganancia Estimada</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: gananciaEstimada >= 0 ? '#15803d' : '#b91c1c' }}>
                                            Bs {gananciaEstimada.toFixed(2)}
                                        </div>
                                    </div>
                                    <div style={{ borderLeft: '1px solid #86efac', height: '35px' }} />
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', fontWeight: 'bold' }}>Margen Comercial</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: margenPorcentaje >= 0 ? '#0284c7' : '#b91c1c' }}>
                                            {margenPorcentaje.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>

                                <button type="submit" style={{ ...btnPrimario, marginTop: '0.5rem', padding: '0.75rem' }}>
                                    ✅ Guardar Producto en Catálogo
                                </button>
                            </form>
                        </section>

                        {/* COLUMNA DERECHA: REABASTECIMIENTO Y MERMAS */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <section style={cardStyle}>
                                <h3 style={{ marginTop: 0 }}>🧱 Materiales e Insumos en Almacén</h3>
                                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                        <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                            <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                                <th style={{ padding: '0.4rem' }}>Insumo</th>
                                                <th style={{ padding: '0.4rem' }}>Stock</th>
                                                <th style={{ padding: '0.4rem' }}>Costo Unit.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(datos?.insumos || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan="3" style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>
                                                        Aún no tienes insumos registrados.
                                                    </td>
                                                </tr>
                                            ) : (
                                                (datos?.insumos || []).map((ins) => (
                                                    <tr key={ins.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '0.4rem' }}><strong>{ins.nombre}</strong></td>
                                                        <td style={{ padding: '0.4rem' }}>{ins.stock_actual} {ins.unidad_medida}</td>
                                                        <td style={{ padding: '0.4rem' }}>Bs {Number(ins.costo_por_unidad).toFixed(2)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ marginTop: '0.75rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => { limpiarAlertas?.(); setSeccionActiva?.('insumos'); }}
                                        style={{ ...btnSecundario, width: '100%', fontSize: '0.82rem', padding: '0.45rem', textAlign: 'center' }}
                                    >
                                        🚚 Ir a Reabastecer Insumos
                                    </button>
                                </div>
                            </section>

                            {usaStockDirecto && (
                                <>
                                    {/* REABASTECER ARTÍCULO DIRECTO */}
                                    <section style={cardStyle}>
                                        <h3 style={{ marginTop: 0, fontSize: '0.98rem' }}>🚚 Reabastecer Artículo Directo (NIC 2)</h3>
                                        {(() => {
                                            const productosDirectos = (datos?.productos || []).filter((p) => p.tipo_inventario === 'directo');
                                            if (productosDirectos.length === 0) {
                                                return (
                                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                                                        No hay artículos de reventa directa registrados.
                                                    </p>
                                                );
                                            }
                                            return (
                                                <form onSubmit={handleComprarProductoDirecto} style={formCol}>
                                                    <select value={compraProdId} onChange={(e) => setCompraProdId(e.target.value)} style={inputStyle}>
                                                        <option value="">-- Selecciona el artículo directo --</option>
                                                        {productosDirectos.map((p) => (
                                                            <option key={p.id} value={p.id}>
                                                                {p.nombre} (Stock: {p.stock ?? 0} {p.unidad_medida || 'u.'} | Costo: Bs {Number(p.costo).toFixed(2)})
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                                        <input type="number" step="0.01" min="0.01" placeholder="Cantidad" required value={compraProdCantidad} onChange={(e) => setCompraProdCantidad(e.target.value)} style={inputStyle} />
                                                        <input type="number" step="0.01" min="0" placeholder="Costo Total (Bs)" required value={compraProdCostoTotal} onChange={(e) => setCompraProdCostoTotal(e.target.value)} style={inputStyle} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Proveedor / Distribuidora (Opcional)"
                                                        value={compraProdProveedor}
                                                        onChange={(e) => setCompraProdProveedor(e.target.value)}
                                                        style={{ ...inputStyle, fontSize: '0.8rem' }}
                                                    />
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                                        <input
                                                            type="text"
                                                            placeholder="NIT Proveedor (Opc.)"
                                                            value={compraProdNit}
                                                            onChange={(e) => setCompraProdNit(e.target.value)}
                                                            style={{ ...inputStyle, fontSize: '0.8rem' }}
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="N° Factura (Opc.)"
                                                            value={compraProdNroFactura}
                                                            onChange={(e) => {
                                                                setCompraProdNroFactura(e.target.value);
                                                                if (e.target.value.trim() !== '') setCompraProdConFactura(true);
                                                            }}
                                                            style={{ ...inputStyle, fontSize: '0.8rem' }}
                                                        />
                                                    </div>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#1e293b', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={compraProdConFactura}
                                                            onChange={(e) => setCompraProdConFactura(e.target.checked)}
                                                        />
                                                        <span>🧾 Compra con Factura Fiscal (Crédito Fiscal IVA)</span>
                                                    </label>
                                                    <button type="submit" style={{ ...btnOscuro, padding: '0.45rem', fontSize: '0.82rem' }}>Registrar Entrada CPP</button>
                                                </form>
                                            );
                                        })()}
                                    </section>

                                    {/* REGISTRAR MERMA PRODUCTO DIRECTO */}
                                    <section style={{ ...cardStyle, border: '1px solid #fecaca', background: '#fffdfd' }}>
                                        <h3 style={{ marginTop: 0, fontSize: '0.98rem', color: '#991b1b' }}>
                                            ⚠️ Registrar Merma / Baja de Producto Directo
                                        </h3>
                                        {(() => {
                                            const productosDirectos = (datos?.productos || []).filter((p) => p.tipo_inventario === 'directo');
                                            if (productosDirectos.length === 0) {
                                                return (
                                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                                                        No hay productos directos registrados para dar de baja por merma.
                                                    </p>
                                                );
                                            }
                                            const prodMermaSel = productosDirectos.find((p) => String(p.id) === String(mermaProdId)) || productosDirectos[0];
                                            const stockActualProd = Number(prodMermaSel?.stock ?? 0);
                                            const costoUnitProd = Number(prodMermaSel?.costo ?? 0);
                                            const cantBajaNum = Number(mermaProdCantidad) || 0;
                                            const costoEstimadoPerdida = Number((Math.max(0, cantBajaNum) * costoUnitProd).toFixed(2));
                                            const superaStock = cantBajaNum > stockActualProd;
                                            const cantidadInvalidaMerma = mermaProdCantidad !== '' && (cantBajaNum <= 0 || superaStock);

                                            return (
                                                <div style={formCol}>
                                                    <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                        1. Seleccionar Producto Directo:
                                                        <select
                                                            value={mermaProdId || prodMermaSel?.id}
                                                            onChange={(e) => {
                                                                setMermaProdId(e.target.value);
                                                                setMermaProdConfirmando(false);
                                                                setMermaProdResultado(null);
                                                            }}
                                                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                                                        >
                                                            {productosDirectos.map((p) => (
                                                                <option key={p.id} value={p.id}>
                                                                    {p.nombre} (Stock: {p.stock ?? 0} {p.unidad_medida || 'u.'} | CPP: Bs {Number(p.costo).toFixed(2)})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', alignItems: 'end' }}>
                                                        <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                            2. Cantidad a Dar de Baja:
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                min="1"
                                                                max={stockActualProd}
                                                                placeholder={`Máx: ${stockActualProd}`}
                                                                value={mermaProdCantidad}
                                                                onChange={(e) => {
                                                                    setMermaProdCantidad(e.target.value);
                                                                    setMermaProdConfirmando(false);
                                                                }}
                                                                style={{
                                                                    ...inputStyle,
                                                                    marginTop: '0.25rem',
                                                                    borderColor: cantidadInvalidaMerma ? '#ef4444' : '#ccc',
                                                                    background: cantidadInvalidaMerma ? '#fef2f2' : '#fff'
                                                                }}
                                                            />
                                                        </label>
                                                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.45rem 0.6rem', textAlign: 'right' }}>
                                                            <div style={{ fontSize: '0.7rem', color: '#991b1b', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                                                Costo Estimado
                                                            </div>
                                                            <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#b91c1c' }}>
                                                                Bs {costoEstimadoPerdida.toFixed(2)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <label style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                                                        3. Motivo de la Merma:
                                                        <input
                                                            type="text"
                                                            placeholder="Ej. Vencido, roto, merma..."
                                                            value={mermaProdMotivo}
                                                            onChange={(e) => {
                                                                setMermaProdMotivo(e.target.value);
                                                                setMermaProdConfirmando(false);
                                                            }}
                                                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                                                        />
                                                    </label>

                                                    {!mermaProdConfirmando ? (
                                                        <button
                                                            type="button"
                                                            disabled={!prodMermaSel || stockActualProd <= 0 || cantBajaNum <= 0 || superaStock || !mermaProdMotivo || mermaProdMotivo.trim().length < 3}
                                                            onClick={() => setMermaProdConfirmando(true)}
                                                            style={{
                                                                ...btnPrimario,
                                                                background: '#dc2626',
                                                                padding: '0.5rem',
                                                                fontSize: '0.84rem',
                                                                opacity: (!prodMermaSel || stockActualProd <= 0 || cantBajaNum <= 0 || superaStock || !mermaProdMotivo || mermaProdMotivo.trim().length < 3) ? 0.55 : 1,
                                                                cursor: (!prodMermaSel || stockActualProd <= 0 || cantBajaNum <= 0 || superaStock || !mermaProdMotivo || mermaProdMotivo.trim().length < 3) ? 'not-allowed' : 'pointer'
                                                            }}
                                                        >
                                                            Registrar Baja por Merma
                                                        </button>
                                                    ) : (
                                                        <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: '8px', padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                                            <div style={{ fontSize: '0.82rem', color: '#92400e', fontWeight: 'bold' }}>
                                                                ⚠️ ¿Confirmar baja de {cantBajaNum} {prodMermaSel?.unidad_medida || 'u.'}?
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleConfirmarMermaProductoDirecto}
                                                                    style={{ ...btnPrimario, background: '#dc2626', flex: 1, padding: '0.45rem', fontSize: '0.82rem' }}
                                                                >
                                                                    ✅ Confirmar Merma
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setMermaProdConfirmando(false)}
                                                                    style={{ ...btnSecundario, padding: '0.45rem 0.75rem', fontSize: '0.82rem', cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {mermaProdResultado && (
                                                        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '0.6rem', fontSize: '0.8rem', color: '#166534' }}>
                                                            <div><strong>✅ Merma registrada:</strong> {mermaProdResultado.productoNombre} (-{mermaProdResultado.cantidadPerdida} {mermaProdResultado.unidadMedida}) | Stock restante: <strong>{mermaProdResultado.stockRestante}</strong></div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </section>
                                </>
                            )}
                        </div>
                    </div>

                    {/* TABLA DE ARTÍCULOS */}
                    <section style={{ ...cardStyle, marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>
                                    Catálogo de Artículos {categoriaTabActiva !== 'todas' ? `— Categoría: ${categoriaTabActiva}` : ''}
                                </h3>
                                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                    {productosFiltrados.length} artículo(s) encontrado(s) de un total de {(datos?.productos || []).length}
                                </span>
                            </div>

                            {/* Buscador Rápido y Selector de Límite de Productos */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <div style={{ position: 'relative', minWidth: '240px' }}>
                                    <input
                                        type="text"
                                        placeholder="🔍 Buscar artículo por nombre o categoría..."
                                        value={busquedaProductos}
                                        onChange={(e) => {
                                            setBusquedaProductos(e.target.value);
                                            setPaginaProductos(1);
                                        }}
                                        style={{ ...inputStyle, padding: '0.45rem 2rem 0.45rem 0.65rem', fontSize: '0.85rem' }}
                                    />
                                    {busquedaProductos && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBusquedaProductos('');
                                                setPaginaProductos(1);
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
                                    value={limitePorPaginaProductos}
                                    onChange={(e) => {
                                        setLimitePorPaginaProductos(Number(e.target.value));
                                        setPaginaProductos(1);
                                    }}
                                    style={{ ...inputStyle, width: 'auto', padding: '0.45rem', fontSize: '0.85rem' }}
                                    title="Artículos por página"
                                >
                                    <option value={5}>5 por pág.</option>
                                    <option value={10}>10 por pág.</option>
                                    <option value={20}>20 por pág.</option>
                                    <option value={50}>50 por pág.</option>
                                </select>
                            </div>
                        </div>

                        {productosFiltrados.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '6px' }}>
                                {busquedaProductos
                                    ? <>No se encontraron artículos que coincidan con &ldquo;<strong>{busquedaProductos}</strong>&rdquo;.</>
                                    : 'No hay artículos registrados en esta categoría.'}
                            </div>
                        ) : (
                            <>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', background: '#f8fafc' }}>
                                                <th style={thTd}>ID</th>
                                                <th style={thTd}>Artículo</th>
                                                <th style={thTd}>Categoría</th>
                                                <th style={thTd}>Modalidad</th>
                                                <th style={thTd}>Precio Venta</th>
                                                <th style={thTd}>Costo Unitario</th>
                                                <th style={thTd}>Ganancia Unitaria</th>
                                                <th style={thTd}>Disponibilidad (Stock)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {productosPaginados.map((p) => {
                                                const gananciaUni = Number(p.precio) - Number(p.costo || 0);
                                                const stockBajo = p.tipo_inventario === 'directo' && Number(p.stock) <= Number(p.stock_minimo || 0);
                                                return (
                                                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                        <td style={thTd}>#{p.id}</td>
                                                        <td style={thTd}>
                                                            <strong>{p.nombre}</strong>
                                                            {p.grupos_modificadores && p.grupos_modificadores.length > 0 && (
                                                                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                                                                    {p.grupos_modificadores.map((g) => (
                                                                        <span key={g.id} style={{ fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                                                            ✨ {g.nombre}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={thTd}>
                                                            {p.categoria && p.categoria.trim() ? (
                                                                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                                                    {p.categoria.split(',').map((catItem, idx) => {
                                                                        const cTrim = catItem.trim();
                                                                        if (!cTrim) return null;
                                                                        return (
                                                                            <span
                                                                                key={idx}
                                                                                style={{
                                                                                    background: '#eff6ff',
                                                                                    color: '#0369a1',
                                                                                    border: '1px solid #bae6fd',
                                                                                    padding: '0.15rem 0.5rem',
                                                                                    borderRadius: '999px',
                                                                                    fontSize: '0.75rem',
                                                                                    fontWeight: '600',
                                                                                    whiteSpace: 'nowrap'
                                                                                }}
                                                                            >
                                                                                🏷️ {cTrim}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontStyle: 'italic' }}>
                                                                    Sin categoría
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={thTd}>
                                                            {p.tipo_inventario === 'receta'
                                                                ? '🧪 Receta / Insumo'
                                                                : p.tipo_inventario === 'directo'
                                                                ? '📦 Reventa Directa'
                                                                : p.tipo_inventario === 'combo'
                                                                ? '🎁 Combo / Promo'
                                                                : '✨ Libre'}
                                                            {p.tipo_inventario === 'combo' && Number(p.limite_maximo_activo) === 1 && (
                                                                <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: '0.2rem' }}>
                                                                    Límite: {p.limite_unidades_restante}/{p.limite_unidades_total} u.
                                                                </div>
                                                            )}
                                                            {p.tipo_inventario === 'combo' && (p.fecha_inicio_vigencia || p.fecha_fin_vigencia) && (
                                                                <div style={{ fontSize: '0.7rem', color: p.esta_vigente === false ? '#dc2626' : '#166534', marginTop: '0.15rem' }}>
                                                                    {p.esta_vigente === false ? `⛔ ${p.motivo_no_vigente || 'Fuera de vigencia'}` : '🟢 En vigencia'}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={{ ...thTd, fontWeight: 'bold' }}>Bs {Number(p.precio).toFixed(2)}</td>
                                                        <td style={thTd}>Bs {Number(p.costo).toFixed(2)}</td>
                                                        <td style={{ ...thTd, color: gananciaUni >= 0 ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>
                                                            Bs {gananciaUni.toFixed(2)}
                                                        </td>
                                                        <td style={{ ...thTd, fontWeight: 'bold', color: p.unidades_disponibles === 0 ? '#b91c1c' : '#166534' }}>
                                                            {p.tipo_inventario === 'libre' || p.unidades_disponibles === null
                                                                ? 'Libre (Servicio)'
                                                                : `${p.unidades_disponibles} ${p.unidad_medida || 'u.'} ${p.insumo_limitante ? `(Límite: ${p.insumo_limitante})` : ''} ${stockBajo ? '⚠️ (Reponer)' : ''}`}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {totalPaginasProductos > 1 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                            Mostrando {inicioProductos + 1} - {Math.min(inicioProductos + limitePorPaginaProductos, productosFiltrados.length)} de {productosFiltrados.length}
                                        </span>
                                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                disabled={paginaProductosValida <= 1}
                                                onClick={() => setPaginaProductos((p) => Math.max(1, p - 1))}
                                                style={{
                                                    padding: '0.35rem 0.75rem',
                                                    borderRadius: '4px',
                                                    border: '1px solid #cbd5e1',
                                                    background: paginaProductosValida <= 1 ? '#f1f5f9' : '#ffffff',
                                                    color: paginaProductosValida <= 1 ? '#94a3b8' : '#0f172a',
                                                    cursor: paginaProductosValida <= 1 ? 'not-allowed' : 'pointer',
                                                    fontSize: '0.82rem',
                                                    fontWeight: 'bold'
                                                }}
                                            >
                                                ◀ Anterior
                                            </button>
                                            <button
                                                type="button"
                                                disabled={paginaProductosValida >= totalPaginasProductos}
                                                onClick={() => setPaginaProductos((p) => Math.min(totalPaginasProductos, p + 1))}
                                                style={{
                                                    padding: '0.35rem 0.75rem',
                                                    borderRadius: '4px',
                                                    border: '1px solid #cbd5e1',
                                                    background: paginaProductosValida >= totalPaginasProductos ? '#f1f5f9' : '#ffffff',
                                                    color: paginaProductosValida >= totalPaginasProductos ? '#94a3b8' : '#0f172a',
                                                    cursor: paginaProductosValida >= totalPaginasProductos ? 'not-allowed' : 'pointer',
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
                </>
            )}
        </div>
    );
}
