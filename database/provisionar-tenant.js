const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { obtenerPool, cerrarPoolsPostgres } = require('./postgres');
const { ejecutarMigracionesEnPool } = require('./migraciones-tenant');
const { obtenerPoolTenant, validarSlug } = require('../server/tenancy/tenant-registry');
const { motivoPasswordDeveloperInvalida } = require('../server/lib/secretos');

const BCRYPT_ROUNDS = 10;

class ErrorAprovisionamiento extends Error {}

async function sincronizarDeveloper(client, tenantId, password, rotar = false) {
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

    const hashVigente = usuario && /^\$2[aby]\$\d{2}\$/.test(usuario.pin_o_password);
    const hash = (!usuario || rotar) ? await bcrypt.hash(password, BCRYPT_ROUNDS) : usuario.pin_o_password;
    if (!usuario) {
        await client.query(`
            INSERT INTO usuarios (tenant_id, nombre, nombre_usuario, pin_o_password, rol)
            VALUES ($1, 'developer', 'developer', $2, 'developer')
        `, [tenantId, hash]);
        return { cambiada: true };
    } else if (rotar || usuario.activo !== 1 || usuario.nombre_usuario !== 'developer' || !hashVigente) {
        await client.query(`
            UPDATE usuarios SET nombre_usuario = 'developer', pin_o_password = $2, activo = 1
            WHERE tenant_id = $1 AND id = $3
        `, [tenantId, hash, usuario.id]);
    }
    return { cambiada: Boolean(rotar || usuario.activo !== 1 || usuario.nombre_usuario !== 'developer' || !hashVigente) };
}

function generarPasswordDeveloper() {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    return Array.from(crypto.randomBytes(24), (byte) => alfabeto[byte % alfabeto.length]).join('');
}

async function provisionarTenant(slug, opciones = {}) {
    const slugNormalizado = validarSlug(slug);
    const passwordEntorno = String(process.env.DEVELOPER_PASSWORD || '').trim();
    const motivo = passwordEntorno ? motivoPasswordDeveloperInvalida(passwordEntorno) : null;
    if (motivo) throw new ErrorAprovisionamiento(motivo);
    const password = passwordEntorno || generarPasswordDeveloper();
    if (passwordEntorno) console.warn('Advertencia: DEVELOPER_PASSWORD está obsoleta; usa la credencial generada por tenant y un gestor de contraseñas.');

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

        let credenciales;
        const version = await ejecutarMigracionesEnPool(poolTenant, async (clientTenant) => {
            await clientTenant.query(`
                INSERT INTO configuracion_negocio (id, modalidad_nombre, configurado)
                VALUES (1, 'Venta Directa No Perecedera', 0)
                ON CONFLICT (id) DO NOTHING
            `);
            credenciales = await sincronizarDeveloper(clientTenant, tenant.tenant_id, password, Boolean(opciones.rotarDeveloper));
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
        return opciones.returnCredentials
            ? { version, password: credenciales?.cambiada ? password : null, generada: Boolean(credenciales?.cambiada && !passwordEntorno) }
            : version;
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
    const slug = process.argv[2];
    const rotarDeveloper = process.argv.includes('--rotar-developer');
    if (!slug) {
        console.error('Uso: npm run provision:tenant -- <slug> [--rotar-developer]');
        process.exitCode = 1;
    } else {
        provisionarTenant(slug, { rotarDeveloper, returnCredentials: true })
            .finally(cerrarPoolsPostgres)
            .then(({ version, password, generada }) => {
                if (generada || rotarDeveloper) {
                    console.log(`Contraseña developer para ${slug} (mostrar una sola vez): ${password}`);
                    console.warn('Advertencia: guárdala ahora en un gestor de contraseñas; no se volverá a mostrar ni se escribe en logs o archivos.');
                }
                console.log(`Tenant aprovisionado (versión ${version}).`);
            })
            .catch((error) => {
                console.error(error instanceof ErrorAprovisionamiento
                    ? error.message
                    : 'No se pudo aprovisionar el tenant.');
                process.exitCode = 1;
            });
    }
}

module.exports = { provisionarTenant };
