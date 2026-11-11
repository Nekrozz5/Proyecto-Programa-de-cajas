CREATE TABLE cajas (
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
            );

CREATE TABLE configuracion_negocio (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                nombre_negocio TEXT DEFAULT 'Mi Negocio',
                modalidad_nombre TEXT DEFAULT 'Artículos No Perecederos',
                usa_stock_directo INTEGER DEFAULT 1,
                usa_vencimiento INTEGER DEFAULT 0,
                usa_recetas_ensamblaje INTEGER DEFAULT 0,
                configurado INTEGER DEFAULT 0
            );

CREATE TABLE detalle_movimientos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                movimiento_id INTEGER NOT NULL,
                producto_id INTEGER NOT NULL,
                cantidad REAL NOT NULL,
                precio_unitario REAL NOT NULL,
                costo_unitario REAL NOT NULL,
                subtotal REAL NOT NULL,
                FOREIGN KEY (movimiento_id) REFERENCES movimientos(id),
                FOREIGN KEY (producto_id) REFERENCES productos(id)
            );

CREATE TABLE insumos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                unidad_medida TEXT NOT NULL,
                stock_actual REAL DEFAULT 0,
                costo_por_unidad REAL DEFAULT 0,
                stock_seguridad REAL DEFAULT 0,
                tiempo_entrega_dias INTEGER DEFAULT 1,
                fecha_vencimiento TEXT DEFAULT NULL,
                activo INTEGER DEFAULT 1
            );

CREATE TABLE movimientos (
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
            );

CREATE TABLE movimientos_insumos (
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
            );

CREATE TABLE productos (
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
            );

CREATE TABLE recetas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                producto_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                cantidad_requerida REAL NOT NULL,
                FOREIGN KEY (producto_id) REFERENCES productos(id),
                FOREIGN KEY (insumo_id) REFERENCES insumos(id),
                UNIQUE(producto_id, insumo_id)
            );

CREATE TABLE usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                pin_o_password TEXT NOT NULL,
                rol TEXT CHECK(rol IN ('user', 'admin', 'superadmin', 'developer')) NOT NULL,
                activo INTEGER DEFAULT 1
            );

CREATE UNIQUE INDEX idx_usuarios_nombre_nocase ON usuarios(nombre COLLATE NOCASE);
CREATE UNIQUE INDEX una_caja_abierta_por_usuario ON cajas(usuario_id) WHERE estado = 'abierta';
CREATE INDEX idx_movimientos_caja_id ON movimientos(caja_id);
CREATE INDEX idx_detalle_movimientos_movimiento_id ON detalle_movimientos(movimiento_id);
CREATE INDEX idx_movimientos_insumos_insumo_id ON movimientos_insumos(insumo_id);
CREATE INDEX idx_movimientos_insumos_movimiento_id ON movimientos_insumos(movimiento_id);