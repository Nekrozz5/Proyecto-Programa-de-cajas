// ==========================================
// SEED DE PRUEBA COMPLETO: CAFETERÍA & BAKERY GOURMET
// Incluye soporte integral para la Versión 7:
// - Grupos de modificadores (Tipo de Leche, Endulzantes, Extras, Temperatura, Toppings de Sándwich)
// - Opciones con reemplazo de insumos de receta (leche entera -> almendras/avena/deslactosada)
// - Opciones con adición de insumos (shots extra, jarabes, crema batida, hielo)
// - Asignación de grupos a productos
// - Historial de ventas auditadas con detalle de modificadores
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

async function sembrarCafeteria() {
    console.log('--- Iniciando carga de datos para Cafetería & Bakery (Con Modificadores v7) ---');

    // 1. Limpieza de tablas operativas
    console.log('[1/8] Limpiando tablas operativas previas...');
    await run(`DELETE FROM detalle_movimientos_combos`);
    await run(`DELETE FROM detalle_movimientos_modificadores`);
    await run(`DELETE FROM combo_componentes`);
    await run(`DELETE FROM producto_grupos_modificadores`);
    await run(`DELETE FROM modificadores_opciones`);
    await run(`DELETE FROM grupos_modificadores`);
    await run(`DELETE FROM movimientos_insumos`);
    await run(`DELETE FROM detalle_movimientos`);
    await run(`DELETE FROM movimientos`);
    await run(`DELETE FROM recetas`);
    await run(`DELETE FROM productos`);
    await run(`DELETE FROM insumos`);
    await run(`DELETE FROM cajas`);
    await run(`DELETE FROM categorias`);

    // 2. Configuración del negocio
    console.log('[2/8] Configurando modalidad de negocio Cafetería...');
    await run(
        `UPDATE configuracion_negocio
         SET nombre_negocio = 'Café Gourmet & Bakery Aroma',
             modalidad_nombre = 'Elaboración con Recetas e Insumos Perecederos',
             usa_stock_directo = 1,
             usa_vencimiento = 1,
             usa_recetas_ensamblaje = 1,
             configurado = 1
         WHERE id = 1`
    );

    // 3. Estaciones de caja física
    console.log('[3/8] Configurando terminales físicas de caja...');
    await run(`UPDATE cajas_fisicas SET nombre = 'Caja 1 - Barra Principal', activa = 1 WHERE id = 1`);
    await run(
        `INSERT OR IGNORE INTO cajas_fisicas (id, nombre, activa)
         VALUES (2, 'Caja 2 - Terraza & Take Away', 1)`
    );

    // 4. Usuarios del sistema
    console.log('[4/8] Configurando usuarios y credenciales (Clave universal: 12345678)...');
    const PASSWORD_UNIVERSAL = '12345678';
    const hashUniversal = await bcrypt.hash(PASSWORD_UNIVERSAL, BCRYPT_ROUNDS);

    // Asegurar cuenta Super Admin: carlos
    let carlosId;
    const carlos = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'carlos'`);
    if (!carlos) {
        const res = await run(`INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('carlos', ?, 'superadmin', 1)`, [hashUniversal]);
        carlosId = res.lastID;
    } else {
        await run(`UPDATE usuarios SET pin_o_password = ?, rol = 'superadmin', activo = 1 WHERE id = ?`, [hashUniversal, carlos.id]);
        carlosId = carlos.id;
    }

    // Asegurar cuenta Administradora: sofia
    let sofiaId;
    const sofia = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'sofia'`);
    if (!sofia) {
        const res = await run(`INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('sofia', ?, 'admin', 1)`, [hashUniversal]);
        sofiaId = res.lastID;
    } else {
        await run(`UPDATE usuarios SET pin_o_password = ?, rol = 'admin', activo = 1 WHERE id = ?`, [hashUniversal, sofia.id]);
        sofiaId = sofia.id;
    }

    // Asegurar cuenta Cajera 1: lucia
    let luciaId;
    const lucia = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'lucia'`);
    if (!lucia) {
        const res = await run(`INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('lucia', ?, 'user', 1)`, [hashUniversal]);
        luciaId = res.lastID;
    } else {
        await run(`UPDATE usuarios SET pin_o_password = ?, rol = 'user', activo = 1 WHERE id = ?`, [hashUniversal, lucia.id]);
        luciaId = lucia.id;
    }

    // Asegurar cuenta Cajero 2: marcos
    let marcosId;
    const marcos = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'marcos'`);
    if (!marcos) {
        const res = await run(`INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('marcos', ?, 'user', 1)`, [hashUniversal]);
        marcosId = res.lastID;
    } else {
        await run(`UPDATE usuarios SET pin_o_password = ?, rol = 'user', activo = 1 WHERE id = ?`, [hashUniversal, marcos.id]);
        marcosId = marcos.id;
    }

    // Asegurar cuenta técnica Developer: developer
    await run(`UPDATE usuarios SET pin_o_password = ?, activo = 1 WHERE LOWER(nombre) = 'developer'`, [hashUniversal]);

    // 5. Categorías
    console.log('[5/8] Creando categorías del catálogo...');
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
        await run(`INSERT OR IGNORE INTO categorias (nombre, activo) VALUES (?, 1)`, [cat]);
    }

    // 6. Insumos (Materia Prima para Recetas y Modificadores)
    console.log('[6/8] Creando insumos de almacén y compras iniciales...');
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
        { nombre: 'Pan Ciabatta Rústico', unidad: 'unidades', stock: 45, costo: 0.65, seg: 10, entrega: 1, venc: '2026-11-20' },
        { nombre: 'Pan Baguette Francés', unidad: 'unidades', stock: 35, costo: 0.70, seg: 10, entrega: 1, venc: '2026-11-20' },
        { nombre: 'Jamón Serrano Selección', unidad: 'gramos', stock: 3000, costo: 0.022, seg: 500, entrega: 2, venc: '2026-12-05' },
        { nombre: 'Queso Mozzarella Fresco', unidad: 'gramos', stock: 4000, costo: 0.015, seg: 600, entrega: 2, venc: '2026-12-01' },
        { nombre: 'Pechuga de Pavo Ahumada', unidad: 'gramos', stock: 2500, costo: 0.018, seg: 400, entrega: 2, venc: '2026-12-10' },
        { nombre: 'Hojas de Albahaca Fresca', unidad: 'gramos', stock: 600, costo: 0.010, seg: 100, entrega: 1, venc: '2026-11-22' },
        { nombre: 'Tomates Deshidratados', unidad: 'gramos', stock: 1500, costo: 0.016, seg: 200, entrega: 3, venc: '2027-01-15' },
        { nombre: 'Croissants Crudos para Hornear', unidad: 'unidades', stock: 80, costo: 0.45, seg: 20, entrega: 2, venc: '2026-11-28' }
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
            'Distribuidora Central de Café y Alimentos'
        );
        mapaInsumos[ins.nombre] = id;
    }

    // 7. Productos del catálogo (Recetas, Directos y Libres)
    console.log('[7/8] Creando productos del catálogo (recetas, reventa directa y libres)...');

    // A. PRODUCTOS POR RECETA (Elaborados)
    const productosReceta = [
        {
            nombre: 'Espresso Simple 30ml',
            precio: 2.50,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 9, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 12oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Espresso Doble 60ml',
            precio: 3.20,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 12oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Americano Clásico 12oz',
            precio: 3.00,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 12oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Cappuccino Barista 12oz',
            precio: 4.00,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 180, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Vaso Biodegradable 12oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Café Latte Vainilla 16oz',
            precio: 4.80,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 220, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Jarabe de Vainilla'], cantidad: 20, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Vaso Biodegradable 16oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Caramel Macchiato 16oz',
            precio: 5.20,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 200, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Jarabe de Caramelo'], cantidad: 25, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Vaso Biodegradable 16oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Mocha Chocolate Suizo 16oz',
            precio: 5.00,
            categoria: 'Cafés Calientes',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 200, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Salsa de Chocolate Mocha'], cantidad: 30, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 16oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Iced Latte Almendras 16oz',
            precio: 5.50,
            categoria: 'Bebidas Frías & Frappés',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche de Almendras'], cantidad: 220, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Vaso Biodegradable 16oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Frappé Caramelo & Café 16oz',
            precio: 5.80,
            categoria: 'Bebidas Frías & Frappés',
            ingredientes: [
                { insumoId: mapaInsumos['Café en Grano Tostado Especial'], cantidad: 18, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 150, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Jarabe de Caramelo'], cantidad: 30, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Hielo Purificado'], cantidad: 150, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 16oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Matcha Latte Cremoso 16oz',
            precio: 5.50,
            categoria: 'Bebidas Frías & Frappés, Tés & Infusiones',
            ingredientes: [
                { insumoId: mapaInsumos['Té Matcha Japonés en Polvo'], cantidad: 6, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Leche Entera Barista'], cantidad: 220, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Jarabe de Vainilla'], cantidad: 15, unidadReceta: 'mililitros' },
                { insumoId: mapaInsumos['Vaso Biodegradable 16oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Té Earl Grey en Hebras 12oz',
            precio: 3.20,
            categoria: 'Tés & Infusiones',
            ingredientes: [
                { insumoId: mapaInsumos['Hojas de Té Negro Earl Grey'], cantidad: 5, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Vaso Biodegradable 12oz'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Croissant Horneado Mantequilla',
            precio: 2.80,
            categoria: 'Pastelería & Dulces',
            ingredientes: [
                { insumoId: mapaInsumos['Croissants Crudos para Hornear'], cantidad: 1, unidadReceta: 'unidades' }
            ]
        },
        {
            nombre: 'Ciabatta Caprese Gourmet',
            precio: 6.50,
            categoria: 'Sándwiches & Salados',
            ingredientes: [
                { insumoId: mapaInsumos['Pan Ciabatta Rústico'], cantidad: 1, unidadReceta: 'unidades' },
                { insumoId: mapaInsumos['Queso Mozzarella Fresco'], cantidad: 80, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Tomates Deshidratados'], cantidad: 40, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Hojas de Albahaca Fresca'], cantidad: 10, unidadReceta: 'gramos' }
            ]
        },
        {
            nombre: 'Baguette Jamón Serrano & Mozzarella',
            precio: 7.80,
            categoria: 'Sándwiches & Salados',
            ingredientes: [
                { insumoId: mapaInsumos['Pan Baguette Francés'], cantidad: 1, unidadReceta: 'unidades' },
                { insumoId: mapaInsumos['Jamón Serrano Selección'], cantidad: 70, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Queso Mozzarella Fresco'], cantidad: 60, unidadReceta: 'gramos' }
            ]
        },
        {
            nombre: 'Baguette Pavo Ahumado & Queso',
            precio: 6.90,
            categoria: 'Sándwiches & Salados',
            ingredientes: [
                { insumoId: mapaInsumos['Pan Baguette Francés'], cantidad: 1, unidadReceta: 'unidades' },
                { insumoId: mapaInsumos['Pechuga de Pavo Ahumada'], cantidad: 80, unidadReceta: 'gramos' },
                { insumoId: mapaInsumos['Queso Mozzarella Fresco'], cantidad: 50, unidadReceta: 'gramos' }
            ]
        }
    ];

    const mapaProductos = {};

    for (const pr of productosReceta) {
        const prod = await queries.crearProductoConInsumos({
            nombre: pr.nombre,
            precio: pr.precio,
            categoria: pr.categoria,
            tipoComposicion: 'receta',
            insumosReceta: pr.ingredientes
        });
        mapaProductos[pr.nombre] = prod.id;
    }

    // B. PRODUCTOS DE VENTA DIRECTA (Reventa con stock propio)
    const productosDirectos = [
        { nombre: 'Agua Mineral Sin Gas 500ml', precio: 1.80, costo: 0.60, stock: 48, min: 12, cat: 'Bebidas Embotelladas' },
        { nombre: 'Agua Mineral Con Gas 500ml', precio: 1.80, costo: 0.60, stock: 36, min: 12, cat: 'Bebidas Embotelladas' },
        { nombre: 'Jugo Natural Naranja & Zanahoria 350ml', precio: 3.50, costo: 1.50, stock: 20, min: 5, cat: 'Bebidas Embotelladas, Bebidas Frías & Frappés' },
        { nombre: 'Kombucha Frutos Rojos 330ml', precio: 4.20, costo: 2.10, stock: 16, min: 5, cat: 'Bebidas Embotelladas' },
        { nombre: 'Muffin de Arándanos Silvestres', precio: 3.20, costo: 1.20, stock: 18, min: 4, cat: 'Pastelería & Dulces' },
        { nombre: 'Porción Cheesecake Frutos Rojos', precio: 4.50, costo: 1.80, stock: 12, min: 3, cat: 'Pastelería & Dulces' },
        { nombre: 'Brownie Artesanal con Nueces', precio: 2.80, costo: 1.00, stock: 24, min: 6, cat: 'Pastelería & Dulces' },
        { nombre: 'Galleta Choco Chips XXL', precio: 2.00, costo: 0.70, stock: 30, min: 8, cat: 'Pastelería & Dulces, Snacks & Empaquetados' },
        { nombre: 'Alfajor Artesanal de Maicena', precio: 2.20, costo: 0.80, stock: 25, min: 5, cat: 'Pastelería & Dulces, Snacks & Empaquetados' },
        { nombre: 'Mix Frutos Secos & Almendras 80g', precio: 3.00, costo: 1.30, stock: 22, min: 5, cat: 'Snacks & Empaquetados' },
        { nombre: 'Barra de Cereal & Miel Orgánica', precio: 1.50, costo: 0.60, stock: 40, min: 10, cat: 'Snacks & Empaquetados' }
    ];

    for (const pd of productosDirectos) {
        const id = await queries.crearProducto(
            pd.nombre,
            pd.precio,
            pd.costo,
            pd.cat,
            pd.stock,
            'unidades',
            pd.min,
            null
        );
        mapaProductos[pd.nombre] = id;
    }

    // C. PRODUCTOS LIBRES (Servicios / Alquileres sin stock de inventario)
    const productosLibres = [
        { nombre: 'Alquiler Espacio Coworking (1 Hora + Wi-Fi)', precio: 5.00, cat: 'Combos & Promociones' },
        { nombre: 'Servicio de Descorche / Uso de Salón', precio: 3.50, cat: 'Combos & Promociones' }
    ];

    for (const pl of productosLibres) {
        const id = await queries.crearProducto(
            pl.nombre,
            pl.precio,
            0,
            pl.cat,
            null,
            'unidades',
            0,
            null
        );
        mapaProductos[pl.nombre] = id;
    }

    // D. COMBOS REALES Y PROMOCIONES (NUEVA FUNCIONALIDAD v8)
    console.log('[+] Registrando Combos y Promociones vinculados a recetas y stock...');
    const comboDesayunoId = (await queries.crearProductoConInsumos({
        nombre: 'Combo Desayuno: Cappuccino + Croissant',
        precio: 6.00,
        categoria: 'Combos & Promociones',
        tipoComposicion: 'combo',
        componentesCombo: [
            { productoId: mapaProductos['Cappuccino Barista 12oz'], cantidad: 1 },
            { productoId: mapaProductos['Croissant Horneado Mantequilla'], cantidad: 1 }
        ],
        limiteMaximoActivo: true,
        limiteUnidadesTotal: 40
    })).id;
    mapaProductos['Combo Desayuno: Cappuccino + Croissant'] = comboDesayunoId;

    const comboTardeId = (await queries.crearProductoConInsumos({
        nombre: 'Combo Tarde Dulce: Americano + Cheesecake',
        precio: 5.50,
        categoria: 'Combos & Promociones',
        tipoComposicion: 'combo',
        componentesCombo: [
            { productoId: mapaProductos['Americano Clásico 12oz'], cantidad: 1 },
            { productoId: mapaProductos['Porción Cheesecake Frutos Rojos'], cantidad: 1 }
        ],
        limiteMaximoActivo: false
    })).id;
    mapaProductos['Combo Tarde Dulce: Americano + Cheesecake'] = comboTardeId;

    // ==========================================
    // 8. CREACIÓN DE GRUPOS DE MODIFICADORES (NUEVA FUNCIONALIDAD v7)
    // ==========================================
    console.log('[+] Creando grupos de modificadores y complementos para cafetería...');

    // A. Tipo de Leche (Selección Única, Obligatorio)
    // Con reemplazo dinámico de insumos de la receta
    const lecheEnteraId = mapaInsumos['Leche Entera Barista'];
    const lecheDeslactosadaId = mapaInsumos['Leche Deslactosada Barista'];
    const lecheAlmendrasId = mapaInsumos['Leche de Almendras'];
    const lecheAvenaId = mapaInsumos['Leche de Avena Barista'];

    const grupoLecheId = await queries.crearGrupoModificadores({
        nombre: 'Tipo de Leche',
        tipoSeleccion: 'unica',
        esObligatorio: true,
        opciones: [
            {
                nombre: 'Leche Entera Barista',
                precioAdicional: 0.00,
                insumoId: lecheEnteraId,
                cantidadInsumo: 0, // Conserva la cantidad de la receta base
                insumoReemplazadoId: null,
                esDefault: 1
            },
            {
                nombre: 'Leche Deslactosada (+Bs 0.50)',
                precioAdicional: 0.50,
                insumoId: lecheDeslactosadaId,
                cantidadInsumo: 0, // Sustituye la cantidad exacta de la leche de la receta
                insumoReemplazadoId: lecheEnteraId,
                esDefault: 0
            },
            {
                nombre: 'Leche de Almendras (+Bs 0.80)',
                precioAdicional: 0.80,
                insumoId: lecheAlmendrasId,
                cantidadInsumo: 0,
                insumoReemplazadoId: lecheEnteraId,
                esDefault: 0
            },
            {
                nombre: 'Leche de Avena Barista (+Bs 0.80)',
                precioAdicional: 0.80,
                insumoId: lecheAvenaId,
                cantidadInsumo: 0,
                insumoReemplazadoId: lecheEnteraId,
                esDefault: 0
            }
        ]
    }, sofiaId);

    // B. Endulzante (Selección Única, Opcional)
    const grupoEndulzanteId = await queries.crearGrupoModificadores({
        nombre: 'Endulzante / Azúcar',
        tipoSeleccion: 'unica',
        esObligatorio: false,
        opciones: [
            {
                nombre: 'Sin Azúcar',
                precioAdicional: 0.00,
                insumoId: null,
                cantidadInsumo: 0,
                insumoReemplazadoId: null,
                esDefault: 1
            },
            {
                nombre: 'Azúcar Mascabado (1 sobre)',
                precioAdicional: 0.00,
                insumoId: mapaInsumos['Sobres de Azúcar Mascabado'],
                cantidadInsumo: 1,
                insumoReemplazadoId: null,
                esDefault: 0
            },
            {
                nombre: 'Stevia Orgánica (1 sobre)',
                precioAdicional: 0.00,
                insumoId: mapaInsumos['Sobres de Stevia Orgánica'],
                cantidadInsumo: 1,
                insumoReemplazadoId: null,
                esDefault: 0
            },
            {
                nombre: 'Miel de Abeja Pura (+Bs 0.50)',
                precioAdicional: 0.50,
                insumoId: mapaInsumos['Miel de Abeja Pura'],
                cantidadInsumo: 15,
                insumoReemplazadoId: null,
                esDefault: 0
            }
        ]
    }, sofiaId);

    // C. Extras & Jarabes para Café (Selección Múltiple, Opcional)
    const grupoExtrasCafeId = await queries.crearGrupoModificadores({
        nombre: 'Extras & Jarabes para Café',
        tipoSeleccion: 'multiple',
        esObligatorio: false,
        opciones: [
            {
                nombre: 'Extra Shot Espresso (+Bs 1.00)',
                precioAdicional: 1.00,
                insumoId: mapaInsumos['Café en Grano Tostado Especial'],
                cantidadInsumo: 9,
                insumoReemplazadoId: null,
                esDefault: 0
            },
            {
                nombre: 'Shot Jarabe Vainilla (+Bs 0.60)',
                precioAdicional: 0.60,
                insumoId: mapaInsumos['Jarabe de Vainilla'],
                cantidadInsumo: 15,
                insumoReemplazadoId: null,
                esDefault: 0
            },
            {
                nombre: 'Shot Jarabe Caramelo (+Bs 0.60)',
                precioAdicional: 0.60,
                insumoId: mapaInsumos['Jarabe de Caramelo'],
                cantidadInsumo: 15,
                insumoReemplazadoId: null,
                esDefault: 0
            },
            {
                nombre: 'Crema Batida Chantilly (+Bs 0.75)',
                precioAdicional: 0.75,
                insumoId: mapaInsumos['Crema de Leche para Batir (Chantilly)'],
                cantidadInsumo: 30,
                insumoReemplazadoId: null,
                esDefault: 0
            },
            {
                nombre: 'Chispas de Chocolate Belga (+Bs 0.40)',
                precioAdicional: 0.40,
                insumoId: mapaInsumos['Chispas de Chocolate Belga'],
                cantidadInsumo: 10,
                insumoReemplazadoId: null,
                esDefault: 0
            }
        ]
    }, sofiaId);

    // D. Temperatura / Estilo (Selección Única, Obligatorio)
    const grupoTemperaturaId = await queries.crearGrupoModificadores({
        nombre: 'Temperatura de la Bebida',
        tipoSeleccion: 'unica',
        esObligatorio: true,
        opciones: [
            {
                nombre: 'Caliente Tradicional',
                precioAdicional: 0.00,
                insumoId: null,
                cantidadInsumo: 0,
                insumoReemplazadoId: null,
                esDefault: 1
            },
            {
                nombre: 'Iced / Con Hielo (+Bs 0.30)',
                precioAdicional: 0.30,
                insumoId: mapaInsumos['Hielo Purificado'],
                cantidadInsumo: 150,
                insumoReemplazadoId: null,
                esDefault: 0
            }
        ]
    }, sofiaId);

    // E. Personalización de Sándwiches (Selección Múltiple, Opcional)
    const grupoSandwichId = await queries.crearGrupoModificadores({
        nombre: 'Personalización de Sándwich',
        tipoSeleccion: 'multiple',
        esObligatorio: false,
        opciones: [
            {
                nombre: 'Tostado y Prensado Caliente',
                precioAdicional: 0.00,
                insumoId: null,
                cantidadInsumo: 0,
                insumoReemplazadoId: null,
                esDefault: 1
            },
            {
                nombre: 'Extra Queso Mozzarella (+Bs 1.20)',
                precioAdicional: 1.20,
                insumoId: mapaInsumos['Queso Mozzarella Fresco'],
                cantidadInsumo: 50,
                insumoReemplazadoId: null,
                esDefault: 0
            },
            {
                nombre: 'Extra Jamón Serrano (+Bs 1.80)',
                precioAdicional: 1.80,
                insumoId: mapaInsumos['Jamón Serrano Selección'],
                cantidadInsumo: 40,
                insumoReemplazadoId: null,
                esDefault: 0
            },
            {
                nombre: 'Pesto / Albahaca Fresca Extra (+Bs 0.80)',
                precioAdicional: 0.80,
                insumoId: mapaInsumos['Hojas de Albahaca Fresca'],
                cantidadInsumo: 15,
                insumoReemplazadoId: null,
                esDefault: 0
            }
        ]
    }, sofiaId);

    // ASIGNAR MODIFICADORES A PRODUCTOS
    console.log('[+] Asignando grupos de modificadores a los productos correspondientes...');

    // Cafés con leche: Leche, Endulzante, Extras, Temperatura
    const cafesConLeche = [
        'Cappuccino Barista 12oz',
        'Café Latte Vainilla 16oz',
        'Caramel Macchiato 16oz',
        'Mocha Chocolate Suizo 16oz'
    ];
    for (const nombreProd of cafesConLeche) {
        if (mapaProductos[nombreProd]) {
            await queries.asignarModificadoresAProducto(
                mapaProductos[nombreProd],
                [grupoLecheId, grupoEndulzanteId, grupoExtrasCafeId, grupoTemperaturaId],
                sofiaId
            );
        }
    }

    // Cafés negros: Endulzante, Extras, Temperatura
    const cafesNegros = [
        'Espresso Simple 30ml',
        'Espresso Doble 60ml',
        'Americano Clásico 12oz'
    ];
    for (const nombreProd of cafesNegros) {
        if (mapaProductos[nombreProd]) {
            await queries.asignarModificadoresAProducto(
                mapaProductos[nombreProd],
                [grupoEndulzanteId, grupoExtrasCafeId, grupoTemperaturaId],
                sofiaId
            );
        }
    }

    // Bebidas frías / Frappés: Tipo Leche, Extras
    const bebidasFrias = [
        'Iced Latte Almendras 16oz',
        'Frappé Caramelo & Café 16oz',
        'Matcha Latte Cremoso 16oz'
    ];
    for (const nombreProd of bebidasFrias) {
        if (mapaProductos[nombreProd]) {
            await queries.asignarModificadoresAProducto(
                mapaProductos[nombreProd],
                [grupoLecheId, grupoExtrasCafeId],
                sofiaId
            );
        }
    }

    // Sándwiches: Personalización de Sándwich
    const sandwiches = [
        'Ciabatta Caprese Gourmet',
        'Baguette Jamón Serrano & Mozzarella',
        'Baguette Pavo Ahumado & Queso'
    ];
    for (const nombreProd of sandwiches) {
        if (mapaProductos[nombreProd]) {
            await queries.asignarModificadoresAProducto(
                mapaProductos[nombreProd],
                [grupoSandwichId],
                sofiaId
            );
        }
    }

    // Obtener IDs de opciones de modificadores para ventas de prueba
    const todasOpciones = await all(`SELECT id, grupo_id, nombre, precio_adicional FROM modificadores_opciones`);
    const buscarOpcion = (nombreParcial) => {
        const found = todasOpciones.find((o) => o.nombre.toLowerCase().includes(nombreParcial.toLowerCase()));
        return found ? found.id : null;
    };

    const opLecheAlmendras = buscarOpcion('Almendras');
    const opLecheDeslactosada = buscarOpcion('Deslactosada');
    const opExtraShot = buscarOpcion('Extra Shot');
    const opCremaChantilly = buscarOpcion('Chantilly');
    const opIced = buscarOpcion('Iced');
    const opMiel = buscarOpcion('Miel');
    const opExtraMozzarella = buscarOpcion('Extra Queso Mozzarella');
    const opTostado = buscarOpcion('Tostado');

    // ==========================================
    // 9. SIMULACIÓN DE HISTORIAL REALISTA (Turno 1 Cerrado + Turno 2 Abierto)
    // ==========================================
    console.log('[+] Generando historial de operaciones con modificadores y turnos de caja...');

    // TURNO 1 (Cerrado por Lucía - Simula turno anterior con personalización de pedidos)
    const turno1Id = await queries.abrirCaja(luciaId, 100.00, 1);

    // Venta 1: Cappuccino con Leche de Almendras (+0.80) y Extra Shot (+1.00) + Croissant
    // Precio Cappuccino: 4.00 + 0.80 + 1.00 = 5.80. Croissant: 2.80. Total: 8.60
    await queries.registrarVentaCompleta(
        turno1Id,
        [
            {
                productoId: mapaProductos['Cappuccino Barista 12oz'],
                cantidad: 1,
                modificadores: [opLecheAlmendras, opExtraShot].filter(Boolean)
            },
            {
                productoId: mapaProductos['Croissant Horneado Mantequilla'],
                cantidad: 1
            }
        ],
        'efectivo',
        10.00,
        'Desayuno mesa 2 (Cappuccino personalizado)',
        luciaId
    );

    // Venta 2: Americano Iced (+0.30) con Miel (+0.50) + Muffin
    // Americano: 3.00 + 0.30 + 0.50 = 3.80. Muffin: 3.20. Total: 7.00
    await queries.registrarVentaCompleta(
        turno1Id,
        [
            {
                productoId: mapaProductos['Americano Clásico 12oz'],
                cantidad: 1,
                modificadores: [opIced, opMiel].filter(Boolean)
            },
            {
                productoId: mapaProductos['Muffin de Arándanos Silvestres'],
                cantidad: 1
            }
        ],
        'qr',
        null,
        'Take away orden #102',
        luciaId
    );

    // Venta 3: Ciabatta Caprese con Extra Mozzarella (+1.20) y Tostado + Agua sin gas
    // Ciabatta: 6.50 + 1.20 = 7.70. Agua: 1.80. Total: 9.50
    await queries.registrarVentaCompleta(
        turno1Id,
        [
            {
                productoId: mapaProductos['Ciabatta Caprese Gourmet'],
                cantidad: 1,
                modificadores: [opExtraMozzarella, opTostado].filter(Boolean)
            },
            {
                productoId: mapaProductos['Agua Mineral Sin Gas 500ml'],
                cantidad: 1
            }
        ],
        'efectivo',
        10.00,
        'Almuerzo express mostrador',
        luciaId
    );

    // Venta 4: Matcha Latte + Cheesecake
    await queries.registrarVentaCompleta(
        turno1Id,
        [
            { productoId: mapaProductos['Matcha Latte Cremoso 16oz'], cantidad: 1 },
            { productoId: mapaProductos['Porción Cheesecake Frutos Rojos'], cantidad: 1 }
        ],
        'qr',
        null,
        'Merienda mesa 4',
        luciaId
    );

    // Venta 5: Café Latte Vainilla con Crema Chantilly (+0.75) y Leche Deslactosada (+0.50)
    // Latte: 4.80 + 0.75 + 0.50 = 6.05. Galleta: 2.00. Total: 8.05
    await queries.registrarVentaCompleta(
        turno1Id,
        [
            {
                productoId: mapaProductos['Café Latte Vainilla 16oz'],
                cantidad: 1,
                modificadores: [opCremaChantilly, opLecheDeslactosada].filter(Boolean)
            },
            {
                productoId: mapaProductos['Galleta Choco Chips XXL'],
                cantidad: 1
            }
        ],
        'efectivo',
        10.00,
        'Café al paso',
        luciaId
    );

    // Egreso de caja menor turno 1
    await queries.registrarEgreso(
        turno1Id,
        12.00,
        'Compra urgente de bolsa de hielo para frappes',
        'efectivo',
        luciaId
    );

    // Ingreso de efectivo (reposición de cambio)
    await queries.registrarIngresoEfectivo(
        turno1Id,
        25.00,
        'Aporte de monedas y billetes chicos para cambio',
        luciaId
    );

    // Calcular efectivo esperado exacto para cerrar cuadrado
    const resumenT1 = await all(
        `SELECT tipo, metodo_pago, COALESCE(SUM(monto), 0) as total
         FROM movimientos WHERE caja_id = ? AND estado = 'completado' GROUP BY tipo, metodo_pago`,
        [turno1Id]
    );
    let ingEfT1 = 0, egEfT1 = 0;
    for (const r of resumenT1) {
        if (r.tipo === 'ingreso' && r.metodo_pago === 'efectivo') ingEfT1 = Number(r.total);
        if (r.tipo === 'egreso' && r.metodo_pago === 'efectivo') egEfT1 = Number(r.total);
    }
    const efEsperadoT1 = Number((100.00 + ingEfT1 - egEfT1).toFixed(2));

    await queries.cerrarCaja(turno1Id, efEsperadoT1, luciaId);

    // Ajustar fechas del Turno 1 a ayer para comparativa de tendencias en Recharts
    await run(
        `UPDATE cajas
         SET fecha_apertura = datetime('now', '-1 day', '08:00:00'),
             fecha_cierre = datetime('now', '-1 day', '16:30:00')
         WHERE id = ?`,
        [turno1Id]
    );

    await run(
        `UPDATE movimientos
         SET fecha_hora = datetime('now', '-1 day', '+8 hours')
         WHERE caja_id = ?`,
        [turno1Id]
    );

    await run(
        `UPDATE movimientos_insumos
         SET fecha_hora = datetime('now', '-1 day', '+8 hours')
         WHERE movimiento_id IN (SELECT id FROM movimientos WHERE caja_id = ?)`,
        [turno1Id]
    );

    // TURNO 2 (Abierto hoy a nombre de Carlos - Super Admin en Caja 1)
    console.log('[+] Abriendo turno activo para pruebas inmediatas en mostrador...');
    const turno2Id = await queries.abrirCaja(carlosId, 120.00, 1);

    // Registrar 2 ventas de hoy con modificadores para ver movimiento en curso
    // Venta A: Mocha Chocolate con Extra Shot (+1.00) y Crema Chantilly (+0.75) + 1 Croissant
    await queries.registrarVentaCompleta(
        turno2Id,
        [
            {
                productoId: mapaProductos['Mocha Chocolate Suizo 16oz'],
                cantidad: 1,
                modificadores: [opExtraShot, opCremaChantilly].filter(Boolean)
            },
            {
                productoId: mapaProductos['Croissant Horneado Mantequilla'],
                cantidad: 1
            }
        ],
        'efectivo',
        10.00,
        'Venta mostrador inicio jornada (Mocha especial)',
        carlosId
    );

    // Venta B: Baguette Serrano con Extra Mozzarella (+1.20) + Kombucha
    await queries.registrarVentaCompleta(
        turno2Id,
        [
            {
                productoId: mapaProductos['Baguette Jamón Serrano & Mozzarella'],
                cantidad: 1,
                modificadores: [opExtraMozzarella, opTostado].filter(Boolean)
            },
            {
                productoId: mapaProductos['Kombucha Frutos Rojos 330ml'],
                cantidad: 1
            }
        ],
        'qr',
        null,
        'Almuerzo terraza',
        carlosId
    );

    console.log('==================================================================');
    console.log(' SEED v7 COMPLETADO EXITOSAMENTE PARA CAFETERÍA & BAKERY');
    console.log('==================================================================');
    console.log(`- Establecimiento: Café Gourmet & Bakery Aroma`);
    console.log(`- Cajas Físicas: 2 estaciones configuradas`);
    console.log(`- Categorías: ${categorias.length} creadas`);
    console.log(`- Insumos de almacén: ${listaInsumos.length} con stock y costos ponderados`);
    console.log(`- Productos en catálogo: ${Object.keys(mapaProductos).length} (Recetas, Directos y Libres)`);
    console.log(`- Grupos de Modificadores (v7): 5 grupos (Leche, Endulzante, Extras, Temp, Sándwiches)`);
    console.log(`- Turno #1 (Ayer, Cerrado): Cuadrado con ventas personalizadas (efectivo y QR)`);
    console.log(`- Turno #2 (Hoy, ABIERTO): En Caja 1 con fondo de $120.00 a nombre de "carlos"`);
    console.log('------------------------------------------------------------------');
    console.log('Credenciales de acceso para pruebas:');
    console.log('  TODOS LOS USUARIOS TIENEN CONTRASEÑA / PIN: 12345678');
    console.log('  1. Super Admin: carlos    | Contraseña: 12345678');
    console.log('  2. Admin:       sofia     | Contraseña: 12345678');
    console.log('  3. Cajera 1:    lucia     | PIN:        12345678');
    console.log('  4. Cajero 2:    marcos    | PIN:        12345678');
    console.log('  5. Developer:   developer | Clave:      12345678');
    console.log('==================================================================');
}

sembrarCafeteria()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error('Error durante la siembra de la base de datos:', err);
        process.exit(1);
    });
