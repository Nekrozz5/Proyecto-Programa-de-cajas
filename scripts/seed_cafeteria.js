// ==========================================
// SEED DE PRUEBA INTEGRAL: CAFETERÍA & BAKERY GOURMET (v16)
// Puebla la base de datos con datos completos y coherentes para pruebas exhaustivas
// utilizando el 100% de las funcionalidades del sistema:
// - Régimen General con liquidación fiscal (IVA 13%, IT 3%, base configurable y facturas SIAT)
// - Respaldo fiscal SIAT RCV (CUF de autorización, código de control, tipo de compra)
// - Estaciones multicaja física (Barra Principal y Terraza & Take Away) con turnos simultáneos
// - Usuarios con perfiles diferenciados: Propietario(a), Admin, Cajeros y Developer
// - Configuración SMTP dinámica y destinatarios de alertas por correo con verificación
// - Soporte completo de Delivery y Apps de Comida (PedidosYa, Yango, Mototaxi Propio, Local)
// - Materia prima métrica con hasta 6 decimales (NIC 2 CPP) y Kardex de Insumos
// - Compras de reposición con factura (crédito fiscal) y mermas registradas en Kardex
// - Los 4 tipos de catálogo: Libre (servicios), Directo (reventa), Receta (elaborados) y Combo (promociones)
// - Trazabilidad de Lotes y Vencimiento PEPS / FIFO: multi-lote, selección manual y PEPS automático
// - Productos elaborados por receta con escandallo multi-insumo
// - Grupos de modificadores: reemplazos de insumos, adiciones y operativos
// - Combos y promociones: descomposición atómica, límites de unidades y vigencia temporal
// - Ventas diversas: Efectivo con cambio, QR conciliado, Pagos Mixtos, Apps de Comida y Facturas SIAT
// - Descuentos comerciales con prorrateo neto exacto entre líneas
// - Anulación auditada de venta con rollback completo en inventario y Kardex
// - Reapertura auditada de turno de caja (historial_reaperturas y veces_reabierta)
// - Egresos operativos y egresos respaldados con factura (crédito fiscal)
// - Inyecciones de sencillo (ingreso_efectivo)
// - Arqueo ciego cuadrado en Turnos Históricos y Turnos ABIERTOS en simultáneo hoy en ambas cajas
// - Verificación automática de integridad algebraica de Kardex directo, insumos y Lotes PEPS
// ==========================================

const bcrypt = require('bcryptjs');
const db = require('../database/database');
const queries = require('../server/queries');

const BCRYPT_ROUNDS = 10;

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function sembrarCafeteriaCompleta() {
    console.log('==================================================================');
    console.log('--- INICIANDO SEED INTEGRAL DE CAFETERÍA & BAKERY (v16) ---');
    console.log('==================================================================');

    // 1. Limpieza de tablas operativas
    console.log('[1/14] Limpiando tablas operativas previas en orden relacional...');
    await run(`DELETE FROM detalle_movimientos_combos`);
    await run(`DELETE FROM detalle_movimientos_modificadores`);
    await run(`DELETE FROM combo_componentes`);
    await run(`DELETE FROM producto_grupos_modificadores`);
    await run(`DELETE FROM modificadores_opciones`);
    await run(`DELETE FROM grupos_modificadores`);
    await run(`DELETE FROM movimientos_productos_directos`);
    await run(`DELETE FROM movimientos_insumos`);
    await run(`DELETE FROM movimientos_pagos`);
    await run(`DELETE FROM detalle_movimientos`);
    await run(`DELETE FROM movimientos`);
    await run(`DELETE FROM recetas`);
    await run(`DELETE FROM producto_lotes`);
    await run(`DELETE FROM productos`);
    await run(`DELETE FROM insumos`);
    await run(`DELETE FROM cajas`);
    await run(`DELETE FROM categorias`);
    await run(`DELETE FROM notificacion_destinatarios`);
    await run(`DELETE FROM configuracion_smtp`);

    // 2. Configuración del negocio y módulo fiscal (Régimen General + Apps de Comida v14)
    console.log('[2/14] Configurando parámetros contables, fiscales y delivery del negocio...');
    await run(
        `UPDATE configuracion_negocio
         SET nombre_negocio = 'Café Gourmet & Bakery Aroma',
             modalidad_nombre = 'Elaboración con Recetas e Insumos Perecederos',
             usa_stock_directo = 1,
             usa_vencimiento = 1,
             usa_recetas_ensamblaje = 1,
             habilita_apps_comida = 1,
             configurado = 1,
             nit_negocio = '1029384756',
             regimen_tributario = 'regimen_general',
             emite_factura = 1,
             iva_porcentaje = 13.00,
             it_porcentaje = 3.00,
             it_base = 'todas_las_ventas',
             usa_respaldo_compras_egresos = 1
         WHERE id = 1`
    );

    // 3. Estaciones de caja física multicaja
    console.log('[3/14] Configurando estaciones multicaja física (Barra y Terraza)...');
    await run(
        `UPDATE cajas_fisicas
         SET nombre = 'Caja 1 - Barra Principal',
             activa = 1,
             habilita_respaldo_fiscal = 1
         WHERE id = 1`
    );
    await run(
        `INSERT OR IGNORE INTO cajas_fisicas (id, nombre, activa, habilita_respaldo_fiscal)
         VALUES (2, 'Caja 2 - Terraza & Take Away', 1, 1)`
    );

    // 4. Usuarios del sistema con perfiles diferenciados (Clave universal: 12345678)
    console.log('[4/14] Configurando usuarios y credenciales (Clave universal: 12345678)...');
    const PASSWORD_UNIVERSAL = '12345678';
    const hashUniversal = await bcrypt.hash(PASSWORD_UNIVERSAL, BCRYPT_ROUNDS);

    // Propietario(a): carlos (v16)
    let carlosId;
    const carlos = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'carlos'`);
    if (!carlos) {
        const res = await run(
            `INSERT INTO usuarios (nombre, pin_o_password, rol, activo, puede_registrar_respaldo_fiscal)
             VALUES ('carlos', ?, 'propietario', 1, 1)`,
            [hashUniversal]
        );
        carlosId = res.lastID;
    } else {
        await run(
            `UPDATE usuarios
             SET pin_o_password = ?, rol = 'propietario', activo = 1, puede_registrar_respaldo_fiscal = 1
             WHERE id = ?`,
            [hashUniversal, carlos.id]
        );
        carlosId = carlos.id;
    }

    // Admin: sofia
    let sofiaId;
    const sofia = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'sofia'`);
    if (!sofia) {
        const res = await run(
            `INSERT INTO usuarios (nombre, pin_o_password, rol, activo, puede_registrar_respaldo_fiscal)
             VALUES ('sofia', ?, 'admin', 1, 1)`,
            [hashUniversal]
        );
        sofiaId = res.lastID;
    } else {
        await run(
            `UPDATE usuarios
             SET pin_o_password = ?, rol = 'admin', activo = 1, puede_registrar_respaldo_fiscal = 1
             WHERE id = ?`,
            [hashUniversal, sofia.id]
        );
        sofiaId = sofia.id;
    }

    // Cajera 1: lucia
    let luciaId;
    const lucia = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'lucia'`);
    if (!lucia) {
        const res = await run(
            `INSERT INTO usuarios (nombre, pin_o_password, rol, activo, puede_registrar_respaldo_fiscal)
             VALUES ('lucia', ?, 'user', 1, 1)`,
            [hashUniversal]
        );
        luciaId = res.lastID;
    } else {
        await run(
            `UPDATE usuarios
             SET pin_o_password = ?, rol = 'user', activo = 1, puede_registrar_respaldo_fiscal = 1
             WHERE id = ?`,
            [hashUniversal, lucia.id]
        );
        luciaId = lucia.id;
    }

    // Cajero 2: marcos
    let marcosId;
    const marcos = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'marcos'`);
    if (!marcos) {
        const res = await run(
            `INSERT INTO usuarios (nombre, pin_o_password, rol, activo, puede_registrar_respaldo_fiscal)
             VALUES ('marcos', ?, 'user', 1, 1)`,
            [hashUniversal]
        );
        marcosId = res.lastID;
    } else {
        await run(
            `UPDATE usuarios
             SET pin_o_password = ?, rol = 'user', activo = 1, puede_registrar_respaldo_fiscal = 1
             WHERE id = ?`,
            [hashUniversal, marcos.id]
        );
        marcosId = marcos.id;
    }

    // Developer técnico
    const dev = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'developer'`);
    if (!dev) {
        await run(
            `INSERT INTO usuarios (nombre, pin_o_password, rol, activo, puede_registrar_respaldo_fiscal)
             VALUES ('developer', ?, 'developer', 1, 1)`,
            [hashUniversal]
        );
    } else {
        await run(
            `UPDATE usuarios
             SET pin_o_password = ?, rol = 'developer', activo = 1, puede_registrar_respaldo_fiscal = 1
             WHERE id = ?`,
            [hashUniversal, dev.id]
        );
    }

    // 5. Configuración SMTP dinámica y Destinatarios de Alertas de Cierre (v15)
    console.log('[5/14] Configurando servicio SMTP dinámico y destinatarios verificados...');
    await run(
        `INSERT OR REPLACE INTO configuracion_smtp (id, host, puerto, secure, usuario, password, remitente_nombre, activo, actualizado_en)
         VALUES (1, 'smtp.gmail.com', 465, 1, 'notificaciones@cafearoma.bo', 'demo-app-password-segura', 'Café Gourmet Aroma - Control POS', 1, CURRENT_TIMESTAMP)`
    );

    await run(
        `INSERT INTO notificacion_destinatarios (email, nombre, verificado, activo, creado_por, creado_en, verificado_en)
         VALUES ('carlos.propietario@cafearoma.bo', 'Carlos Mendoza (Propietario)', 1, 1, ?, datetime('now', '-2 days'), datetime('now', '-2 days'))`,
        [carlosId]
    );
    await run(
        `INSERT INTO notificacion_destinatarios (email, nombre, verificado, activo, creado_por, creado_en, verificado_en)
         VALUES ('sofia.admin@cafearoma.bo', 'Sofía Valenzuela (Administradora)', 1, 1, ?, datetime('now', '-2 days'), datetime('now', '-2 days'))`,
        [carlosId]
    );
    await run(
        `INSERT INTO notificacion_destinatarios (email, nombre, verificado, codigo_verificacion, codigo_expira, activo, creado_por, creado_en)
         VALUES ('auditoria@cafearoma.bo', 'Auditoría Fiscal Externa', 0, '582914', datetime('now', '+1 day'), 1, ?, datetime('now'))`,
        [carlosId]
    );

    // 6. Categorías del catálogo
    console.log('[6/14] Creando categorías del catálogo completo...');
    const categorias = [
        'Cafés Calientes',
        'Bebidas Frías & Frappés',
        'Tés & Infusiones',
        'Pastelería & Dulces',
        'Sándwiches & Salados',
        'Bebidas Embotelladas',
        'Snacks & Empaquetados',
        'Combos & Promociones',
        'Servicios & Eventos'
    ];
    for (const cat of categorias) {
        await queries.crearCategoria(cat);
    }

    // 7. Insumos (Materia Prima con precisión métrica de hasta 6 decimales NIC 2 CPP)
    console.log('[7/14] Creando insumos de almacén y compras con crédito fiscal RCV SIAT...');
    const listaInsumos = [
        // Cafetería base
        { nombre: 'Café en Grano Tostado Especial', unidad: 'gramos', stock: 15000, costo: 0.025, seg: 2000, entrega: 2, venc: '2027-06-30' },
        { nombre: 'Leche Entera Barista', unidad: 'mililitros', stock: 30000, costo: 0.0015, seg: 5000, entrega: 1, venc: '2026-12-15' },
        { nombre: 'Leche Deslactosada Barista', unidad: 'mililitros', stock: 15000, costo: 0.0018, seg: 3000, entrega: 1, venc: '2026-12-15' },
        { nombre: 'Leche de Almendras', unidad: 'mililitros', stock: 12000, costo: 0.0030, seg: 2000, entrega: 2, venc: '2026-12-20' },
        { nombre: 'Leche de Avena Barista', unidad: 'mililitros', stock: 12000, costo: 0.0032, seg: 2000, entrega: 2, venc: '2026-12-20' },
        // Jarabes y Salsas
        { nombre: 'Jarabe de Vainilla', unidad: 'mililitros', stock: 5000, costo: 0.008, seg: 1000, entrega: 3, venc: '2027-01-10' },
        { nombre: 'Jarabe de Caramelo', unidad: 'mililitros', stock: 5000, costo: 0.008, seg: 1000, entrega: 3, venc: '2027-01-10' },
        { nombre: 'Salsa de Chocolate Mocha', unidad: 'gramos', stock: 4000, costo: 0.012, seg: 800, entrega: 3, venc: '2027-02-15' },
        { nombre: 'Crema de Leche para Batir (Chantilly)', unidad: 'gramos', stock: 3500, costo: 0.008, seg: 500, entrega: 2, venc: '2026-12-05' },
        { nombre: 'Chispas de Chocolate Belga', unidad: 'gramos', stock: 120, costo: 0.015, seg: 400, entrega: 3, venc: '2027-03-20' },
        { nombre: 'Hielo Purificado', unidad: 'gramos', stock: 25000, costo: 0.0005, seg: 5000, entrega: 1, venc: null },
        // Endulzantes
        { nombre: 'Sobres de Azúcar Mascabado', unidad: 'unidades', stock: 600, costo: 0.02, seg: 100, entrega: 2, venc: null },
        { nombre: 'Sobres de Stevia Orgánica', unidad: 'unidades', stock: 35, costo: 0.03, seg: 100, entrega: 2, venc: null },
        { nombre: 'Miel de Abeja Pura', unidad: 'gramos', stock: 3000, costo: 0.012, seg: 400, entrega: 4, venc: '2027-08-01' },
        // Tés
        { nombre: 'Té Matcha Japonés en Polvo', unidad: 'gramos', stock: 2000, costo: 0.045, seg: 300, entrega: 5, venc: '2027-05-20' },
        { nombre: 'Hojas de Té Negro Earl Grey', unidad: 'gramos', stock: 1500, costo: 0.030, seg: 200, entrega: 4, venc: '2027-08-10' },
        // Desechables
        { nombre: 'Vaso Biodegradable 12oz', unidad: 'unidades', stock: 500, costo: 0.15, seg: 100, entrega: 2, venc: null },
        { nombre: 'Vaso Biodegradable 16oz', unidad: 'unidades', stock: 450, costo: 0.20, seg: 100, entrega: 2, venc: null },
        // Panes y Rellenos
        { nombre: 'Pan Ciabatta Rústico', unidad: 'unidades', stock: 50, costo: 0.65, seg: 10, entrega: 1, venc: '2026-11-20' },
        { nombre: 'Pan Baguette Francés', unidad: 'unidades', stock: 40, costo: 0.70, seg: 10, entrega: 1, venc: '2026-11-20' },
        { nombre: 'Jamón Serrano Selección', unidad: 'gramos', stock: 3000, costo: 0.022, seg: 500, entrega: 2, venc: '2026-12-05' },
        { nombre: 'Queso Mozzarella Fresco', unidad: 'gramos', stock: 4000, costo: 0.015, seg: 600, entrega: 2, venc: '2026-12-01' },
        { nombre: 'Pechuga de Pavo Ahumada', unidad: 'gramos', stock: 2500, costo: 0.018, seg: 400, entrega: 2, venc: '2026-12-10' },
        { nombre: 'Hojas de Albahaca Fresca', unidad: 'gramos', stock: 600, costo: 0.010, seg: 100, entrega: 1, venc: '2026-11-22' },
        { nombre: 'Tomates Deshidratados', unidad: 'gramos', stock: 1500, costo: 0.016, seg: 200, entrega: 3, venc: '2027-01-15' },
        { nombre: 'Croissants Crudos para Hornear', unidad: 'unidades', stock: 90, costo: 0.45, seg: 20, entrega: 2, venc: '2026-11-28' }
    ];

    const mapaInsumos = {};
    for (const ins of listaInsumos) {
        const id = await queries.crearInsumo(
            ins.nombre,
            ins.unidad,
            ins.stock,
            ins.costo,
            ins.seg,
            ins.entrega,
            ins.venc,
            'Distribuidora Central de Café y Alimentos',
            carlosId
        );
        mapaInsumos[ins.nombre] = id;
    }

    // Compra de reposición de café con Factura Fiscal (Kardex Insumos y Respaldo RCV SIAT v13)
    console.log('    -> Registrando compra de reposición de café con Factura Fiscal y CUF SIAT...');
    await queries.registrarCompraInsumo(
        mapaInsumos['Café en Grano Tostado Especial'],
        5000, // 5 kg
        135.00, // Bs 135 total
        'Compra de reposición grano selecto',
        'Café Yungas Andino S.R.L.',
        {
            proveedorNombre: 'Café Yungas Andino S.R.L.',
            proveedorNit: '3948201018',
            nroFacturaCompra: '44820',
            conFactura: true,
            nroAutorizacionCuf: 'CUF-YUN-99283401-2026',
            codigoControl: '4B-8D-F1',
            tipoCompra: 1,
            usuarioId: sofiaId
        }
    );

    // Merma controlada de insumos registrada en Kardex
    console.log('    -> Registrando merma controlada de leche por calibración de vaporizador...');
    await queries.registrarMermaInsumo(
        mapaInsumos['Leche Entera Barista'],
        250, // 250 ml
        'Derrame y purga en calibración de lanceta de vapor',
        sofiaId
    );

    // 8. Productos directos de reventa y tipo Libre (Servicios)
    console.log('[8/14] Creando catálogo de productos directos (con Lotes PEPS v12) y tipo libre (Servicios)...');
    const mapaProductos = {};

    const productosDirectos = [
        {
            nombre: 'Kombucha Frutos Rojos 330ml',
            precio: 15.00,
            costo: 8.00,
            categoria: 'Bebidas Embotelladas',
            stock: 35,
            stockMin: 5,
            venc: '2027-04-30'
        },
        {
            nombre: 'Agua Mineral con Gas 500ml',
            precio: 8.00,
            costo: 3.50,
            categoria: 'Bebidas Embotelladas',
            stock: 3,
            stockMin: 10,
            venc: '2027-12-31'
        },
        {
            nombre: 'Galletas de Avena Artesanales',
            precio: 10.00,
            costo: 4.50,
            categoria: 'Snacks & Empaquetados',
            stock: 40,
            stockMin: 8,
            venc: '2026-12-31'
        },
        {
            nombre: 'Barra Chocolate 70% Origen',
            precio: 18.00,
            costo: 9.50,
            categoria: 'Snacks & Empaquetados',
            stock: 0,
            stockMin: 5,
            venc: '2027-06-30'
        }
    ];

    for (const prod of productosDirectos) {
        const res = await queries.crearProducto(
            prod.nombre,
            prod.precio,
            prod.costo,
            prod.categoria,
            prod.stock,
            'unidades',
            prod.stockMin,
            prod.venc,
            carlosId
        );
        mapaProductos[prod.nombre] = typeof res === 'object' && res !== null ? res.id : res;
    }

    // Productos tipo 'libre' (Servicios / Sin control de stock)
    const productosLibres = [
        {
            nombre: 'Alquiler Salón de Reuniones (por Hora)',
            precio: 50.00,
            costo: 0.00,
            categoria: 'Servicios & Eventos'
        },
        {
            nombre: 'Servicio Barista para Eventos Privados',
            precio: 150.00,
            costo: 0.00,
            categoria: 'Servicios & Eventos'
        }
    ];

    for (const pl of productosLibres) {
        const res = await queries.crearProducto(
            pl.nombre,
            pl.precio,
            pl.costo,
            pl.categoria,
            null, // stock null -> tipo_inventario = 'libre'
            'servicio',
            0,
            null,
            carlosId
        );
        mapaProductos[pl.nombre] = typeof res === 'object' && res !== null ? res.id : res;
    }

    // Compra con factura de producto directo (Kardex Directo y segundo lote de Kombucha)
    console.log('    -> Registrando compras con Factura Fiscal SIAT RCV y multi-lote PEPS...');
    await queries.registrarCompraProductoDirecto(
        mapaProductos['Kombucha Frutos Rojos 330ml'],
        15, // 15 unidades más
        115.00,
        '2027-05-15',
        {
            proveedorNombre: 'Bebidas Naturales Andinas S.A.',
            proveedorNit: '1829402011',
            nroFacturaCompra: '8921',
            conFactura: true,
            nroAutorizacionCuf: 'CUF-BEB-88392019-2026',
            codigoControl: 'A1-9F-3D',
            tipoCompra: 1,
            usuarioId: sofiaId
        }
    );

    // Compra de segundo lote para Galletas de Avena (trazabilidad multi-lote v12)
    await queries.registrarCompraProductoDirecto(
        mapaProductos['Galletas de Avena Artesanales'],
        20, // 20 unidades más
        90.00,
        '2027-02-28',
        {
            proveedorNombre: 'Panadería Artesanal del Valle',
            proveedorNit: '9482019283',
            nroFacturaCompra: '3310',
            conFactura: true,
            nroAutorizacionCuf: 'CUF-PAN-33109284-2026',
            codigoControl: 'C7-2E-88',
            tipoCompra: 1,
            usuarioId: sofiaId
        }
    );

    // Merma de producto directo
    console.log('    -> Registrando merma de 1 agua mineral con gas por rotura de envase...');
    await queries.registrarMermaProductoDirecto(
        mapaProductos['Agua Mineral con Gas 500ml'],
        1,
        'Envase con fisura detectado en recepción',
        sofiaId
    );

    // 9. Productos por Receta (Elaborados)
    console.log('[9/14] Creando productos elaborados por receta (escandallo multi-insumo)...');
    const productosReceta = [
        {
            nombre: 'Espresso Simple 30ml',
            precio: 7.00,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 9, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 12oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Espresso Doble 60ml',
            precio: 9.00,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 12oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Americano Clásico 12oz',
            precio: 10.00,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 12oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Cappuccino Barista 12oz',
            precio: 14.00,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 180, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Vaso Biodegradable 12oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Café Latte Vainilla 16oz',
            precio: 16.00,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 240, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Jarabe de Vainilla'], cantidad: 20, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Vaso Biodegradable 16oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Mocha Chocolate Suizo 16oz',
            precio: 18.00,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 220, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Salsa de Chocolate Mocha'], cantidad: 25, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 16oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Matcha Latte Frío 16oz',
            precio: 19.00,
            categoria: 'Bebidas Frías & Frappés',
            ingredientes: [
                { insumoId: mapaInsumos['Té Matcha Japonés en Polvo'], cantidad: 6, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 200, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Hielo Purificado'], cantidad: 80, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 16oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Baguette Jamón Serrano & Mozzarella',
            precio: 25.00,
            categoria: 'Sándwiches & Salados',
            ingredientes: [
                { insumoId: mapaInsumos['Pan Baguette Francés'], cantidad: 1, unidadReceta: 'unidades' },
                { insumoId: mapaInsumos['Jamón Serrano Selección'], cantidad: 60, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Queso Mozzarella Fresco'], cantidad: 50, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Tomates Deshidratados'], cantidad: 20, unidadReceta: 'gramos' }
            ]
        },
        {
            nombre: 'Ciabatta Caprese Gourmet',
            precio: 22.00,
            categoria: 'Sándwiches & Salados',
            ingredientes: [
                { insumoId: mapaInsumos['Pan Ciabatta Rústico'], cantidad: 1, unidadReceta: 'unidades' },
                { insumoId: mapaInsumos['Queso Mozzarella Fresco'], cantidad: 70, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Hojas de Albahaca Fresca'], cantidad: 10, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Tomates Deshidratados'], cantidad: 25, unidadReceta: 'gramos' }
            ]
        },
        {
            nombre: 'Croissant Horneado Mantequilla',
            precio: 10.00,
            categoria: 'Pastelería & Dulces',
            ingredientes: [
                { insumoId: mapaInsumos['Croissants Crudos para Hornear'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        }
    ];

    for (const pr of productosReceta) {
        const res = await queries.crearProductoConInsumos({
            nombre: pr.nombre,
            precio: pr.precio,
            categoria: pr.categoria,
            tipoComposicion: 'receta',
            insumosReceta: pr.ingredientes
        });
        mapaProductos[pr.nombre] = res.id;
    }

    // 10. Grupos de modificadores (Reemplazo de insumo, adiciones y opciones operativas)
    console.log('[10/14] Configurando grupos de complementos y modificadores...');

    // Grupo A: Tipo de Leche (Única, obligatoria, con reemplazo exacto del insumo base)
    const grupoLecheId = await queries.crearGrupoModificadores(
        {
            nombre: 'Tipo de Leche',
            tipoSeleccion: 'unica',
            esObligatorio: true,
            opciones: [
                {
                    nombre: 'Leche Entera Barista (Estándar)',
                    precioAdicional: 0.00,
                    insumoId: mapaInsumos['Leche Entera Barista'],
                    cantidadInsumo: 180,
                    insumoReemplazadoId: mapaInsumos['Leche Entera Barista'],
                    esDefault: true
                },
                {
                    nombre: 'Leche Deslactosada (+0.50 Bs)',
                    precioAdicional: 0.50,
                    insumoId: mapaInsumos['Leche Deslactosada Barista'],
                    cantidadInsumo: 180,
                    insumoReemplazadoId: mapaInsumos['Leche Entera Barista'],
                    esDefault: false
                },
                {
                    nombre: 'Leche de Almendras (+1.50 Bs)',
                    precioAdicional: 1.50,
                    insumoId: mapaInsumos['Leche de Almendras'],
                    cantidadInsumo: 180,
                    insumoReemplazadoId: mapaInsumos['Leche Entera Barista'],
                    esDefault: false
                },
                {
                    nombre: 'Leche de Avena (+1.50 Bs)',
                    precioAdicional: 1.50,
                    insumoId: mapaInsumos['Leche de Avena Barista'],
                    cantidadInsumo: 180,
                    insumoReemplazadoId: mapaInsumos['Leche Entera Barista'],
                    esDefault: false
                }
            ]
        },
        sofiaId
    );

    // Grupo B: Endulzante (Única, no obligatoria, consumo de sobres / miel)
    const grupoEndulzanteId = await queries.crearGrupoModificadores(
        {
            nombre: 'Endulzante',
            tipoSeleccion: 'unica',
            esObligatorio: false,
            opciones: [
                {
                    nombre: 'Azúcar Mascabado (1 sobre)',
                    precioAdicional: 0.00,
                    insumoId: mapaInsumos['Sobres de Azúcar Mascabado'],
                    cantidadInsumo: 1,
                    esDefault: false
                },
                {
                    nombre: 'Stevia Orgánica (1 sobre)',
                    precioAdicional: 0.00,
                    insumoId: mapaInsumos['Sobres de Stevia Orgánica'],
                    cantidadInsumo: 1,
                    esDefault: false
                },
                {
                    nombre: 'Miel de Abeja Pura (+1.00 Bs)',
                    precioAdicional: 1.00,
                    insumoId: mapaInsumos['Miel de Abeja Pura'],
                    cantidadInsumo: 15,
                    esDefault: false
                },
                {
                    nombre: 'Sin Endulzante',
                    precioAdicional: 0.00,
                    esDefault: true
                }
            ]
        },
        sofiaId
    );

    // Grupo C: Extras y Siropes (Múltiple, no obligatoria, adición de insumos con recargo)
    const grupoExtrasCafeId = await queries.crearGrupoModificadores(
        {
            nombre: 'Extras & Siropes',
            tipoSeleccion: 'multiple',
            esObligatorio: false,
            opciones: [
                {
                    nombre: 'Extra Shot Espresso (+3.00 Bs)',
                    precioAdicional: 3.00,
                    insumoId: mapaInsumos['Café en Grano Tostado Especial'],
                    cantidadInsumo: 9,
                    esDefault: false
                },
                {
                    nombre: 'Crema Chantilly (+2.50 Bs)',
                    precioAdicional: 2.50,
                    insumoId: mapaInsumos['Crema de Leche para Batir (Chantilly)'],
                    cantidadInsumo: 30,
                    esDefault: false
                },
                {
                    nombre: 'Chispas de Chocolate Belga (+1.50 Bs)',
                    precioAdicional: 1.50,
                    insumoId: mapaInsumos['Chispas de Chocolate Belga'],
                    cantidadInsumo: 15,
                    esDefault: false
                },
                {
                    nombre: 'Jarabe de Caramelo (+2.00 Bs)',
                    precioAdicional: 2.00,
                    insumoId: mapaInsumos['Jarabe de Caramelo'],
                    cantidadInsumo: 20,
                    esDefault: false
                }
            ]
        },
        sofiaId
    );

    // Grupo D: Opciones de Sándwiches (Múltiple, operativos y con adición de queso)
    const grupoSandwichId = await queries.crearGrupoModificadores(
        {
            nombre: 'Personalización de Sándwich',
            tipoSeleccion: 'multiple',
            esObligatorio: false,
            opciones: [
                {
                    nombre: 'Extra Queso Mozzarella (+3.50 Bs)',
                    precioAdicional: 3.50,
                    insumoId: mapaInsumos['Queso Mozzarella Fresco'],
                    cantidadInsumo: 40,
                    esDefault: false
                },
                {
                    nombre: 'Pan Tostado Crujiente (Grill)',
                    precioAdicional: 0.00,
                    esDefault: false
                },
                {
                    nombre: 'Sin Albahaca',
                    precioAdicional: 0.00,
                    esDefault: false
                }
            ]
        },
        sofiaId
    );

    // Asignación de grupos a productos
    await queries.asignarModificadoresAProducto(
        mapaProductos['Cappuccino Barista 12oz'],
        [grupoLecheId, grupoEndulzanteId, grupoExtrasCafeId],
        sofiaId
    );
    await queries.asignarModificadoresAProducto(
        mapaProductos['Café Latte Vainilla 16oz'],
        [grupoLecheId, grupoEndulzanteId, grupoExtrasCafeId],
        sofiaId
    );
    await queries.asignarModificadoresAProducto(
        mapaProductos['Mocha Chocolate Suizo 16oz'],
        [grupoLecheId, grupoEndulzanteId, grupoExtrasCafeId],
        sofiaId
    );
    await queries.asignarModificadoresAProducto(
        mapaProductos['Matcha Latte Frío 16oz'],
        [grupoLecheId, grupoEndulzanteId],
        sofiaId
    );
    await queries.asignarModificadoresAProducto(
        mapaProductos['Baguette Jamón Serrano & Mozzarella'],
        [grupoSandwichId],
        sofiaId
    );
    await queries.asignarModificadoresAProducto(
        mapaProductos['Ciabatta Caprese Gourmet'],
        [grupoSandwichId],
        sofiaId
    );

    const gruposCargados = await queries.obtenerGruposModificadores(false);
    const mapaOpciones = {};
    for (const g of gruposCargados) {
        for (const op of g.opciones) {
            mapaOpciones[op.nombre] = op.id;
        }
    }

    // 11. Combos y Promociones (Descomposición atómica de stock y límites)
    console.log('[11/14] Creando combos y paquetes promocionales...');

    // Combo 1: Desayuno Clásico (Cappuccino + Croissant) -> Sin límite
    const comboDesayuno = await queries.crearProductoConInsumos({
        nombre: 'Combo Desayuno Clásico',
        precio: 20.00,
        categoria: 'Combos & Promociones',
        tipoComposicion: 'combo',
        componentesCombo: [
            { productoId: mapaProductos['Cappuccino Barista 12oz'], cantidad: 1 },
            { productoId: mapaProductos['Croissant Horneado Mantequilla'], cantidad: 1 }
        ],
        limiteMaximoActivo: false
    });
    mapaProductos['Combo Desayuno Clásico'] = comboDesayuno.id;

    // Combo 2: Ejecutivo Almuerzo (Baguette Serrano + Kombucha) -> Con límite de 30 unidades
    const comboAlmuerzo = await queries.crearProductoConInsumos({
        nombre: 'Combo Ejecutivo Almuerzo',
        precio: 35.00,
        categoria: 'Combos & Promociones',
        tipoComposicion: 'combo',
        componentesCombo: [
            { productoId: mapaProductos['Baguette Jamón Serrano & Mozzarella'], cantidad: 1 },
            { productoId: mapaProductos['Kombucha Frutos Rojos 330ml'], cantidad: 1 }
        ],
        limiteMaximoActivo: true,
        limiteUnidadesTotal: 30
    });
    mapaProductos['Combo Ejecutivo Almuerzo'] = comboAlmuerzo.id;

    // Combo 3: Promoción Flash Tarde Dulce (Americano + Galletas de Avena) -> Con vigencia temporal
    const fechaInicioVig = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const fechaFinVig = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const promoTarde = await queries.crearProductoConInsumos({
        nombre: 'Promo Tarde Dulce Aroma',
        precio: 17.00,
        categoria: 'Combos & Promociones',
        tipoComposicion: 'combo',
        componentesCombo: [
            { productoId: mapaProductos['Americano Clásico 12oz'], cantidad: 1 },
            { productoId: mapaProductos['Galletas de Avena Artesanales'], cantidad: 1 }
        ],
        limiteMaximoActivo: false,
        fechaInicioVigencia: fechaInicioVig,
        fechaFinVigencia: fechaFinVig
    });
    mapaProductos['Promo Tarde Dulce Aroma'] = promoTarde.id;

    // 12. Simulación Histórica: Turno #1 (Ayer, Caja 1 - Barra Principal - lucia)
    console.log('[12/14] Simulando Turnos Históricos de Ayer:');
    console.log('   --- [A] Turno #1 (Caja 1 - Barra Principal - lucia): arqueo ciego, pagos mixtos, facturas SIAT...');

    const turno1Id = await queries.abrirCaja(luciaId, 150.00, 1);

    // Venta A: Efectivo con cambio entregado (Cappuccino con leche de almendras y shot extra + Croissant)
    console.log('       -> T1 Venta 1: Efectivo con modificadores y cálculo de cambio...');
    await queries.registrarVentaCompleta(
        turno1Id,
        [
            {
                productoId: mapaProductos['Cappuccino Barista 12oz'],
                cantidad: 1,
                modificadores: [
                    mapaOpciones['Leche de Almendras (+1.50 Bs)'],
                    mapaOpciones['Extra Shot Espresso (+3.00 Bs)']
                ]
            },
            {
                productoId: mapaProductos['Croissant Horneado Mantequilla'],
                cantidad: 1
            }
        ],
        'efectivo',
        50.00, // Pagó con billete de 50.00 Bs (cambio calculado)
        'Venta mostrador desayuno gourmet',
        luciaId
    );

    // Venta B: Venta por QR con FACTURA FISCAL (Snapshot IVA 13% e IT 3%)
    console.log('       -> T1 Venta 2: QR con Factura Fiscal SIAT y cliente corporativo...');
    const ventaFac = await queries.registrarVentaCompleta(
        turno1Id,
        [
            {
                productoId: mapaProductos['Baguette Jamón Serrano & Mozzarella'],
                cantidad: 2,
                modificadores: [
                    mapaOpciones['Extra Queso Mozzarella (+3.50 Bs)'],
                    mapaOpciones['Pan Tostado Crujiente (Grill)']
                ]
            },
            {
                productoId: mapaProductos['Kombucha Frutos Rojos 330ml'],
                cantidad: 2
            }
        ],
        'qr',
        null,
        'Almuerzo corporativo cliente habitual',
        luciaId,
        null,
        {
            tipoComprobante: 'factura',
            conFactura: true,
            nroFactura: '101',
            cufAutorizacion: 'CUF-CAF-88492019-2026',
            codigoControl: '5F-2A-88',
            clienteNitCi: '4839201019',
            clienteRazonSocial: 'Importadora Andina S.R.L.'
        }
    );
    if (ventaFac && ventaFac.movimientoId) {
        await run(
            `UPDATE movimientos SET cuf_autorizacion = 'CUF-CAF-88492019-2026', codigo_control = '5F-2A-88' WHERE id = ?`,
            [ventaFac.movimientoId]
        );
    }

    // Venta C: Venta con PAGO MIXTO (Efectivo + QR) y DESCUENTO comercial prorrateado
    console.log('       -> T1 Venta 3: Pago Mixto (Efectivo + QR) con descuento comercial prorrateado...');
    await queries.registrarVentaCompleta(
        turno1Id,
        [
            {
                productoId: mapaProductos['Mocha Chocolate Suizo 16oz'],
                cantidad: 1
            },
            {
                productoId: mapaProductos['Café Latte Vainilla 16oz'],
                cantidad: 1
            }
        ],
        'mixto',
        20.00, // Billete de 20.00 recibido para la porción de 10.00 de efectivo
        'Merienda de amigos con descuento de lealtad',
        luciaId,
        null,
        {
            descuentoTotal: 4.00,
            descuento: 4.00,
            montoEfectivo: 10.00,
            montoQr: 20.00,
            referenciaQr: 'TRANSF-BNB-998231',
            pagos: [
                { metodo: 'efectivo', monto: 10.00, recibido: 20.00 },
                { metodo: 'qr', monto: 20.00, referencia: 'TRANSF-BNB-998231' }
            ]
        }
    );

    // Venta D: Venta de COMBOS (2 Combos Desayuno Clásico)
    console.log('       -> T1 Venta 4: Combo Desayuno Clásico (descuento atómico multi-componente)...');
    await queries.registrarVentaCompleta(
        turno1Id,
        [
            {
                productoId: mapaProductos['Combo Desayuno Clásico'],
                cantidad: 2
            }
        ],
        'efectivo',
        40.00,
        'Desayuno de pareja con combo promocional',
        luciaId
    );

    // Venta E: Venta que luego es ANULADA auditadamente con rollback
    console.log('       -> T1 Venta 5: Venta y anulación formal por Sofía (rollback atómico)...');
    const ventaAnular = await queries.registrarVentaCompleta(
        turno1Id,
        [
            {
                productoId: mapaProductos['Ciabatta Caprese Gourmet'],
                cantidad: 1
            },
            {
                productoId: mapaProductos['Americano Clásico 12oz'],
                cantidad: 1
            }
        ],
        'efectivo',
        35.00,
        'Venta equivocada de mesa 4',
        luciaId
    );

    await queries.anularMovimientoConPermiso(
        sofiaId,
        ventaAnular.movimientoId,
        'Error de mesa: el cliente solicitó cancelar la orden antes de la preparación'
    );

    // Egreso 1: Gasto operativo menor de caja en efectivo
    console.log('       -> T1 Egreso 1: Gasto menor en efectivo...');
    await queries.registrarEgreso(
        turno1Id,
        18.00,
        'Compra urgente de papel secante y detergente para barra',
        'efectivo',
        luciaId,
        { categoriaContable: 'gasto_operativo' }
    );

    // Egreso 2: Gasto de mantenimiento con Factura Fiscal SIAT (Crédito fiscal IVA)
    console.log('       -> T1 Egreso 2: Egreso respaldado con Factura Fiscal SIAT (crédito IVA)...');
    await queries.registrarEgreso(
        turno1Id,
        45.00,
        'Mantenimiento preventivo y cambio de empaque en grupo barista',
        'efectivo',
        luciaId,
        {
            categoriaContable: 'gasto_operativo',
            proveedorNombre: 'Servicios Técnicos Café Express S.R.L.',
            proveedorNit: '2938401015',
            nroFactura: '1204',
            cufAutorizacion: 'CUF-SER-120492-2026',
            codigoControl: '3E-1A-99',
            conFactura: true,
            tipoComprobante: 'factura'
        }
    );

    // Inyección de cambio / sencillo (ingreso_efectivo)
    console.log('       -> T1 Inyección: Sencillo y monedas para cambio matutino...');
    await queries.registrarIngresoEfectivo(
        turno1Id,
        50.00,
        'Reposición de monedas de 1 y 2 Bs por cambio matutino',
        luciaId
    );

    // Cierre cuadrado con arqueo ciego exacto
    const detT1 = await queries.obtenerResumenCaja(turno1Id);
    console.log(`       -> Cerrando Turno #1 con arqueo ciego exacto: Bs ${detT1.efectivo_esperado.toFixed(2)} (QR: Bs ${detT1.qr_esperado.toFixed(2)})...`);
    await queries.cerrarCaja(
        turno1Id,
        detT1.efectivo_esperado,
        luciaId,
        detT1.qr_esperado,
        'Cierre de turno barra principal cuadrado sin novedades'
    );

    // 13. Simulación Histórica: Turno #2 (Ayer, Caja 2 - Terraza & Take Away - marcos)
    console.log('   --- [B] Turno #2 (Caja 2 - Terraza & Take Away - marcos): Apps de Comida v14 y Reapertura Auditada...');
    const turno2Id = await queries.abrirCaja(marcosId, 100.00, 2);

    // Venta 2.1: Delivery PedidosYa (Canal externo desacoplado del arqueo de efectivo)
    console.log('       -> T2 Venta 1: Pedido delivery PedidosYa (v14)...');
    await queries.registrarVentaCompleta(
        turno2Id,
        [
            {
                productoId: mapaProductos['Cappuccino Barista 12oz'],
                cantidad: 2
            },
            {
                productoId: mapaProductos['Baguette Jamón Serrano & Mozzarella'],
                cantidad: 1
            }
        ],
        'pedidos_ya',
        null,
        'Pedido delivery PedidosYa para retiro por repartidor',
        marcosId,
        null,
        {
            canalVenta: 'pedidos_ya',
            referenciaExterna: 'PY-98421',
            datosEntrega: { direccion: 'Av. Heroínas #840, Edif. Los Olivos 3B', cliente: 'Camila Rojas', telefono: '71234567' }
        }
    );

    // Venta 2.2: Delivery Yango Food
    console.log('       -> T2 Venta 2: Pedido delivery Yango Food (v14)...');
    await queries.registrarVentaCompleta(
        turno2Id,
        [
            {
                productoId: mapaProductos['Mocha Chocolate Suizo 16oz'],
                cantidad: 1
            },
            {
                productoId: mapaProductos['Croissant Horneado Mantequilla'],
                cantidad: 2
            }
        ],
        'yango',
        null,
        'Pedido delivery Yango Food',
        marcosId,
        null,
        {
            canalVenta: 'yango',
            referenciaExterna: 'YNG-55210',
            datosEntrega: { direccion: 'Calle Calama #230, Piso 1', cliente: 'Diego Morales', telefono: '68901234' }
        }
    );

    // Venta 2.3: Delivery con Mototaxi propio pagado por QR
    console.log('       -> T2 Venta 3: Despacho mototaxi propio con QR bancario...');
    await queries.registrarVentaCompleta(
        turno2Id,
        [
            {
                productoId: mapaProductos['Combo Ejecutivo Almuerzo'],
                cantidad: 1
            }
        ],
        'qr',
        null,
        'Despacho motorizado propio a oficina centro',
        marcosId,
        null,
        {
            canalVenta: 'mototaxi',
            referenciaQr: 'QR-BNB-33190',
            datosEntrega: { motorizado: 'Juan Pérez (Moto 4)', direccion: 'Av. América #120' }
        }
    );

    // Venta 2.4: Venta de producto libre 'Alquiler Salón de Reuniones' en efectivo
    console.log('       -> T2 Venta 4: Servicio Libre (Alquiler salón 2 horas) en efectivo...');
    await queries.registrarVentaCompleta(
        turno2Id,
        [
            {
                productoId: mapaProductos['Alquiler Salón de Reuniones (por Hora)'],
                cantidad: 2
            }
        ],
        'efectivo',
        100.00,
        'Alquiler de salón privado para reunión ejecutiva',
        marcosId
    );

    // Venta 2.5: Venta mostrador terraza en efectivo
    console.log('       -> T2 Venta 5: Café y galleta en efectivo en terraza...');
    await queries.registrarVentaCompleta(
        turno2Id,
        [
            {
                productoId: mapaProductos['Cappuccino Barista 12oz'],
                cantidad: 1
            },
            {
                productoId: mapaProductos['Galletas de Avena Artesanales'],
                cantidad: 1
            }
        ],
        'efectivo',
        30.00,
        'Consumo en mesa terraza tarde',
        marcosId
    );

    // Cierre inicial de Turno #2
    const detT2_1 = await queries.obtenerResumenCaja(turno2Id);
    console.log(`       -> Cierre inicial de Turno #2 con arqueo ciego exacto: Bs ${detT2_1.efectivo_esperado.toFixed(2)} (Apps: Bs ${detT2_1.ventas_apps_total.toFixed(2)} desacopladas)...`);
    await queries.cerrarCaja(
        turno2Id,
        detT2_1.efectivo_esperado,
        marcosId,
        detT2_1.qr_esperado,
        'Cierre habitual de turno terraza'
    );

    // REAPERTURA AUDITADA: Carlos (propietario) reabre formalmente Turno #2
    console.log('       -> Demostrando REAPERTURA AUDITADA formal por Propietario (Carlos)...');
    await queries.reabrirCajaConPermiso(
        carlosId,
        turno2Id,
        'Auditoría y sincronización de pedido delivery omitido en cierre inicial'
    );

    // Registro de venta durante la reapertura
    console.log('       -> Registrando venta omitida en turno reabierto...');
    await queries.registrarVentaCompleta(
        turno2Id,
        [
            {
                productoId: mapaProductos['Matcha Latte Frío 16oz'],
                cantidad: 1
            }
        ],
        'qr',
        null,
        'Bebida agregada durante reapertura auditada',
        marcosId,
        null,
        {
            referenciaQr: 'QR-BNB-998812'
        }
    );

    // Cierre final post-reapertura de Turno #2
    const detT2_2 = await queries.obtenerResumenCaja(turno2Id);
    console.log(`       -> Cierre definitivo post-reapertura con historial y veces_reabierta = 1...`);
    await queries.cerrarCaja(
        turno2Id,
        detT2_2.efectivo_esperado,
        marcosId,
        detT2_2.qr_esperado,
        'Cierre final post-auditoría con reapertura formal'
    );

    // Ajuste temporal realista de Turnos #1 y #2 a ayer distribuido en horarios de atención
    console.log('    -> Sincronizando timestamps de turnos históricos para analíticas y Recharts...');
    await run(
        `UPDATE cajas
         SET fecha_apertura = datetime('now', '-1 day', '07:30:00'),
             fecha_cierre = datetime('now', '-1 day', '16:00:00')
         WHERE id = ?`,
        [turno1Id]
    );
    await run(
        `UPDATE cajas
         SET fecha_apertura = datetime('now', '-1 day', '11:00:00'),
             fecha_cierre = datetime('now', '-1 day', '20:30:00')
         WHERE id = ?`,
        [turno2Id]
    );

    const movsT1 = await all(`SELECT id FROM movimientos WHERE caja_id = ? ORDER BY id ASC`, [turno1Id]);
    const horasT1 = ['08:15:00', '09:40:00', '11:20:00', '12:35:00', '13:50:00', '14:10:00', '14:45:00', '15:15:00'];
    for (let i = 0; i < movsT1.length; i++) {
        const hora = horasT1[i] || '15:30:00';
        await run(`UPDATE movimientos SET fecha_hora = datetime('now', '-1 day', ?) WHERE id = ?`, [hora, movsT1[i].id]);
        await run(`UPDATE movimientos_productos_directos SET fecha_hora = datetime('now', '-1 day', ?) WHERE movimiento_id = ?`, [hora, movsT1[i].id]);
        await run(`UPDATE movimientos_insumos SET fecha_hora = datetime('now', '-1 day', ?) WHERE movimiento_id = ?`, [hora, movsT1[i].id]);
    }

    const movsT2 = await all(`SELECT id FROM movimientos WHERE caja_id = ? ORDER BY id ASC`, [turno2Id]);
    const horasT2 = ['11:45:00', '13:10:00', '14:30:00', '16:00:00', '17:20:00', '19:15:00', '20:00:00'];
    for (let i = 0; i < movsT2.length; i++) {
        const hora = horasT2[i] || '20:15:00';
        await run(`UPDATE movimientos SET fecha_hora = datetime('now', '-1 day', ?) WHERE id = ?`, [hora, movsT2[i].id]);
        await run(`UPDATE movimientos_productos_directos SET fecha_hora = datetime('now', '-1 day', ?) WHERE movimiento_id = ?`, [hora, movsT2[i].id]);
        await run(`UPDATE movimientos_insumos SET fecha_hora = datetime('now', '-1 day', ?) WHERE movimiento_id = ?`, [hora, movsT2[i].id]);
    }

    // Fechas de compras e inventario inicial en anteayer
    await run(`UPDATE movimientos_insumos SET fecha_hora = datetime('now', '-2 days', '08:00:00') WHERE movimiento_id IS NULL`);
    await run(`UPDATE movimientos_productos_directos SET fecha_hora = datetime('now', '-2 days', '08:00:00') WHERE movimiento_id IS NULL`);

    // 14. Turnos simultáneos ABIERTOS HOY (Caja 1 y Caja 2 en vivo)
    console.log('[13/14] Abriendo turnos simultáneos HOY para operación multicaja en vivo...');

    // Turno #3: Caja 1 - Barra Principal (carlos)
    const turno3Id = await queries.abrirCaja(carlosId, 150.00, 1);
    console.log(`    -> Turno #3 ABIERTO en Caja 1 (Barra Principal) a nombre de Carlos (Propietario)...`);

    // Venta hoy 3.1: Combo Ejecutivo Almuerzo por QR
    await queries.registrarVentaCompleta(
        turno3Id,
        [
            {
                productoId: mapaProductos['Combo Ejecutivo Almuerzo'],
                cantidad: 1
            }
        ],
        'qr',
        null,
        'Almuerzo en mostrador barra inicio turno hoy',
        carlosId,
        null,
        {
            referenciaQr: 'QR-BCP-552190'
        }
    );

    // Venta hoy 3.2: Mocha Chocolate con Deslactosada y Chantilly + Croissant en Efectivo
    await queries.registrarVentaCompleta(
        turno3Id,
        [
            {
                productoId: mapaProductos['Mocha Chocolate Suizo 16oz'],
                cantidad: 1,
                modificadores: [
                    mapaOpciones['Leche Deslactosada (+0.50 Bs)'],
                    mapaOpciones['Crema Chantilly (+2.50 Bs)']
                ]
            },
            {
                productoId: mapaProductos['Croissant Horneado Mantequilla'],
                cantidad: 1
            }
        ],
        'efectivo',
        40.00,
        'Merienda dulce mostrador',
        carlosId
    );

    // Venta hoy 3.3: Trazabilidad FIFO y selección manual de lote (v12)
    const loteGalletaReciente = await get(
        `SELECT id, fecha_vencimiento, stock FROM producto_lotes WHERE producto_id = ? ORDER BY fecha_vencimiento DESC LIMIT 1`,
        [mapaProductos['Galletas de Avena Artesanales']]
    );

    await queries.registrarVentaCompleta(
        turno3Id,
        [
            {
                productoId: mapaProductos['Galletas de Avena Artesanales'],
                cantidad: 1,
                loteId: loteGalletaReciente.id
            },
            {
                productoId: mapaProductos['Kombucha Frutos Rojos 330ml'],
                cantidad: 1
                // PEPS automático para Kombucha
            }
        ],
        'efectivo',
        25.00,
        'Snack con selección de lote manual y política PEPS automática',
        carlosId
    );

    // Turno #4: Caja 2 - Terraza & Take Away (marcos)
    const turno4Id = await queries.abrirCaja(marcosId, 100.00, 2);
    console.log(`    -> Turno #4 ABIERTO en Caja 2 (Terraza & Take Away) a nombre de Marcos (Cajero)...`);

    // Venta hoy 4.1: Pedido Delivery PedidosYa entrante
    await queries.registrarVentaCompleta(
        turno4Id,
        [
            {
                productoId: mapaProductos['Matcha Latte Frío 16oz'],
                cantidad: 1
            },
            {
                productoId: mapaProductos['Ciabatta Caprese Gourmet'],
                cantidad: 1
            }
        ],
        'pedidos_ya',
        null,
        'Pedido online PedidosYa en preparación',
        marcosId,
        null,
        {
            canalVenta: 'pedidos_ya',
            referenciaExterna: 'PY-66102',
            datosEntrega: { direccion: 'Calle Paccieri #330', cliente: 'Andrea Torrico', telefono: '72345678' }
        }
    );

    // Venta hoy 4.2: Venta en mostrador terraza efectivo
    await queries.registrarVentaCompleta(
        turno4Id,
        [
            {
                productoId: mapaProductos['Americano Clásico 12oz'],
                cantidad: 2
            },
            {
                productoId: mapaProductos['Croissant Horneado Mantequilla'],
                cantidad: 2
            }
        ],
        'efectivo',
        50.00,
        'Cafés y panes para mesa terraza mañana',
        marcosId
    );

    // 15. Verificación de integridad de Kardex, Lotes y Arqueos
    console.log('\n[14/14] --- AUDITORÍA AUTOMÁTICA DE INTEGRIDAD ALGEBRAICA (KARDEX & LOTES PEPS) ---');
    const checkKardexDirecto = await queries.verificarIntegridadKardexDirecto();
    const checkKardexInsumos = await queries.verificarIntegridadKardexInsumos();

    const checkLotes = await all(
        `SELECT p.id as producto_id, p.nombre, p.stock as stock_producto,
                COALESCE(SUM(pl.stock), 0) as stock_total_lotes,
                COUNT(pl.id) as cantidad_lotes
         FROM productos p
         LEFT JOIN producto_lotes pl ON p.id = pl.producto_id AND pl.activo = 1
         WHERE p.tipo_inventario = 'directo' AND p.fecha_vencimiento IS NOT NULL
         GROUP BY p.id`
    );

    let descuadresLotes = 0;
    for (const cl of checkLotes) {
        if (Math.abs(Number(cl.stock_producto) - Number(cl.stock_total_lotes)) > 0.001) {
            descuadresLotes++;
            console.error(`Descuadre en lotes de ${cl.nombre}: Stock producto ${cl.stock_producto} vs Suma lotes ${cl.stock_total_lotes}`);
        }
    }
    const lotesOk = descuadresLotes === 0;

    console.log(`[Kardex Directo] Válido: ${checkKardexDirecto.integridadOk} | Productos auditados: ${checkKardexDirecto.totalProductosDirectos} | Descuadres: ${checkKardexDirecto.totalDescuadres}`);
    console.log(`[Kardex Insumos] Válido: ${checkKardexInsumos.integridadOk} | Insumos auditados: ${checkKardexInsumos.totalInsumos} | Descuadres: ${checkKardexInsumos.totalDescuadres}`);
    console.log(`[Lotes PEPS] Válido: ${lotesOk} | Productos con lotes: ${checkLotes.length} | Descuadres: ${descuadresLotes}`);

    if (!checkKardexDirecto.integridadOk || !checkKardexInsumos.integridadOk || !lotesOk) {
        console.error('ADVERTENCIA: Se detectaron descuadres en la verificación de Kardex / Lotes.');
    } else {
        console.log('✓ Kardex dual y trazabilidad de lotes PEPS auditados y matemáticamente consistentes al 100% (0 descuadres).');
    }

    console.log('==================================================================');
    console.log(' SEED INTEGRAL v16 COMPLETADO EXITOSAMENTE');
    console.log('==================================================================');
    console.log(`- Establecimiento: Café Gourmet & Bakery Aroma`);
    console.log(`- Régimen Fiscal: Régimen General (IVA 13%, IT 3%, Base: todas_las_ventas)`);
    console.log(`- Respaldo RCV SIAT: CUF, Código de control y Facturas de compras/egresos`);
    console.log(`- Servicio SMTP: Gmail SSL/TLS activo con destinatarios verificados`);
    console.log(`- Canales de Venta: Local, Delivery Propio (Mototaxi), PedidosYa y Yango Food`);
    console.log(`- Estaciones Multicaja: 2 Cajas Físicas activas con turnos simultáneos`);
    console.log(`- Tipos de Catálogo: Libre (servicios), Directo (reventa), Receta (elaborados) y Combo (promociones)`);
    console.log(`- Trazabilidad de Lotes: Multi-lotes con control PEPS / FIFO y selección manual`);
    console.log(`- Turno #1 (Ayer, CERRADO): Barra Principal operado por Lucía (cuadrado sin novedades)`);
    console.log(`- Turno #2 (Ayer, CERRADO & REABIERTO): Terraza operado por Marcos con apps de delivery y auditoría`);
    console.log(`- Turno #3 (Hoy, ABIERTO): Barra Principal a nombre de Carlos (Propietario) con ventas en curso`);
    console.log(`- Turno #4 (Hoy, ABIERTO): Terraza a nombre de Marcos (Cajero) con pedidos online en curso`);
    console.log('------------------------------------------------------------------');
    console.log('Credenciales de acceso para pruebas:');
    console.log('  - Propietario(a): carlos   | Clave: 12345678');
    console.log('  - Admin:          sofia    | Clave: 12345678');
    console.log('  - Cajera 1:       lucia    | Clave: 12345678');
    console.log('  - Cajero 2:       marcos   | Clave: 12345678');
    console.log('  - Developer:      developer| Clave: 12345678');
    console.log('==================================================================\n');
}

sembrarCafeteriaCompleta()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n[Error Fatal en Seed]', err);
        process.exit(1);
    });
