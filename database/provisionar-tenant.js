const bcrypt = require('bcryptjs');
const { obtenerPool, cerrarPoolsPostgres } = require('./postgres');
const { ejecutarMigracionesEnPool } = require('./migraciones-tenant');
const { obtenerPoolTenant, validarSlug } = require('../server/tenancy/tenant-registry');
const { motivoPasswordDeveloperInvalida } = require('../server/lib/secretos');

const BCRYPT_ROUNDS = 10;

class ErrorAprovisionamiento extends Error {}

async function sincronizarDeveloper(client, tenantId, password) {
    const { rows } = await client.query(`
        SELECT id, rol, activo, nombre_usuario, pin_o_password
        FROM usuarios
        WHERE tenant_id = $1 AND (LOWER(nombre_usuario) = 'developer' OR rol = 'developer')
        FOR UPDATE
    `, [tenantId]);
    const [usuario] = rows;
    if (rows.length > 1 || (usuario && usuario.rol !== 'developer')) {
        throw new ErrorAprovisionamiento('La cuenta developer entra en conflicto con usuarios existentes del tenant.');
    }

    const hashVigente = usuario && bcrypt.getRounds(usuario.pin_o_password) >= BCRYPT_ROUNDS
        && await bcrypt.compare(password, usuario.pin_o_password);
    const hash = hashVigente ? usuario.pin_o_password : await bcrypt.hash(password, BCRYPT_ROUNDS);
    if (!usuario) {
        await client.query(`
            INSERT INTO usuarios (tenant_id, nombre, nombre_usuario, pin_o_password, rol)
            VALUES ($1, 'developer', 'developer', $2, 'developer')
        `, [tenantId, hash]);
    } else if (!hashVigente || usuario.activo !== 1 || usuario.nombre_usuario !== 'developer') {
        await client.query(`
            UPDATE usuarios SET nombre_usuario = 'developer', pin_o_password = $2, activo = 1
            WHERE tenant_id = $1 AND id = $3
        `, [tenantId, hash, usuario.id]);
    }
}

async function provisionarTenant(slug) {
    const slugNormalizado = validarSlug(slug);
    const password = String(process.env.DEVELOPER_PASSWORD || '').trim();
    const motivo = motivoPasswordDeveloperInvalida(password);
    if (!password || motivo) {
        throw new ErrorAprovisionamiento(motivo || 'DEVELOPER_PASSWORD es obligatoria para aprovisionar el tenant.');
    }

    const control = obtenerPool(process.env.CONTROL_DATABASE_URL);
    const clientControl = await control.connect();
    let tenant;
    const claveBloqueo = `provisionar-tenant:${slugNormalizado}`;

    try {
        await clientControl.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [claveBloqueo]);
        await clientControl.query('BEGIN');
        try {
            const { rows: [encontrado] } = await clientControl.query(`
                SELECT tenant_id, slug, database_name, database_secret_ref FROM control_tenants
                WHERE slug = $1 AND estado IN ('activo', 'error')
                FOR UPDATE
            `, [slugNormalizado]);
            if (!encontrado) {
                throw new ErrorAprovisionamiento('El tenant debe estar registrado y activo o en estado de error en control_tenants.');
            }

            await clientControl.query(`
                UPDATE control_tenants
                SET estado = 'migrando',
                    ultimo_error_provisionamiento = NULL,
                    provisionamiento_iniciado_en = CURRENT_TIMESTAMP
                WHERE tenant_id = $1
            `, [encontrado.tenant_id]);
            tenant = encontrado;
            await clientControl.query('COMMIT');
        } catch (error) {
            await clientControl.query('ROLLBACK').catch(() => {});
            throw error;
        }

        const poolTenant = await obtenerPoolTenant(tenant);
        if (poolTenant === control) {
            throw new ErrorAprovisionamiento('El tenant requiere una base operativa separada del control plane.');
        }
        const { rows: [{ coincide }] } = await poolTenant.query(
            'SELECT current_database() = $1 AS coincide', [tenant.database_name]
        );
        if (!coincide) throw new ErrorAprovisionamiento('La base operativa no coincide con el registro del tenant.');

        const version = await ejecutarMigracionesEnPool(poolTenant, async (clientTenant) => {
            await clientTenant.query(`
                INSERT INTO configuracion_negocio (id, modalidad_nombre, configurado)
                VALUES (1, 'Venta Directa No Perecedera', 0)
                ON CONFLICT (id) DO NOTHING
            `);
            await sincronizarDeveloper(clientTenant, tenant.tenant_id, password);
        });

        await clientControl.query(`
            UPDATE control_tenants
            SET schema_version = $2,
                estado = 'activo',
                ultimo_error_provisionamiento = NULL,
                actualizado_en = CASE
                    WHEN schema_version IS DISTINCT FROM $2 THEN CURRENT_TIMESTAMP
                    ELSE actualizado_en
                END
            WHERE tenant_id = $1
        `, [tenant.tenant_id, version]);
        return version;
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : 'Error desconocido de aprovisionamiento.';
        if (tenant) {
            await clientControl.query(`
                UPDATE control_tenants
                SET estado = 'error',
                    ultimo_error_provisionamiento = $2,
                    actualizado_en = CURRENT_TIMESTAMP
                WHERE tenant_id = $1
            `, [tenant.tenant_id, mensaje]).catch(() => {});
        }
        throw error;
    } finally {
        await clientControl.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [claveBloqueo]).catch(() => {});
        clientControl.release();
    }
}

if (require.main === module) {
    if (process.argv.length !== 3) {
        console.error('Uso: npm run provision:tenant -- <slug>');
        process.exitCode = 1;
    } else {
        provisionarTenant(process.argv[2])
            .finally(cerrarPoolsPostgres)
            .then((version) => console.log(`Tenant aprovisionado (versión ${version}).`))
            .catch((error) => {
                console.error(error instanceof ErrorAprovisionamiento
                    ? error.message
                    : 'No se pudo aprovisionar el tenant.');
                process.exitCode = 1;
            });
    }
}

module.exports = { provisionarTenant };
