'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
    Package, 
    Sparkles, 
    Plus, 
    Trash2, 
    Tag, 
    Layers, 
    Search, 
    X, 
    Edit2, 
    Save, 
    Check, 
    Clock, 
    Truck,
    ChevronLeft,
    ChevronRight 
} from 'lucide-react';
import {
    crearCategoriaAction,
    crearProductoAction,
    actualizarProductoAction,
    eliminarProductoAction,
    crearGrupoModificadorAction,
    eliminarGrupoModificadorAction,
    asignarModificadoresProductoAction
} from '../../../server/actions/catalogo.actions';

export const OPCIONES_UNIDADES_MEDIDA = [
    { valor: 'unidades', etiqueta: 'Unidades (u. / piezas / paquetes)' },
    { valor: 'kilos', etiqueta: 'Kilos (kg)' },
    { valor: 'gramos', etiqueta: 'Gramos (g)' },
    { valor: 'miligramos', etiqueta: 'Miligramos (mg)' },
    { valor: 'litros', etiqueta: 'Litros (L)' },
    { valor: 'mililitros', etiqueta: 'Mililitros (ml)' },
    { valor: 'metros', etiqueta: 'Metros (m)' },
    { valor: 'centimetros', etiqueta: 'Centímetros (cm)' }
];

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
    const usaRecetas = Boolean(configActual.usa_recetas_ensamblaje ?? false);

    // Sub-sección interna de Catálogo
    const [subSeccionCatalogo, setSubSeccionCatalogo] = useState('articulos'); // 'articulos' | 'modificadores'

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

    // Estado y Modal de Edición de Producto / Receta
    const [modalEditarAbierto, setModalEditarAbierto] = useState(false);
    const [productoAEditar, setProductoAEditar] = useState(null);
    const [editNombre, setEditNombre] = useState('');
    const [editPrecio, setEditPrecio] = useState('');
    const [editCategorias, setEditCategorias] = useState([]);
    const [editStockMinimo, setEditStockMinimo] = useState('0');
    const [editFechaVencimiento, setEditFechaVencimiento] = useState('');
    const [editFilasReceta, setEditFilasReceta] = useState([]);
    const [guardandoEdicion, setGuardandoEdicion] = useState(false);

    // Cálculo dinámico de costo y margen para el modal de edición
    let costoEstimadoEdit = 0;
    if (productoAEditar?.tipo_inventario === 'receta') {
        for (const f of editFilasReceta) {
            if (!f.insumoId || !f.cantidad) continue;
            const ins = (datos?.insumos || []).find((i) => String(i.id) === String(f.insumoId));
            if (!ins) continue;
            const cant = Number(f.cantidad) || 0;
            const convertida = f.unidadReceta
                ? convertirMedidaReceta(cant, f.unidadReceta, ins.unidad_medida)
                : cant;
            if (convertida !== null) {
                costoEstimadoEdit += convertida * Number(ins.costo_por_unidad || 0);
            }
        }
    } else {
        costoEstimadoEdit = Number(productoAEditar?.costo || 0);
    }
    const gananciaEstimadaEdit = Number(editPrecio || 0) - costoEstimadoEdit;
    const margenPorcentajeEdit = Number(editPrecio) > 0 ? (gananciaEstimadaEdit / Number(editPrecio)) * 100 : 0;

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

    // Helpers y Handlers de Edición de Producto / Receta
    function abrirModalEditarProducto(p) {
        limpiarAlertas?.();
        setProductoAEditar(p);
        setEditNombre(p.nombre || '');
        setEditPrecio(p.precio !== undefined && p.precio !== null ? String(p.precio) : '0');

        let cats = [];
        if (p.categoria && typeof p.categoria === 'string') {
            cats = p.categoria.split(',').map((c) => c.trim()).filter(Boolean);
        }
        setEditCategorias(cats);
        setEditStockMinimo(p.stock_minimo !== undefined && p.stock_minimo !== null ? String(p.stock_minimo) : '0');
        setEditFechaVencimiento(p.fecha_vencimiento || '');

        if (p.tipo_inventario === 'receta') {
            const filas = (p.receta || []).map((r) => {
                const ins = (datos?.insumos || []).find((i) => Number(i.id) === Number(r.insumo_id));
                return {
                    insumoId: String(r.insumo_id),
                    cantidad: String(r.cantidad_requerida || ''),
                    unidadReceta: r.insumo_unidad || ins?.unidad_medida || 'unidades'
                };
            });
            if (filas.length > 0) {
                setEditFilasReceta(filas);
            } else {
                const primerInsumo = (datos?.insumos || [])[0];
                setEditFilasReceta([
                    {
                        insumoId: primerInsumo ? String(primerInsumo.id) : '',
                        cantidad: '',
                        unidadReceta: primerInsumo ? primerInsumo.unidad_medida : 'unidades'
                    }
                ]);
            }
        } else {
            setEditFilasReceta([]);
        }

        setModalEditarAbierto(true);
    }

    function toggleCategoriaEdit(nomCat) {
        if (!nomCat) return;
        setEditCategorias((prev) => {
            const existe = prev.some((c) => c.toLowerCase() === nomCat.toLowerCase());
            return existe ? prev.filter((c) => c.toLowerCase() !== nomCat.toLowerCase()) : [...prev, nomCat];
        });
    }

    function agregarFilaRecetaEdit() {
        if (editFilasReceta.length >= 30) {
            setError?.('Límite alcanzado: una receta no puede tener más de 30 insumos.');
            return;
        }
        const primerInsumo = (datos?.insumos || [])[0];
        setEditFilasReceta([
            ...editFilasReceta,
            {
                insumoId: primerInsumo ? String(primerInsumo.id) : '',
                cantidad: '',
                unidadReceta: primerInsumo ? primerInsumo.unidad_medida : 'unidades'
            }
        ]);
    }

    function quitarFilaRecetaEdit(index) {
        if (editFilasReceta.length <= 1) return;
        setEditFilasReceta(editFilasReceta.filter((_, i) => i !== index));
    }

    function cambiarFilaRecetaEdit(index, campo, valor) {
        const copia = [...editFilasReceta];
        copia[index] = { ...copia[index], [campo]: valor };
        if (campo === 'insumoId') {
            const ins = (datos?.insumos || []).find((i) => String(i.id) === String(valor));
            if (ins) {
                copia[index].unidadReceta = ins.unidad_medida;
            }
        }
        setEditFilasReceta(copia);
    }

    async function handleGuardarEdicionProducto(e) {
        e.preventDefault();
        if (!productoAEditar) return;
        limpiarAlertas?.();

        const nom = editNombre.trim();
        if (!nom) {
            setError?.('El nombre del producto no puede estar vacío.');
            return;
        }
        const precioNum = Number(editPrecio);
        if (!Number.isFinite(precioNum) || precioNum < 0) {
            setError?.('El precio debe ser un número mayor o igual a 0.');
            return;
        }

        const payload = {
            productoId: productoAEditar.id,
            nombre: nom,
            precio: precioNum,
            categorias: editCategorias,
            stock_minimo: Number(editStockMinimo || 0),
            fecha_vencimiento: editFechaVencimiento ? editFechaVencimiento : null
        };

        if (productoAEditar.tipo_inventario === 'receta') {
            const insumosLimpio = editFilasReceta
                .filter((f) => f.insumoId && Number(f.cantidad) > 0)
                .map((f) => ({
                    insumoId: Number(f.insumoId),
                    cantidad: Number(f.cantidad),
                    unidadReceta: f.unidadReceta || null
                }));

            if (insumosLimpio.length === 0) {
                setError?.('Debes incluir al menos un insumo con cantidad mayor a 0 para la receta.');
                return;
            }
            if (insumosLimpio.length > 30) {
                setError?.('Límite excedido: No se pueden agregar más de 30 insumos en una receta.');
                return;
            }
            payload.insumosReceta = insumosLimpio;
        }

        try {
            setGuardandoEdicion(true);
            const res = await actualizarProductoAction(payload);
            if (!res.ok) throw new Error(res.error || 'Error al actualizar el producto.');
            setMensaje?.(`Producto "${nom}" actualizado con éxito.`);
            setModalEditarAbierto(false);
            setProductoAEditar(null);
            await cargarTodo?.();
        } catch (err) {
            setError?.(err.message);
        } finally {
            setGuardandoEdicion(false);
        }
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

    async function handleEliminarProducto(p) {
        if (!p || !p.id) return;
        const confirmado = window.confirm(`¿Está seguro de borrar el artículo "${p.nombre}" del catálogo?`);
        if (!confirmado) return;

        limpiarAlertas?.();
        try {
            const res = await eliminarProductoAction({ productoId: p.id });
            if (!res.ok) throw new Error(res.error || 'Error al eliminar el artículo.');
            setMensaje?.(`Artículo "${p.nombre}" eliminado del catálogo.`);
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

    return (
        <div className="flex flex-col gap-5">
            {/* SELECTOR DE SUB-SECCIÓN: ARTÍCULOS O MODIFICADORES */}
            <div className="flex gap-2 bg-slate-200 p-1.5 rounded-lg self-start flex-wrap">
                <Button
                    type="button"
                    variant={subSeccionCatalogo === 'articulos' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setSubSeccionCatalogo('articulos')}
                    className={`text-xs font-bold gap-1.5 ${
                        subSeccionCatalogo === 'articulos'
                            ? 'bg-white text-slate-900 shadow-sm hover:bg-white'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <Package className="w-4 h-4" />
                    <span>Artículos y Catálogo ({(datos?.productos || []).length})</span>
                </Button>
                <Button
                    type="button"
                    variant={subSeccionCatalogo === 'modificadores' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setSubSeccionCatalogo('modificadores')}
                    className={`text-xs font-bold gap-1.5 ${
                        subSeccionCatalogo === 'modificadores'
                            ? 'bg-white text-sky-700 shadow-sm hover:bg-white'
                            : 'text-slate-600 hover:text-sky-700'
                    }`}
                >
                    <Sparkles className="w-4 h-4" />
                    <span>Complementos y Modificadores ({(datos?.gruposModificadores || []).length})</span>
                </Button>
            </div>

            {/* VISTA: MODIFICADORES O ARTÍCULOS */}
            {subSeccionCatalogo === 'modificadores' ? (
                /* VISTA: MODIFICADORES */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* CREAR NUEVO GRUPO */}
                    <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 m-0 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-sky-600" />
                                <span>Crear Grupo de Complementos / Modificadores</span>
                            </h3>
                            <p className="text-xs text-slate-500 m-0 mt-0.5">
                                Configura grupos como <em>&ldquo;Tipo de Leche&rdquo;</em> (reemplazo) o <em>&ldquo;Extras / Jarabes&rdquo;</em> (adiciones) con sus precios e insumos.
                            </p>
                        </div>

                        <form onSubmit={handleCrearGrupoModificador} className="flex flex-col gap-3">
                            <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                Nombre del Grupo:
                                <Input
                                    type="text"
                                    placeholder="Ej. Tipo de Leche, Extras / Jarabes, Adicionales"
                                    required
                                    value={nombreGrupoMod}
                                    onChange={(e) => setNombreGrupoMod(e.target.value)}
                                    className="bg-white"
                                />
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">Tipo de Selección:</label>
                                    <select
                                        value={tipoSeleccionGrupoMod}
                                        onChange={(e) => setTipoSeleccionGrupoMod(e.target.value)}
                                        className="w-full h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs shadow-sm focus:outline-none"
                                    >
                                        <option value="unica">Selección Única (Excluyente / Reemplazo)</option>
                                        <option value="multiple">Múltiples Opciones (Extras / Agregados)</option>
                                    </select>
                                </div>

                                <div className="flex items-center h-9">
                                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={esObligatorioGrupoMod}
                                            onChange={(e) => setEsObligatorioGrupoMod(e.target.checked)}
                                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                        />
                                        <strong>¿Obligatorio al cobrar?</strong>
                                    </label>
                                </div>
                            </div>

                            {/* OPCIONES DEL GRUPO */}
                            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 mt-1">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-slate-800">
                                        Opciones del Grupo ({opcionesGrupoMod.length})
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                        Insumo, cantidad y recargo al cliente
                                    </span>
                                </div>

                                <div className="flex flex-col gap-2.5">
                                    {opcionesGrupoMod.map((op, idx) => {
                                        const insumoActual = (datos?.insumos || []).find((i) => String(i.id) === String(op.insumoId));
                                        return (
                                            <div key={idx} className="bg-white p-3 rounded-md border border-slate-300 flex flex-col gap-2">
                                                <div className="flex gap-2 items-center">
                                                    <Input
                                                        type="text"
                                                        placeholder="Nombre de la opción (Ej. Leche Almendras)"
                                                        required
                                                        value={op.nombre}
                                                        onChange={(e) => cambiarOpcionGrupoMod(idx, 'nombre', e.target.value)}
                                                        className="flex-grow bg-white h-8 text-xs"
                                                    />
                                                    <div className="flex items-center gap-1 w-28">
                                                        <span className="text-xs text-slate-500 font-bold">+Bs</span>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            placeholder="0.00"
                                                            value={op.precioAdicional}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'precioAdicional', e.target.value)}
                                                            className="bg-white h-8 text-xs"
                                                            title="Recargo adicional para el cliente"
                                                        />
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => quitarOpcionGrupoMod(idx)}
                                                        disabled={opcionesGrupoMod.length <= 1}
                                                        className="h-8 px-2 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                                                        title="Quitar opción"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center text-xs">
                                                    <div>
                                                        <span className="text-[11px] text-slate-500 block mb-0.5">Insumo que descuenta:</span>
                                                        <select
                                                            value={op.insumoId}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'insumoId', e.target.value)}
                                                            className="w-full h-8 rounded border border-slate-300 bg-white px-1 text-xs"
                                                        >
                                                            <option value="">-- Sin insumo --</option>
                                                            {(datos?.insumos || []).map((ins) => (
                                                                <option key={ins.id} value={ins.id}>
                                                                    {ins.nombre} ({ins.unidad_medida})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <span className="text-[11px] text-slate-500 block mb-0.5">Cantidad ({insumoActual?.unidad_medida || 'u.'}):</span>
                                                        <Input
                                                            type="number"
                                                            step="0.001"
                                                            min="0"
                                                            placeholder="0.2"
                                                            value={op.cantidadInsumo}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'cantidadInsumo', e.target.value)}
                                                            className="h-8 text-xs bg-white"
                                                        />
                                                    </div>

                                                    <div>
                                                        <span className="text-[11px] text-slate-500 block mb-0.5">Insumo que sustituye:</span>
                                                        <select
                                                            value={op.insumoReemplazadoId}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'insumoReemplazadoId', e.target.value)}
                                                            className="w-full h-8 rounded border border-slate-300 bg-white px-1 text-xs"
                                                        >
                                                            <option value="">-- Ninguno (Es extra) --</option>
                                                            {(datos?.insumos || []).map((ins) => (
                                                                <option key={ins.id} value={ins.id}>
                                                                    Sustituye a: {ins.nombre}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <label className="flex items-center gap-1.5 pt-4 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={op.esDefault}
                                                            onChange={(e) => cambiarOpcionGrupoMod(idx, 'esDefault', e.target.checked)}
                                                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                                        />
                                                        <span className="text-xs text-slate-700 font-medium">Por defecto</span>
                                                    </label>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={agregarOpcionGrupoMod}
                                        className="w-full h-8 border-dashed text-xs text-sky-700 hover:bg-sky-50 font-bold gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Agregar otra opción al grupo</span>
                                    </Button>
                                </div>
                            </div>

                            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 gap-1.5">
                                <Save className="w-4 h-4" />
                                <span>Guardar Grupo de Modificadores</span>
                            </Button>
                        </form>
                    </section>

                    {/* ASIGNACIÓN A PRODUCTOS Y LISTADO EXISTENTE */}
                    <div className="flex flex-col gap-5">
                        <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                            <h3 className="text-base font-bold text-slate-900 m-0">Asignar a Productos con Receta</h3>
                            <p className="text-xs text-slate-500 m-0">
                                Indica qué productos con receta ofrecerán estos modificadores en la pantalla de cobro.
                            </p>

                            <form onSubmit={handleGuardarAsignacionModificadores} className="flex flex-col gap-3">
                                <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                    Selecciona el Producto con Receta:
                                    <select
                                        value={productoAsignarModId}
                                        onChange={(e) => {
                                            const pId = e.target.value;
                                            setProductoAsignarModId(pId);
                                            const prod = (datos?.productos || []).find((p) => String(p.id) === String(pId));
                                            setGruposAsignarIds(prod?.grupos_modificadores_ids || []);
                                        }}
                                        className="w-full h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs shadow-sm focus:outline-none"
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
                                    <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                                        <div className="text-xs font-bold text-slate-700 mb-2">
                                            Grupos que aplican a este producto:
                                        </div>
                                        {(datos?.gruposModificadores || []).length === 0 ? (
                                            <p className="text-xs text-slate-400 m-0">No hay grupos creados todavía.</p>
                                        ) : (
                                            <div className="flex flex-col gap-1.5">
                                                {(datos?.gruposModificadores || []).map((g) => (
                                                    <label key={g.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={gruposAsignarIds.includes(g.id)}
                                                            onChange={() => toggleGrupoAsignar(g.id)}
                                                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                                        />
                                                        <strong>{g.nombre}</strong>
                                                        <span className="text-[11px] text-slate-500">
                                                            ({g.tipo_seleccion === 'unica' ? 'Única' : 'Múltiple'} • {g.opciones?.length || 0} opciones)
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    disabled={!productoAsignarModId}
                                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-8 text-xs disabled:opacity-50"
                                >
                                    Guardar Asignación
                                </Button>
                            </form>
                        </section>

                        <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                            <h3 className="text-base font-bold text-slate-900 m-0">
                                Grupos Registrados ({(datos?.gruposModificadores || []).length})
                            </h3>
                            {(datos?.gruposModificadores || []).length === 0 ? (
                                <p className="text-slate-400 text-xs m-0">No hay grupos registrados.</p>
                            ) : (
                                <div className="flex flex-col gap-2.5">
                                    {(datos?.gruposModificadores || []).map((g) => (
                                        <div key={g.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-sm text-slate-900">
                                                    {g.nombre}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEliminarGrupoModificador(g.id, g.nombre)}
                                                    className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 p-1 gap-1"
                                                    title="Eliminar grupo"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                    <span>Eliminar</span>
                                                </Button>
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">
                                                {g.tipo_seleccion === 'unica' ? 'Selección única' : 'Selección múltiple'}
                                                {g.es_obligatorio ? ' • Obligatorio' : ' • Opcional'}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {(g.opciones || []).map((op) => (
                                                    <span
                                                        key={op.id}
                                                        className="text-[11px] bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-700 font-medium"
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
                /* VISTA: ARTÍCULOS Y CATÁLOGO */
                <>
                    {/* BARRA DE CATEGORÍAS */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                        <div className="flex gap-2 flex-wrap items-center">
                            <span className="text-xs font-bold text-slate-600 mr-1">
                                Categorías:
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant={categoriaTabActiva === 'todas' ? 'default' : 'secondary'}
                                onClick={() => {
                                    setCategoriaTabActiva('todas');
                                    setPaginaProductos(1);
                                }}
                                className="rounded-full h-8 text-xs font-bold"
                            >
                                Todas ({(datos?.productos || []).length})
                            </Button>
                            {(datos?.categorias || []).map((cat) => {
                                const cant = (datos?.productos || []).filter((p) => {
                                    const cats = (p.categoria || '').split(',').map((c) => c.trim().toLowerCase());
                                    return cats.includes(cat.nombre?.toLowerCase());
                                }).length;
                                const activa = categoriaTabActiva.toLowerCase() === cat.nombre?.toLowerCase();
                                return (
                                    <Button
                                        key={cat.id || cat.nombre}
                                        type="button"
                                        size="sm"
                                        variant={activa ? 'default' : 'secondary'}
                                        onClick={() => {
                                            setCategoriaTabActiva(cat.nombre);
                                            setProdCategorias([cat.nombre]);
                                            setPaginaProductos(1);
                                        }}
                                        className="rounded-full h-8 text-xs font-bold"
                                    >
                                        {cat.nombre} ({cant})
                                    </Button>
                                );
                            })}
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setMostrarModalNuevaCat(!mostrarModalNuevaCat)}
                                className="rounded-full h-8 text-xs font-bold border-dashed border-sky-600 text-sky-700 bg-sky-50 hover:bg-sky-100"
                            >
                                {mostrarModalNuevaCat ? 'Cancelar' : '+ Nueva Categoría'}
                            </Button>
                        </div>

                        {mostrarModalNuevaCat && (
                            <form onSubmit={handleCrearCategoria} className="mt-3 flex gap-2 items-center bg-slate-50 p-2.5 rounded-lg border border-slate-300">
                                <Input
                                    type="text"
                                    placeholder="Nombre de la nueva categoría (Ej. Bebidas, Repuestos, Postres)"
                                    required
                                    value={nuevaCatNombre}
                                    onChange={(e) => setNuevaCatNombre(e.target.value)}
                                    className="bg-white h-9 text-xs flex-grow"
                                />
                                <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9">
                                    Guardar Categoría
                                </Button>
                            </form>
                        )}
                    </div>

                    {/* CUERPO PRINCIPAL DEL CATÁLOGO */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        {/* FORMULARIO DE REGISTRO */}
                        <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 m-0 flex items-center gap-2">
                                    <Package className="w-5 h-5 text-slate-700" />
                                    <span>Registrar Artículo / Producto</span>
                                </h3>
                                <p className="text-xs text-slate-500 m-0 mt-0.5">
                                    El costo y la disponibilidad se calculan matemáticamente de forma automática a partir de los insumos seleccionados.
                                </p>
                            </div>

                            <form onSubmit={handleCrearProducto} className="flex flex-col gap-3">
                                <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                    Nombre del Artículo / Producto:
                                    <Input
                                        placeholder="Ej. Café Capuchino, Filtro de Aceite, Tarta de Chocolate"
                                        required
                                        value={prodNombre}
                                        onChange={(e) => setProdNombre(e.target.value)}
                                        className="bg-white"
                                    />
                                </label>

                                <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                    Precio de Venta al Público (Bs):
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej. 0.00 o 25.00"
                                        required
                                        value={prodPrecio}
                                        onChange={(e) => setProdPrecio(e.target.value)}
                                        className="bg-white"
                                    />
                                </label>

                                {/* BARRA DE ASIGNACIÓN MÚLTIPLE DE CATEGORÍAS */}
                                <div>
                                    <span className="text-xs font-bold text-slate-700 block mb-1">
                                        Categorías del Producto:
                                    </span>
                                    <div className="flex gap-1.5 flex-wrap items-center p-2.5 bg-slate-50 rounded-lg border border-slate-200 min-h-[44px]">
                                        {(!datos?.categorias || datos.categorias.length === 0) ? (
                                            <div className="text-xs text-slate-400">
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
                                                        className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                                                            seleccionada
                                                                ? 'bg-sky-600 text-white shadow-sm'
                                                                : 'bg-white text-slate-700 border border-slate-300 hover:border-slate-400'
                                                        }`}
                                                    >
                                                        {seleccionada ? <Check className="w-3.5 h-3.5" /> : <Tag className="w-3.5 h-3.5 text-slate-400" />}
                                                        <span>{cat.nombre}</span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                    {prodCategorias.length > 0 && (
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-[11px] text-sky-700 font-medium">
                                                Asignadas: <strong>{prodCategorias.join(', ')}</strong>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setProdCategorias([])}
                                                className="text-[11px] text-slate-500 hover:text-slate-700 underline"
                                            >
                                                Limpiar selección
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* MODO DE COMPOSICIÓN */}
                                <div>
                                    <span className="text-xs font-bold text-slate-700 block mb-1.5">
                                        Composición y Origen de Inventario:
                                    </span>
                                    <div className="grid grid-cols-5 gap-1.5">
                                        {[
                                            { id: 'directo', label: 'Directo', sub: 'Stock propio' },
                                            { id: 'unitario', label: 'Unitario', sub: '1 a 1 Insumo' },
                                            { id: 'receta', label: 'Receta', sub: 'Insumos' },
                                            { id: 'combo', label: 'Combo', sub: 'Agrupa' },
                                            { id: 'libre', label: 'Libre', sub: 'Servicio' }
                                        ].map((m) => (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => setTipoComposicion(m.id)}
                                                className={`p-2 rounded-lg border text-center cursor-pointer transition-all ${
                                                    tipoComposicion === m.id
                                                        ? 'border-2 border-sky-600 bg-sky-50 text-slate-900 shadow-sm'
                                                        : 'border-slate-300 bg-white hover:border-slate-400 text-slate-700'
                                                }`}
                                            >
                                                <strong className="text-xs block">{m.label}</strong>
                                                <span className="text-[10px] text-slate-500 block mt-0.5">{m.sub}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* CAMPOS ESPECÍFICOS POR TIPO */}
                                {tipoComposicion === 'directo' && (
                                    <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col gap-2.5">
                                        <div className="grid grid-cols-2 gap-2.5">
                                            <label className="text-xs text-slate-700 flex flex-col gap-1">
                                                Stock Inicial:
                                                <Input
                                                    type="number"
                                                    step="1"
                                                    min="0"
                                                    required
                                                    value={prodDirectoStockIni}
                                                    onChange={(e) => setProdDirectoStockIni(e.target.value)}
                                                    className="bg-white h-8 text-xs"
                                                />
                                            </label>
                                            <label className="text-xs text-slate-700 flex flex-col gap-1">
                                                Costo Inicial (Bs):
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    required
                                                    value={prodDirectoCostoIni}
                                                    onChange={(e) => setProdDirectoCostoIni(e.target.value)}
                                                    className="bg-white h-8 text-xs"
                                                />
                                            </label>
                                            <label className="text-xs text-slate-700 flex flex-col gap-1">
                                                Stock Mínimo (Alerta):
                                                <Input
                                                    type="number"
                                                    step="1"
                                                    min="0"
                                                    value={prodDirectoStockMin}
                                                    onChange={(e) => setProdDirectoStockMin(e.target.value)}
                                                    className="bg-white h-8 text-xs"
                                                />
                                            </label>
                                            <label className="text-xs text-slate-700 flex flex-col gap-1">
                                                Unidad de Medida:
                                                <select
                                                    value={prodDirectoUnidad}
                                                    onChange={(e) => setProdDirectoUnidad(e.target.value)}
                                                    className="w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs shadow-sm focus:outline-none"
                                                >
                                                    {OPCIONES_UNIDADES_MEDIDA.map((u) => (
                                                        <option key={u.valor} value={u.valor}>
                                                            {u.etiqueta}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                        {usaVencimiento && (
                                            <label className="text-xs text-slate-700 flex flex-col gap-1">
                                                <span>
                                                    Fecha de Vencimiento Inicial:
                                                    <span className="text-slate-500 font-normal ml-1">(Opcional. Dejar vacío si el artículo NO vence, ej. café al vacío, vajilla)</span>
                                                </span>
                                                <Input
                                                    type="date"
                                                    value={prodDirectoVencimiento}
                                                    onChange={(e) => setProdDirectoVencimiento(e.target.value)}
                                                    className="bg-white h-8 text-xs"
                                                />
                                            </label>
                                        )}
                                    </div>
                                )}

                                {tipoComposicion === 'unitario' && (
                                    <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                                        <label className="text-xs text-slate-700 flex flex-col gap-1">
                                            Selecciona el Insumo del Inventario:
                                            <select
                                                required
                                                value={insumoUnitarioId}
                                                onChange={(e) => setInsumoUnitarioId(e.target.value)}
                                                className="w-full h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs shadow-sm focus:outline-none"
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
                                    <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col gap-2">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-slate-800">
                                                Insumos y Materiales de la Receta:
                                            </span>
                                            <span className={`text-xs font-bold ${filasReceta.length >= 30 ? 'text-red-600' : 'text-sky-700'}`}>
                                                {filasReceta.length} / 30 insumos
                                            </span>
                                        </div>

                                        {filasReceta.map((fila, index) => {
                                            const insSel = (datos?.insumos || []).find((i) => String(i.id) === String(fila.insumoId));
                                            const unidadAlm = insSel ? insSel.unidad_medida : 'unidades';
                                            const opcionesComp = obtenerUnidadesCompatibles(unidadAlm);
                                            return (
                                                <div key={index} className="grid grid-cols-[1.4fr_1fr_1fr_32px] gap-1.5 items-center">
                                                    <select
                                                        required
                                                        value={fila.insumoId}
                                                        onChange={(e) => cambiarFilaReceta(index, 'insumoId', e.target.value)}
                                                        className="h-8 rounded border border-slate-300 bg-white px-1 text-xs"
                                                    >
                                                        <option value="">-- Insumo --</option>
                                                        {(datos?.insumos || []).map((i) => (
                                                            <option key={i.id} value={i.id}>
                                                                {i.nombre} ({i.unidad_medida})
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <Input
                                                        type="number"
                                                        step="0.001"
                                                        min="0.001"
                                                        required
                                                        placeholder="Cantidad"
                                                        value={fila.cantidad}
                                                        onChange={(e) => cambiarFilaReceta(index, 'cantidad', e.target.value)}
                                                        className="h-8 text-xs bg-white"
                                                    />

                                                    <select
                                                        value={fila.unidadReceta || unidadAlm}
                                                        onChange={(e) => cambiarFilaReceta(index, 'unidadReceta', e.target.value)}
                                                        className="h-8 rounded border border-slate-300 bg-white px-1 text-xs"
                                                    >
                                                        {opcionesComp.map((o) => (
                                                            <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                                                        ))}
                                                    </select>

                                                    <button
                                                        type="button"
                                                        disabled={filasReceta.length <= 1}
                                                        onClick={() => quitarFilaReceta(index)}
                                                        className="h-8 w-8 rounded bg-red-100 text-red-700 hover:bg-red-200 font-bold text-xs disabled:opacity-40 flex items-center justify-center"
                                                        title="Quitar este insumo"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            );
                                        })}

                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={filasReceta.length >= 30}
                                            onClick={agregarFilaReceta}
                                            className="w-full h-8 border-dashed text-xs text-sky-700 hover:bg-sky-50 font-bold mt-1 gap-1"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Agregar otro insumo ({filasReceta.length}/30)</span>
                                        </Button>
                                    </div>
                                )}

                                {tipoComposicion === 'combo' && (
                                    <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col gap-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-800">
                                                Componentes del Combo / Promoción:
                                            </span>
                                            <span className="text-xs font-bold text-sky-700">
                                                {filasCombo.length} / 20 productos
                                            </span>
                                        </div>

                                        {filasCombo.map((fila, index) => (
                                            <div key={index} className="grid grid-cols-[2fr_1fr_32px] gap-2 items-center">
                                                <select
                                                    required
                                                    value={fila.productoId}
                                                    onChange={(e) => {
                                                        const copia = [...filasCombo];
                                                        copia[index] = { ...copia[index], productoId: e.target.value };
                                                        setFilasCombo(copia);
                                                    }}
                                                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                                                >
                                                    <option value="">-- Elige producto componente --</option>
                                                    {(datos?.productos || [])
                                                        .filter((p) => p.tipo_inventario !== 'combo')
                                                        .map((p) => (
                                                             <option key={p.id} value={p.id}>
                                                                {p.nombre} (Costo: Bs {Number(p.costo).toFixed(2)})
                                                            </option>
                                                        ))}
                                                </select>

                                                <Input
                                                    type="number"
                                                    step="1"
                                                    min="1"
                                                    required
                                                    placeholder="Cant."
                                                    value={fila.cantidad}
                                                    onChange={(e) => {
                                                        const copia = [...filasCombo];
                                                        copia[index] = { ...copia[index], cantidad: e.target.value };
                                                        setFilasCombo(copia);
                                                    }}
                                                    className="h-8 text-xs bg-white"
                                                />

                                                <button
                                                    type="button"
                                                    disabled={filasCombo.length <= 1}
                                                    onClick={() => setFilasCombo(filasCombo.filter((_, i) => i !== index))}
                                                    className="h-8 w-8 rounded bg-red-100 text-red-700 hover:bg-red-200 font-bold text-xs disabled:opacity-40 flex items-center justify-center"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}

                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={filasCombo.length >= 20}
                                            onClick={() => setFilasCombo((prev) => [...prev, { productoId: '', cantidad: '1' }])}
                                            className="w-full h-8 border-dashed text-xs text-sky-700 hover:bg-sky-50 font-bold gap-1"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Agregar otro producto al combo ({filasCombo.length}/20)</span>
                                        </Button>

                                        {/* Modo de Límite */}
                                        <div className="border-t border-slate-200 pt-2.5">
                                            <span className="text-xs font-bold text-slate-800 block mb-1.5">
                                                Modo de Límite de Venta:
                                            </span>
                                            <div className="grid grid-cols-2 gap-2 mb-2">
                                                <label className={`flex items-center gap-1.5 p-2 rounded-md border text-xs cursor-pointer ${comboModoLimite === 'sin_limite' ? 'border-sky-600 bg-sky-50 font-bold' : 'border-slate-300 bg-white'}`}>
                                                    <input
                                                        type="radio"
                                                        name="modo_combo"
                                                        checked={comboModoLimite === 'sin_limite'}
                                                        onChange={() => setComboModoLimite('sin_limite')}
                                                    />
                                                    <span>Sin límite</span>
                                                </label>
                                                <label className={`flex items-center gap-1.5 p-2 rounded-md border text-xs cursor-pointer ${comboModoLimite === 'cantidad_maxima' ? 'border-sky-600 bg-sky-50 font-bold' : 'border-slate-300 bg-white'}`}>
                                                    <input
                                                        type="radio"
                                                        name="modo_combo"
                                                        checked={comboModoLimite === 'cantidad_maxima'}
                                                        onChange={() => setComboModoLimite('cantidad_maxima')}
                                                    />
                                                    <span>Cantidad máxima</span>
                                                </label>
                                            </div>

                                            {comboModoLimite === 'cantidad_maxima' && (
                                                <label className="text-xs text-slate-700 flex flex-col gap-1">
                                                    Número máximo de combos a vender:
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        step="1"
                                                        required
                                                        value={comboCantidadMaxima}
                                                        onChange={(e) => setComboCantidadMaxima(e.target.value)}
                                                        className="h-8 text-xs bg-white"
                                                    />
                                                </label>
                                            )}
                                        </div>

                                        {/* Vigencia Temporal */}
                                        <div className="border-t border-slate-200 pt-2.5">
                                            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={comboUsaVigencia}
                                                    onChange={(e) => setComboUsaVigencia(e.target.checked)}
                                                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                                />
                                                Programar vigencia temporal (Fecha y Hora)
                                            </label>

                                            {comboUsaVigencia && (
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    <label className="text-[11px] text-slate-600 flex flex-col gap-1">
                                                        Válido Desde:
                                                        <Input
                                                            type="datetime-local"
                                                            value={comboFechaInicio}
                                                            onChange={(e) => setComboFechaInicio(e.target.value)}
                                                            className="h-8 text-xs bg-white"
                                                        />
                                                    </label>
                                                    <label className="text-[11px] text-slate-600 flex flex-col gap-1">
                                                        Válido Hasta:
                                                        <Input
                                                            type="datetime-local"
                                                            value={comboFechaFin}
                                                            onChange={(e) => setComboFechaFin(e.target.value)}
                                                            className="h-8 text-xs bg-white"
                                                        />
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {tipoComposicion === 'libre' && (
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600">
                                        <em>Este producto se registrará como servicio o venta libre sin descontar stock físico del inventario.</em>
                                    </div>
                                )}

                                {/* Panel de cálculo en vivo */}
                                <div className="bg-emerald-50/60 p-3.5 rounded-lg border border-emerald-200 flex justify-around items-center text-center">
                                    <div>
                                        <div className="text-[10px] text-emerald-800 uppercase font-bold">Costo Calculado</div>
                                        <div className="text-lg font-bold text-emerald-700">
                                            Bs {costoEstimado.toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="border-l border-emerald-300 h-8" />
                                    <div>
                                        <div className="text-[10px] text-emerald-800 uppercase font-bold">Ganancia Estimada</div>
                                        <div className={`text-lg font-bold ${gananciaEstimada >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                            Bs {gananciaEstimada.toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="border-l border-emerald-300 h-8" />
                                    <div>
                                        <div className="text-[10px] text-emerald-800 uppercase font-bold">Margen Comercial</div>
                                        <div className={`text-lg font-bold ${margenPorcentaje >= 0 ? 'text-sky-700' : 'text-red-700'}`}>
                                            {margenPorcentaje.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>

                                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 mt-1 gap-1.5">
                                    <Save className="w-4 h-4" />
                                    <span>Guardar Producto en Catálogo</span>
                                </Button>
                            </form>
                        </section>

                        {/* COLUMNA DERECHA: REABASTECIMIENTO Y MERMAS */}
                        <div className="flex flex-col gap-5">
                            <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
                                <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-slate-700" />
                                    <span>Materiales e Insumos en Almacén</span>
                                </h3>
                                <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg">
                                    <Table className="text-xs">
                                        <TableHeader className="sticky top-0 bg-slate-50">
                                            <TableRow>
                                                <TableHead className="font-bold text-slate-900">Insumo</TableHead>
                                                <TableHead className="font-bold text-slate-900">Stock</TableHead>
                                                <TableHead className="font-bold text-slate-900">Costo Unit.</TableHead>
                                                <TableHead className="font-bold text-slate-900">Vencimiento</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(datos?.insumos || []).length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan="4" className="text-center text-slate-400 py-4">
                                                        Aún no tienes insumos registrados.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                (datos?.insumos || []).map((ins) => (
                                                    <TableRow key={ins.id}>
                                                        <TableCell className="font-bold">{ins.nombre}</TableCell>
                                                        <TableCell>{ins.stock_actual} {ins.unidad_medida}</TableCell>
                                                        <TableCell>Bs {Number(ins.costo_por_unidad).toFixed(2)}</TableCell>
                                                        <TableCell>
                                                            {ins.fecha_vencimiento ? (
                                                                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 font-medium text-[10px] whitespace-nowrap">
                                                                    {ins.fecha_vencimiento}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-slate-400 text-xs italic">-</span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => { limpiarAlertas?.(); setSeccionActiva?.('insumos'); }}
                                    className="w-full text-xs font-semibold gap-1.5"
                                >
                                    <Truck className="w-4 h-4" />
                                    <span>Ir a Reabastecer Insumos</span>
                                </Button>
                            </section>
                        </div>
                    </div>

                    {/* TABLA DE ARTÍCULOS */}
                    <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-4 mt-2">
                        <div className="flex justify-between items-center flex-wrap gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 m-0">
                                    Catálogo de Artículos {categoriaTabActiva !== 'todas' ? `— Categoría: ${categoriaTabActiva}` : ''}
                                </h3>
                                <span className="text-xs text-slate-500">
                                    {productosFiltrados.length} artículo(s) encontrado(s) de un total de {(datos?.productos || []).length}
                                </span>
                            </div>

                            {/* Buscador Rápido y Selector de Límite de Productos */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="relative min-w-[240px]">
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    <Input
                                        type="text"
                                        placeholder="Buscar artículo por nombre o categoría..."
                                        value={busquedaProductos}
                                        onChange={(e) => {
                                            setBusquedaProductos(e.target.value);
                                            setPaginaProductos(1);
                                        }}
                                        className="h-9 pl-8 pr-8 text-xs bg-white"
                                    />
                                    {busquedaProductos && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBusquedaProductos('');
                                                setPaginaProductos(1);
                                            }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs flex items-center justify-center p-0.5 rounded cursor-pointer"
                                            title="Limpiar búsqueda"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                <select
                                    value={limitePorPaginaProductos}
                                    onChange={(e) => {
                                        setLimitePorPaginaProductos(Number(e.target.value));
                                        setPaginaProductos(1);
                                    }}
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs shadow-sm focus:outline-none"
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
                            <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg text-sm">
                                {busquedaProductos
                                    ? <>No se encontraron artículos que coincidan con &ldquo;<strong>{busquedaProductos}</strong>&rdquo;.</>
                                    : 'No hay artículos registrados en esta categoría.'}
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                    <Table className="text-xs">
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead className="font-bold text-slate-900">ID</TableHead>
                                                <TableHead className="font-bold text-slate-900">Artículo</TableHead>
                                                <TableHead className="font-bold text-slate-900">Categoría</TableHead>
                                                <TableHead className="font-bold text-slate-900">Modalidad</TableHead>
                                                <TableHead className="font-bold text-slate-900">Precio Venta</TableHead>
                                                <TableHead className="font-bold text-slate-900">Costo Unitario</TableHead>
                                                <TableHead className="font-bold text-slate-900">Ganancia Unitaria</TableHead>
                                                <TableHead className="font-bold text-slate-900">Vencimiento</TableHead>
                                                <TableHead className="font-bold text-slate-900">Disponibilidad (Stock)</TableHead>
                                                <TableHead className="font-bold text-slate-900 text-center">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {productosPaginados.map((p) => {
                                                const gananciaUni = Number(p.precio) - Number(p.costo || 0);
                                                const stockBajo = p.tipo_inventario === 'directo' && Number(p.stock) <= Number(p.stock_minimo || 0);
                                                return (
                                                    <TableRow key={p.id}>
                                                        <TableCell className="font-medium text-slate-500">#{p.id}</TableCell>
                                                        <TableCell>
                                                            <strong className="text-slate-900">{p.nombre}</strong>
                                                            {p.grupos_modificadores && p.grupos_modificadores.length > 0 && (
                                                                <div className="flex gap-1 flex-wrap mt-1">
                                                                    {p.grupos_modificadores.map((g) => (
                                                                        <Badge key={g.id} variant="outline" className="bg-sky-50 text-sky-800 border-sky-200 text-[10px] font-semibold py-0 px-1.5 flex items-center gap-1">
                                                                            <Sparkles className="w-2.5 h-2.5" />
                                                                            <span>{g.nombre}</span>
                                                                        </Badge>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {p.categoria && p.categoria.trim() ? (
                                                                <div className="flex gap-1 flex-wrap">
                                                                    {p.categoria.split(',').map((catItem, idx) => {
                                                                        const cTrim = catItem.trim();
                                                                        if (!cTrim) return null;
                                                                        return (
                                                                            <Badge
                                                                                key={idx}
                                                                                variant="secondary"
                                                                                className="bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-semibold flex items-center gap-1"
                                                                            >
                                                                                <Tag className="w-2.5 h-2.5" />
                                                                                <span>{cTrim}</span>
                                                                            </Badge>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-400 text-xs italic">
                                                                    Sin categoría
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div>
                                                                {p.tipo_inventario === 'receta' ? (
                                                                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 font-semibold text-[11px] flex items-center gap-1 w-fit">
                                                                        <Layers className="w-3 h-3 text-purple-600" />
                                                                        <span>Receta / Insumo</span>
                                                                    </Badge>
                                                                ) : p.tipo_inventario === 'directo' ? (
                                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-semibold text-[11px] flex items-center gap-1 w-fit">
                                                                        <Package className="w-3 h-3 text-blue-600" />
                                                                        <span>Reventa Directa</span>
                                                                    </Badge>
                                                                ) : p.tipo_inventario === 'combo' ? (
                                                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-semibold text-[11px] flex items-center gap-1 w-fit">
                                                                        <Layers className="w-3 h-3 text-amber-600" />
                                                                        <span>Combo / Promo</span>
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-semibold text-[11px] flex items-center gap-1 w-fit">
                                                                        <Sparkles className="w-3 h-3 text-slate-500" />
                                                                        <span>Libre</span>
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {p.tipo_inventario === 'combo' && Number(p.limite_maximo_activo) === 1 && (
                                                                <div className="text-[11px] text-sky-700 mt-1 font-medium">
                                                                    Límite: {p.limite_unidades_restante}/{p.limite_unidades_total} u.
                                                                </div>
                                                            )}
                                                            {p.tipo_inventario === 'combo' && (p.fecha_inicio_vigencia || p.fecha_fin_vigencia) && (
                                                                <div className="mt-1">
                                                                    {p.esta_vigente === false ? (
                                                                        <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 text-[10px] flex items-center gap-1 w-fit">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block" />
                                                                            <span>{p.motivo_no_vigente || 'Fuera de vigencia'}</span>
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-[10px] flex items-center gap-1 w-fit">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
                                                                            <span>En vigencia</span>
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="font-bold text-slate-900">Bs {Number(p.precio).toFixed(2)}</TableCell>
                                                        <TableCell>Bs {Number(p.costo).toFixed(2)}</TableCell>
                                                        <TableCell className={`font-bold ${gananciaUni >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                            Bs {gananciaUni.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {p.fecha_vencimiento ? (
                                                                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 font-medium text-[11px] whitespace-nowrap inline-flex items-center gap-1">
                                                                    <Clock className="w-3 h-3 text-amber-700" />
                                                                    <span>{p.fecha_vencimiento}</span>
                                                                </Badge>
                                                            ) : (Array.isArray(p.lotes) && p.lotes.length > 0 && p.lotes[0].fecha_vencimiento) ? (
                                                                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 font-medium text-[11px] whitespace-nowrap inline-flex items-center gap-1">
                                                                    <Clock className="w-3 h-3 text-amber-700" />
                                                                    <span>{p.lotes[0].fecha_vencimiento}</span>
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-slate-400 text-xs italic">Sin vencimiento</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className={`font-bold ${p.unidades_disponibles === 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                            {p.tipo_inventario === 'libre' || p.unidades_disponibles === null
                                                                ? 'Libre (Servicio)'
                                                                : `${p.unidades_disponibles} ${p.unidad_medida || 'u.'} ${p.insumo_limitante ? `(Límite: ${p.insumo_limitante})` : ''} ${stockBajo ? '(Reponer)' : ''}`}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => abrirModalEditarProducto(p)}
                                                                    className="h-7 px-2 text-xs text-sky-700 hover:text-sky-800 hover:bg-sky-50 border-sky-300 font-semibold cursor-pointer flex items-center gap-1"
                                                                    title="Editar producto o receta"
                                                                >
                                                                    <Edit2 className="w-3 h-3" />
                                                                    <span>Editar</span>
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleEliminarProducto(p)}
                                                                    className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 font-semibold cursor-pointer flex items-center gap-1"
                                                                    title="Eliminar artículo del catálogo"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                    <span>Eliminar</span>
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                {totalPaginasProductos > 1 && (
                                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200 flex-wrap gap-2">
                                        <span className="text-xs text-slate-500">
                                            Mostrando {inicioProductos + 1} - {Math.min(inicioProductos + limitePorPaginaProductos, productosFiltrados.length)} de {productosFiltrados.length}
                                        </span>
                                        <div className="flex gap-1.5 items-center">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={paginaProductosValida <= 1}
                                                onClick={() => setPaginaProductos((p) => Math.max(1, p - 1))}
                                                className="h-7 text-xs font-bold flex items-center gap-1"
                                            >
                                                <ChevronLeft className="w-3.5 h-3.5" />
                                                <span>Anterior</span>
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={paginaProductosValida >= totalPaginasProductos}
                                                onClick={() => setPaginaProductos((p) => Math.min(totalPaginasProductos, p + 1))}
                                                className="h-7 text-xs font-bold flex items-center gap-1"
                                            >
                                                <span>Siguiente</span>
                                                <ChevronRight className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </>
            )}

            {/* MODAL DE EDICIÓN DE PRODUCTO Y RECETA */}
            {modalEditarAbierto && productoAEditar && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
                    <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
                        {/* Cabecera del Modal */}
                        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 m-0">
                                    <Edit2 className="w-4 h-4 text-sky-600" />
                                    <span>Editar Producto #{productoAEditar.id}</span>
                                    <Badge variant="outline" className="text-[11px] capitalize bg-white text-slate-700">
                                        {productoAEditar.tipo_inventario === 'receta' ? 'Receta' : productoAEditar.tipo_inventario === 'directo' ? 'Reventa Directa' : productoAEditar.tipo_inventario === 'combo' ? 'Combo' : 'Libre'}
                                    </Badge>
                                </h3>
                                <p className="text-xs text-slate-500 m-0 mt-0.5">
                                    Modifica los datos del producto, precios o proporciones de insumos de su receta.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setModalEditarAbierto(false);
                                    setProductoAEditar(null);
                                }}
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md p-1.5 transition-colors cursor-pointer text-sm flex items-center justify-center"
                                title="Cerrar ventana"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Formulario de Edición */}
                        <form onSubmit={handleGuardarEdicionProducto} className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-slate-800">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                    Nombre del Producto:
                                    <Input
                                        type="text"
                                        required
                                        value={editNombre}
                                        onChange={(e) => setEditNombre(e.target.value)}
                                        className="bg-white h-9"
                                    />
                                </label>

                                <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                    Precio de Venta al Público (Bs):
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej. 0.00 o 25.00"
                                        required
                                        value={editPrecio}
                                        onChange={(e) => setEditPrecio(e.target.value)}
                                        className="bg-white h-9"
                                    />
                                </label>
                            </div>

                            {/* Categorías del Producto */}
                            <div>
                                <span className="text-xs font-bold text-slate-700 block mb-1">
                                    Categorías Asignadas:
                                </span>
                                <div className="flex gap-1.5 flex-wrap items-center p-2.5 bg-slate-50 rounded-lg border border-slate-200 min-h-[40px]">
                                    {(!datos?.categorias || datos.categorias.length === 0) ? (
                                        <div className="text-xs text-slate-400">No hay categorías registradas.</div>
                                    ) : (
                                        datos.categorias.map((cat) => {
                                            const seleccionada = editCategorias.some(
                                                (c) => c.toLowerCase() === cat.nombre?.toLowerCase()
                                            );
                                            return (
                                                <button
                                                    key={cat.id || cat.nombre}
                                                    type="button"
                                                    onClick={() => toggleCategoriaEdit(cat.nombre)}
                                                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 transition-all ${
                                                        seleccionada
                                                            ? 'bg-sky-600 text-white shadow-sm'
                                                            : 'bg-white text-slate-700 border border-slate-300 hover:border-slate-400'
                                                    }`}
                                                >
                                                    {seleccionada ? (
                                                        <Check className="w-3 h-3" />
                                                    ) : (
                                                        <Tag className="w-3 h-3 text-slate-400" />
                                                    )}
                                                    <span>{cat.nombre}</span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                                {editCategorias.length > 0 && (
                                    <div className="flex justify-between items-center mt-1">
                                        <span className="text-[11px] text-sky-700 font-medium">
                                            Asignadas: <strong>{editCategorias.join(', ')}</strong>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setEditCategorias([])}
                                            className="text-[11px] text-slate-500 hover:text-slate-700 underline"
                                        >
                                            Limpiar selección
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Stock Mínimo y Fecha de Vencimiento */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                                {(productoAEditar.tipo_inventario === 'directo' || productoAEditar.tipo_inventario === 'receta') && (
                                    <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                        Stock Mínimo (Alerta de Reposición):
                                        <Input
                                            type="number"
                                            step="1"
                                            min="0"
                                            value={editStockMinimo}
                                            onChange={(e) => setEditStockMinimo(e.target.value)}
                                            className="bg-white h-8 text-xs"
                                        />
                                    </label>
                                )}
                                <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        <span>Fecha de Vencimiento:</span>
                                    </span>
                                    <Input
                                        type="date"
                                        value={editFechaVencimiento}
                                        onChange={(e) => setEditFechaVencimiento(e.target.value)}
                                        className="bg-white h-8 text-xs"
                                    />
                                </label>
                            </div>

                            {/* Modificación de Receta */}
                            {productoAEditar.tipo_inventario === 'receta' && (
                                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col gap-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-slate-800">
                                            Insumos y Materiales de la Receta:
                                        </span>
                                        <span className={`text-xs font-bold ${editFilasReceta.length >= 30 ? 'text-red-600' : 'text-sky-700'}`}>
                                            {editFilasReceta.length} / 30 insumos
                                        </span>
                                    </div>

                                    {editFilasReceta.map((fila, index) => {
                                        const insSel = (datos?.insumos || []).find((i) => String(i.id) === String(fila.insumoId));
                                        const unidadAlm = insSel ? insSel.unidad_medida : 'unidades';
                                        const opcionesComp = obtenerUnidadesCompatibles(unidadAlm);
                                        return (
                                            <div key={index} className="grid grid-cols-[1.4fr_1fr_1fr_32px] gap-1.5 items-center">
                                                <select
                                                    required
                                                    value={fila.insumoId}
                                                    onChange={(e) => cambiarFilaRecetaEdit(index, 'insumoId', e.target.value)}
                                                    className="h-8 rounded border border-slate-300 bg-white px-1 text-xs"
                                                >
                                                    <option value="">-- Insumo --</option>
                                                    {(datos?.insumos || []).map((i) => (
                                                        <option key={i.id} value={i.id}>
                                                            {i.nombre} ({i.unidad_medida})
                                                        </option>
                                                    ))}
                                                </select>

                                                <Input
                                                    type="number"
                                                    step="0.001"
                                                    min="0.001"
                                                    required
                                                    placeholder="Cantidad"
                                                    value={fila.cantidad}
                                                    onChange={(e) => cambiarFilaRecetaEdit(index, 'cantidad', e.target.value)}
                                                    className="h-8 text-xs bg-white"
                                                />

                                                <select
                                                    value={fila.unidadReceta || unidadAlm}
                                                    onChange={(e) => cambiarFilaRecetaEdit(index, 'unidadReceta', e.target.value)}
                                                    className="h-8 rounded border border-slate-300 bg-white px-1 text-xs"
                                                >
                                                    {opcionesComp.map((o) => (
                                                        <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                                                    ))}
                                                </select>

                                                <button
                                                    type="button"
                                                    disabled={editFilasReceta.length <= 1}
                                                    onClick={() => quitarFilaRecetaEdit(index)}
                                                    className="h-8 w-8 rounded bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center text-xs disabled:opacity-40 cursor-pointer"
                                                    title="Quitar este insumo"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        );
                                    })}

                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={editFilasReceta.length >= 30}
                                        onClick={agregarFilaRecetaEdit}
                                        className="w-full h-8 border-dashed text-xs text-sky-700 hover:bg-sky-50 font-bold mt-1 flex items-center justify-center gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Agregar otro insumo ({editFilasReceta.length}/30)</span>
                                    </Button>
                                </div>
                            )}

                            {/* Panel de cálculo en vivo de costo y margen */}
                            <div className="bg-emerald-50/60 p-3.5 rounded-lg border border-emerald-200 flex justify-around items-center text-center">
                                <div>
                                    <div className="text-[10px] text-emerald-800 uppercase font-bold">Costo Estimado</div>
                                    <div className="text-lg font-bold text-emerald-700">
                                        Bs {costoEstimadoEdit.toFixed(2)}
                                    </div>
                                </div>
                                <div className="border-l border-emerald-300 h-8" />
                                <div>
                                    <div className="text-[10px] text-emerald-800 uppercase font-bold">Ganancia Estimada</div>
                                    <div className={`text-lg font-bold ${gananciaEstimadaEdit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        Bs {gananciaEstimadaEdit.toFixed(2)}
                                    </div>
                                </div>
                                <div className="border-l border-emerald-300 h-8" />
                                <div>
                                    <div className="text-[10px] text-emerald-800 uppercase font-bold">Margen Comercial</div>
                                    <div className={`text-lg font-bold ${margenPorcentajeEdit >= 0 ? 'text-sky-700' : 'text-red-700'}`}>
                                        {margenPorcentajeEdit.toFixed(1)}%
                                    </div>
                                </div>
                            </div>

                            {/* Botones de Acción */}
                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setModalEditarAbierto(false);
                                        setProductoAEditar(null);
                                    }}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={guardandoEdicion}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5"
                                >
                                    <Save className="w-4 h-4" />
                                    <span>{guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}</span>
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
