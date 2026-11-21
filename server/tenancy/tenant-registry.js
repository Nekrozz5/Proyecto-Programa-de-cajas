/**
 * Registro central de tenants.
 *
 * La URL de la base operativa no se guarda en el navegador ni se acepta desde
 * requests. En producción se resolverá mediante Secrets Manager usando
 * `database_secret_ref`; para desarrollo se permite un mapa explícito por env.
 */
const crypto = require('crypto');
const { obtenerPool } = require('../../database/postgres');

function obtenerPoolControl() {
    return obtenerPool(process.env.CONTROL_DATABASE_URL, { max: 5 });
}

function validarSlug(slug) {
    const valor = String(slug || '').trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(valor)) {
        throw new Error('El slug del negocio no es válido.');
    }
    return valor;
}

function obtenerTenantDatabaseUrl(tenant) {
    const mapaRaw = process.env.TENANT_DATABASE_URLS_JSON;
    if (mapaRaw) {
        let mapa;
        try {
            mapa = JSON.parse(mapaRaw);
        } catch {
            throw new Error('TENANT_DATABASE_URLS_JSON no contiene JSON válido.');
        }
        if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) {
            throw new Error('TENANT_DATABASE_URLS_JSON debe contener un mapa de conexiones.');
        }
        const clave = Object.hasOwn(mapa, tenant.tenant_id) ? tenant.tenant_id : tenant.slug;
        const url = Object.hasOwn(mapa, clave) ? mapa[clave] : null;
        if (typeof url === 'string' && url.trim()) return url;
    }

    throw new Error(`No hay resolver de conexión configurado para el tenant ${tenant.slug}.`);
}

async function crearTenant({ nombre, slug, databaseName, databaseSecretRef = null, plan = 'standard' }) {
    const tenantId = crypto.randomUUID();
    const slugNormalizado = validarSlug(slug);
    const pool = obtenerPoolControl();
    const { rows } = await pool.query(`
        INSERT INTO control_tenants
            (tenant_id, nombre, slug, database_name, database_secret_ref, plan, estado)
        VALUES ($1, $2, $3, $4, $5, $6, 'activo')
        RETURNING *
    `, [tenantId, String(nombre || '').trim(), slugNormalizado, databaseName, databaseSecretRef, plan]);
    return rows[0];
}

async function obtenerTenantPorId(tenantId) {
    const pool = obtenerPoolControl();
    const { rows } = await pool.query(
        'SELECT * FROM control_tenants WHERE tenant_id = $1 AND estado = $2',
        [tenantId, 'activo']
    );
    return rows[0] || null;
}

async function obtenerTenantPorSlug(slug) {
    const pool = obtenerPoolControl();
    const { rows } = await pool.query(
        'SELECT * FROM control_tenants WHERE slug = $1 AND estado = $2',
        [validarSlug(slug), 'activo']
    );
    return rows[0] || null;
}

async function obtenerPoolTenant(tenant) {
    if (!tenant || !tenant.tenant_id) throw new Error('Contexto de tenant requerido.');
    return obtenerPool(obtenerTenantDatabaseUrl(tenant));
}

module.exports = {
    crearTenant,
    obtenerTenantPorId,
    obtenerTenantPorSlug,
    obtenerPoolTenant,
    validarSlug
};
