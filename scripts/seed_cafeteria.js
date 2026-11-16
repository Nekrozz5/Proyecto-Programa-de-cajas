// ==========================================
// SEED DE PRUEBA INTEGRAL: CAFETERÍA & BAKERY GOURMET (v11)
// Puebla la base de datos con datos completos y coherentes para pruebas exhaustivas
// utilizando el 100% de las funcionalidades del sistema:
// - Régimen General con liquidación fiscal (IVA 13%, IT 3%, base configurable y facturas)
// - Estaciones multicaja física con permisos fiscales
// - Usuarios con perfiles diferenciados y permisos fiscales
// - Materia prima métrica con hasta 6 decimales (NIC 2 CPP) y Kardex de Insumos v11
// - Compras de reposición con factura (crédito fiscal) y mermas registradas en Kardex
// - Productos directos de reventa con Kardex de Productos Directos
// - Productos elaborados por receta con escandallo multi-insumo
// - Grupos de modificadores (v7): reemplazos de insumos, adiciones y operativos
// - Combos y promociones (v8): descomposición atómica, límites de unidades y vigencia
// - Ventas diversas: Efectivo con cambio, QR conciliado, Pagos Mixtos y Facturas con snapshot
// - Descuentos comerciales con prorrateo neto exacto entre líneas
// - Anulación auditada de venta con rollback completo en inventario y Kardex
// - Egresos operativos y egresos respaldados con factura
// - Inyecciones de sencillo (ingreso_efectivo)
// - Arqueo ciego cuadrado en Turno #1 (ayer) y Turno #2 ABIERTO (hoy)
// - Verificación automática de integridad algebraica de Kardex directo e insumos
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
    console.log('--- INICIANDO SEED INTEGRAL DE CAFETERÍA & BAKERY (v11) ---');
    console.log('==================================================================');

    // 1. Limpieza de tablas operativas
    console.log('[1/12] Limpiando tablas operativas previas...');
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
    await run(`DELETE FROM productos`);
    await run(`DELETE FROM insumos`);
    await run(`DELETE FROM cajas`);
    await run(`DELETE FROM categorias`);

    // 2. Configuración del negocio y módulo fiscal (Régimen General)
    console.log('[2/12] Configurando modalidad de negocio y parámetros contables / fiscales...');
    await run(
        `UPDATE configuracion_negocio
         SET nombre_negocio = 'Café Gourmet & Bakery Aroma',
             modalidad_nombre = 'Elaboración con Recetas e Insumos Perecederos',
             usa_stock_directo = 1,
             usa_vencimiento = 1,
             usa_recetas_ensamblaje = 1,
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

    // 3. Estaciones de caja física
    console.log('[3/12] Configurando estaciones multicaja física...');
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

    // 4. Usuarios del sistema con permisos fiscales diferenciados
    console.log('[4/12] Configurando usuarios y credenciales (Clave universal: 12345678)...');
    const PASSWORD_UNIVERSAL = '12345678';
    const hashUniversal = await bcrypt.hash(PASSWORD_UNIVERSAL, BCRYPT_ROUNDS);

    // Superadmin: carlos
    let carlosId;
    const carlos = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'carlos'`);
    if (!carlos) {
        const res = await run(
            `INSERT INTO usuarios (nombre, pin_o_password, rol, activo, puede_registrar_respaldo_fiscal)
             VALUES ('carlos', ?, 'superadmin', 1, 1)`,
            [hashUniversal]
        );
        carlosId = res.lastID;
    } else {
        await run(
            `UPDATE usuarios
             SET pin_o_password = ?, rol = 'superadmin', activo = 1, puede_registrar_respaldo_fiscal = 1
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
    await run(
        `UPDATE usuarios
         SET pin_o_password = ?, activo = 1, puede_registrar_respaldo_fiscal = 1
         WHERE LOWER(nombre) = 'developer'`,
        [hashUniversal]
    );

    // 5. Categorías
    console.log('[5/12] Creando categorías del catálogo...');
    const categorias = [
        'Cafés Calientes',
        'Bebidas Frías & Frappés',
        'Tés & Infusiones',
        'Pastelería & Dulces',
        'Sándwiches & Salados',
        'Bebidas Embotelladas',
        'Snacks & Empaquetados',
        'Combos & Promociones'
    ];
    for (const cat of categorias) {
        await queries.crearCategoria(cat);
    }

    // 6. Insumos (Materia Prima con precisión métrica de hasta 6 decimales NIC 2)
    console.log('[6/12] Creando insumos de almacén y compras con crédito fiscal...');
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
        { nombre: 'Chispas de Chocolate Belga', unidad: 'gramos', stock: 2500, costo: 0.015, seg: 400, entrega: 3, venc: '2027-03-20' },
        { nombre: 'Hielo Purificado', unidad: 'gramos', stock: 25000, costo: 0.0005, seg: 5000, entrega: 1, venc: null },
        // Endulzantes
        { nombre: 'Sobres de Azúcar Mascabado', unidad: 'unidades', stock: 600, costo: 0.02, seg: 100, entrega: 2, venc: null },
        { nombre: 'Sobres de Stevia Orgánica', unidad: 'unidades', stock: 500, costo: 0.03, seg: 100, entrega: 2, venc: null },
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

    // Compra adicional de reposición con Factura Fiscal (Kardex de insumos y crédito fiscal)
    console.log('    -> Registrando compra de reposición de café con Factura Fiscal...');
    await queries.registrarCompraInsumo(
        mapaInsumos['Café en Grano Tostado Especial'],
        5000, // 5 kg
        135.00, // Bs 135 total
        'Compra de reposición grano selecto',
        'Café Yungas Andino S.R.L.',
        {
            proveedorNombre: 'Café Yungas Andino S.R.L.',
            proveedorNit: '3948201018',
            nroFacturaCompra: 'F-44820',
            conFactura: true,
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

    // 7. Productos directos de reventa con Kardex Directo
    console.log('[7/12] Creando productos directos de reventa con Kardex inicial...');
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
            stock: 50,
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
            stock: 25,
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

    // Compra con factura de producto directo (Kardex Directo)
    console.log('    -> Registrando compra con factura fiscal de Kombucha (Kardex directo)...');
    await queries.registrarCompraProductoDirecto(
        mapaProductos['Kombucha Frutos Rojos 330ml'],
        15, // 15 unidades más
        115.00,
        '2027-05-15',
        {
            proveedorNombre: 'Bebidas Naturales Andinas S.A.',
            proveedorNit: '1829402011',
            nroFacturaCompra: 'F-8921',
            conFactura: true,
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

    // 8. Productos por Receta (Elaborados)
    console.log('[8/12] Creando productos elaborados por receta (escandallo multi-insumo)...');
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

    // 9. Grupos de modificadores (v7): Reemplazos de insumos, adiciones y opciones operativas
    console.log('[9/12] Configurando grupos de complementos y modificadores...');

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

    // Obtener IDs de opciones para armar ventas de prueba
    const gruposCargados = await queries.obtenerGruposModificadores(false);
    const mapaOpciones = {};
    for (const g of gruposCargados) {
        for (const op of g.opciones) {
            mapaOpciones[op.nombre] = op.id;
        }
    }

    // 10. Combos y Promociones (v8): Descomposición atómica de stock y límites
    console.log('[10/12] Creando combos y paquetes promocionales...');

    // Combo 1: Desayuno Clásico (Cappuccino + Croissant) -> Sin límite
    const comboDesayuno = await queries.crearProductoConInsumos({
        nombre: 'Combo Desayuno Clásico',
        precio: 20.00, // Ahorro vs 24.00 individual
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
        precio: 35.00, // Ahorro vs 40.00 individual
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
        precio: 17.00, // Ahorro vs 20.00 individual
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

    // 11. Simulación Operativa Completa: Turno #1 (Ayer, Cerrado, Cuadrado y Auditado)
    console.log('[11/12] Simulando Turno #1 histórico (Ayer) con arqueo ciego, pagos mixtos y facturación...');

    // Abrir Turno #1 en Caja 1 con fondo inicial de 150.00 Bs
    const turno1Id = await queries.abrirCaja(luciaId, 150.00, 1);

    // Venta A: Efectivo con cambio entregado (Cappuccino con leche de almendras y shot extra + Croissant)
    console.log('    -> Turno 1: Venta 1 en Efectivo con modificadores de receta...');
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
        50.00, // Pagó con billete de 50.00 Bs
        'Venta mostrador desayuno gourmet',
        luciaId
    );

    // Venta B: Venta por QR con FACTURA FISCAL (Snapshot IVA 13% e IT 3%)
    console.log('    -> Turno 1: Venta 2 por QR con Factura Fiscal y cliente corporativo...');
    await queries.registrarVentaCompleta(
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
            nroFactura: 'F-00101',
            cufAutorizacion: 'CUF-CAF-8849-XYZ-2026',
            clienteNitCi: '4839201019',
            clienteRazonSocial: 'Importadora Andina S.R.L.'
        }
    );

    // Venta C: Venta con PAGO MIXTO (Efectivo + QR) y DESCUENTO comercial prorrateado
    console.log('    -> Turno 1: Venta 3 con Pago Mixto (Efectivo + QR) y Descuento comercial...');
    // Mocha (18.00) + Latte (16.00) = 34.00 Bs bruto. Descuento 4.00 Bs -> Total 30.00 Bs neto.
    // Pagó: 10.00 Bs en Efectivo (con billete de 20.00 Bs -> 10.00 Bs de cambio) + 20.00 Bs por QR.
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
            descuento: 4.00,
            montoEfectivo: 10.00,
            montoQr: 20.00,
            referenciaQr: 'TRANSF-BNB-998231'
        }
    );

    // Venta D: Venta de COMBOS (2 Combos Desayuno Clásico)
    console.log('    -> Turno 1: Venta 4 de Combo Desayuno Clásico (descuento atómico multi-componente)...');
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

    // Venta E: Venta que luego es ANULADA (Demuestra auditoría de anulación y rollback de Kardex)
    console.log('    -> Turno 1: Venta 5 y posterior ANULACIÓN auditada (rollback de inventario y Kardex)...');
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

    // Anulación formal por parte de la administradora Sofía
    await queries.anularMovimientoConPermiso(
        sofiaId,
        ventaAnular.movimientoId,
        'Error de mesa: el cliente solicitó cancelar la orden antes de la preparación'
    );

    // Egreso 1: Gasto operativo menor de caja en efectivo (limpieza)
    console.log('    -> Turno 1: Egreso menor en efectivo...');
    await queries.registrarEgreso(
        turno1Id,
        18.00,
        'Compra urgente de papel secante y detergente para barra',
        'efectivo',
        luciaId
    );

    // Egreso 2: Gasto de mantenimiento con Factura Fiscal (Crédito fiscal IVA)
    console.log('    -> Turno 1: Egreso operativo respaldado con Factura Fiscal...');
    await queries.registrarEgreso(
        turno1Id,
        45.00,
        'Mantenimiento preventivo y cambio de empaque en grupo barista',
        'efectivo',
        luciaId,
        {
            categoriaContable: 'mantenimiento',
            proveedorNombre: 'Servicios Técnicos Café Express S.R.L.',
            proveedorNit: '2938401015',
            nroFactura: 'F-1204',
            conFactura: true,
            tipoComprobante: 'factura'
        }
    );

    // Inyección de cambio / sencillo (ingreso_efectivo)
    console.log('    -> Turno 1: Inyección de sencillo / monedas al cajón...');
    await queries.registrarIngresoEfectivo(
        turno1Id,
        50.00,
        'Reposición de monedas de 1 y 2 Bs por cambio matutino',
        luciaId
    );

    // Calcular efectivo esperado exacto para cerrar el Turno 1 perfectamente cuadrado
    const resumenT1 = await all(
        `SELECT tipo, metodo_pago, COALESCE(SUM(monto), 0) as total
         FROM movimientos
         WHERE caja_id = ? AND estado = 'completado'
         GROUP BY tipo, metodo_pago`,
        [turno1Id]
    );

    let ingEfT1 = 0;
    let egEfT1 = 0;
    for (const r of resumenT1) {
        if (r.tipo === 'ingreso' && r.metodo_pago === 'efectivo') ingEfT1 = Number(r.total);
        if (r.tipo === 'egreso' && r.metodo_pago === 'efectivo') egEfT1 = Number(r.total);
    }
    // También sumar la porción de efectivo de pagos mixtos
    const mixtosT1 = await get(
        `SELECT COALESCE(SUM(monto_efectivo), 0) as total_mixto_efectivo
         FROM movimientos
         WHERE caja_id = ? AND estado = 'completado' AND metodo_pago = 'mixto'`,
        [turno1Id]
    );
    const porcionMixtaEfectivo = Number(mixtosT1?.total_mixto_efectivo || 0);

    const efEsperadoT1 = Number((150.00 + ingEfT1 + porcionMixtaEfectivo - egEfT1).toFixed(2));

    console.log(`    -> Cerrando Turno #1 con arqueo ciego exacto: Bs ${efEsperadoT1.toFixed(2)}...`);
    await queries.cerrarCaja(turno1Id, efEsperadoT1, luciaId);

    // Ajustar fechas del Turno 1 a ayer para que Recharts muestre tendencias realistas
    await run(
        `UPDATE cajas
         SET fecha_apertura = datetime('now', '-1 day', '08:00:00'),
             fecha_cierre = datetime('now', '-1 day', '16:30:00')
         WHERE id = ?`,
        [turno1Id]
    );
    await run(
        `UPDATE movimientos
         SET fecha_hora = datetime('now', '-1 day', '+2 hours')
         WHERE caja_id = ?`,
        [turno1Id]
    );
    await run(
        `UPDATE movimientos_pagos
         SET movimiento_id = movimiento_id
         WHERE movimiento_id IN (SELECT id FROM movimientos WHERE caja_id = ?)`,
        [turno1Id]
    );
    await run(
        `UPDATE movimientos_productos_directos
         SET fecha_hora = datetime('now', '-1 day', '+2 hours')
         WHERE movimiento_id IN (SELECT id FROM movimientos WHERE caja_id = ?)`,
        [turno1Id]
    );
    await run(
        `UPDATE movimientos_insumos
         SET fecha_hora = datetime('now', '-1 day', '+2 hours')
         WHERE movimiento_id IN (SELECT id FROM movimientos WHERE caja_id = ?)`,
        [turno1Id]
    );

    // 12. Turno #2 (Hoy, ABIERTO en Caja 1 para operar de inmediato)
    console.log('[12/12] Abriendo Turno #2 (Hoy, ABIERTO) con ventas en curso para mostrador...');
    const turno2Id = await queries.abrirCaja(carlosId, 150.00, 1);

    // Venta de hoy 1: Combo Ejecutivo Almuerzo por QR
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
        'Almuerzo en terraza inicio turno hoy',
        carlosId,
        null,
        {
            referenciaQr: 'QR-BCP-552190'
        }
    );

    // Venta de hoy 2: Mocha Chocolate con Leche Deslactosada y Chantilly + 1 Croissant en Efectivo
    await queries.registrarVentaCompleta(
        turno2Id,
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

    // Verificación final de integridad de Kardex
    console.log('\n--- VERIFICACIÓN AUTOMÁTICA DE INTEGRIDAD ALGEBRAICA DE KARDEX ---');
    const checkKardexDirecto = await queries.verificarIntegridadKardexDirecto();
    const checkKardexInsumos = await queries.verificarIntegridadKardexInsumos();

    console.log(`[Kardex Directo] Válido: ${checkKardexDirecto.integridadOk} | Productos auditados: ${checkKardexDirecto.totalProductosDirectos} | Descuadres: ${checkKardexDirecto.totalDescuadres}`);
    console.log(`[Kardex Insumos] Válido: ${checkKardexInsumos.integridadOk} | Insumos auditados: ${checkKardexInsumos.totalInsumos} | Descuadres: ${checkKardexInsumos.totalDescuadres}`);

    if (!checkKardexDirecto.integridadOk || !checkKardexInsumos.integridadOk) {
        console.error('ADVERTENCIA: Se detectaron descuadres en la verificación de Kardex.');
    } else {
        console.log('✓ Kardex dual auditado y matemáticamente consistente al 100% (0 descuadres).');
    }

    console.log('==================================================================');
    console.log(' SEED INTEGRAL v11 COMPLETADO EXITOSAMENTE');
    console.log('==================================================================');
    console.log(`- Establecimiento: Café Gourmet & Bakery Aroma`);
    console.log(`- Régimen Fiscal: Régimen General (IVA 13%, IT 3%, Base: todas_las_ventas)`);
    console.log(`- Cajas Físicas: 2 estaciones con respaldo fiscal habilitado`);
    console.log(`- Categorías: ${categorias.length} categorías creadas`);
    console.log(`- Insumos de almacén: ${listaInsumos.length} con Kardex y NIC 2`);
    console.log(`- Productos en catálogo: ${Object.keys(mapaProductos).length} (Directos, Recetas y Combos)`);
    console.log(`- Grupos de Modificadores: 4 grupos (Leches con reemplazo, Endulzante, Extras, Sándwiches)`);
    console.log(`- Combos configurados: 3 combos (Estándar, Con límite regresivo y Con vigencia temporal)`);
    console.log(`- Turno #1 (Ayer, CERRADO): Cuadrado con arqueo ciego, pagos mixtos, facturas y anulación`);
    console.log(`- Turno #2 (Hoy, ABIERTO): En Caja 1 con fondo de Bs 150.00 a nombre de "carlos"`);
    console.log('------------------------------------------------------------------');
    console.log('Credenciales de acceso para pruebas:');
    console.log('  - Super Admin: carlos   | Clave: 12345678');
    console.log('  - Admin:       sofia    | Clave: 12345678');
    console.log('  - Cajera 1:    lucia    | Clave: 12345678');
    console.log('  - Cajero 2:    marcos   | Clave: 12345678');
    console.log('  - Developer:   developer| Clave: 12345678');
    console.log('==================================================================\n');
}

sembrarCafeteriaCompleta()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n[Error Fatal en Seed]', err);
        process.exit(1);
    });
