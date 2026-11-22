/**
 * Esquema mínimo del control plane. Las bases operativas de cada negocio se
 * migrarán por separado y nunca dentro de esta misma transacción.
 */
const { obtenerPool, cerrarPoolsPostgres, enTransaccionPostgres } = require('./postgres');

async function ejecutarMigracionesControl() {
    const pool = obtenerPool(process.env.CONTROL_DATABASE_URL, { max: 2 });
    await enTransaccionPostgres(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':migraciones-control', 0))");
        await client.query(`
            CREATE TABLE IF NOT EXISTS control_tenants (
                tenant_id UUID PRIMARY KEY,
                nombre TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                database_name TEXT NOT NULL,
                database_secret_ref TEXT,
                plan TEXT NOT NULL DEFAULT 'standard',
                estado TEXT NOT NULL DEFAULT 'activo'
                    CHECK (estado IN ('activo', 'suspendido', 'migrando', 'error', 'archivado')),
                schema_version INTEGER NOT NULL DEFAULT 0,
                ultimo_backup_exitoso TIMESTAMPTZ,
                ultimo_error_provisionamiento TEXT,
                provisionamiento_iniciado_en TIMESTAMPTZ,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE control_tenants ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE control_tenants ADD COLUMN IF NOT EXISTS ultimo_error_provisionamiento TEXT;
            ALTER TABLE control_tenants ADD COLUMN IF NOT EXISTS provisionamiento_iniciado_en TIMESTAMPTZ;

            ALTER TABLE control_tenants DROP CONSTRAINT IF EXISTS control_tenants_estado_check;
            ALTER TABLE control_tenants ADD CONSTRAINT control_tenants_estado_check
                CHECK (estado IN ('activo', 'suspendido', 'migrando', 'error', 'archivado'));

            CREATE INDEX IF NOT EXISTS control_tenants_estado_idx
                ON control_tenants (estado);
        `);
    });
}

if (require.main === module) {
    ejecutarMigracionesControl()
        .finally(cerrarPoolsPostgres)
        .then(() => console.log('Migraciones del control plane completadas.'))
        .catch(() => {
            console.error('No se pudieron completar las migraciones del control plane.');
            process.exitCode = 1;
        });
}

module.exports = { ejecutarMigracionesControl };
