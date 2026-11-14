// ==========================================
// SEED DE PRUEBA: CAFETERÍA & BAKERY GOURMET
// Puebla la base de datos con datos completos y coherentes para pruebas manuales
// ==========================================
const path = require('path');
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
    console.log('--- Iniciando carga de datos para Cafetería & Bakery ---');

    // 1. Limpieza de tablas operativas para evitar duplicados o estados inconsistentes
    console.log('[1/7] Limpiando tablas operativas previas...');
    await run(`DELETE FROM movimientos_insumos`);
    await run(`DELETE FROM detalle_movimientos`);
    await run(`DELETE FROM movimientos`);
    await run(`DELETE FROM recetas`);
    await run(`DELETE FROM productos`);
    await run(`DELETE FROM insumos`);
    await run(`DELETE FROM cajas`);
    await run(`DELETE FROM categorias`);

    // 2. Configuración del negocio
    console.log('[2/7] Configurando modalidad de negocio Cafetería...');
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
    console.log('[3/7] Configurando terminales físicas de caja...');
    await run(`UPDATE cajas_fisicas SET nombre = 'Caja 1 - Barra Principal', activa = 1 WHERE id = 1`);
    await run(
        `INSERT OR IGNORE INTO cajas_fisicas (id, nombre, activa)
         VALUES (2, 'Caja 2 - Terraza & Take Away', 1)`
    );

    // 4. Usuarios del sistema
    console.log('[4/7] Configurando usuarios y credenciales...');
    const hashCarlos = await bcrypt.hash('Carlos1234*', BCRYPT_ROUNDS);
    const hashSofia = await bcrypt.hash('Admin1234*', BCRYPT_ROUNDS);
    const hashLucia = await bcrypt.hash('1234', BCRYPT_ROUNDS);
    const hashMarcos = await bcrypt.hash('5678', BCRYPT_ROUNDS);

    // Actualizar Carlos
    await run(`UPDATE usuarios SET nombre = 'carlos', pin_o_password = ?, rol = 'superadmin', activo = 1 WHERE id = 2`, [hashCarlos]);

    // Insertar Sofia (admin), Lucia (user) y Marcos (user) si no existen
    const sofia = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'sofia'`);
    let sofiaId = sofia ? sofia.id : null;
    if (!sofia) {
        const res = await run(`INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('sofia', ?, 'admin', 1)`, [hashSofia]);
        sofiaId = res.lastID;
    } else {
        await run(`UPDATE usuarios SET pin_o_password = ?, rol = 'admin', activo = 1 WHERE id = ?`, [hashSofia, sofia.id]);
    }

    const lucia = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'lucia'`);
    let luciaId = lucia ? lucia.id : null;
    if (!lucia) {
        const res = await run(`INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('lucia', ?, 'user', 1)`, [hashLucia]);
        luciaId = res.lastID;
    } else {
        await run(`UPDATE usuarios SET pin_o_password = ?, rol = 'user', activo = 1 WHERE id = ?`, [hashLucia, lucia.id]);
    }

    const marcos = await get(`SELECT id FROM usuarios WHERE LOWER(nombre) = 'marcos'`);
    let marcosId = marcos ? marcos.id : null;
    if (!marcos) {
        const res = await run(`INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('marcos', ?, 'user', 1)`, [hashMarcos]);
        marcosId = res.lastID;
    } else {
        await run(`UPDATE usuarios SET pin_o_password = ?, rol = 'user', activo = 1 WHERE id = ?`, [hashMarcos, marcos.id]);
    }

    // 5. Categorías
    console.log('[5/7] Creando categorías del catálogo...');
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

    // 6. Insumos (Materia Prima)
    console.log('[6/7] Creando insumos de almacén y compras iniciales...');
    const listaInsumos = [
        { nombre: 'Café en Grano Tostado Especial', unidad: 'gramos', stock: 15000, costo: 0.025, seg: 2000, entrega: 2, venc: '2027-06-30' },
        { nombre: 'Leche Entera Barista', unidad: 'mililitros', stock: 30000, costo: 0.0015, seg: 5000, entrega: 1, venc: '2026-12-15' },
        { nombre: 'Leche de Almendras', unidad: 'mililitros', stock: 10000, costo: 0.003, seg: 2000, entrega: 2, venc: '2026-12-20' },
        { nombre: 'Jarabe de Vainilla', unidad: 'mililitros', stock: 5000, costo: 0.008, seg: 1000, entrega: 3, venc: '2027-01-10' },
        { nombre: 'Jarabe de Caramelo', unidad: 'mililitros', stock: 5000, costo: 0.008, seg: 1000, entrega: 3, venc: '2027-01-10' },
        { nombre: 'Salsa de Chocolate Mocha', unidad: 'gramos', stock: 4000, costo: 0.012, seg: 800, entrega: 3, venc: '2027-02-15' },
        { nombre: 'Té Matcha Japonés en Polvo', unidad: 'gramos', stock: 2000, costo: 0.045, seg: 300, entrega: 5, venc: '2027-05-20' },
        { nombre: 'Hojas de Té Negro Earl Grey', unidad: 'gramos', stock: 1500, costo: 0.030, seg: 200, entrega: 4, venc: '2027-08-10' },
        { nombre: 'Vaso Biodegradable 12oz', unidad: 'unidades', stock: 500, costo: 0.15, seg: 100, entrega: 2, venc: null },
        { nombre: 'Vaso Biodegradable 16oz', unidad: 'unidades', stock: 450, costo: 0.20, seg: 100, entrega: 2, venc: null },
        { nombre: 'Pan Ciabatta Rústico', unidad: 'unidades', stock: 45, costo: 0.65, seg: 10, entrega: 1, venc: '2026-11-20' },
        { nombre: 'Pan Baguette Francés', unidad: 'unidades', stock: 35, costo: 0.70, seg: 10, entrega: 1, venc: '2026-11-20' },
        { nombre: 'Jamón Serrano Selección', unidad: 'gramos', stock: 3000, costo: 0.022, seg: 500, entrega: 2, venc: '2026-12-05' },
        { nombre: 'Queso Mozzarella Fresco', unidad: 'gramos', stock: 3500, costo: 0.015, seg: 600, entrega: 2, venc: '2026-12-01' },
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
    console.log('[7/7] Creando productos del catálogo (recetas, reventa directa y libres)...');

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

    // C. PRODUCTOS LIBRES (Servicios / Extras)
    const productosLibres = [
        { nombre: 'Extra Shot de Café Espresso', precio: 1.00, cat: 'Cafés Calientes' },
        { nombre: 'Cambio a Leche Vegetal', precio: 0.80, cat: 'Cafés Calientes, Bebidas Frías & Frappés' },
        { nombre: 'Shot Jarabe Saborizante', precio: 0.60, cat: 'Cafés Calientes, Bebidas Frías & Frappés' },
        { nombre: 'Combo Desayuno: Cappuccino + Croissant', precio: 6.00, cat: 'Combos & Promociones' },
        { nombre: 'Alquiler Espacio Coworking (1 Hora + Wi-Fi)', precio: 5.00, cat: 'Combos & Promociones' }
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

    // ==========================================
    // 8. SIMULACIÓN DE HISTORIAL REALISTA (Turno 1 Cerrado + Turno 2 Abierto)
    // ==========================================
    console.log('[+] Generando historial de operaciones y turnos de caja...');

    // TURNO 1 (Cerrado por Lucía - Simula el turno de ayer)
    const turno1Id = await queries.abrirCaja(luciaId, 100.00, 1);

    // Ventas del turno 1
    const v1 = await queries.registrarVentaCompleta(
        turno1Id,
        [
            { productoId: mapaProductos['Cappuccino Barista 12oz'], cantidad: 2 },
            { productoId: mapaProductos['Croissant Horneado Mantequilla'], cantidad: 1 }
        ],
        'efectivo',
        15.00,
        'Desayuno salón mesa 2',
        luciaId
    );

    const v2 = await queries.registrarVentaCompleta(
        turno1Id,
        [
            { productoId: mapaProductos['Caramel Macchiato 16oz'], cantidad: 1 },
            { productoId: mapaProductos['Muffin de Arándanos Silvestres'], cantidad: 1 }
        ],
        'qr',
        null,
        'Take away orden #102',
        luciaId
    );

    const v3 = await queries.registrarVentaCompleta(
        turno1Id,
        [
            { productoId: mapaProductos['Baguette Jamón Serrano & Mozzarella'], cantidad: 1 },
            { productoId: mapaProductos['Agua Mineral Sin Gas 500ml'], cantidad: 1 }
        ],
        'efectivo',
        10.00,
        'Almuerzo express mostrador',
        luciaId
    );

    const v4 = await queries.registrarVentaCompleta(
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

    const v5 = await queries.registrarVentaCompleta(
        turno1Id,
        [
            { productoId: mapaProductos['Americano Clásico 12oz'], cantidad: 1 },
            { productoId: mapaProductos['Galleta Choco Chips XXL'], cantidad: 1 }
        ],
        'efectivo',
        5.00,
        'Café al paso',
        luciaId
    );

    const v6 = await queries.registrarVentaCompleta(
        turno1Id,
        [
            { productoId: mapaProductos['Iced Latte Almendras 16oz'], cantidad: 1 },
            { productoId: mapaProductos['Alfajor Artesanal de Maicena'], cantidad: 1 }
        ],
        'qr',
        null,
        'Take away orden #108',
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

    // Ingreso de efectivo (sencillo) turno 1
    await queries.registrarIngresoEfectivo(
        turno1Id,
        25.00,
        'Aporte de monedas y billetes chicos para cambio',
        luciaId
    );

    // Cierre Turno 1 con arqueo ciego exacto
    // Efectivo esperado = 100 (inicio) + 10.80 (v1) + 9.60 (v3) + 5.00 (v5) + 25.00 (ingreso) - 12.00 (egreso) = 138.40
    await queries.cerrarCaja(turno1Id, 138.40, luciaId);

    // Ajustar fechas del Turno 1 a ayer para tener comparativa semanal realista en Recharts
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
    const turno2Id = await queries.abrirCaja(2, 120.00, 1);

    // Registrar 2 ventas de hoy para ver movimiento en curso
    await queries.registrarVentaCompleta(
        turno2Id,
        [
            { productoId: mapaProductos['Cappuccino Barista 12oz'], cantidad: 1 },
            { productoId: mapaProductos['Croissant Horneado Mantequilla'], cantidad: 2 }
        ],
        'efectivo',
        10.00,
        'Venta mostrador inicio jornada',
        2
    );

    await queries.registrarVentaCompleta(
        turno2Id,
        [
            { productoId: mapaProductos['Ciabatta Caprese Gourmet'], cantidad: 1 },
            { productoId: mapaProductos['Kombucha Frutos Rojos 330ml'], cantidad: 1 }
        ],
        'qr',
        null,
        'Almuerzo terraza',
        2
    );

    console.log('==================================================================');
    console.log(' SEED COMPLETADO EXITOSAMENTE PARA CAFETERÍA & BAKERY');
    console.log('==================================================================');
    console.log(`- Establecimiento: Café Gourmet & Bakery Aroma`);
    console.log(`- Cajas Físicas: 2 estaciones configuradas`);
    console.log(`- Categorías: ${categorias.length} creadas`);
    console.log(`- Insumos de almacén: ${listaInsumos.length} con stock y costos ponderados`);
    console.log(`- Productos en catálogo: ${Object.keys(mapaProductos).length} (Recetas, Directos y Libres)`);
    console.log(`- Turno #1 (Ayer, Cerrado): Cuadrado con ventas en efectivo y QR`);
    console.log(`- Turno #2 (Hoy, ABIERTO): En Caja 1 con fondo de $120.00 a nombre de "carlos"`);
    console.log('------------------------------------------------------------------');
    console.log('Credenciales de acceso para pruebas:');
    console.log('  1. Super Admin: carlos  | Contraseña: Carlos1234*');
    console.log('  2. Admin:       sofia   | Contraseña: Admin1234*');
    console.log('  3. Cajera 1:    lucia   | PIN:        1234');
    console.log('  4. Cajero 2:    marcos  | PIN:        5678');
    console.log('  5. Developer:   developer | Clave: developer123 (desde .env.local)');
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
