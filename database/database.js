const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'caja.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con SQLite:', err.message);
    } else {
        console.log('Conectado exitosamente a la base de datos SQLite local.');
    }
});

db.serialize(() => {
    db.run(`PRAGMA foreign_keys = ON`);

    // 1. Tabla de Usuarios (Admin y Cajeros)
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            pin_o_password TEXT NOT NULL,
            rol TEXT CHECK(rol IN ('user', 'admin')) NOT NULL,
            activo INTEGER DEFAULT 1
        )
    `);

    // 2. Tabla de Productos
    // tipo_inventario: 'libre' (sin stock), 'directo' (ferretería/minimarket), 'receta' (cafetería/carpintería)
    db.run(`
        CREATE TABLE IF NOT EXISTS productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            precio REAL NOT NULL,
            costo REAL DEFAULT 0,
            categoria TEXT DEFAULT 'General',
            tipo_inventario TEXT CHECK(tipo_inventario IN ('libre', 'directo', 'receta')) DEFAULT 'libre',
            stock REAL DEFAULT NULL,
            activo INTEGER DEFAULT 1
        )
    `);

    // 3. Tabla de Insumos / Materia Prima (Bolsa común: leche, café, madera, barniz)
    db.run(`
        CREATE TABLE IF NOT EXISTS insumos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            unidad_medida TEXT NOT NULL, -- ej: 'litros', 'kg', 'metros', 'unidades'
            stock_actual REAL DEFAULT 0,
            costo_por_unidad REAL DEFAULT 0,
            stock_seguridad REAL DEFAULT 0,
            tiempo_entrega_dias INTEGER DEFAULT 1,
            activo INTEGER DEFAULT 1
        )
    `);

    // 4. Tabla de Recetas / Escandallo (Qué insumos y qué cantidad consume cada producto)
    db.run(`
        CREATE TABLE IF NOT EXISTS recetas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto_id INTEGER NOT NULL,
            insumo_id INTEGER NOT NULL,
            cantidad_requerida REAL NOT NULL, -- Admite decimales (ej: 0.5 litros, 1.5 litros)
            FOREIGN KEY (producto_id) REFERENCES productos(id),
            FOREIGN KEY (insumo_id) REFERENCES insumos(id),
            UNIQUE(producto_id, insumo_id)
        )
    `);

    // 5. Tabla Kardex de Movimientos de Insumos (Compras, consumos por venta y mermas)
    db.run(`
        CREATE TABLE IF NOT EXISTS movimientos_insumos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            insumo_id INTEGER NOT NULL,
            tipo TEXT CHECK(tipo IN ('compra', 'consumo_venta', 'merma', 'reingreso_anulacion')) NOT NULL,
            cantidad REAL NOT NULL,
            costo_unitario REAL NOT NULL,
            motivo TEXT DEFAULT '',
            fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (insumo_id) REFERENCES insumos(id)
        )
    `);

    // 6. Tabla de Cajas (Turnos)
    db.run(`
        CREATE TABLE IF NOT EXISTS cajas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            monto_inicial REAL NOT NULL,
            efectivo_esperado REAL,
            efectivo_real REAL,
            qr_esperado REAL DEFAULT 0,
            diferencia_efectivo REAL,
            estado TEXT CHECK(estado IN ('abierta', 'cerrada')) DEFAULT 'abierta',
            fecha_apertura DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_cierre DATETIME,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);

    // 7. Tabla de Movimientos de Caja (Ingresos y Egresos monetarios)
    db.run(`
        CREATE TABLE IF NOT EXISTS movimientos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            caja_id INTEGER NOT NULL,
            tipo TEXT CHECK(tipo IN ('ingreso', 'egreso')) NOT NULL,
            monto REAL NOT NULL,
            metodo_pago TEXT CHECK(metodo_pago IN ('efectivo', 'qr')) NOT NULL,
            monto_recibido REAL,
            cambio REAL DEFAULT 0,
            descripcion TEXT DEFAULT '',
            estado TEXT CHECK(estado IN ('completado', 'anulado')) DEFAULT 'completado',
            fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (caja_id) REFERENCES cajas(id)
        )
    `);

    // 8. Tabla Detalle de Movimientos (Productos vendidos por ticket)
    db.run(`
        CREATE TABLE IF NOT EXISTS detalle_movimientos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            movimiento_id INTEGER NOT NULL,
            producto_id INTEGER NOT NULL,
            cantidad REAL NOT NULL,
            precio_unitario REAL NOT NULL,
            costo_unitario REAL NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (movimiento_id) REFERENCES movimientos(id),
            FOREIGN KEY (producto_id) REFERENCES productos(id)
        )
    `);

    console.log('Esquema híbrido (Caja + Insumos + Recetas) inicializado.');
});

module.exports = db;