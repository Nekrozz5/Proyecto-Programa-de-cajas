const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(process.cwd(), 'caja.db');

let dbInstance = null;

function inicializarEsquema(conexion) {
    conexion.serialize(() => {
        conexion.run(`PRAGMA foreign_keys = ON`);

        // 1. Tabla de Usuarios (Developper oculto, SuperAdmin, Admin y Cajeros)
        conexion.run(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                pin_o_password TEXT NOT NULL,
                rol TEXT CHECK(rol IN ('user', 'admin', 'superadmin', 'developper')) NOT NULL,
                activo INTEGER DEFAULT 1
            )
        `);

        // 2. Tabla de Productos
        conexion.run(`
            CREATE TABLE IF NOT EXISTS productos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                precio REAL NOT NULL,
                costo REAL DEFAULT 0,
                categoria TEXT DEFAULT 'General',
                unidad_medida TEXT DEFAULT 'unidades',
                tipo_inventario TEXT CHECK(tipo_inventario IN ('libre', 'directo', 'receta')) DEFAULT 'libre',
                stock REAL DEFAULT NULL,
                stock_minimo REAL DEFAULT 0,
                fecha_vencimiento TEXT DEFAULT NULL,
                activo INTEGER DEFAULT 1
            )
        `);

        conexion.run(`ALTER TABLE productos ADD COLUMN unidad_medida TEXT DEFAULT 'unidades'`, () => {});
        conexion.run(`ALTER TABLE productos ADD COLUMN stock_minimo REAL DEFAULT 0`, () => {});
        conexion.run(`ALTER TABLE productos ADD COLUMN fecha_vencimiento TEXT DEFAULT NULL`, () => {});

        // 3. Tabla de Insumos / Materiales / Componentes
        conexion.run(`
            CREATE TABLE IF NOT EXISTS insumos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                unidad_medida TEXT NOT NULL,
                stock_actual REAL DEFAULT 0,
                costo_por_unidad REAL DEFAULT 0,
                stock_seguridad REAL DEFAULT 0,
                tiempo_entrega_dias INTEGER DEFAULT 1,
                fecha_vencimiento TEXT DEFAULT NULL,
                activo INTEGER DEFAULT 1
            )
        `);

        conexion.run(`ALTER TABLE insumos ADD COLUMN fecha_vencimiento TEXT DEFAULT NULL`, () => {});

        // Tabla de Configuración de Modalidad del Negocio (Primera ejecución e interruptores)
        conexion.run(`
            CREATE TABLE IF NOT EXISTS configuracion_negocio (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                nombre_negocio TEXT DEFAULT 'Mi Negocio',
                modalidad_nombre TEXT DEFAULT 'Artículos No Perecederos',
                usa_stock_directo INTEGER DEFAULT 1,
                usa_vencimiento INTEGER DEFAULT 0,
                usa_recetas_ensamblaje INTEGER DEFAULT 0,
                configurado INTEGER DEFAULT 0
            )
        `);

        // 4. Tabla de Recetas / Escandallo
        conexion.run(`
            CREATE TABLE IF NOT EXISTS recetas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                producto_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                cantidad_requerida REAL NOT NULL,
                FOREIGN KEY (producto_id) REFERENCES productos(id),
                FOREIGN KEY (insumo_id) REFERENCES insumos(id),
                UNIQUE(producto_id, insumo_id)
            )
        `);

        // 5. Tabla Kardex de Movimientos de Insumos
        conexion.run(`
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
        conexion.run(`
            CREATE TABLE IF NOT EXISTS cajas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER NOT NULL,
                monto_inicial REAL NOT NULL,
                efectivo_esperado REAL,
                efectivo_real REAL,
                qr_esperado REAL DEFAULT 0,
                diferencia_efectivo REAL,
                estado TEXT CHECK(estado IN ('abierta', 'cerrada')) DEFAULT 'abierta',
                veces_reabierta INTEGER DEFAULT 0,
                historial_reaperturas TEXT DEFAULT '',
                fecha_apertura DATETIME DEFAULT CURRENT_TIMESTAMP,
                fecha_cierre DATETIME,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
            )
        `);

        conexion.run(`ALTER TABLE cajas ADD COLUMN veces_reabierta INTEGER DEFAULT 0`, () => {});
        conexion.run(`ALTER TABLE cajas ADD COLUMN historial_reaperturas TEXT DEFAULT ''`, () => {});

        // 7. Tabla de Movimientos de Caja
        conexion.run(`
            CREATE TABLE IF NOT EXISTS movimientos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                caja_id INTEGER NOT NULL,
                usuario_id INTEGER,
                tipo TEXT CHECK(tipo IN ('ingreso', 'egreso')) NOT NULL,
                monto REAL NOT NULL,
                metodo_pago TEXT CHECK(metodo_pago IN ('efectivo', 'qr')) NOT NULL,
                monto_recibido REAL,
                cambio REAL DEFAULT 0,
                descripcion TEXT DEFAULT '',
                estado TEXT CHECK(estado IN ('completado', 'anulado')) DEFAULT 'completado',
                fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (caja_id) REFERENCES cajas(id),
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
            )
        `);

        conexion.run(`ALTER TABLE movimientos ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)`, () => {});

        // 8. Tabla Detalle de Movimientos
        conexion.run(`
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
}

function obtenerConexion() {
    if (!dbInstance || !fs.existsSync(dbPath)) {
        dbInstance = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error al conectar con SQLite:', err.message);
            } else {
                console.log('Conectado exitosamente a la base de datos SQLite local.');
            }
        });
        inicializarEsquema(dbInstance);
    }
    return dbInstance;
}

// Inicializar al arrancar
obtenerConexion();

const dbProxy = {
    run(sql, params, callback) {
        const conn = obtenerConexion();
        return conn.run(sql, params, callback);
    },
    get(sql, params, callback) {
        const conn = obtenerConexion();
        return conn.get(sql, params, callback);
    },
    all(sql, params, callback) {
        const conn = obtenerConexion();
        return conn.all(sql, params, callback);
    },
    serialize(callback) {
        const conn = obtenerConexion();
        return conn.serialize(callback);
    }
};

module.exports = dbProxy;
