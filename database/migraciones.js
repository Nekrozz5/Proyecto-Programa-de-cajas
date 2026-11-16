// ==========================================
// SISTEMA DE MIGRACIONES CONTROLADO POR PRAGMA user_version
// ==========================================
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    esProduccion,
    exigirPasswordDeveloperProduccion,
    motivoPasswordDeveloperInvalida
} = require('../server/secretos');

const BCRYPT_ROUNDS = 10;

function esHashBcrypt(valor) {
    return typeof valor === 'string' && /^\$2[aby]\$\d{2}\$/.test(valor);
}

function obtenerPasswordDeveloperDesdeEnv() {
    if (process.env.DEVELOPER_PASSWORD && String(process.env.DEVELOPER_PASSWORD).trim() !== '') {
        return String(process.env.DEVELOPER_PASSWORD).trim();
    }
    try {
        const envLocalPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envLocalPath)) {
            const contenido = fs.readFileSync(envLocalPath, 'utf8');
            for (const linea of contenido.split(/\r?\n/)) {
                const limpia = linea.trim();
                if (!limpia || limpia.startsWith('#')) continue;
                const match = limpia.match(/^DEVELOPER_PASSWORD\s*=\s*(.+)$/);
                if (match) {
                    const val = match[1].trim().replace(/^['"]|['"]$/g, '');
                    if (val) return val;
                }
            }
        }
    } catch (err) {
        console.error('[Migraciones] Aviso al leer .env.local:', err.message);
    }
    return null;
}

function runRaw(conn, sql, params = []) {
    return new Promise((resolve, reject) => {
        conn.run(sql, params, function (err) {
            if (err) {
                console.error(`[Migraciones SQL Error] Sentencia: ${sql.trim()} | Error:`, err.message);
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}

function getRaw(conn, sql, params = []) {
    return new Promise((resolve, reject) => {
        conn.get(sql, params, (err, row) => {
            if (err) {
                console.error(`[Migraciones SQL Error] Sentencia: ${sql.trim()} | Error:`, err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function allRaw(conn, sql, params = []) {
    return new Promise((resolve, reject) => {
        conn.all(sql, params, (err, rows) => {
            if (err) {
                console.error(`[Migraciones SQL Error] Sentencia: ${sql.trim()} | Error:`, err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

async function tieneColumna(conn, tabla, columna) {
    const info = await allRaw(conn, `PRAGMA table_info(${tabla})`);
    return info.some((col) => col.name === columna);
}

async function agregarColumnaSiNoExiste(conn, tabla, columna, definicion) {
    const existe = await tieneColumna(conn, tabla, columna);
    if (!existe) {
        await runRaw(conn, `ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
    }
}

const MIGRACIONES = [
    {
        version: 1,
        descripcion: 'Esquema base completo, auditoría de anulaciones, FK movimiento_id en insumos, usuario_id NOT NULL en movimientos e índices',
        up: async (conn) => {
            // 1. Asegurar tablas base si la BD inicia desde cero
            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS usuarios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    pin_o_password TEXT NOT NULL,
                    rol TEXT CHECK(rol IN ('user', 'admin', 'superadmin', 'developper', 'developer')) NOT NULL,
                    activo INTEGER DEFAULT 1
                )
            `);

            await runRaw(conn, `
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

            await agregarColumnaSiNoExiste(conn, 'productos', 'unidad_medida', `TEXT DEFAULT 'unidades'`);
            await agregarColumnaSiNoExiste(conn, 'productos', 'stock_minimo', `REAL DEFAULT 0`);
            await agregarColumnaSiNoExiste(conn, 'productos', 'fecha_vencimiento', `TEXT DEFAULT NULL`);

            await runRaw(conn, `
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

            await agregarColumnaSiNoExiste(conn, 'insumos', 'fecha_vencimiento', `TEXT DEFAULT NULL`);

            await runRaw(conn, `
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

            const configRow = await getRaw(conn, `SELECT id FROM configuracion_negocio WHERE id = 1`);
            if (!configRow) {
                await runRaw(
                    conn,
                    `INSERT INTO configuracion_negocio (id, nombre_negocio, modalidad_nombre, usa_stock_directo, usa_vencimiento, usa_recetas_ensamblaje, configurado)
                     VALUES (1, 'Mi Negocio', 'Venta Directa No Perecedera', 1, 0, 0, 0)`
                );
            }

            await runRaw(conn, `
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

            await runRaw(conn, `
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

            await agregarColumnaSiNoExiste(conn, 'cajas', 'veces_reabierta', `INTEGER DEFAULT 0`);
            await agregarColumnaSiNoExiste(conn, 'cajas', 'historial_reaperturas', `TEXT DEFAULT ''`);

            await runRaw(conn, `
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

            await agregarColumnaSiNoExiste(conn, 'movimientos', 'usuario_id', `INTEGER REFERENCES usuarios(id)`);

            await runRaw(conn, `
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

            await runRaw(conn, `
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

            // 2. Recrear `movimientos` con `usuario_id NOT NULL` y columnas de anulación
            const tieneAnuladoPor = await tieneColumna(conn, 'movimientos', 'anulado_por');
            const tieneFechaAnulacion = await tieneColumna(conn, 'movimientos', 'fecha_anulacion');
            const tieneMotivoAnulacion = await tieneColumna(conn, 'movimientos', 'motivo_anulacion');

            await runRaw(conn, `
                CREATE TABLE movimientos_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    caja_id INTEGER NOT NULL,
                    usuario_id INTEGER NOT NULL,
                    tipo TEXT CHECK(tipo IN ('ingreso', 'egreso')) NOT NULL,
                    monto REAL NOT NULL,
                    metodo_pago TEXT CHECK(metodo_pago IN ('efectivo', 'qr')) NOT NULL,
                    monto_recibido REAL,
                    cambio REAL DEFAULT 0,
                    descripcion TEXT DEFAULT '',
                    estado TEXT CHECK(estado IN ('completado', 'anulado')) DEFAULT 'completado',
                    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                    anulado_por INTEGER,
                    fecha_anulacion DATETIME,
                    motivo_anulacion TEXT,
                    FOREIGN KEY (caja_id) REFERENCES cajas(id),
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
                    FOREIGN KEY (anulado_por) REFERENCES usuarios(id)
                )
            `);

            const exprAnuladoPor = tieneAnuladoPor ? 'm.anulado_por' : 'NULL';
            const exprFechaAnulacion = tieneFechaAnulacion ? 'm.fecha_anulacion' : 'NULL';
            const exprMotivoAnulacion = tieneMotivoAnulacion ? 'm.motivo_anulacion' : 'NULL';

            await runRaw(conn, `
                INSERT INTO movimientos_new (
                    id, caja_id, usuario_id, tipo, monto, metodo_pago, monto_recibido, cambio,
                    descripcion, estado, fecha_hora, anulado_por, fecha_anulacion, motivo_anulacion
                )
                SELECT
                    m.id,
                    m.caja_id,
                    COALESCE(
                        m.usuario_id,
                        (SELECT c.usuario_id FROM cajas c WHERE c.id = m.caja_id),
                        (SELECT u.id FROM usuarios u ORDER BY u.id ASC LIMIT 1),
                        1
                    ),
                    m.tipo,
                    m.monto,
                    m.metodo_pago,
                    m.monto_recibido,
                    m.cambio,
                    m.descripcion,
                    m.estado,
                    m.fecha_hora,
                    ${exprAnuladoPor},
                    ${exprFechaAnulacion},
                    ${exprMotivoAnulacion}
                FROM movimientos m
            `);

            await runRaw(conn, `DROP TABLE movimientos`);
            await runRaw(conn, `ALTER TABLE movimientos_new RENAME TO movimientos`);

            // 3. Recrear `movimientos_insumos` agregando `movimiento_id INTEGER` (FK a `movimientos`)
            const tieneMovIdEnInsumos = await tieneColumna(conn, 'movimientos_insumos', 'movimiento_id');

            await runRaw(conn, `
                CREATE TABLE movimientos_insumos_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    insumo_id INTEGER NOT NULL,
                    movimiento_id INTEGER,
                    tipo TEXT CHECK(tipo IN ('compra', 'consumo_venta', 'merma', 'reingreso_anulacion')) NOT NULL,
                    cantidad REAL NOT NULL,
                    costo_unitario REAL NOT NULL,
                    motivo TEXT DEFAULT '',
                    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (insumo_id) REFERENCES insumos(id),
                    FOREIGN KEY (movimiento_id) REFERENCES movimientos(id)
                )
            `);

            const exprMovId = tieneMovIdEnInsumos ? 'mi.movimiento_id' : 'NULL';

            await runRaw(conn, `
                INSERT INTO movimientos_insumos_new (
                    id, insumo_id, movimiento_id, tipo, cantidad, costo_unitario, motivo, fecha_hora
                )
                SELECT
                    mi.id,
                    mi.insumo_id,
                    ${exprMovId},
                    mi.tipo,
                    mi.cantidad,
                    mi.costo_unitario,
                    mi.motivo,
                    mi.fecha_hora
                FROM movimientos_insumos mi
            `);

            await runRaw(conn, `DROP TABLE movimientos_insumos`);
            await runRaw(conn, `ALTER TABLE movimientos_insumos_new RENAME TO movimientos_insumos`);

            // 4. Crear índices únicos y de claves foráneas
            await runRaw(conn, `CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_nombre_nocase ON usuarios(nombre COLLATE NOCASE)`);
            await runRaw(conn, `CREATE UNIQUE INDEX IF NOT EXISTS una_caja_abierta_por_usuario ON cajas(usuario_id) WHERE estado = 'abierta'`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_movimientos_caja_id ON movimientos(caja_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_detalle_movimientos_movimiento_id ON detalle_movimientos(movimiento_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_movimientos_insumos_insumo_id ON movimientos_insumos(insumo_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_movimientos_insumos_movimiento_id ON movimientos_insumos(movimiento_id)`);
        }
    },
    {
        version: 2,
        descripcion: 'Migración de rol developper -> developer en tabla usuarios y aseguramiento de cuentas base',
        up: async (conn) => {
            await runRaw(conn, `
                CREATE TABLE usuarios_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    pin_o_password TEXT NOT NULL,
                    rol TEXT CHECK(rol IN ('user', 'admin', 'superadmin', 'developer')) NOT NULL,
                    activo INTEGER DEFAULT 1
                )
            `);

            await runRaw(conn, `
                INSERT INTO usuarios_new (id, nombre, pin_o_password, rol, activo)
                SELECT
                    id,
                    CASE WHEN LOWER(TRIM(nombre)) = 'developper' THEN 'developer' ELSE TRIM(nombre) END,
                    pin_o_password,
                    CASE WHEN rol = 'developper' THEN 'developer' ELSE rol END,
                    activo
                FROM usuarios
            `);

            await runRaw(conn, `DROP TABLE usuarios`);
            await runRaw(conn, `ALTER TABLE usuarios_new RENAME TO usuarios`);

            await runRaw(conn, `CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_nombre_nocase ON usuarios(nombre COLLATE NOCASE)`);

            // Asegurar que exista al menos un superadmin si había un admin previo
            const existeSuper = await getRaw(conn, `SELECT id FROM usuarios WHERE rol = 'superadmin' AND activo = 1 LIMIT 1`);
            if (!existeSuper) {
                const primerAdmin = await getRaw(conn, `SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1 ORDER BY id ASC LIMIT 1`);
                if (primerAdmin) {
                    await runRaw(conn, `UPDATE usuarios SET rol = 'superadmin' WHERE id = ?`, [primerAdmin.id]);
                }
            }

            // Asegurar que exista la cuenta oculta 'developer'
            const existeDev = await getRaw(conn, `SELECT id FROM usuarios WHERE rol = 'developer' AND activo = 1 LIMIT 1`);
            if (!existeDev) {
                const placeholder = crypto.randomBytes(16).toString('hex');
                await runRaw(
                    conn,
                    `INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('developer', ?, 'developer', 1)`,
                    [placeholder]
                );
            }
        }
    },
    {
        version: 3,
        descripcion: 'Hasheo de contraseñas/PIN con bcryptjs y generación única de clave aleatoria o por entorno para developer',
        up: async (conn) => {
            // 1. Configurar clave del rol 'developer' sin clave fija en el código
            const devUser = await getRaw(conn, `SELECT id, nombre, pin_o_password FROM usuarios WHERE rol = 'developer' AND activo = 1 LIMIT 1`);
            const claveEnv = obtenerPasswordDeveloperDesdeEnv();

            if (!devUser) {
                const claveInicial = claveEnv || crypto.randomBytes(9).toString('base64url');
                const hashDev = await bcrypt.hash(claveInicial, BCRYPT_ROUNDS);
                await runRaw(
                    conn,
                    `INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('developer', ?, 'developer', 1)`,
                    [hashDev]
                );
                if (!claveEnv) {
                    console.log('==================================================================');
                    console.log("[SEGURIDAD] Clave aleatoria generada por única vez para 'developer':");
                    console.log(`  Usuario: developer`);
                    console.log(`  Clave:   ${claveInicial}`);
                    console.log('  (Guárdala ahora o configura DEVELOPER_PASSWORD en .env.local)');
                    console.log('==================================================================');
                }
            } else if (!esHashBcrypt(devUser.pin_o_password)) {
                const claveInicial = claveEnv || crypto.randomBytes(9).toString('base64url');
                const hashDev = await bcrypt.hash(claveInicial, BCRYPT_ROUNDS);
                await runRaw(conn, `UPDATE usuarios SET pin_o_password = ? WHERE id = ?`, [hashDev, devUser.id]);
                if (!claveEnv) {
                    console.log('==================================================================');
                    console.log("[SEGURIDAD] Clave aleatoria generada por única vez para 'developer':");
                    console.log(`  Usuario: developer`);
                    console.log(`  Clave:   ${claveInicial}`);
                    console.log('  (Guárdala ahora o configura DEVELOPER_PASSWORD en .env.local)');
                    console.log('==================================================================');
                }
            }

            // 2. Migrar todos los PIN/contraseñas existentes en texto plano a hashes bcrypt
            const todosUsuarios = await allRaw(conn, `SELECT id, nombre, pin_o_password FROM usuarios`);
            for (const u of todosUsuarios) {
                if (!esHashBcrypt(u.pin_o_password)) {
                    const hash = await bcrypt.hash(String(u.pin_o_password), BCRYPT_ROUNDS);
                    await runRaw(conn, `UPDATE usuarios SET pin_o_password = ? WHERE id = ?`, [hash, u.id]);
                }
            }
        }
    },
    {
        version: 4,
        descripcion: 'Creación de tabla categorias para catálogo por pestañas y normalización de categorías en productos',
        up: async (conn) => {
            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS categorias (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    activo INTEGER DEFAULT 1
                )
            `);

            // Sembrar categorías preexistentes desde la tabla productos
            const prods = await allRaw(conn, `SELECT DISTINCT TRIM(categoria) as cat FROM productos WHERE categoria IS NOT NULL AND TRIM(categoria) != ''`);
            for (const p of prods) {
                if (p.cat) {
                    const partes = p.cat.split(',').map(s => s.trim()).filter(Boolean);
                    for (const subCat of partes) {
                        if (subCat.toLowerCase() !== 'todas') {
                            await runRaw(conn, `INSERT OR IGNORE INTO categorias (nombre, activo) VALUES (?, 1)`, [subCat]);
                        }
                    }
                }
            }
        }
    },
    {
        version: 5,
        descripcion: 'Limpieza de categoría por defecto General en favor de catálogo limpio sin categorías iniciales',
        up: async (conn) => {
            await runRaw(conn, `
                DELETE FROM categorias 
                WHERE LOWER(nombre) = 'general' 
                  AND NOT EXISTS (
                      SELECT 1 FROM productos 
                      WHERE LOWER(categoria) LIKE '%general%'
                  )
            `);
        }
    },
    {
        version: 6,
        descripcion: 'Creación de tabla cajas_fisicas para gestión de múltiples terminales/estaciones y vinculación de caja_fisica_id en tabla cajas',
        up: async (conn) => {
            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS cajas_fisicas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL UNIQUE,
                    activa INTEGER NOT NULL DEFAULT 1,
                    creada_en DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await runRaw(conn, `
                INSERT OR IGNORE INTO cajas_fisicas (id, nombre, activa)
                VALUES (1, 'Caja 1 - Principal', 1)
            `);

            await agregarColumnaSiNoExiste(
                conn,
                'cajas',
                'caja_fisica_id',
                'INTEGER DEFAULT 1 REFERENCES cajas_fisicas(id)'
            );

            await runRaw(conn, `
                UPDATE cajas SET caja_fisica_id = 1 WHERE caja_fisica_id IS NULL
            `);
        }
    },
    {
        version: 7,
        descripcion: 'Tablas para grupos de modificadores, opciones (reemplazos y extras de recetas), asignación a productos y detalle de venta auditado',
        up: async (conn) => {
            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS grupos_modificadores (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    tipo_seleccion TEXT CHECK(tipo_seleccion IN ('unica', 'multiple')) NOT NULL DEFAULT 'unica',
                    es_obligatorio INTEGER NOT NULL DEFAULT 0,
                    activo INTEGER NOT NULL DEFAULT 1,
                    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS modificadores_opciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    grupo_id INTEGER NOT NULL,
                    nombre TEXT NOT NULL,
                    insumo_id INTEGER,
                    cantidad_insumo REAL DEFAULT 0,
                    precio_adicional REAL NOT NULL DEFAULT 0,
                    insumo_reemplazado_id INTEGER DEFAULT NULL,
                    es_default INTEGER NOT NULL DEFAULT 0,
                    activo INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY (grupo_id) REFERENCES grupos_modificadores(id),
                    FOREIGN KEY (insumo_id) REFERENCES insumos(id),
                    FOREIGN KEY (insumo_reemplazado_id) REFERENCES insumos(id)
                )
            `);

            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS producto_grupos_modificadores (
                    producto_id INTEGER NOT NULL,
                    grupo_id INTEGER NOT NULL,
                    PRIMARY KEY (producto_id, grupo_id),
                    FOREIGN KEY (producto_id) REFERENCES productos(id),
                    FOREIGN KEY (grupo_id) REFERENCES grupos_modificadores(id)
                )
            `);

            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS detalle_movimientos_modificadores (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    detalle_movimiento_id INTEGER NOT NULL,
                    modificador_opcion_id INTEGER,
                    nombre TEXT NOT NULL,
                    precio_adicional REAL NOT NULL DEFAULT 0,
                    costo_adicional REAL NOT NULL DEFAULT 0,
                    insumo_id INTEGER,
                    cantidad_insumo REAL DEFAULT 0,
                    insumo_reemplazado_id INTEGER DEFAULT NULL,
                    FOREIGN KEY (detalle_movimiento_id) REFERENCES detalle_movimientos(id),
                    FOREIGN KEY (modificador_opcion_id) REFERENCES modificadores_opciones(id),
                    FOREIGN KEY (insumo_id) REFERENCES insumos(id)
                )
            `);

            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_mod_opc_grupo ON modificadores_opciones(grupo_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_prod_grupos_mod ON producto_grupos_modificadores(producto_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_det_mov_mod ON detalle_movimientos_modificadores(detalle_movimiento_id)`);
        }
    },
    {
        version: 8,
        descripcion: 'Soporte para combos y promociones: tipo_inventario combo, límites de unidades, vigencia temporal y tablas de componentes y auditoría de combos',
        up: async (conn) => {
            // 1. Ampliar CHECK de tipo_inventario en tabla productos para permitir 'combo'
            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS productos_nueva (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    precio REAL NOT NULL,
                    costo REAL DEFAULT 0,
                    categoria TEXT DEFAULT 'General',
                    unidad_medida TEXT DEFAULT 'unidades',
                    tipo_inventario TEXT CHECK(tipo_inventario IN ('libre', 'directo', 'receta', 'combo')) DEFAULT 'libre',
                    stock REAL DEFAULT NULL,
                    stock_minimo REAL DEFAULT 0,
                    fecha_vencimiento TEXT DEFAULT NULL,
                    activo INTEGER DEFAULT 1,
                    limite_maximo_activo INTEGER DEFAULT 0,
                    limite_unidades_total REAL DEFAULT NULL,
                    limite_unidades_restante REAL DEFAULT NULL,
                    fecha_inicio_vigencia TEXT DEFAULT NULL,
                    fecha_fin_vigencia TEXT DEFAULT NULL
                )
            `);

            await runRaw(conn, `
                INSERT INTO productos_nueva (
                    id, nombre, precio, costo, categoria, unidad_medida, tipo_inventario,
                    stock, stock_minimo, fecha_vencimiento, activo
                )
                SELECT id, nombre, precio, costo, categoria, unidad_medida, tipo_inventario,
                       stock, stock_minimo, fecha_vencimiento, activo
                FROM productos
            `);

            await runRaw(conn, `DROP TABLE productos`);
            await runRaw(conn, `ALTER TABLE productos_nueva RENAME TO productos`);

            // 2. Tabla de componentes de combos
            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS combo_componentes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    combo_producto_id INTEGER NOT NULL,
                    componente_producto_id INTEGER NOT NULL,
                    cantidad REAL NOT NULL CHECK(cantidad > 0),
                    FOREIGN KEY (combo_producto_id) REFERENCES productos(id) ON DELETE CASCADE,
                    FOREIGN KEY (componente_producto_id) REFERENCES productos(id) ON DELETE RESTRICT
                )
            `);

            // 3. Tabla de auditoría histórica para ventas de combos
            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS detalle_movimientos_combos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    detalle_movimiento_id INTEGER NOT NULL,
                    componente_producto_id INTEGER NOT NULL,
                    cantidad_unitaria REAL NOT NULL,
                    cantidad_total REAL NOT NULL,
                    costo_unitario_congelado REAL NOT NULL,
                    FOREIGN KEY (detalle_movimiento_id) REFERENCES detalle_movimientos(id) ON DELETE CASCADE,
                    FOREIGN KEY (componente_producto_id) REFERENCES productos(id)
                )
            `);

            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_combo_comp_combo ON combo_componentes(combo_producto_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_combo_comp_prod ON combo_componentes(componente_producto_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_det_mov_combos ON detalle_movimientos_combos(detalle_movimiento_id)`);
        }
    },
    {
        version: 9,
        descripcion: 'Soporte contable modular por régimen tributario (Simplificado vs. General), pagos mixtos (efectivo + QR), respaldo fiscal de ventas/compras/egresos, permisos por usuario/caja y Kardex de productos directos',
        up: async (conn) => {
            // 1. Configuración fiscal y de régimen modular en configuracion_negocio
            await agregarColumnaSiNoExiste(conn, 'configuracion_negocio', 'nit_negocio', `TEXT DEFAULT ''`);
            await agregarColumnaSiNoExiste(conn, 'configuracion_negocio', 'regimen_tributario', `TEXT DEFAULT 'simplificado_control_interno'`);
            await agregarColumnaSiNoExiste(conn, 'configuracion_negocio', 'emite_factura', `INTEGER DEFAULT 0`);
            await agregarColumnaSiNoExiste(conn, 'configuracion_negocio', 'iva_porcentaje', `REAL DEFAULT 13`);
            await agregarColumnaSiNoExiste(conn, 'configuracion_negocio', 'it_porcentaje', `REAL DEFAULT 3`);
            await agregarColumnaSiNoExiste(conn, 'configuracion_negocio', 'usa_respaldo_compras_egresos', `INTEGER DEFAULT 1`);

            // 2. Permisos de registro de respaldo fiscal por usuario y por estación de caja física
            await agregarColumnaSiNoExiste(conn, 'usuarios', 'puede_registrar_respaldo_fiscal', `INTEGER DEFAULT 1`);
            await agregarColumnaSiNoExiste(conn, 'cajas_fisicas', 'habilita_respaldo_fiscal', `INTEGER DEFAULT 1`);

            // 3. Conciliación de QR en cierres de caja
            await agregarColumnaSiNoExiste(conn, 'cajas', 'qr_real', `REAL DEFAULT NULL`);
            await agregarColumnaSiNoExiste(conn, 'cajas', 'diferencia_qr', `REAL DEFAULT NULL`);
            await agregarColumnaSiNoExiste(conn, 'cajas', 'observaciones_cierre', `TEXT DEFAULT ''`);

            // 4. Recrear tabla movimientos para soportar metodo_pago = 'mixto', desglose efectivo/QR, categoría contable, descuentos y datos de facturación
            await runRaw(conn, `
                CREATE TABLE movimientos_v9 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    caja_id INTEGER NOT NULL,
                    usuario_id INTEGER NOT NULL,
                    tipo TEXT CHECK(tipo IN ('ingreso', 'egreso')) NOT NULL,
                    categoria_contable TEXT CHECK(categoria_contable IN ('venta', 'aporte_cambio', 'gasto_operativo', 'compra_insumo', 'pago_proveedor', 'retiro_dueno', 'otro')) NOT NULL DEFAULT 'venta',
                    subtotal_bruto REAL NOT NULL DEFAULT 0,
                    descuento_total REAL NOT NULL DEFAULT 0,
                    monto REAL NOT NULL,
                    metodo_pago TEXT CHECK(metodo_pago IN ('efectivo', 'qr', 'mixto')) NOT NULL,
                    monto_efectivo REAL NOT NULL DEFAULT 0,
                    monto_qr REAL NOT NULL DEFAULT 0,
                    referencia_qr TEXT DEFAULT NULL,
                    monto_recibido REAL,
                    cambio REAL DEFAULT 0,
                    tipo_comprobante TEXT CHECK(tipo_comprobante IN ('recibo', 'factura', 'sin_respaldo')) NOT NULL DEFAULT 'recibo',
                    nro_factura TEXT DEFAULT NULL,
                    cuf_autorizacion TEXT DEFAULT NULL,
                    cliente_nit_ci TEXT DEFAULT NULL,
                    cliente_razon_social TEXT DEFAULT NULL,
                    descripcion TEXT DEFAULT '',
                    estado TEXT CHECK(estado IN ('completado', 'anulado')) DEFAULT 'completado',
                    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                    anulado_por INTEGER,
                    fecha_anulacion DATETIME,
                    motivo_anulacion TEXT,
                    FOREIGN KEY (caja_id) REFERENCES cajas(id),
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
                    FOREIGN KEY (anulado_por) REFERENCES usuarios(id)
                )
            `);

            await runRaw(conn, `
                INSERT INTO movimientos_v9 (
                    id, caja_id, usuario_id, tipo, categoria_contable,
                    subtotal_bruto, descuento_total, monto, metodo_pago,
                    monto_efectivo, monto_qr, referencia_qr,
                    monto_recibido, cambio, tipo_comprobante,
                    nro_factura, cuf_autorizacion, cliente_nit_ci, cliente_razon_social,
                    descripcion, estado, fecha_hora, anulado_por, fecha_anulacion, motivo_anulacion
                )
                SELECT
                    m.id,
                    m.caja_id,
                    m.usuario_id,
                    m.tipo,
                    CASE
                        WHEN m.tipo = 'egreso' THEN 'gasto_operativo'
                        WHEN m.tipo = 'ingreso' AND (
                            m.descripcion LIKE '[REPOSICIÓN DE EFECTIVO]%'
                            OR LOWER(m.descripcion) LIKE 'inyección%'
                            OR NOT EXISTS (SELECT 1 FROM detalle_movimientos d WHERE d.movimiento_id = m.id)
                        ) THEN 'aporte_cambio'
                        ELSE 'venta'
                    END,
                    m.monto,
                    0,
                    m.monto,
                    m.metodo_pago,
                    CASE WHEN m.metodo_pago = 'efectivo' THEN m.monto ELSE 0 END,
                    CASE WHEN m.metodo_pago = 'qr' THEN m.monto ELSE 0 END,
                    NULL,
                    m.monto_recibido,
                    COALESCE(m.cambio, 0),
                    'recibo',
                    NULL,
                    NULL,
                    NULL,
                    NULL,
                    m.descripcion,
                    m.estado,
                    m.fecha_hora,
                    m.anulado_por,
                    m.fecha_anulacion,
                    m.motivo_anulacion
                FROM movimientos m
            `);

            await runRaw(conn, `DROP TABLE movimientos`);
            await runRaw(conn, `ALTER TABLE movimientos_v9 RENAME TO movimientos`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_movimientos_caja_id ON movimientos(caja_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha_hora)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_movimientos_cat ON movimientos(categoria_contable)`);

            // 5. Tabla normalizada de pagos por movimiento (soporte de pagos mixtos y auditoría)
            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS movimientos_pagos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    movimiento_id INTEGER NOT NULL,
                    metodo_pago TEXT CHECK(metodo_pago IN ('efectivo', 'qr')) NOT NULL,
                    monto REAL NOT NULL CHECK(monto > 0),
                    referencia TEXT DEFAULT NULL,
                    FOREIGN KEY (movimiento_id) REFERENCES movimientos(id) ON DELETE CASCADE
                )
            `);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_mov_pagos_movimiento ON movimientos_pagos(movimiento_id)`);

            // Poblar movimientos_pagos para movimientos existentes
            await runRaw(conn, `
                INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia)
                SELECT id, metodo_pago, monto, referencia_qr
                FROM movimientos
                WHERE monto > 0 AND metodo_pago IN ('efectivo', 'qr')
            `);

            // 6. Respaldo fiscal en compras de insumos (movimientos_insumos)
            await agregarColumnaSiNoExiste(conn, 'movimientos_insumos', 'proveedor_nombre', `TEXT DEFAULT NULL`);
            await agregarColumnaSiNoExiste(conn, 'movimientos_insumos', 'proveedor_nit', `TEXT DEFAULT NULL`);
            await agregarColumnaSiNoExiste(conn, 'movimientos_insumos', 'nro_factura_compra', `TEXT DEFAULT NULL`);
            await agregarColumnaSiNoExiste(conn, 'movimientos_insumos', 'con_factura', `INTEGER DEFAULT 0`);
            await agregarColumnaSiNoExiste(conn, 'movimientos_insumos', 'monto_total_compra', `REAL DEFAULT 0`);
            await agregarColumnaSiNoExiste(conn, 'movimientos_insumos', 'usuario_id', `INTEGER DEFAULT NULL REFERENCES usuarios(id)`);

            await runRaw(conn, `
                UPDATE movimientos_insumos
                SET monto_total_compra = ROUND(cantidad * costo_unitario, 2)
                WHERE monto_total_compra IS NULL OR monto_total_compra = 0
            `);

            // 7. Kardex completo de Productos de Stock Directo
            await runRaw(conn, `
                CREATE TABLE IF NOT EXISTS movimientos_productos_directos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    producto_id INTEGER NOT NULL,
                    movimiento_id INTEGER DEFAULT NULL,
                    usuario_id INTEGER DEFAULT NULL,
                    tipo TEXT CHECK(tipo IN ('inventario_inicial', 'compra', 'venta', 'merma', 'reingreso_anulacion', 'ajuste')) NOT NULL,
                    cantidad REAL NOT NULL,
                    stock_resultante REAL NOT NULL,
                    costo_unitario REAL NOT NULL,
                    monto_total REAL NOT NULL DEFAULT 0,
                    proveedor_nombre TEXT DEFAULT NULL,
                    proveedor_nit TEXT DEFAULT NULL,
                    nro_factura_compra TEXT DEFAULT NULL,
                    con_factura INTEGER DEFAULT 0,
                    motivo TEXT DEFAULT '',
                    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (producto_id) REFERENCES productos(id),
                    FOREIGN KEY (movimiento_id) REFERENCES movimientos(id),
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
                )
            `);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_mov_prod_dir_prod ON movimientos_productos_directos(producto_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_mov_prod_dir_mov ON movimientos_productos_directos(movimiento_id)`);
        }
    },
    {
        version: 10,
        descripcion: 'Snapshot tributario por movimiento (régimen, alícuotas e importes IVA/IT), parámetro it_base en configuracion_negocio, costo_promedio_resultante y saldo de apertura de Kardex para productos directos existentes',
        up: async (conn) => {
            // 1. Parámetro configurable de base imponible del IT (a confirmar con el contador)
            await agregarColumnaSiNoExiste(
                conn,
                'configuracion_negocio',
                'it_base',
                `TEXT DEFAULT 'todas_las_ventas'`
            );
            await runRaw(conn, `
                UPDATE configuracion_negocio
                SET it_base = 'todas_las_ventas'
                WHERE it_base IS NULL OR it_base NOT IN ('todas_las_ventas', 'solo_facturadas')
            `);

            // 2. Columnas aditivas de snapshot fiscal en movimientos
            await agregarColumnaSiNoExiste(conn, 'movimientos', 'regimen_tributario', `TEXT DEFAULT NULL`);
            await agregarColumnaSiNoExiste(conn, 'movimientos', 'iva_porcentaje', `REAL DEFAULT 0`);
            await agregarColumnaSiNoExiste(conn, 'movimientos', 'it_porcentaje', `REAL DEFAULT 0`);
            await agregarColumnaSiNoExiste(conn, 'movimientos', 'iva_monto', `REAL DEFAULT 0`);
            await agregarColumnaSiNoExiste(conn, 'movimientos', 'it_monto', `REAL DEFAULT 0`);

            // 3. Rellenar snapshot histórico en movimientos existentes y registrar trazabilidad
            const cfg = await getRaw(conn, `SELECT regimen_tributario, iva_porcentaje, it_porcentaje, it_base FROM configuracion_negocio WHERE id = 1`);
            const regimenActual = cfg?.regimen_tributario === 'regimen_general' ? 'regimen_general' : 'simplificado_control_interno';
            const ivaActual = Number(cfg?.iva_porcentaje ?? 13);
            const itActual = Number(cfg?.it_porcentaje ?? 3);

            const movsExistentes = await allRaw(
                conn,
                `SELECT id, tipo, COALESCE(categoria_contable, 'venta') as categoria_contable,
                        monto, COALESCE(tipo_comprobante, 'recibo') as tipo_comprobante
                 FROM movimientos
                 WHERE regimen_tributario IS NULL
                 ORDER BY id ASC`
            );

            const reclasificadosConFactura = [];
            const reclasificadosConRecibo = [];

            for (const m of movsExistentes) {
                const monto = Number(m.monto || 0);
                const esFactura = m.tipo_comprobante === 'factura';
                if (esFactura) {
                    const ivaM = Math.round((monto * (ivaActual / 100) + Number.EPSILON) * 100) / 100;
                    const itM = m.tipo === 'ingreso' && m.categoria_contable === 'venta'
                        ? Math.round((monto * (itActual / 100) + Number.EPSILON) * 100) / 100
                        : 0;
                    await runRaw(
                        conn,
                        `UPDATE movimientos
                         SET regimen_tributario = 'regimen_general',
                             iva_porcentaje = ?,
                             it_porcentaje = ?,
                             iva_monto = ?,
                             it_monto = ?
                         WHERE id = ?`,
                        [ivaActual, m.tipo === 'ingreso' ? itActual : 0, ivaM, itM, m.id]
                    );
                    reclasificadosConFactura.push(m.id);
                } else {
                    await runRaw(
                        conn,
                        `UPDATE movimientos
                         SET regimen_tributario = ?,
                             iva_porcentaje = 0,
                             it_porcentaje = 0,
                             iva_monto = 0,
                             it_monto = 0
                         WHERE id = ?`,
                        [regimenActual, m.id]
                    );
                    reclasificadosConRecibo.push(m.id);
                }
            }

            if (movsExistentes.length > 0) {
                console.log(
                    `[Migraciones v10 Snapshot] Movimientos históricos rellenados: total=${movsExistentes.length} | ` +
                    `con factura (IVA ${ivaActual}% / IT ${itActual}%): [${reclasificadosConFactura.join(', ') || 'ninguno'}] | ` +
                    `con recibo/interno (IVA=0, IT=0): [${reclasificadosConRecibo.join(', ') || 'ninguno'}]`
                );
            }

            // 4. Columna costo_promedio_resultante en movimientos_productos_directos
            await agregarColumnaSiNoExiste(
                conn,
                'movimientos_productos_directos',
                'costo_promedio_resultante',
                `REAL DEFAULT 0`
            );
            await runRaw(
                conn,
                `UPDATE movimientos_productos_directos
                 SET costo_promedio_resultante = costo_unitario
                 WHERE costo_promedio_resultante IS NULL OR costo_promedio_resultante = 0`
            );

            // 5. Sembrar saldo de apertura en Kardex para productos de stock directo existentes que no tengan movimientos
            const prodsSinKardex = await allRaw(
                conn,
                `SELECT p.id, p.nombre, COALESCE(p.stock, 0) as stock, COALESCE(p.costo, 0) as costo
                 FROM productos p
                 WHERE p.tipo_inventario = 'directo'
                   AND NOT EXISTS (
                       SELECT 1 FROM movimientos_productos_directos mpd WHERE mpd.producto_id = p.id
                   )
                 ORDER BY p.id ASC`
            );

            const sembrados = [];
            for (const p of prodsSinKardex) {
                const stockNum = Number(Number(p.stock || 0).toFixed(4));
                const costoNum = Number(Number(p.costo || 0).toFixed(4));
                const montoTotal = Math.round((stockNum * costoNum + Number.EPSILON) * 100) / 100;
                await runRaw(
                    conn,
                    `INSERT INTO movimientos_productos_directos (
                        producto_id, movimiento_id, usuario_id, tipo,
                        cantidad, stock_resultante, costo_unitario, costo_promedio_resultante, monto_total, motivo
                    ) VALUES (?, NULL, NULL, 'inventario_inicial', ?, ?, ?, ?, ?, 'Saldo de apertura (migración v10)')`,
                    [p.id, stockNum, stockNum, costoNum, costoNum, montoTotal]
                );
                sembrados.push(`${p.id}:${p.nombre}(stock=${stockNum},costo=${costoNum})`);
            }

            if (sembrados.length > 0) {
                console.log(`[Migraciones v10 Kardex] Saldos de apertura sembrados (${sembrados.length}): ${sembrados.join(', ')}`);
            }
        }
    },
    {
        version: 11,
        descripcion: 'Índice único de turno abierto por estación física, Kardex cronológico completo de insumos (stock_resultante, costo_promedio_resultante y tipos inventario_inicial/ajuste) y reconciliación integral de movimientos_pagos',
        up: async (conn) => {
            // 1. Índice único parcial para impedir dos turnos abiertos simultáneamente en la misma estación física
            await runRaw(
                conn,
                `CREATE UNIQUE INDEX IF NOT EXISTS una_caja_abierta_por_estacion ON cajas(caja_fisica_id) WHERE estado = 'abierta'`
            );

            // 2. Recrear movimientos_insumos para soportar 'inventario_inicial' y 'ajuste' y columnas de saldo/CPP resultante
            const tieneProvNombre = await tieneColumna(conn, 'movimientos_insumos', 'proveedor_nombre');
            const tieneProvNit = await tieneColumna(conn, 'movimientos_insumos', 'proveedor_nit');
            const tieneNroFac = await tieneColumna(conn, 'movimientos_insumos', 'nro_factura_compra');
            const tieneConFac = await tieneColumna(conn, 'movimientos_insumos', 'con_factura');
            const tieneMontoTot = await tieneColumna(conn, 'movimientos_insumos', 'monto_total_compra');
            const tieneUsuarioId = await tieneColumna(conn, 'movimientos_insumos', 'usuario_id');

            await runRaw(conn, `
                CREATE TABLE movimientos_insumos_v11 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    insumo_id INTEGER NOT NULL,
                    movimiento_id INTEGER,
                    usuario_id INTEGER DEFAULT NULL,
                    tipo TEXT CHECK(tipo IN ('inventario_inicial', 'compra', 'consumo_venta', 'merma', 'reingreso_anulacion', 'ajuste')) NOT NULL,
                    cantidad REAL NOT NULL,
                    stock_resultante REAL NOT NULL DEFAULT 0,
                    costo_unitario REAL NOT NULL,
                    costo_promedio_resultante REAL NOT NULL DEFAULT 0,
                    monto_total_compra REAL DEFAULT 0,
                    proveedor_nombre TEXT DEFAULT NULL,
                    proveedor_nit TEXT DEFAULT NULL,
                    nro_factura_compra TEXT DEFAULT NULL,
                    con_factura INTEGER DEFAULT 0,
                    motivo TEXT DEFAULT '',
                    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (insumo_id) REFERENCES insumos(id),
                    FOREIGN KEY (movimiento_id) REFERENCES movimientos(id),
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
                )
            `);

            await runRaw(conn, `
                INSERT INTO movimientos_insumos_v11 (
                    id, insumo_id, movimiento_id, usuario_id, tipo, cantidad,
                    stock_resultante, costo_unitario, costo_promedio_resultante, monto_total_compra,
                    proveedor_nombre, proveedor_nit, nro_factura_compra, con_factura, motivo, fecha_hora
                )
                SELECT
                    mi.id,
                    mi.insumo_id,
                    mi.movimiento_id,
                    ${tieneUsuarioId ? 'mi.usuario_id' : 'NULL'},
                    mi.tipo,
                    mi.cantidad,
                    0,
                    mi.costo_unitario,
                    mi.costo_unitario,
                    ${tieneMontoTot ? 'COALESCE(mi.monto_total_compra, ROUND(mi.cantidad * mi.costo_unitario, 2))' : 'ROUND(mi.cantidad * mi.costo_unitario, 2)'},
                    ${tieneProvNombre ? 'mi.proveedor_nombre' : 'NULL'},
                    ${tieneProvNit ? 'mi.proveedor_nit' : 'NULL'},
                    ${tieneNroFac ? 'mi.nro_factura_compra' : 'NULL'},
                    ${tieneConFac ? 'COALESCE(mi.con_factura, 0)' : '0'},
                    mi.motivo,
                    mi.fecha_hora
                FROM movimientos_insumos mi
                ORDER BY mi.id ASC
            `);

            await runRaw(conn, `DROP TABLE movimientos_insumos`);
            await runRaw(conn, `ALTER TABLE movimientos_insumos_v11 RENAME TO movimientos_insumos`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_movimientos_insumos_insumo_id ON movimientos_insumos(insumo_id)`);
            await runRaw(conn, `CREATE INDEX IF NOT EXISTS idx_movimientos_insumos_movimiento_id ON movimientos_insumos(movimiento_id)`);

            // 2.5. Reparar costos unitarios métricos de insumos que fueron truncados a 0.00 por redondeo a 2 decimales previo
            const costosMetricosSemilla = [
                { nombre: 'Leche Entera Barista', costo: 0.0015 },
                { nombre: 'Leche Deslactosada Barista', costo: 0.0018 },
                { nombre: 'Leche de Almendras', costo: 0.0030 },
                { nombre: 'Leche de Avena Barista', costo: 0.0032 },
                { nombre: 'Hielo Purificado', costo: 0.0005 },
                { nombre: 'Leche Entera Fresca', costo: 0.0015 },
                { nombre: 'Leche Deslactosada', costo: 0.0018 },
                { nombre: 'Leche de Soya', costo: 0.0032 },
                { nombre: 'Agua Purificada Filtrada', costo: 0.0005 }
            ];
            for (const item of costosMetricosSemilla) {
                await runRaw(
                    conn,
                    `UPDATE insumos SET costo_por_unidad = ? WHERE nombre = ? AND COALESCE(costo_por_unidad, 0) = 0`,
                    [item.costo, item.nombre]
                );
            }
            // Recalcular costos de recetas y combos en cascada si se repararon insumos métricos
            await runRaw(
                conn,
                `UPDATE productos
                 SET costo = COALESCE((
                     SELECT ROUND(SUM(r.cantidad_requerida * i.costo_por_unidad), 2)
                     FROM recetas r
                     JOIN insumos i ON r.insumo_id = i.id
                     WHERE r.producto_id = productos.id
                 ), costo)
                 WHERE tipo_inventario = 'receta'
                   AND EXISTS (SELECT 1 FROM recetas rp WHERE rp.producto_id = productos.id)`
            );
            await runRaw(
                conn,
                `UPDATE productos
                 SET costo = COALESCE((
                     SELECT ROUND(SUM(cc.cantidad * p_comp.costo), 2)
                     FROM combo_componentes cc
                     JOIN productos p_comp ON cc.componente_producto_id = p_comp.id
                     WHERE cc.combo_producto_id = productos.id
                 ), costo)
                 WHERE tipo_inventario = 'combo'
                   AND EXISTS (SELECT 1 FROM combo_componentes c2 WHERE c2.combo_producto_id = productos.id)`
            );

            // 3. Reconstruir saldos cronológicos y CPP resultante en movimientos_insumos
            const todosInsumos = await allRaw(conn, `SELECT id, nombre, COALESCE(stock_actual, 0) as stock_actual, COALESCE(costo_por_unidad, 0) as costo_por_unidad FROM insumos ORDER BY id ASC`);
            for (const ins of todosInsumos) {
                const movsIns = await allRaw(
                    conn,
                    `SELECT id, tipo, cantidad, costo_unitario, fecha_hora FROM movimientos_insumos WHERE insumo_id = ? ORDER BY id ASC`,
                    [ins.id]
                );

                if (movsIns.length === 0) {
                    const stockNum = Number(Number(ins.stock_actual || 0).toFixed(4));
                    const costoNum = Number(Number(ins.costo_por_unidad || 0).toFixed(6));
                    if (stockNum > 0) {
                        const montoTot = Math.round((stockNum * costoNum + Number.EPSILON) * 100) / 100;
                        await runRaw(
                            conn,
                            `INSERT INTO movimientos_insumos (
                                insumo_id, movimiento_id, usuario_id, tipo, cantidad,
                                stock_resultante, costo_unitario, costo_promedio_resultante, monto_total_compra, motivo
                            ) VALUES (?, NULL, NULL, 'inventario_inicial', ?, ?, ?, ?, ?, 'Saldo de apertura (migración v11)')`,
                            [ins.id, stockNum, stockNum, costoNum, costoNum, montoTot]
                        );
                    }
                    continue;
                }

                // Calcular variación neta de los movimientos registrados para detectar si existía un saldo previo no registrado
                let deltaMovs = 0;
                for (const m of movsIns) {
                    const c = Number(m.cantidad || 0);
                    const esEntrada = ['inventario_inicial', 'compra', 'reingreso_anulacion'].includes(m.tipo) || (m.tipo === 'ajuste' && c >= 0);
                    deltaMovs = Number((deltaMovs + (esEntrada ? c : -c)).toFixed(4));
                }

                const stockActualReal = Number(Number(ins.stock_actual || 0).toFixed(4));
                let saldoAcumulado = Number((stockActualReal - deltaMovs).toFixed(4));
                let cppActual = Number(Number(ins.costo_por_unidad || 0).toFixed(6));

                // Si había un saldo de apertura previo a los movimientos registrados, insertarlo como inventario_inicial
                if (saldoAcumulado > 0.0001) {
                    const montoTotIni = Math.round((saldoAcumulado * cppActual + Number.EPSILON) * 100) / 100;
                    await runRaw(
                        conn,
                        `INSERT INTO movimientos_insumos (
                            insumo_id, movimiento_id, usuario_id, tipo, cantidad,
                            stock_resultante, costo_unitario, costo_promedio_resultante, monto_total_compra, motivo, fecha_hora
                        ) VALUES (?, NULL, NULL, 'inventario_inicial', ?, ?, ?, ?, ?, 'Saldo de apertura reconstruido (migración v11)', ?)`,
                        [ins.id, saldoAcumulado, saldoAcumulado, cppActual, cppActual, montoTotIni, movsIns[0].fecha_hora]
                    );
                }

                for (const m of movsIns) {
                    const cant = Number(m.cantidad || 0);
                    const costoMov = Number(m.costo_unitario || cppActual || 0);
                    const esEntrada = ['inventario_inicial', 'compra', 'reingreso_anulacion'].includes(m.tipo) || (m.tipo === 'ajuste' && cant >= 0);

                    if (m.tipo === 'compra' || m.tipo === 'inventario_inicial') {
                        const stockPrevio = Math.max(0, saldoAcumulado);
                        const nuevoStock = Number((saldoAcumulado + cant).toFixed(4));
                        if (nuevoStock > 0 && costoMov > 0) {
                            cppActual = Number((((stockPrevio * cppActual) + (cant * costoMov)) / (stockPrevio + cant)).toFixed(6));
                        } else if (costoMov > 0) {
                            cppActual = Number(costoMov.toFixed(6));
                        }
                        saldoAcumulado = nuevoStock;
                    } else if (esEntrada) {
                        saldoAcumulado = Number((saldoAcumulado + Math.abs(cant)).toFixed(4));
                    } else {
                        saldoAcumulado = Number((saldoAcumulado - Math.abs(cant)).toFixed(4));
                    }

                    const cppGuardar = cppActual > 0 ? cppActual : Number(Number(ins.costo_por_unidad || costoMov || 0).toFixed(6));
                    await runRaw(
                        conn,
                        `UPDATE movimientos_insumos SET stock_resultante = ?, costo_promedio_resultante = ? WHERE id = ?`,
                        [saldoAcumulado, cppGuardar, m.id]
                    );
                }
            }

            // 4. Reconciliar movimientos_pagos para garantizar que todo movimiento tenga su desglose exacto
            const movsDescuadrados = await allRaw(
                conn,
                `SELECT m.id, m.metodo_pago, m.monto, m.monto_efectivo, m.monto_qr, m.referencia_qr,
                        COALESCE((SELECT SUM(mp.monto) FROM movimientos_pagos mp WHERE mp.movimiento_id = m.id), 0) as suma_pagos
                 FROM movimientos m
                 WHERE m.monto > 0`
            );

            for (const m of movsDescuadrados) {
                if (Math.abs(Number(m.monto) - Number(m.suma_pagos)) > 0.005) {
                    await runRaw(conn, `DELETE FROM movimientos_pagos WHERE movimiento_id = ?`, [m.id]);
                    if (m.metodo_pago === 'mixto') {
                        const ef = Number(m.monto_efectivo || 0);
                        const qr = Number(m.monto_qr || 0);
                        if (ef > 0) {
                            await runRaw(
                                conn,
                                `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES (?, 'efectivo', ?, NULL)`,
                                [m.id, ef]
                            );
                        }
                        if (qr > 0) {
                            await runRaw(
                                conn,
                                `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES (?, 'qr', ?, ?)`,
                                [m.id, qr, m.referencia_qr || null]
                            );
                        }
                    } else {
                        const canal = m.metodo_pago === 'qr' ? 'qr' : 'efectivo';
                        await runRaw(
                            conn,
                            `INSERT INTO movimientos_pagos (movimiento_id, metodo_pago, monto, referencia) VALUES (?, ?, ?, ?)`,
                            [m.id, canal, Number(m.monto), canal === 'qr' ? (m.referencia_qr || null) : null]
                        );
                    }
                }
            }
        }
    }
];

async function sincronizarCuentaDeveloper(conn) {
    const claveEnv = obtenerPasswordDeveloperDesdeEnv();

    // Sin DEVELOPER_PASSWORD no se crea la cuenta developer (no hay clave por defecto ni se escribe .env.local).
    // Si existiera una cuenta developer previa (p. ej. creada por migraciones antiguas con clave aleatoria),
    // se desactiva para que no quede utilizable; se reactiva sola al definir DEVELOPER_PASSWORD.
    if (!claveEnv) {
        console.warn("[Seguridad] DEVELOPER_PASSWORD no está definida: la cuenta técnica 'developer' no se crea ni queda habilitada. Defínela en .env.local (desarrollo) o .env (producción) si necesitas el perfil de mantenimiento.");
        try {
            const res = await runRaw(conn, `UPDATE usuarios SET activo = 0 WHERE rol = 'developer' AND activo = 1`);
            if (res.changes > 0) {
                console.warn("[Seguridad] Cuenta 'developer' existente desactivada hasta que se configure DEVELOPER_PASSWORD.");
            }
        } catch (err) {
            console.error('[Seguridad] Error al desactivar la cuenta developer:', err.message);
        }
        return;
    }

    // Producción: rechazar valores de ejemplo o demasiado cortos (error bloqueante y claro).
    // Se lanza fuera del try/catch para que la inicialización de la base de datos falle de forma visible.
    if (esProduccion()) {
        exigirPasswordDeveloperProduccion(claveEnv);
    } else {
        const motivo = motivoPasswordDeveloperInvalida(claveEnv);
        if (motivo) console.warn(`[Seguridad] Aviso (desarrollo): ${motivo} En producción esto impediría arrancar.`);
    }

    try {
        const devUser = await getRaw(conn, `SELECT id, pin_o_password, activo FROM usuarios WHERE LOWER(nombre) = 'developer' LIMIT 1`);
        if (devUser) {
            let coincide = false;
            try {
                coincide = await bcrypt.compare(claveEnv, devUser.pin_o_password);
            } catch (_) {
                coincide = false;
            }

            if (!coincide || Number(devUser.activo) !== 1) {
                const nuevoHash = await bcrypt.hash(claveEnv, BCRYPT_ROUNDS);
                await runRaw(conn, `UPDATE usuarios SET pin_o_password = ?, activo = 1 WHERE id = ?`, [nuevoHash, devUser.id]);
                console.log(`[Seguridad] Credencial de 'developer' sincronizada con DEVELOPER_PASSWORD de .env.local.`);
            }
        } else {
            const nuevoHash = await bcrypt.hash(claveEnv, BCRYPT_ROUNDS);
            await runRaw(
                conn,
                `INSERT INTO usuarios (nombre, pin_o_password, rol, activo) VALUES ('developer', ?, 'developer', 1)`,
                [nuevoHash]
            );
            console.log(`[Seguridad] Cuenta 'developer' creada y sincronizada con .env.local.`);
        }
    } catch (err) {
        console.error('[Seguridad] Error al sincronizar cuenta developer:', err.message);
    }
}

async function respaldarAntesDeMigrar(conn, versionActual, versionDestino) {
    // Si la BD es nueva (versionActual === 0 y sin tablas previas) no requiere respaldo pre-migración
    if (!versionActual || versionActual <= 0) {
        const tablasExistentes = await allRaw(
            conn,
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
        );
        if (!tablasExistentes || tablasExistentes.length === 0) {
            return null;
        }
    }

    const backupDir = process.env.BACKUP_DIR
        ? path.resolve(process.env.BACKUP_DIR)
        : path.resolve(process.cwd(), 'backups');

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const ahora = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const sello = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}_${pad(ahora.getHours())}-${pad(ahora.getMinutes())}-${pad(ahora.getSeconds())}_${ahora.getMilliseconds()}`;
    const nombreArchivo = `caja-pre-migracion-v${versionActual}-a-v${versionDestino}-${sello}.db`;
    const rutaDestino = path.join(backupDir, nombreArchivo);

    await runRaw(conn, `VACUUM INTO ?`, [rutaDestino]);
    console.log(`[Migraciones Backup] Respaldo automático pre-migración (v${versionActual} -> v${versionDestino}) creado en: ${rutaDestino}`);
    return rutaDestino;
}

async function ejecutarMigraciones(conn) {
    await runRaw(conn, `PRAGMA foreign_keys = ON`);
    const row = await getRaw(conn, `PRAGMA user_version`);
    let versionActual = row ? Number(row.user_version) : 0;

    const pendientes = MIGRACIONES.filter((m) => m.version > versionActual).sort((a, b) => a.version - b.version);

    if (pendientes.length > 0) {
        const versionDestino = pendientes[pendientes.length - 1].version;
        await respaldarAntesDeMigrar(conn, versionActual, versionDestino);

        for (const migracion of pendientes) {
            console.log(`[Migraciones] Aplicando v${migracion.version}: ${migracion.descripcion}...`);
            // En SQLite, PRAGMA foreign_keys = OFF debe ejecutarse fuera de la transacción para recrear tablas
            await runRaw(conn, `PRAGMA foreign_keys = OFF`);
            await runRaw(conn, `BEGIN IMMEDIATE`);
            try {
                await migracion.up(conn);

                const violacionesFK = await allRaw(conn, `PRAGMA foreign_key_check`);
                if (violacionesFK && violacionesFK.length > 0) {
                    throw new Error(`Violación de integridad referencial detectada en migración v${migracion.version}: ${JSON.stringify(violacionesFK)}`);
                }

                await runRaw(conn, `PRAGMA user_version = ${Number(migracion.version)}`);
                await runRaw(conn, `COMMIT`);
                versionActual = migracion.version;
                console.log(`[Migraciones] v${migracion.version} completada exitosamente.`);
            } catch (err) {
                await runRaw(conn, `ROLLBACK`).catch((rollbackErr) => {
                    console.error(`[Migraciones] Error durante ROLLBACK de v${migracion.version}:`, rollbackErr.message);
                });
                console.error(`[Migraciones] Falló la migración v${migracion.version}:`, err.message);
                throw err;
            } finally {
                await runRaw(conn, `PRAGMA foreign_keys = ON`);
            }
        }
    }

    // Asegurar y sincronizar la cuenta 'developer' siempre con .env.local
    await sincronizarCuentaDeveloper(conn);

    return versionActual;
}

module.exports = {
    ejecutarMigraciones
};
