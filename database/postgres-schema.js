/**
 * Esquema PostgreSQL inicial para las bases operativas de los tenants.
 * Esta fase define únicamente identidad; el resto del POS se migrará después.
 */
const {
    pgTable,
    serial,
    uuid,
    text,
    timestamp,
    integer,
    uniqueIndex,
    index,
    check
} = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');

const usuarios = pgTable('usuarios', {
    id: serial('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    // `nombre` conserva compatibilidad con los repositorios POS existentes.
    nombre: text('nombre').notNull(),
    nombreUsuario: text('nombre_usuario').notNull(),
    pinOPassword: text('pin_o_password').notNull(),
    rol: text('rol').notNull(),
    activo: integer('activo').notNull().default(1),
    puedeRegistrarRespaldoFiscal: integer('puede_registrar_respaldo_fiscal').notNull().default(1)
}, (tabla) => ({
    usuarioTenantNombreUnico: uniqueIndex('usuarios_tenant_nombre_usuario_uq')
        .on(tabla.tenantId, tabla.nombreUsuario),
    usuarioTenantIdUnico: uniqueIndex('usuarios_tenant_id_id_uq')
        .on(tabla.tenantId, tabla.id)
}));

const dispositivosPos = pgTable('dispositivos_pos', {
    id: serial('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    nombre: text('nombre').notNull(),
    clavePublica: text('clave_publica').notNull(),
    estado: text('estado').notNull().default('pendiente'),
    creadoPor: integer('creado_por').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    ultimoAcceso: timestamp('ultimo_acceso', { withTimezone: true }),
    revocadoEn: timestamp('revocado_en', { withTimezone: true })
}, (tabla) => ({
    dispositivoTenantClaveUnico: uniqueIndex('dispositivos_pos_tenant_clave_uq')
        .on(tabla.tenantId, tabla.clavePublica),
    dispositivoTenantEstadoIdx: index('dispositivos_pos_tenant_estado_idx')
        .on(tabla.tenantId, tabla.estado),
    dispositivoEstadoValido: check(
        'dispositivos_pos_estado_ck',
        sql`${tabla.estado} IN ('pendiente', 'activo', 'revocado')`
    ),
    dispositivoRevocacionCoherente: check(
        'dispositivos_pos_revocacion_ck',
        sql`(
            (${tabla.estado} = 'revocado' AND ${tabla.revocadoEn} IS NOT NULL)
            OR (${tabla.estado} <> 'revocado' AND ${tabla.revocadoEn} IS NULL)
        )`
    )
}));

module.exports = { usuarios, dispositivosPos };
