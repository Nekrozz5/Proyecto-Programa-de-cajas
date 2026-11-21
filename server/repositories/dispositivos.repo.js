const { getQuery, allQuery, enTransaccion } = require('./db');
const { obtenerContextoTenantActual } = require('../tenancy/tenant-context');

const UUID_TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolverTenant(tenantId) {
    const contexto = obtenerContextoTenantActual();
    const tenant = contexto?.tenantId;
    if (!UUID_TENANT.test(tenant) || (tenantId != null && tenantId !== tenant)) {
        throw new Error('Contexto de tenant inválido o ausente.');
    }
    return tenant;
}

function validarClavePublica(clavePublica) {
    const valor = String(clavePublica || '').trim();
    if (valor.length < 32 || valor.length > 4096) {
        throw new Error('La clave pública del dispositivo no tiene un formato válido.');
    }
    if (/private\s*key|privatekey/i.test(valor)) {
        throw new Error('Solo se permite registrar la clave pública del dispositivo.');
    }
    return valor;
}

function validarNombre(nombre) {
    const valor = String(nombre || '').trim();
    if (!valor || valor.length > 120) throw new Error('El nombre de la terminal es obligatorio.');
    return valor;
}

async function emparejarDispositivo({ tenantId, administradorId, nombre, clavePublica }) {
    const tenant = resolverTenant(tenantId);
    const adminId = Number(administradorId);
    const nombreValido = validarNombre(nombre);
    const claveValida = validarClavePublica(clavePublica);

    if (!Number.isSafeInteger(adminId) || adminId <= 0) throw new Error('Administrador inválido.');

    return enTransaccion(async () => {
        const administrador = await getQuery(`
            SELECT id, tenant_id, rol, activo
            FROM usuarios
            WHERE tenant_id = $1 AND id = $2 AND activo = 1
            LIMIT 1
        `, [tenant, adminId]);
        if (!administrador || !['admin', 'propietario', 'developer'].includes(administrador.rol)) {
            throw new Error('El administrador no existe, está inactivo o no tiene permisos.');
        }

        const pendiente = await getQuery(`
            INSERT INTO dispositivos_pos
                (tenant_id, nombre, clave_publica, estado, creado_por)
            VALUES ($1, $2, $3, 'pendiente', $4)
            ON CONFLICT (tenant_id, clave_publica) DO NOTHING
            RETURNING id
        `, [tenant, nombreValido, claveValida, adminId]);
        if (!pendiente) throw new Error('La clave pública ya está registrada en este tenant.');

        const activo = await getQuery(`
            UPDATE dispositivos_pos
            SET estado = 'activo'
            WHERE id = $1 AND tenant_id = $2 AND estado = 'pendiente'
            RETURNING id, tenant_id, nombre, clave_publica, estado, creado_en
        `, [pendiente.id, tenant]);
        if (!activo || activo.estado !== 'activo') {
            throw new Error('La terminal no pudo alcanzar el estado activo.');
        }

        return {
            id: activo.id,
            tenantId: activo.tenant_id,
            nombre: activo.nombre,
            clavePublica: activo.clave_publica,
            estado: activo.estado,
            creadoEn: activo.creado_en
        };
    });
}

async function obtenerEstadoDispositivo({ tenantId, clavePublica }) {
    const tenant = resolverTenant(tenantId);
    const clave = validarClavePublica(clavePublica);
    const dispositivo = await getQuery(`
        SELECT id, tenant_id, nombre, clave_publica, estado, creado_en, ultimo_acceso
        FROM dispositivos_pos
        WHERE tenant_id = $1 AND clave_publica = $2
        LIMIT 1
    `, [tenant, clave]);
    if (!dispositivo) return null;
    return {
        id: dispositivo.id,
        tenantId: dispositivo.tenant_id,
        nombre: dispositivo.nombre,
        clavePublica: dispositivo.clave_publica,
        estado: dispositivo.estado,
        creadoEn: dispositivo.creado_en,
        ultimoAcceso: dispositivo.ultimo_acceso
    };
}

async function listarDispositivos({ tenantId } = {}) {
    const tenant = resolverTenant(tenantId);
    const dispositivos = await allQuery(`
        SELECT id, tenant_id, nombre, estado, creado_en, ultimo_acceso, revocado_en
        FROM dispositivos_pos
        WHERE tenant_id = $1
        ORDER BY CASE estado WHEN 'activo' THEN 1 WHEN 'pendiente' THEN 2 ELSE 3 END, LOWER(nombre) ASC, id ASC
    `, [tenant]);
    return dispositivos.map((dispositivo) => ({
        id: dispositivo.id,
        tenantId: dispositivo.tenant_id,
        nombre: dispositivo.nombre,
        estado: dispositivo.estado,
        creadoEn: dispositivo.creado_en,
        ultimoAcceso: dispositivo.ultimo_acceso,
        revocadoEn: dispositivo.revocado_en
    }));
}

async function revocarDispositivo({ tenantId, dispositivoId, administradorId }) {
    const tenant = resolverTenant(tenantId);
    const id = Number(dispositivoId);
    const adminId = Number(administradorId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Dispositivo inválido.');
    if (!Number.isSafeInteger(adminId) || adminId <= 0) throw new Error('Administrador inválido.');

    return enTransaccion(async () => {
        const administrador = await getQuery(`
            SELECT id, rol, activo FROM usuarios
            WHERE tenant_id = $1 AND id = $2 AND activo = 1 LIMIT 1
        `, [tenant, adminId]);
        if (!administrador || !['admin', 'propietario', 'developer'].includes(administrador.rol)) {
            throw new Error('El administrador no existe, está inactivo o no tiene permisos.');
        }

        const revocado = await getQuery(`
            UPDATE dispositivos_pos
            SET estado = 'revocado', revocado_en = CURRENT_TIMESTAMP
            WHERE tenant_id = $1 AND id = $2 AND estado <> 'revocado'
            RETURNING id, nombre, estado, revocado_en
        `, [tenant, id]);
        if (!revocado) throw new Error('La terminal no existe o ya fue revocada.');
        return revocado;
    });
}

module.exports = {
    emparejarDispositivo,
    obtenerEstadoDispositivo,
    listarDispositivos,
    revocarDispositivo,
    validarClavePublica
};
