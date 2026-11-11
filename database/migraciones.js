// ==========================================
// SISTEMA DE MIGRACIONES CONTROLADO POR PRAGMA user_version
// ==========================================
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
    }
];

async function ejecutarMigraciones(conn) {
    await runRaw(conn, `PRAGMA foreign_keys = ON`);
    const row = await getRaw(conn, `PRAGMA user_version`);
    let versionActual = row ? Number(row.user_version) : 0;

    const pendientes = MIGRACIONES.filter((m) => m.version > versionActual).sort((a, b) => a.version - b.version);

    if (pendientes.length === 0) {
        return versionActual;
    }

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

    return versionActual;
}

module.exports = {
    ejecutarMigraciones
};
