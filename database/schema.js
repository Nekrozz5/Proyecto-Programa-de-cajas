/**
 * database/schema.js
 * Definición completa del esquema SQLite para Drizzle ORM.
 * Mapea las 19 tablas del sistema de cajas respetando claves foráneas,
 * tipos numéricos para cálculos de alta precisión (NIC 2 / Kardex) y relaciones.
 */

const {
    sqliteTable,
    text,
    integer,
    real,
    primaryKey
} = require('drizzle-orm/sqlite-core');
const { relations, sql } = require('drizzle-orm');

// 1. Configuración del Negocio (Singleton id = 1)
const configuracionNegocio = sqliteTable('configuracion_negocio', {
    id: integer('id').primaryKey(),
    nombreNegocio: text('nombre_negocio').default('Mi Negocio'),
    modalidadNombre: text('modalidad_nombre').default('Artículos No Perecederos'),
    usaStockDirecto: integer('usa_stock_directo').default(1),
    usaVencimiento: integer('usa_vencimiento').default(0),
    usaRecetasEnsamblaje: integer('usa_recetas_ensamblaje').default(0),
    habilitaAppsComida: integer('habilita_apps_comida').default(0),
    configurado: integer('configurado').default(0),
    nitNegocio: text('nit_negocio').default(''),
    regimenTributario: text('regimen_tributario').default('simplificado_control_interno'),
    emiteFactura: integer('emite_factura').default(0),
    ivaPorcentaje: real('iva_porcentaje').default(13),
    itPorcentaje: real('it_porcentaje').default(3),
    usaRespaldoComprasEgresos: integer('usa_respaldo_compras_egresos').default(1),
    itBase: text('it_base').default('todas_las_ventas')
});

// 2. Estaciones Físicas de Cobro
const cajasFisicas = sqliteTable('cajas_fisicas', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull().unique(),
    activa: integer('activa').notNull().default(1),
    creadaEn: text('creada_en').default(sql`CURRENT_TIMESTAMP`),
    habilitaRespaldoFiscal: integer('habilita_respaldo_fiscal').default(1)
});

// 3. Usuarios y Roles
const usuarios = sqliteTable('usuarios', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull(),
    pinOPassword: text('pin_o_password').notNull(),
    rol: text('rol').notNull(), // 'user', 'admin', 'propietario', 'developer'
    activo: integer('activo').default(1),
    puedeRegistrarRespaldoFiscal: integer('puede_registrar_respaldo_fiscal').default(1)
});

// 4. Categorías de Productos
const categorias = sqliteTable('categorias', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull().unique(),
    activo: integer('activo').default(1)
});

// 5. Catálogo de Productos
const productos = sqliteTable('productos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull(),
    precio: real('precio').notNull(),
    costo: real('costo').default(0),
    categoria: text('categoria').default('General'),
    unidadMedida: text('unidad_medida').default('unidades'),
    tipoInventario: text('tipo_inventario').default('libre'), // 'libre', 'directo', 'receta', 'combo'
    stock: real('stock'),
    stockMinimo: real('stock_minimo').default(0),
    fechaVencimiento: text('fecha_vencimiento'),
    activo: integer('activo').default(1),
    limiteMaximoActivo: integer('limite_maximo_activo').default(0),
    limiteUnidadesTotal: real('limite_unidades_total'),
    limiteUnidadesRestante: real('limite_unidades_restante'),
    fechaInicioVigencia: text('fecha_inicio_vigencia'),
    fechaFinVigencia: text('fecha_fin_vigencia')
});

// 6. Insumos (Cafetería / Gastronomía / Recetas)
const insumos = sqliteTable('insumos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull(),
    unidadMedida: text('unidad_medida').notNull(),
    stockActual: real('stock_actual').default(0),
    costoPorUnidad: real('costo_por_unidad').default(0),
    stockSeguridad: real('stock_seguridad').default(0),
    tiempoEntregaDias: integer('tiempo_entrega_dias').default(1),
    fechaVencimiento: text('fecha_vencimiento'),
    activo: integer('activo').default(1)
});

// 7. Recetas (Escandallo multi-insumo por producto)
const recetas = sqliteTable('recetas', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productoId: integer('producto_id').notNull().references(() => productos.id),
    insumoId: integer('insumo_id').notNull().references(() => insumos.id),
    cantidadRequerida: real('cantidad_requerida').notNull()
});

// 8. Grupos de Modificadores (Opciones, Toppings, Sustituciones)
const gruposModificadores = sqliteTable('grupos_modificadores', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull(),
    tipoSeleccion: text('tipo_seleccion').notNull().default('unica'), // 'unica', 'multiple'
    esObligatorio: integer('es_obligatorio').notNull().default(0),
    activo: integer('activo').notNull().default(1),
    creadoEn: text('creado_en').default(sql`CURRENT_TIMESTAMP`)
});

// 9. Vinculación Producto <-> Grupos de Modificadores
const productoGruposModificadores = sqliteTable('producto_grupos_modificadores', {
    productoId: integer('producto_id').notNull().references(() => productos.id),
    grupoId: integer('grupo_id').notNull().references(() => gruposModificadores.id)
}, (t) => ({
    pk: primaryKey({ columns: [t.productoId, t.grupoId] })
}));

// 10. Opciones dentro de cada Grupo de Modificadores
const modificadoresOpciones = sqliteTable('modificadores_opciones', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    grupoId: integer('grupo_id').notNull().references(() => gruposModificadores.id),
    nombre: text('nombre').notNull(),
    insumoId: integer('insumo_id').references(() => insumos.id),
    cantidadInsumo: real('cantidad_insumo').default(0),
    precioAdicional: real('precio_adicional').notNull().default(0),
    insumoReemplazadoId: integer('insumo_reemplazado_id').references(() => insumos.id),
    esDefault: integer('es_default').notNull().default(0),
    activo: integer('activo').notNull().default(1)
});

// 11. Componentes de Combos y Paquetes
const comboComponentes = sqliteTable('combo_componentes', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    comboProductoId: integer('combo_producto_id').notNull().references(() => productos.id, { onDelete: 'cascade' }),
    componenteProductoId: integer('componente_producto_id').notNull().references(() => productos.id, { onDelete: 'restrict' }),
    cantidad: real('cantidad').notNull()
});

// 12. Turnos de Operación / Arqueos de Caja
const cajas = sqliteTable('cajas', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    usuarioId: integer('usuario_id').notNull().references(() => usuarios.id),
    cajaFisicaId: integer('caja_fisica_id').default(1).references(() => cajasFisicas.id),
    montoInicial: real('monto_inicial').notNull(),
    efectivoEsperado: real('efectivo_esperado'),
    efectivoReal: real('efectivo_real'),
    qrEsperado: real('qr_esperado').default(0),
    qrReal: real('qr_real'),
    diferenciaEfectivo: real('diferencia_efectivo'),
    diferenciaQr: real('diferencia_qr'),
    estado: text('estado').default('abierta'), // 'abierta', 'cerrada'
    vecesReabierta: integer('veces_reabierta').default(0),
    historialReaperturas: text('historial_reaperturas').default(''),
    observacionesCierre: text('observaciones_cierre').default(''),
    fechaApertura: text('fecha_apertura').default(sql`CURRENT_TIMESTAMP`),
    fechaCierre: text('fecha_cierre')
});

// 13. Movimientos Financieros (Ventas, Aportes, Egresos)
const movimientos = sqliteTable('movimientos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cajaId: integer('caja_id').notNull().references(() => cajas.id),
    usuarioId: integer('usuario_id').notNull().references(() => usuarios.id),
    tipo: text('tipo').notNull(), // 'ingreso', 'egreso'
    categoriaContable: text('categoria_contable').notNull().default('venta'),
    subtotalBruto: real('subtotal_bruto').notNull().default(0),
    descuentoTotal: real('descuento_total').notNull().default(0),
    monto: real('monto').notNull(),
    metodoPago: text('metodo_pago').notNull(), // 'efectivo', 'qr', 'mixto'
    montoEfectivo: real('monto_efectivo').notNull().default(0),
    montoQr: real('monto_qr').notNull().default(0),
    referenciaQr: text('referencia_qr'),
    montoRecibido: real('monto_recibido'),
    cambio: real('cambio').default(0),
    tipoComprobante: text('tipo_comprobante').notNull().default('recibo'),
    nroFactura: text('nro_factura'),
    cufAutorizacion: text('cuf_autorizacion').default(''),
    codigoControl: text('codigo_control').default('0'),
    tipoCompra: integer('tipo_compra').default(1),
    clienteNitCi: text('cliente_nit_ci'),
    clienteRazonSocial: text('cliente_razon_social'),
    descripcion: text('descripcion').default(''),
    canalVenta: text('canal_venta').default('local'), // 'local', 'mototaxi', 'pedidos_ya', 'yango'
    datosEntrega: text('datos_entrega').default(''),
    referenciaExterna: text('referencia_externa').default(''),
    estado: text('estado').default('completado'), // 'completado', 'anulado'
    fechaHora: text('fecha_hora').default(sql`CURRENT_TIMESTAMP`),
    anuladoPor: integer('anulado_por').references(() => usuarios.id),
    fechaAnulacion: text('fecha_anulacion'),
    motivoAnulacion: text('motivo_anulacion'),
    regimenTributario: text('regimen_tributario'),
    ivaPorcentaje: real('iva_porcentaje').default(0),
    itPorcentaje: real('it_porcentaje').default(0),
    ivaMonto: real('iva_monto').default(0),
    itMonto: real('it_monto').default(0)
});

// 14. Desglose de Pagos (Fuente de verdad: simple o mixto)
const movimientosPagos = sqliteTable('movimientos_pagos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    movimientoId: integer('movimiento_id').notNull().references(() => movimientos.id, { onDelete: 'cascade' }),
    metodoPago: text('metodo_pago').notNull(), // 'efectivo', 'qr', 'pedidos_ya', 'yango'
    monto: real('monto').notNull(),
    referencia: text('referencia')
});

// 15. Detalle de Líneas de Venta (Productos y Congelamiento de Costos)
const detalleMovimientos = sqliteTable('detalle_movimientos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    movimientoId: integer('movimiento_id').notNull().references(() => movimientos.id),
    productoId: integer('producto_id').notNull().references(() => productos.id),
    cantidad: real('cantidad').notNull(),
    precioUnitario: real('precio_unitario').notNull(),
    costoUnitario: real('costo_unitario').notNull(),
    subtotal: real('subtotal').notNull()
});

// 16. Desglose de Componentes de Combos en Ventas
const detalleMovimientosCombos = sqliteTable('detalle_movimientos_combos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    detalleMovimientoId: integer('detalle_movimiento_id').notNull().references(() => detalleMovimientos.id, { onDelete: 'cascade' }),
    componenteProductoId: integer('componente_producto_id').notNull().references(() => productos.id),
    cantidadUnitaria: real('cantidad_unitaria').notNull(),
    cantidadTotal: real('cantidad_total').notNull(),
    costoUnitarioCongelado: real('costo_unitario_congelado').notNull()
});

// 17. Desglose de Modificadores en Ventas
const detalleMovimientosModificadores = sqliteTable('detalle_movimientos_modificadores', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    detalleMovimientoId: integer('detalle_movimiento_id').notNull().references(() => detalleMovimientos.id),
    modificadorOpcionId: integer('modificador_opcion_id').references(() => modificadoresOpciones.id),
    nombre: text('nombre').notNull(),
    precioAdicional: real('precio_adicional').notNull().default(0),
    costoAdicional: real('costo_adicional').notNull().default(0),
    insumoId: integer('insumo_id').references(() => insumos.id),
    cantidadInsumo: real('cantidad_insumo').default(0),
    insumoReemplazadoId: integer('insumo_reemplazado_id').references(() => insumos.id)
});

// 18. Kardex Cronológico de Productos Directos
const movimientosProductosDirectos = sqliteTable('movimientos_productos_directos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productoId: integer('producto_id').notNull().references(() => productos.id),
    movimientoId: integer('movimiento_id').references(() => movimientos.id),
    usuarioId: integer('usuario_id').references(() => usuarios.id),
    tipo: text('tipo').notNull(), // 'inventario_inicial', 'compra', 'venta', 'merma', 'reingreso_anulacion', 'ajuste'
    cantidad: real('cantidad').notNull(),
    stockResultante: real('stock_resultante').notNull(),
    costoUnitario: real('costo_unitario').notNull(),
    costoPromedioResultante: real('costo_promedio_resultante').default(0),
    montoTotal: real('monto_total').notNull().default(0),
    proveedorNombre: text('proveedor_nombre'),
    proveedorNit: text('proveedor_nit'),
    nroFacturaCompra: text('nro_factura_compra'),
    nroAutorizacionCuf: text('nro_autorizacion_cuf').default(''),
    codigoControl: text('codigo_control').default('0'),
    tipoCompra: integer('tipo_compra').default(1),
    conFactura: integer('con_factura').default(0),
    motivo: text('motivo').default(''),
    fechaHora: text('fecha_hora').default(sql`CURRENT_TIMESTAMP`)
});

// 19. Kardex Cronológico de Insumos
const movimientosInsumos = sqliteTable('movimientos_insumos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    insumoId: integer('insumo_id').notNull().references(() => insumos.id),
    movimientoId: integer('movimiento_id').references(() => movimientos.id),
    usuarioId: integer('usuario_id').references(() => usuarios.id),
    tipo: text('tipo').notNull(), // 'inventario_inicial', 'compra', 'consumo_venta', 'merma', 'reingreso_anulacion', 'ajuste'
    cantidad: real('cantidad').notNull(),
    stockResultante: real('stock_resultante').notNull().default(0),
    costoUnitario: real('costo_unitario').notNull(),
    costoPromedioResultante: real('costo_promedio_resultante').notNull().default(0),
    montoTotalCompra: real('monto_total_compra').default(0),
    proveedorNombre: text('proveedor_nombre'),
    proveedorNit: text('proveedor_nit'),
    nroFacturaCompra: text('nro_factura_compra'),
    nroAutorizacionCuf: text('nro_autorizacion_cuf').default(''),
    codigoControl: text('codigo_control').default('0'),
    tipoCompra: integer('tipo_compra').default(1),
    conFactura: integer('con_factura').default(0),
    motivo: text('motivo').default(''),
    fechaHora: text('fecha_hora').default(sql`CURRENT_TIMESTAMP`)
});

// 20. Lotes de Productos con Fecha de Vencimiento
const productoLotes = sqliteTable('producto_lotes', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productoId: integer('producto_id').notNull().references(() => productos.id, { onDelete: 'cascade' }),
    fechaVencimiento: text('fecha_vencimiento').notNull(),
    stock: real('stock').notNull().default(0),
    costoUnitario: real('costo_unitario').notNull().default(0),
    activo: integer('activo').notNull().default(1),
    creadoEn: text('creado_en').default(sql`CURRENT_TIMESTAMP`)
});

// 21. Configuración SMTP Dinámica (Singleton id = 1)
const configuracionSmtp = sqliteTable('configuracion_smtp', {
    id: integer('id').primaryKey(),
    host: text('host'),
    puerto: integer('puerto'),
    secure: integer('secure'),
    usuario: text('usuario'),
    password: text('password'),
    remitenteNombre: text('remitente_nombre'),
    activo: integer('activo').default(0),
    actualizadoEn: text('actualizado_en')
});

// 22. Destinatarios de Notificaciones por Correo
const notificacionDestinatarios = sqliteTable('notificacion_destinatarios', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').unique(),
    nombre: text('nombre'),
    verificado: integer('verificado').default(0),
    codigoVerificacion: text('codigo_verificacion'),
    codigoExpira: text('codigo_expira'),
    intentosFallidos: integer('intentos_fallidos').default(0),
    activo: integer('activo').default(1),
    creadoPor: integer('creado_por').references(() => usuarios.id),
    creadoEn: text('creado_en'),
    verificadoEn: text('verificado_en')
});

// ==========================================
// DEFINICIONES DE RELACIONES RELACIONALES (DRIZZLE RELATIONS)
// ==========================================

const productosRelations = relations(productos, ({ many }) => ({
    recetas: many(recetas),
    comboComponentes: many(comboComponentes, { relationName: 'comboPrincipal' }),
    componenteDeCombos: many(comboComponentes, { relationName: 'esComponente' }),
    gruposModificadores: many(productoGruposModificadores),
    detallesVenta: many(detalleMovimientos),
    kardexDirecto: many(movimientosProductosDirectos),
    lotes: many(productoLotes)
}));

const productoLotesRelations = relations(productoLotes, ({ one }) => ({
    producto: one(productos, { fields: [productoLotes.productoId], references: [productos.id] })
}));

const insumosRelations = relations(insumos, ({ many }) => ({
    recetas: many(recetas),
    modificadoresOpciones: many(modificadoresOpciones),
    kardexInsumo: many(movimientosInsumos)
}));

const recetasRelations = relations(recetas, ({ one }) => ({
    producto: one(productos, { fields: [recetas.productoId], references: [productos.id] }),
    insumo: one(insumos, { fields: [recetas.insumoId], references: [insumos.id] })
}));

const comboComponentesRelations = relations(comboComponentes, ({ one }) => ({
    combo: one(productos, { fields: [comboComponentes.comboProductoId], references: [productos.id], relationName: 'comboPrincipal' }),
    componente: one(productos, { fields: [comboComponentes.componenteProductoId], references: [productos.id], relationName: 'esComponente' })
}));

const gruposModificadoresRelations = relations(gruposModificadores, ({ many }) => ({
    opciones: many(modificadoresOpciones),
    productos: many(productoGruposModificadores)
}));

const productoGruposModificadoresRelations = relations(productoGruposModificadores, ({ one }) => ({
    producto: one(productos, { fields: [productoGruposModificadores.productoId], references: [productos.id] }),
    grupo: one(gruposModificadores, { fields: [productoGruposModificadores.grupoId], references: [gruposModificadores.id] })
}));

const modificadoresOpcionesRelations = relations(modificadoresOpciones, ({ one }) => ({
    grupo: one(gruposModificadores, { fields: [modificadoresOpciones.grupoId], references: [gruposModificadores.id] }),
    insumo: one(insumos, { fields: [modificadoresOpciones.insumoId], references: [insumos.id] })
}));

const cajasRelations = relations(cajas, ({ one, many }) => ({
    cajaFisica: one(cajasFisicas, { fields: [cajas.cajaFisicaId], references: [cajasFisicas.id] }),
    usuario: one(usuarios, { fields: [cajas.usuarioId], references: [usuarios.id] }),
    movimientos: many(movimientos)
}));

const movimientosRelations = relations(movimientos, ({ one, many }) => ({
    caja: one(cajas, { fields: [movimientos.cajaId], references: [cajas.id] }),
    usuario: one(usuarios, { fields: [movimientos.usuarioId], references: [usuarios.id] }),
    anulador: one(usuarios, { fields: [movimientos.anuladoPor], references: [usuarios.id] }),
    pagos: many(movimientosPagos),
    detalles: many(detalleMovimientos)
}));

const movimientosPagosRelations = relations(movimientosPagos, ({ one }) => ({
    movimiento: one(movimientos, { fields: [movimientosPagos.movimientoId], references: [movimientos.id] })
}));

const detalleMovimientosRelations = relations(detalleMovimientos, ({ one, many }) => ({
    movimiento: one(movimientos, { fields: [detalleMovimientos.movimientoId], references: [movimientos.id] }),
    producto: one(productos, { fields: [detalleMovimientos.productoId], references: [productos.id] }),
    modificadores: many(detalleMovimientosModificadores),
    componentesCombo: many(detalleMovimientosCombos)
}));

const notificacionDestinatariosRelations = relations(notificacionDestinatarios, ({ one }) => ({
    creador: one(usuarios, { fields: [notificacionDestinatarios.creadoPor], references: [usuarios.id] })
}));

module.exports = {
    configuracionNegocio,
    cajasFisicas,
    usuarios,
    categorias,
    productos,
    insumos,
    recetas,
    gruposModificadores,
    productoGruposModificadores,
    modificadoresOpciones,
    comboComponentes,
    cajas,
    movimientos,
    movimientosPagos,
    detalleMovimientos,
    detalleMovimientosCombos,
    detalleMovimientosModificadores,
    movimientosProductosDirectos,
    movimientosInsumos,
    productoLotes,
    configuracionSmtp,
    notificacionDestinatarios,
    // Relaciones
    productosRelations,
    insumosRelations,
    recetasRelations,
    comboComponentesRelations,
    gruposModificadoresRelations,
    productoGruposModificadoresRelations,
    modificadoresOpcionesRelations,
    cajasRelations,
    movimientosRelations,
    movimientosPagosRelations,
    detalleMovimientosRelations,
    productoLotesRelations,
    notificacionDestinatariosRelations
};
