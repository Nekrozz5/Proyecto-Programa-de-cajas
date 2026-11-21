/**
 * Esquema operativo completo de una base PostgreSQL de tenant.
 * Cada negocio ejecuta esta migración sobre su propia base; no mezcla datos.
 */
const { obtenerPool } = require('./postgres');
const { obtenerPoolTenant } = require('../server/tenancy/tenant-registry');

async function ejecutarMigracionesEnPool(pool) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query(`
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
        `);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
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
        .then(() => console.log('Migraciones completas del tenant ejecutadas.'))
        .catch((err) => {
            console.error('Error en migraciones del tenant:', err.message);
            process.exitCode = 1;
        });
}

module.exports = {
    ejecutarMigracionesTenant,
    ejecutarMigracionesTenantRegistrado,
    ejecutarMigracionesEnPool
};
