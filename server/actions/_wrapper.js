const { exigirUsuarioSesionAction } = require('../lib/sesion');
const { obtenerTenantPorId } = require('../tenancy/tenant-registry');
const { obtenerModoTenancy, ejecutarConContextoTenant } = require('../tenancy/tenant-context');

/**
 * Wrapper de ejecución segura para Server Actions.
 * - Valida la sesión del usuario y sus permisos de rol en el servidor mediante cookies HttpOnly.
 * - Ejecuta la lógica de negocio pasando el usuario autenticado.
 * - Captura excepciones y retorna invariablemente una estructura plana serializable para el cliente:
 *     { ok: true, data, error: null } | { ok: false, data: null, error, status }
 *
 * @param {Array<string>|null|Function} rolesPermitidos - Lista de roles permitidos (ej. ['admin', 'propietario']), null para cualquier usuario autenticado, o la función directamente si no se especifican roles.
 * @param {Function} [fn] - Función asíncrona de negocio `async (usuario) => resultado`
 * @returns {Promise<{ ok: true, data: any, error: null } | { ok: false, data: null, error: string, status: number }>}
 */
async function ejecutarAction(rolesPermitidos, fn) {
    let actionFn = fn;
    let roles = rolesPermitidos;

    // Soporte flexible si se invoca como ejecutarAction(fn) sin especificar roles
    if (typeof rolesPermitidos === 'function' && fn === undefined) {
        actionFn = rolesPermitidos;
        roles = null;
    }

    try {
        const usuario = await exigirUsuarioSesionAction(roles);
        let resultado;
        if (obtenerModoTenancy() === 'AWS_MULTI_TENANT') {
            const tenant = await obtenerTenantPorId(usuario.tenantId);
            if (!tenant) throw new Error('El negocio no existe o está inactivo.');
            resultado = await ejecutarConContextoTenant({
                modo: 'AWS_MULTI_TENANT',
                tenantId: usuario.tenantId,
                tenant
            }, () => actionFn(usuario));
        } else {
            resultado = await actionFn(usuario);
        }

        return {
            ok: true,
            success: true,
            data: resultado !== undefined ? resultado : null,
            error: null
        };
    } catch (err) {
        console.error('[ServerAction Error]:', err && err.message ? err.message : err);
        return {
            ok: false,
            success: false,
            data: null,
            error: (err && err.message) ? err.message : 'Error interno al procesar la operación.',
            status: (err && typeof err.status === 'number') ? err.status : 500
        };
    }
}

module.exports = {
    ejecutarAction,
    validarSesionAccion: ejecutarAction
};
