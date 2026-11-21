/**
 * Esquema mínimo del control plane. Las bases operativas de cada negocio se
 * migrarán por separado y nunca dentro de esta misma transacción.
 */
const { obtenerPool } = require('./postgres');

async function ejecutarMigracionesControl() {
    const pool = obtenerPool(process.env.CONTROL_DATABASE_URL, { max: 2 });
    await pool.query(`
        CREATE TABLE IF NOT EXISTS control_tenants (
            tenant_id UUID PRIMARY KEY,
            nombre TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            database_name TEXT NOT NULL,
            database_secret_ref TEXT,
            plan TEXT NOT NULL DEFAULT 'standard',
            estado TEXT NOT NULL DEFAULT 'activo'
                CHECK (estado IN ('activo', 'suspendido', 'migrando', 'archivado')),
            schema_version INTEGER NOT NULL DEFAULT 0,
            ultimo_backup_exitoso TIMESTAMPTZ,
            creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS control_tenants_estado_idx
            ON control_tenants (estado);
    `);
}

if (require.main === module) {
    ejecutarMigracionesControl()
        .then(() => console.log('Migraciones del control plane completadas.'))
        .catch((err) => {
            console.error('Error en migraciones del control plane:', err.message);
            process.exitCode = 1;
        });
}

module.exports = { ejecutarMigracionesControl };
