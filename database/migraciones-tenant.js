/**
 * Historial canónico del esquema operativo PostgreSQL.
 * Las versiones publicadas son inmutables y se aplican en orden por base.
 */
const { obtenerPool, cerrarPoolsPostgres, enTransaccionPostgres } = require('./postgres');
const { obtenerPoolTenant } = require('../server/tenancy/tenant-registry');

const migraciones = [
    {
        version: 1,
        sql: `
            CREATE TABLE IF NOT EXISTS configuracion_negocio (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                nombre_negocio TEXT DEFAULT 'Mi Negocio',
                modalidad_nombre TEXT DEFAULT 'Artículos No Perecederos',
                usa_stock_directo INTEGER DEFAULT 1,
                usa_vencimiento INTEGER DEFAULT 0,
                usa_recetas_ensamblaje INTEGER DEFAULT 0,
                habilita_apps_comida INTEGER DEFAULT 0,
                habilita_delivery INTEGER DEFAULT 0,
                configurado INTEGER DEFAULT 0,
                nit_negocio TEXT DEFAULT '',
                regimen_tributario TEXT DEFAULT 'simplificado_control_interno',
                emite_factura INTEGER DEFAULT 0,
                iva_porcentaje DOUBLE PRECISION DEFAULT 13,
                it_porcentaje DOUBLE PRECISION DEFAULT 3,
                usa_respaldo_compras_egresos INTEGER DEFAULT 1,
                it_base TEXT DEFAULT 'todas_las_ventas'
            );

            CREATE TABLE IF NOT EXISTS usuarios (
                id BIGSERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                nombre TEXT NOT NULL,
                nombre_usuario TEXT NOT NULL,
                pin_o_password TEXT NOT NULL,
                rol TEXT NOT NULL,
                activo INTEGER NOT NULL DEFAULT 1,
                puede_registrar_respaldo_fiscal INTEGER NOT NULL DEFAULT 1,
                CONSTRAINT usuarios_tenant_id_id_uq UNIQUE (tenant_id, id),
                CONSTRAINT usuarios_tenant_nombre_usuario_uq UNIQUE (tenant_id, nombre_usuario)
            );

            CREATE TABLE IF NOT EXISTS cajas_fisicas (
                id BIGSERIAL PRIMARY KEY,
                nombre TEXT NOT NULL UNIQUE,
                activa INTEGER NOT NULL DEFAULT 1,
                creada_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                habilita_respaldo_fiscal INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS categorias (
                id BIGSERIAL PRIMARY KEY,
                nombre TEXT NOT NULL UNIQUE,
                activo INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS productos (
                id BIGSERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                precio DOUBLE PRECISION NOT NULL,
                costo DOUBLE PRECISION DEFAULT 0,
                categoria TEXT DEFAULT 'General',
                unidad_medida TEXT DEFAULT 'unidades',
                tipo_inventario TEXT DEFAULT 'libre',
                stock DOUBLE PRECISION,
                stock_minimo DOUBLE PRECISION DEFAULT 0,
                fecha_vencimiento TEXT,
                activo INTEGER DEFAULT 1,
                limite_maximo_activo INTEGER DEFAULT 0,
                limite_unidades_total DOUBLE PRECISION,
                limite_unidades_restante DOUBLE PRECISION,
                fecha_inicio_vigencia TEXT,
                fecha_fin_vigencia TEXT
            );

            CREATE TABLE IF NOT EXISTS insumos (
                id BIGSERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                unidad_medida TEXT NOT NULL,
                stock_actual DOUBLE PRECISION DEFAULT 0,
                costo_por_unidad DOUBLE PRECISION DEFAULT 0,
                stock_seguridad DOUBLE PRECISION DEFAULT 0,
                tiempo_entrega_dias INTEGER DEFAULT 1,
                fecha_vencimiento TEXT,
                activo INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS grupos_modificadores (
                id BIGSERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                tipo_seleccion TEXT NOT NULL DEFAULT 'unica',
                es_obligatorio INTEGER NOT NULL DEFAULT 0,
                activo INTEGER NOT NULL DEFAULT 1,
                creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS recetas (
                id BIGSERIAL PRIMARY KEY,
                producto_id BIGINT NOT NULL REFERENCES productos(id),
                insumo_id BIGINT NOT NULL REFERENCES insumos(id),
                cantidad_requerida DOUBLE PRECISION NOT NULL,
                UNIQUE (producto_id, insumo_id)
            );

            CREATE TABLE IF NOT EXISTS producto_grupos_modificadores (
                producto_id BIGINT NOT NULL REFERENCES productos(id),
                grupo_id BIGINT NOT NULL REFERENCES grupos_modificadores(id),
                PRIMARY KEY (producto_id, grupo_id)
            );

            CREATE TABLE IF NOT EXISTS modificadores_opciones (
                id BIGSERIAL PRIMARY KEY,
                grupo_id BIGINT NOT NULL REFERENCES grupos_modificadores(id),
                nombre TEXT NOT NULL,
                insumo_id BIGINT REFERENCES insumos(id),
                cantidad_insumo DOUBLE PRECISION DEFAULT 0,
                precio_adicional DOUBLE PRECISION NOT NULL DEFAULT 0,
                insumo_reemplazado_id BIGINT REFERENCES insumos(id),
                es_default INTEGER NOT NULL DEFAULT 0,
                activo INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS combo_componentes (
                id BIGSERIAL PRIMARY KEY,
                combo_producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
                componente_producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
                cantidad DOUBLE PRECISION NOT NULL
            );

            CREATE TABLE IF NOT EXISTS cajas (
                id BIGSERIAL PRIMARY KEY,
                usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
                caja_fisica_id BIGINT REFERENCES cajas_fisicas(id),
                monto_inicial DOUBLE PRECISION NOT NULL,
                efectivo_esperado DOUBLE PRECISION,
                efectivo_real DOUBLE PRECISION,
                qr_esperado DOUBLE PRECISION DEFAULT 0,
                qr_real DOUBLE PRECISION,
                diferencia_efectivo DOUBLE PRECISION,
                diferencia_qr DOUBLE PRECISION,
                estado TEXT DEFAULT 'abierta',
                veces_reabierta INTEGER DEFAULT 0,
                historial_reaperturas TEXT DEFAULT '',
                observaciones_cierre TEXT DEFAULT '',
                fecha_apertura TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                fecha_cierre TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS movimientos (
                id BIGSERIAL PRIMARY KEY,
                caja_id BIGINT NOT NULL REFERENCES cajas(id),
                usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
                tipo TEXT NOT NULL,
                categoria_contable TEXT NOT NULL DEFAULT 'venta',
                subtotal_bruto DOUBLE PRECISION NOT NULL DEFAULT 0,
                descuento_total DOUBLE PRECISION NOT NULL DEFAULT 0,
                monto DOUBLE PRECISION NOT NULL,
                metodo_pago TEXT NOT NULL,
                monto_efectivo DOUBLE PRECISION NOT NULL DEFAULT 0,
                monto_qr DOUBLE PRECISION NOT NULL DEFAULT 0,
                referencia_qr TEXT,
                monto_recibido DOUBLE PRECISION,
                cambio DOUBLE PRECISION DEFAULT 0,
                tipo_comprobante TEXT NOT NULL DEFAULT 'recibo',
                nro_factura TEXT,
                cuf_autorizacion TEXT DEFAULT '',
                codigo_control TEXT DEFAULT '0',
                tipo_compra INTEGER DEFAULT 1,
                cliente_nit_ci TEXT,
                cliente_razon_social TEXT,
                descripcion TEXT DEFAULT '',
                canal_venta TEXT DEFAULT 'local',
                datos_entrega TEXT DEFAULT '',
                referencia_externa TEXT DEFAULT '',
                estado TEXT DEFAULT 'completado',
                fecha_hora TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                anulado_por BIGINT REFERENCES usuarios(id),
                fecha_anulacion TIMESTAMPTZ,
                motivo_anulacion TEXT,
                regimen_tributario TEXT,
                iva_porcentaje DOUBLE PRECISION DEFAULT 0,
                it_porcentaje DOUBLE PRECISION DEFAULT 0,
                iva_monto DOUBLE PRECISION DEFAULT 0,
                it_monto DOUBLE PRECISION DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS movimientos_pagos (
                id BIGSERIAL PRIMARY KEY,
                movimiento_id BIGINT NOT NULL REFERENCES movimientos(id) ON DELETE CASCADE,
                metodo_pago TEXT NOT NULL,
                monto DOUBLE PRECISION NOT NULL,
                referencia TEXT
            );

            CREATE TABLE IF NOT EXISTS detalle_movimientos (
                id BIGSERIAL PRIMARY KEY,
                movimiento_id BIGINT NOT NULL REFERENCES movimientos(id),
                producto_id BIGINT NOT NULL REFERENCES productos(id),
                cantidad DOUBLE PRECISION NOT NULL,
                precio_unitario DOUBLE PRECISION NOT NULL,
                costo_unitario DOUBLE PRECISION NOT NULL,
                subtotal DOUBLE PRECISION NOT NULL
            );

            CREATE TABLE IF NOT EXISTS detalle_movimientos_combos (
                id BIGSERIAL PRIMARY KEY,
                detalle_movimiento_id BIGINT NOT NULL REFERENCES detalle_movimientos(id) ON DELETE CASCADE,
                componente_producto_id BIGINT NOT NULL REFERENCES productos(id),
                cantidad_unitaria DOUBLE PRECISION NOT NULL,
                cantidad_total DOUBLE PRECISION NOT NULL,
                costo_unitario_congelado DOUBLE PRECISION NOT NULL
            );

            CREATE TABLE IF NOT EXISTS detalle_movimientos_modificadores (
                id BIGSERIAL PRIMARY KEY,
                detalle_movimiento_id BIGINT NOT NULL REFERENCES detalle_movimientos(id),
                modificador_opcion_id BIGINT REFERENCES modificadores_opciones(id),
                nombre TEXT NOT NULL,
                precio_adicional DOUBLE PRECISION NOT NULL DEFAULT 0,
                costo_adicional DOUBLE PRECISION NOT NULL DEFAULT 0,
                insumo_id BIGINT REFERENCES insumos(id),
                cantidad_insumo DOUBLE PRECISION DEFAULT 0,
                insumo_reemplazado_id BIGINT REFERENCES insumos(id)
            );

            CREATE TABLE IF NOT EXISTS movimientos_productos_directos (
                id BIGSERIAL PRIMARY KEY,
                producto_id BIGINT NOT NULL REFERENCES productos(id),
                movimiento_id BIGINT REFERENCES movimientos(id),
                usuario_id BIGINT REFERENCES usuarios(id),
                tipo TEXT NOT NULL,
                cantidad DOUBLE PRECISION NOT NULL,
                stock_resultante DOUBLE PRECISION NOT NULL,
                costo_unitario DOUBLE PRECISION NOT NULL,
                costo_promedio_resultante DOUBLE PRECISION DEFAULT 0,
                monto_total DOUBLE PRECISION NOT NULL DEFAULT 0,
                proveedor_nombre TEXT,
                proveedor_nit TEXT,
                nro_factura_compra TEXT,
                nro_autorizacion_cuf TEXT DEFAULT '',
                codigo_control TEXT DEFAULT '0',
                tipo_compra INTEGER DEFAULT 1,
                con_factura INTEGER DEFAULT 0,
                motivo TEXT DEFAULT '',
                fecha_hora TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS movimientos_insumos (
                id BIGSERIAL PRIMARY KEY,
                insumo_id BIGINT NOT NULL REFERENCES insumos(id),
                movimiento_id BIGINT REFERENCES movimientos(id),
                usuario_id BIGINT REFERENCES usuarios(id),
                tipo TEXT NOT NULL,
                cantidad DOUBLE PRECISION NOT NULL,
                stock_resultante DOUBLE PRECISION NOT NULL DEFAULT 0,
                costo_unitario DOUBLE PRECISION NOT NULL,
                costo_promedio_resultante DOUBLE PRECISION NOT NULL DEFAULT 0,
                monto_total_compra DOUBLE PRECISION DEFAULT 0,
                proveedor_nombre TEXT,
                proveedor_nit TEXT,
                nro_factura_compra TEXT,
                nro_autorizacion_cuf TEXT DEFAULT '',
                codigo_control TEXT DEFAULT '0',
                tipo_compra INTEGER DEFAULT 1,
                con_factura INTEGER DEFAULT 0,
                motivo TEXT DEFAULT '',
                fecha_hora TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS producto_lotes (
                id BIGSERIAL PRIMARY KEY,
                producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
                fecha_vencimiento TEXT NOT NULL,
                stock DOUBLE PRECISION NOT NULL DEFAULT 0,
                costo_unitario DOUBLE PRECISION NOT NULL DEFAULT 0,
                activo INTEGER NOT NULL DEFAULT 1,
                creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS configuracion_smtp (
                id INTEGER PRIMARY KEY,
                host TEXT,
                puerto INTEGER,
                secure INTEGER,
                usuario TEXT,
                password TEXT,
                remitente_nombre TEXT,
                activo INTEGER DEFAULT 0,
                actualizado_en TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS notificacion_destinatarios (
                id BIGSERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                nombre TEXT,
                verificado INTEGER DEFAULT 0,
                codigo_verificacion TEXT,
                codigo_expira TIMESTAMPTZ,
                intentos_fallidos INTEGER DEFAULT 0,
                activo INTEGER DEFAULT 1,
                creado_por BIGINT REFERENCES usuarios(id),
                creado_en TIMESTAMPTZ,
                verificado_en TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS dispositivos_pos (
                id BIGSERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                nombre TEXT NOT NULL,
                clave_publica TEXT NOT NULL,
                estado TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'activo', 'revocado')),
                creado_por BIGINT NOT NULL,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ultimo_acceso TIMESTAMPTZ,
                revocado_en TIMESTAMPTZ,
                CONSTRAINT dispositivos_pos_tenant_creador_fk
                    FOREIGN KEY (tenant_id, creado_por) REFERENCES usuarios (tenant_id, id),
                CONSTRAINT dispositivos_pos_tenant_clave_uq UNIQUE (tenant_id, clave_publica),
                CONSTRAINT dispositivos_pos_revocacion_ck CHECK (
                    (estado = 'revocado' AND revocado_en IS NOT NULL)
                    OR (estado <> 'revocado' AND revocado_en IS NULL)
                )
            );

            CREATE INDEX IF NOT EXISTS movimientos_fecha_hora_idx ON movimientos (fecha_hora);
            CREATE INDEX IF NOT EXISTS movimientos_caja_idx ON movimientos (caja_id);
            CREATE INDEX IF NOT EXISTS detalle_movimientos_movimiento_idx ON detalle_movimientos (movimiento_id);
            CREATE INDEX IF NOT EXISTS producto_lotes_producto_vencimiento_idx ON producto_lotes (producto_id, fecha_vencimiento);
            CREATE INDEX IF NOT EXISTS dispositivos_pos_tenant_estado_idx ON dispositivos_pos (tenant_id, estado);
        `
    },
    {
        version: 2,
        sql: `
            ALTER TABLE configuracion_negocio
                ALTER COLUMN iva_porcentaje TYPE NUMERIC,
                ALTER COLUMN it_porcentaje TYPE NUMERIC;
            ALTER TABLE usuarios
                ADD CONSTRAINT usuarios_rol_ck CHECK (rol IN ('user', 'admin', 'propietario', 'developer'));
            ALTER TABLE productos
                ALTER COLUMN precio TYPE NUMERIC,
                ALTER COLUMN costo TYPE NUMERIC,
                ALTER COLUMN fecha_inicio_vigencia TYPE TIMESTAMPTZ
                    USING NULLIF(BTRIM(fecha_inicio_vigencia), '')::timestamptz,
                ALTER COLUMN fecha_fin_vigencia TYPE TIMESTAMPTZ
                    USING NULLIF(BTRIM(fecha_fin_vigencia), '')::timestamptz,
                ADD CONSTRAINT productos_tipo_inventario_ck
                    CHECK (tipo_inventario IN ('libre', 'directo', 'receta', 'combo'));
            ALTER TABLE insumos ALTER COLUMN costo_por_unidad TYPE NUMERIC;
            ALTER TABLE grupos_modificadores
                ADD CONSTRAINT grupos_modificadores_tipo_ck CHECK (tipo_seleccion IN ('unica', 'multiple'));
            ALTER TABLE modificadores_opciones ALTER COLUMN precio_adicional TYPE NUMERIC;
            ALTER TABLE combo_componentes
                ADD CONSTRAINT combo_componentes_cantidad_ck CHECK (cantidad > 0);
            ALTER TABLE cajas
                ALTER COLUMN caja_fisica_id SET DEFAULT 1,
                ALTER COLUMN monto_inicial TYPE NUMERIC,
                ALTER COLUMN efectivo_esperado TYPE NUMERIC,
                ALTER COLUMN efectivo_real TYPE NUMERIC,
                ALTER COLUMN qr_esperado TYPE NUMERIC,
                ALTER COLUMN qr_real TYPE NUMERIC,
                ALTER COLUMN diferencia_efectivo TYPE NUMERIC,
                ALTER COLUMN diferencia_qr TYPE NUMERIC,
                ADD CONSTRAINT cajas_estado_ck CHECK (estado IN ('abierta', 'cerrada'));
            ALTER TABLE movimientos
                ALTER COLUMN subtotal_bruto TYPE NUMERIC,
                ALTER COLUMN descuento_total TYPE NUMERIC,
                ALTER COLUMN monto TYPE NUMERIC,
                ALTER COLUMN monto_efectivo TYPE NUMERIC,
                ALTER COLUMN monto_qr TYPE NUMERIC,
                ALTER COLUMN monto_recibido TYPE NUMERIC,
                ALTER COLUMN cambio TYPE NUMERIC,
                ALTER COLUMN iva_porcentaje TYPE NUMERIC,
                ALTER COLUMN it_porcentaje TYPE NUMERIC,
                ALTER COLUMN iva_monto TYPE NUMERIC,
                ALTER COLUMN it_monto TYPE NUMERIC,
                ADD CONSTRAINT movimientos_tipo_ck CHECK (tipo IN ('ingreso', 'egreso')),
                ADD CONSTRAINT movimientos_categoria_ck CHECK (categoria_contable IN (
                    'venta', 'aporte_cambio', 'gasto_operativo', 'compra_insumo', 'pago_proveedor', 'retiro_dueno', 'otro'
                )),
                ADD CONSTRAINT movimientos_metodo_pago_ck CHECK (metodo_pago IN ('efectivo', 'qr', 'mixto')),
                ADD CONSTRAINT movimientos_comprobante_ck CHECK (tipo_comprobante IN ('recibo', 'factura', 'sin_respaldo')),
                ADD CONSTRAINT movimientos_estado_ck CHECK (estado IN ('completado', 'anulado'));
            ALTER TABLE movimientos_pagos
                ALTER COLUMN monto TYPE NUMERIC,
                ADD CONSTRAINT movimientos_pagos_metodo_ck CHECK (metodo_pago IN ('efectivo', 'qr', 'pedidos_ya', 'yango')),
                ADD CONSTRAINT movimientos_pagos_monto_ck CHECK (monto > 0);
            ALTER TABLE detalle_movimientos
                ALTER COLUMN precio_unitario TYPE NUMERIC,
                ALTER COLUMN costo_unitario TYPE NUMERIC,
                ALTER COLUMN subtotal TYPE NUMERIC;
            ALTER TABLE detalle_movimientos_combos ALTER COLUMN costo_unitario_congelado TYPE NUMERIC;
            ALTER TABLE detalle_movimientos_modificadores
                ALTER COLUMN precio_adicional TYPE NUMERIC,
                ALTER COLUMN costo_adicional TYPE NUMERIC;
            ALTER TABLE movimientos_productos_directos
                ALTER COLUMN costo_unitario TYPE NUMERIC,
                ALTER COLUMN costo_promedio_resultante TYPE NUMERIC,
                ALTER COLUMN monto_total TYPE NUMERIC,
                ADD CONSTRAINT movimientos_productos_directos_tipo_ck CHECK (tipo IN (
                    'inventario_inicial', 'compra', 'venta', 'merma', 'reingreso_anulacion', 'ajuste'
                ));
            ALTER TABLE movimientos_insumos
                ALTER COLUMN costo_unitario TYPE NUMERIC,
                ALTER COLUMN costo_promedio_resultante TYPE NUMERIC,
                ALTER COLUMN monto_total_compra TYPE NUMERIC,
                ADD CONSTRAINT movimientos_insumos_tipo_ck CHECK (tipo IN (
                    'inventario_inicial', 'compra', 'consumo_venta', 'merma', 'reingreso_anulacion', 'ajuste'
                ));
            ALTER TABLE producto_lotes ALTER COLUMN costo_unitario TYPE NUMERIC;
            ALTER TABLE configuracion_smtp ADD CONSTRAINT configuracion_smtp_singleton_ck CHECK (id = 1);
            ALTER TABLE notificacion_destinatarios
                DROP CONSTRAINT notificacion_destinatarios_creado_por_fkey,
                ADD CONSTRAINT notificacion_destinatarios_creado_por_fkey
                    FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL;

            CREATE UNIQUE INDEX usuarios_tenant_nombre_visible_ci_uq ON usuarios (tenant_id, LOWER(nombre));
            CREATE UNIQUE INDEX usuarios_tenant_nombre_usuario_ci_uq ON usuarios (tenant_id, LOWER(nombre_usuario));
            CREATE UNIQUE INDEX categorias_nombre_ci_uq ON categorias (LOWER(nombre));
            CREATE UNIQUE INDEX una_caja_abierta_por_usuario ON cajas (usuario_id) WHERE estado = 'abierta';
            CREATE UNIQUE INDEX una_caja_abierta_por_estacion ON cajas (caja_fisica_id) WHERE estado = 'abierta';
            CREATE INDEX idx_mod_opc_grupo ON modificadores_opciones (grupo_id);
            CREATE INDEX idx_det_mov_mod ON detalle_movimientos_modificadores (detalle_movimiento_id);
            CREATE INDEX idx_combo_comp_combo ON combo_componentes (combo_producto_id);
            CREATE INDEX idx_combo_comp_prod ON combo_componentes (componente_producto_id);
            CREATE INDEX idx_det_mov_combos ON detalle_movimientos_combos (detalle_movimiento_id);
            CREATE INDEX idx_movimientos_cat ON movimientos (categoria_contable);
            CREATE INDEX idx_mov_pagos_movimiento ON movimientos_pagos (movimiento_id);
            CREATE INDEX idx_mov_prod_dir_prod ON movimientos_productos_directos (producto_id);
            CREATE INDEX idx_mov_prod_dir_mov ON movimientos_productos_directos (movimiento_id);
            CREATE INDEX idx_movimientos_insumos_insumo_id ON movimientos_insumos (insumo_id);
            CREATE INDEX idx_movimientos_insumos_movimiento_id ON movimientos_insumos (movimiento_id);
            CREATE INDEX idx_producto_lotes_fecha_vencimiento ON producto_lotes (fecha_vencimiento);
        `
    },
    {
        version: 3,
        sql: `
            ALTER TABLE configuracion_negocio
                ADD COLUMN IF NOT EXISTS nombre_corto TEXT DEFAULT '',
                ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '',
                ADD COLUMN IF NOT EXISTS color_primario TEXT NOT NULL DEFAULT '#0284C7',
                ADD COLUMN IF NOT EXISTS color_secundario TEXT NOT NULL DEFAULT '#0F172A',
                ADD COLUMN IF NOT EXISTS tema_visual TEXT NOT NULL DEFAULT 'claro';

            ALTER TABLE configuracion_negocio
                DROP CONSTRAINT IF EXISTS configuracion_negocio_color_primario_ck,
                DROP CONSTRAINT IF EXISTS configuracion_negocio_color_secundario_ck,
                DROP CONSTRAINT IF EXISTS configuracion_negocio_tema_visual_ck;

            ALTER TABLE configuracion_negocio
                ADD CONSTRAINT configuracion_negocio_color_primario_ck
                    CHECK (color_primario ~ '^#[0-9A-Fa-f]{6}$'),
                ADD CONSTRAINT configuracion_negocio_color_secundario_ck
                    CHECK (color_secundario ~ '^#[0-9A-Fa-f]{6}$'),
                ADD CONSTRAINT configuracion_negocio_tema_visual_ck
                    CHECK (tema_visual IN ('claro', 'oscuro', 'sistema'));
        `
    }
];

async function ejecutarMigracionesEnPool(pool, inicializar) {
    return enTransaccionPostgres(pool, async (client) => {
        // Serializa tanto la creación del historial como su lectura y actualización.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':migraciones-tenant', 0))");
        await client.query(`
            SET LOCAL TIME ZONE 'UTC';
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY CHECK (version > 0),
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const { rows: aplicadas } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
        if (aplicadas.some(({ version }, indice) => version !== migraciones[indice]?.version)) {
            throw new Error('El historial de migraciones del tenant no coincide con esta versión de la aplicación.');
        }

        for (const { version, sql } of migraciones.slice(aplicadas.length)) {
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        }
        if (inicializar) await inicializar(client);
        return migraciones.at(-1).version;
    });
}

async function ejecutarMigracionesTenant(databaseUrl = process.env.TENANT_DATABASE_URL) {
    return ejecutarMigracionesEnPool(obtenerPool(databaseUrl, { max: 2 }));
}

async function ejecutarMigracionesTenantRegistrado(tenant) {
    if (!tenant || !tenant.tenant_id) throw new Error('Tenant inválido para migración.');
    return ejecutarMigracionesEnPool(await obtenerPoolTenant(tenant));
}

if (require.main === module) {
    ejecutarMigracionesTenant()
        .finally(cerrarPoolsPostgres)
        .then((version) => console.log(`Migraciones del tenant completadas (versión ${version}).`))
        .catch(() => {
            console.error('No se pudieron completar las migraciones del tenant.');
            process.exitCode = 1;
        });
}

module.exports = {
    ejecutarMigracionesTenant,
    ejecutarMigracionesTenantRegistrado,
    ejecutarMigracionesEnPool
};
