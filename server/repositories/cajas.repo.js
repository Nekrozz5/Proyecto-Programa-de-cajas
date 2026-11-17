/**
 * server/repositories/cajas.repo.js
 * Repositorio para estaciones de caja físicas, turnos de operación, arqueo ciego,
 * reaperturas auditadas y métricas de cierre de caja.
 * Respeta reglas de 'localtime', transacciones y consultas parametrizadas.
 */

const { runQuery, getQuery, allQuery, enTransaccion, redondear2, numeroNoNegativo } = require('./db');
const { obtenerUsuarioPorId, esRolAdministrativo } = require('./auth.repo');
const { obtenerConfiguracionNegocio } = require('./configuracion.repo');

// ==========================================
// ESTACIONES DE CAJA FÍSICA
// ==========================================

async function obtenerCajasFisicas(soloActivas = false) {
    return await allQuery(
        `SELECT cf.*,
                (SELECT c.id FROM cajas c WHERE c.caja_fisica_id = cf.id AND c.estado = 'abierta' LIMIT 1) as turno_abierto_id,
                (SELECT u.nombre FROM cajas c LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.caja_fisica_id = cf.id AND c.estado = 'abierta' LIMIT 1) as operador_abierto
         FROM cajas_fisicas cf
         ${soloActivas ? 'WHERE cf.activa = 1' : ''}
         ORDER BY cf.id ASC`
    );
}

async function crearCajaFisica(nombre, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede registrar estaciones de caja.');
    }
    const nombreLimpio = String(nombre || '').trim();
    if (!nombreLimpio || nombreLimpio.length < 2) {
        throw new Error('Debes ingresar un nombre válido para la caja física (mínimo 2 caracteres).');
    }
    const existente = await getQuery(`SELECT id FROM cajas_fisicas WHERE LOWER(nombre) = LOWER(?)`, [nombreLimpio]);
    if (existente) {
        throw new Error(`Ya existe una caja física registrada con el nombre "${nombreLimpio}".`);
    }
    const res = await runQuery(`INSERT INTO cajas_fisicas (nombre, activa) VALUES (?, 1)`, [nombreLimpio]);
    return res.lastID;
}

async function desactivarCajaFisica(cajaFisicaId, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede desactivar estaciones de caja.');
    }
    const idNum = Number(cajaFisicaId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
        throw new Error('ID de caja física inválido.');
    }
    const caja = await getQuery(`SELECT * FROM cajas_fisicas WHERE id = ?`, [idNum]);
    if (!caja) {
        throw new Error('La caja física indicada no existe.');
    }
    if (Number(caja.activa) === 0) {
        throw new Error('Esta caja física ya se encuentra inactiva.');
    }

    // Regla obligatoria: Mínimo 1 caja física activa en el sistema
    const conteoActivas = await getQuery(`SELECT COUNT(*) as total FROM cajas_fisicas WHERE activa = 1`);
    if (!conteoActivas || Number(conteoActivas.total) <= 1) {
        throw new Error('Operación denegada: El sistema debe mantener al menos una caja física activa disponible.');
    }

    // Validar que no tenga turno abierto en curso
    const turnoAbierto = await getQuery(
        `SELECT id FROM cajas WHERE caja_fisica_id = ? AND estado = 'abierta'`,
        [idNum]
    );
    if (turnoAbierto) {
        throw new Error(`No puedes desactivar "${caja.nombre}" porque tiene el Turno #${turnoAbierto.id} actualmente abierto. Debes cerrarlo primero.`);
    }

    await runQuery(`UPDATE cajas_fisicas SET activa = 0 WHERE id = ?`, [idNum]);
    return true;
}

async function reactivarCajaFisica(cajaFisicaId, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede reactivar estaciones de caja.');
    }
    const idNum = Number(cajaFisicaId);
    await runQuery(`UPDATE cajas_fisicas SET activa = 1 WHERE id = ?`, [idNum]);
    return true;
}

async function actualizarPermisoFiscalCajaFisica(cajaFisicaId, habilitado, adminId) {
    const ejecutor = await obtenerUsuarioPorId(adminId);
    if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
        throw new Error('Permiso denegado: solo un Administrador puede modificar las opciones fiscales de una estación.');
    }
    const idNum = Number(cajaFisicaId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
        throw new Error('ID de caja física inválido.');
    }
    await runQuery(`UPDATE cajas_fisicas SET habilita_respaldo_fiscal = ? WHERE id = ?`, [habilitado ? 1 : 0, idNum]);
    return true;
}

// ==========================================
// APERTURA DE TURNOS, MULTICAJA Y REAPERTURAS
// ==========================================

async function obtenerCajasAbiertas() {
    return await allQuery(
        `SELECT c.*,
                datetime(c.fecha_apertura, 'localtime') as fecha_apertura,
                datetime(c.fecha_cierre, 'localtime') as fecha_cierre,
                cf.nombre as caja_fisica_nombre,
                COALESCE(cf.habilita_respaldo_fiscal, 1) as habilita_respaldo_fiscal,
                u.nombre as usuario_nombre,
                u.rol as usuario_rol
         FROM cajas c
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         WHERE c.estado = 'abierta'
         ORDER BY c.id ASC`
    );
}

async function obtenerCajaAbierta(usuarioId = null, cajaFisicaId = null) {
    let sql = `
        SELECT c.*,
               datetime(c.fecha_apertura, 'localtime') as fecha_apertura,
               datetime(c.fecha_cierre, 'localtime') as fecha_cierre,
               cf.nombre as caja_fisica_nombre,
               COALESCE(cf.habilita_respaldo_fiscal, 1) as habilita_respaldo_fiscal,
               u.nombre as usuario_nombre,
               u.rol as usuario_rol
        FROM cajas c
        LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.estado = 'abierta'
    `;
    const params = [];
    if (cajaFisicaId) {
        sql += ` AND c.caja_fisica_id = ?`;
        params.push(cajaFisicaId);
    } else if (usuarioId) {
        sql += ` AND c.usuario_id = ?`;
        params.push(usuarioId);
    }
    sql += ` ORDER BY c.id DESC LIMIT 1`;
    return await getQuery(sql, params);
}

async function obtenerHistorialCajas(cajaFisicaId = null) {
    let sql = `
        SELECT c.*,
               datetime(c.fecha_apertura, 'localtime') as fecha_apertura,
               datetime(c.fecha_cierre, 'localtime') as fecha_cierre,
               cf.nombre as caja_fisica_nombre,
               COALESCE(cf.habilita_respaldo_fiscal, 1) as habilita_respaldo_fiscal,
               u.nombre as usuario_nombre,
               u.rol as usuario_rol
        FROM cajas c
        LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
        LEFT JOIN usuarios u ON c.usuario_id = u.id
    `;
    const params = [];
    if (cajaFisicaId) {
        sql += ` WHERE c.caja_fisica_id = ?`;
        params.push(cajaFisicaId);
    }
    sql += ` ORDER BY c.id DESC`;
    return await allQuery(sql, params);
}

async function abrirCaja(usuarioId, montoInicial, cajaFisicaId = null) {
    const montoInicialValidado = redondear2(numeroNoNegativo(montoInicial, 'El monto inicial'));

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que abre la caja es obligatorio.');
    }

    return await enTransaccion(async () => {
        const usuario = await obtenerUsuarioPorId(usuarioId);
        if (!usuario) {
            throw new Error('Usuario no válido o inactivo.');
        }

        // Resolver caja física asignada
        let cajaFisica = null;
        if (cajaFisicaId) {
            cajaFisica = await getQuery(`SELECT * FROM cajas_fisicas WHERE id = ? AND activa = 1`, [cajaFisicaId]);
            if (!cajaFisica) {
                throw new Error('La caja física seleccionada no existe o está inactiva.');
            }
        } else {
            cajaFisica = await getQuery(`SELECT * FROM cajas_fisicas WHERE activa = 1 ORDER BY id ASC LIMIT 1`);
            if (!cajaFisica) {
                throw new Error('No hay ninguna caja física activa en el sistema para abrir turno.');
            }
        }

        // Validar que la estación física no tenga ya un turno abierto
        const turnoAbiertoEstacion = await getQuery(
            `SELECT c.id, u.nombre as operador
             FROM cajas c
             LEFT JOIN usuarios u ON c.usuario_id = u.id
             WHERE c.caja_fisica_id = ? AND c.estado = 'abierta'`,
            [cajaFisica.id]
        );
        if (turnoAbiertoEstacion) {
            throw new Error(
                `La ${cajaFisica.nombre} ya tiene un turno abierto (Turno #${turnoAbiertoEstacion.id} a cargo de ${turnoAbiertoEstacion.operador || 'otro cajero'}). Debe cerrarse antes de iniciar uno nuevo en esta misma estación.`
            );
        }

        // Validar que el usuario no tenga otro turno abierto en otra caja simultáneamente
        const turnoAbiertoUsuario = await getQuery(
            `SELECT c.id, cf.nombre as caja_nombre
             FROM cajas c
             LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
             WHERE c.usuario_id = ? AND c.estado = 'abierta'`,
            [usuario.id]
        );
        if (turnoAbiertoUsuario) {
            throw new Error(
                `El usuario ${usuario.nombre} ya tiene activo el Turno #${turnoAbiertoUsuario.id} en ${turnoAbiertoUsuario.caja_nombre || 'otra caja'}. Debe cerrar su turno anterior antes de abrir uno nuevo.`
            );
        }

        const res = await runQuery(
            `INSERT INTO cajas (caja_fisica_id, usuario_id, monto_inicial, estado) VALUES (?, ?, ?, 'abierta')`,
            [cajaFisica.id, usuario.id, montoInicialValidado]
        );
        return res.lastID;
    });
}

async function reabrirCajaConPermiso(adminId, cajaId, motivo = 'Revisión administrativa') {
    if (!motivo || String(motivo).trim() === '') {
        throw new Error('Debes indicar el motivo de la reapertura de caja.');
    }

    return await enTransaccion(async () => {
        const ejecutor = await obtenerUsuarioPorId(adminId);
        if (!ejecutor || !esRolAdministrativo(ejecutor.rol)) {
            throw new Error('Permiso denegado: solo el Administrador puede reabrir un turno cerrado.');
        }

        const caja = await getQuery(`SELECT * FROM cajas WHERE id = ?`, [cajaId]);
        if (!caja) throw new Error('Turno de caja no encontrado.');
        if (caja.estado === 'abierta') {
            throw new Error(`El Turno #${cajaId} ya se encuentra abierto.`);
        }

        // Verificar si la caja física correspondiente ya tiene otro turno abierto
        const turnoAbierto = await getQuery(
            `SELECT c.id, cf.nombre as caja_nombre
             FROM cajas c
             LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
             WHERE c.caja_fisica_id = ? AND c.estado = 'abierta'`,
            [caja.caja_fisica_id]
        );
        if (turnoAbierto) {
            throw new Error(
                `No se puede reabrir el Turno #${cajaId}: la estación "${turnoAbierto.caja_nombre || 'Caja'}" ya tiene el Turno #${turnoAbierto.id} abierto actualmente.`
            );
        }

        // Verificar que el cajero titular del turno no tenga otro turno abierto en otra estación
        const turnoAbiertoTitular = await getQuery(
            `SELECT c.id, cf.nombre as caja_nombre
             FROM cajas c
             LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
             WHERE c.usuario_id = ? AND c.estado = 'abierta'`,
            [caja.usuario_id]
        );
        if (turnoAbiertoTitular) {
            throw new Error(
                `No se puede reabrir el Turno #${cajaId}: su operador titular ya tiene abierto el Turno #${turnoAbiertoTitular.id} en "${turnoAbiertoTitular.caja_nombre || 'otra estación'}".`
            );
        }

        const numReapertura = (Number(caja.veces_reabierta) || 0) + 1;
        const notaPrevia = `Reapertura #${numReapertura} por ${ejecutor.nombre} (${String(motivo).trim()}) — Arqueo previo: Esperado Bs ${Number(caja.efectivo_esperado || 0).toFixed(2)}, Real Bs ${Number(caja.efectivo_real || 0).toFixed(2)}, Dif: Bs ${Number(caja.diferencia_efectivo || 0).toFixed(2)}`;
        const nuevoHistorial = caja.historial_reaperturas
            ? `${caja.historial_reaperturas} | ${notaPrevia}`
            : notaPrevia;

        await runQuery(
            `UPDATE cajas
             SET estado = 'abierta',
                 veces_reabierta = ?,
                 historial_reaperturas = ?,
                 efectivo_esperado = NULL,
                 efectivo_real = NULL,
                 diferencia_efectivo = NULL,
                 qr_esperado = 0,
                 qr_real = NULL,
                 diferencia_qr = NULL,
                 fecha_cierre = NULL
             WHERE id = ?`,
            [numReapertura, nuevoHistorial, cajaId]
        );
        return true;
    });
}

// ==========================================
// ARQUEO CIEGO Y CIERRE DE CAJA
// ==========================================

async function cerrarCaja(cajaId, efectivoRealFisico, usuarioId = null, qrRealConciliado = null, observacionesCierre = '') {
    const efectivoRealValidado = redondear2(numeroNoNegativo(efectivoRealFisico, 'El efectivo real físico'));
    const tieneQrReal = qrRealConciliado !== null && qrRealConciliado !== undefined && qrRealConciliado !== '';
    const qrRealValidado = tieneQrReal ? redondear2(numeroNoNegativo(qrRealConciliado, 'El monto QR conciliado')) : null;

    if (usuarioId === null || usuarioId === undefined || usuarioId === '') {
        throw new Error('El usuario que cierra la caja es obligatorio.');
    }

    return await enTransaccion(async () => {
        const ejecutor = await obtenerUsuarioPorId(usuarioId);
        if (!ejecutor) {
            throw new Error('El usuario que intenta cerrar la caja no existe o está inactivo.');
        }

        const caja = await getQuery(`SELECT * FROM cajas WHERE id = ?`, [cajaId]);
        if (!caja) throw new Error('Caja no encontrada.');
        if (caja.estado !== 'abierta') throw new Error('Esta caja ya fue cerrada.');

        if (Number(caja.usuario_id) !== Number(ejecutor.id) && !esRolAdministrativo(ejecutor.rol)) {
            throw new Error('Permiso denegado: solo el cajero titular de la caja o un Administrador puede cerrarla.');
        }

        // Fuente de verdad del dinero: tabla movimientos_pagos vinculada a movimientos completados
        const resumen = await allQuery(
            `SELECT
                m.tipo,
                COALESCE(m.categoria_contable, CASE WHEN m.tipo = 'egreso' THEN 'gasto_operativo' ELSE 'venta' END) as cat,
                COALESCE(SUM(CASE WHEN mp.metodo_pago = 'efectivo' THEN mp.monto ELSE 0 END), 0) as total_efectivo,
                COALESCE(SUM(CASE WHEN mp.metodo_pago = 'qr' THEN mp.monto ELSE 0 END), 0) as total_qr
             FROM movimientos m
             INNER JOIN movimientos_pagos mp ON mp.movimiento_id = m.id
             WHERE m.caja_id = ? AND m.estado = 'completado'
             GROUP BY m.tipo, cat`,
            [cajaId]
        );

        let ventasEfectivo = 0;
        let reposicionesEfectivo = 0;
        let egresosEfectivo = 0;
        let ingresosQR = 0;
        let egresosQR = 0;

        for (const fila of resumen) {
            if (fila.tipo === 'ingreso') {
                if (fila.cat === 'aporte_cambio') {
                    reposicionesEfectivo = redondear2(reposicionesEfectivo + fila.total_efectivo);
                } else {
                    ventasEfectivo = redondear2(ventasEfectivo + fila.total_efectivo);
                    ingresosQR = redondear2(ingresosQR + fila.total_qr);
                }
            } else if (fila.tipo === 'egreso') {
                egresosEfectivo = redondear2(egresosEfectivo + fila.total_efectivo);
                egresosQR = redondear2(egresosQR + fila.total_qr);
            }
        }

        const ingresosEfectivo = redondear2(ventasEfectivo + reposicionesEfectivo);
        const fondoInicial = redondear2(caja.monto_inicial);
        const efectivoEsperado = redondear2(fondoInicial + ingresosEfectivo - egresosEfectivo);
        const qrEsperado = redondear2(ingresosQR - egresosQR);
        const diferenciaEfectivo = redondear2(efectivoRealValidado - efectivoEsperado);
        const diferenciaQr = qrRealValidado !== null ? redondear2(qrRealValidado - qrEsperado) : null;

        await runQuery(
            `UPDATE cajas
             SET estado = 'cerrada',
                 efectivo_esperado = ?,
                 efectivo_real = ?,
                 qr_esperado = ?,
                 qr_real = ?,
                 diferencia_efectivo = ?,
                 diferencia_qr = ?,
                 observaciones_cierre = ?,
                 fecha_cierre = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                efectivoEsperado,
                efectivoRealValidado,
                qrEsperado,
                qrRealValidado,
                diferenciaEfectivo,
                diferenciaQr,
                String(observacionesCierre || '').trim(),
                cajaId
            ]
        );

        return {
            cajaId,
            fondoInicial,
            ventasEfectivo,
            reposicionesEfectivo,
            ingresosEfectivo,
            egresosEfectivo,
            efectivoEsperado,
            efectivoReal: efectivoRealValidado,
            diferenciaEfectivo,
            ingresosQR,
            egresosQR,
            qrEsperado,
            qrReal: qrRealValidado,
            diferenciaQr,
            ventasTotalesTurno: redondear2(ventasEfectivo + ingresosQR)
        };
    });
}

async function obtenerDatosCierreParaNotificacion(cajaId) {
    const caja = await getQuery(
        `SELECT c.id, c.monto_inicial, c.efectivo_esperado, c.efectivo_real,
                c.diferencia_efectivo, c.qr_esperado, c.qr_real, c.diferencia_qr, c.veces_reabierta,
                COALESCE(c.observaciones_cierre, '') as observaciones_cierre,
                datetime(c.fecha_apertura, 'localtime') as fecha_apertura,
                datetime(c.fecha_cierre, 'localtime') as fecha_cierre,
                c.estado,
                COALESCE(cf.nombre, 'Caja Principal') as caja_nombre,
                COALESCE(u.nombre, '—') as cajero_nombre,
                COALESCE(u.nombre, '—') as cajero_usuario
         FROM cajas c
         LEFT JOIN cajas_fisicas cf ON c.caja_fisica_id = cf.id
         LEFT JOIN usuarios u ON c.usuario_id = u.id
         WHERE c.id = ?`,
        [cajaId]
    );
    if (!caja) return null;

    const negocio = await obtenerConfiguracionNegocio();

    const movimientos = await allQuery(
        `SELECT m.id, m.tipo, m.categoria_contable, m.metodo_pago, m.monto,
                COALESCE(m.descuento_total, 0) as descuento_total,
                COALESCE((SELECT SUM(mp.monto) FROM movimientos_pagos mp WHERE mp.movimiento_id = m.id AND mp.metodo_pago = 'efectivo'), m.monto_efectivo, 0) as pagado_efectivo,
                COALESCE((SELECT SUM(mp.monto) FROM movimientos_pagos mp WHERE mp.movimiento_id = m.id AND mp.metodo_pago = 'qr'), m.monto_qr, 0) as pagado_qr,
                m.descripcion, datetime(m.fecha_hora, 'localtime') as fecha_hora
         FROM movimientos m
         WHERE m.caja_id = ? AND m.estado = 'completado'
         ORDER BY m.id ASC`,
        [cajaId]
    );

    let totalVentasEfectivo = 0;
    let totalVentasQR = 0;
    let totalDescuentos = 0;
    let totalInyeccionSencillo = 0;
    let totalEgresosEfectivo = 0;
    let totalEgresosQR = 0;
    let totalEgresos = 0;
    let cantidadVentas = 0;
    let cantidadVentasMixtas = 0;
    let cantidadEgresos = 0;

    for (const m of movimientos) {
        const monto = Number(m.monto || 0);
        const ef = Number(m.pagado_efectivo || 0);
        const qr = Number(m.pagado_qr || 0);

        if (m.tipo === 'ingreso') {
            const desc = (m.descripcion || '').toLowerCase();
            const esAporteCambio = m.categoria_contable === 'aporte_cambio'
                || desc.startsWith('inyección')
                || desc.startsWith('[reposición');
            if (esAporteCambio) {
                totalInyeccionSencillo = redondear2(totalInyeccionSencillo + ef);
            } else {
                cantidadVentas++;
                if (m.metodo_pago === 'mixto') cantidadVentasMixtas++;
                totalVentasEfectivo = redondear2(totalVentasEfectivo + ef);
                totalVentasQR = redondear2(totalVentasQR + qr);
                totalDescuentos = redondear2(totalDescuentos + Number(m.descuento_total || 0));
            }
        } else if (m.tipo === 'egreso') {
            cantidadEgresos++;
            totalEgresosEfectivo = redondear2(totalEgresosEfectivo + ef);
            totalEgresosQR = redondear2(totalEgresosQR + qr);
            totalEgresos = redondear2(totalEgresos + monto);
        }
    }

    return {
        caja,
        negocio,
        metricas: {
            fondoInicial: Number(caja.monto_inicial || 0),
            totalVentas: redondear2(totalVentasEfectivo + totalVentasQR),
            totalVentasEfectivo: redondear2(totalVentasEfectivo),
            totalVentasQR: redondear2(totalVentasQR),
            totalDescuentos: redondear2(totalDescuentos),
            totalInyeccionSencillo: redondear2(totalInyeccionSencillo),
            totalEgresosEfectivo: redondear2(totalEgresosEfectivo),
            totalEgresosQR: redondear2(totalEgresosQR),
            totalEgresos: redondear2(totalEgresos),
            efectivoEsperado: caja.efectivo_esperado !== null ? Number(caja.efectivo_esperado) : 0,
            efectivoReal: caja.efectivo_real !== null ? Number(caja.efectivo_real) : 0,
            diferenciaEfectivo: caja.diferencia_efectivo !== null ? Number(caja.diferencia_efectivo) : 0,
            qrEsperado: Number(caja.qr_esperado || 0),
            qrReal: caja.qr_real !== null && caja.qr_real !== undefined ? Number(caja.qr_real) : null,
            diferenciaQr: caja.diferencia_qr !== null && caja.diferencia_qr !== undefined ? Number(caja.diferencia_qr) : null,
            observacionesCierre: caja.observaciones_cierre || '',
            cantidadVentas,
            cantidadVentasMixtas,
            cantidadEgresos
        }
    };
}

module.exports = {
    obtenerCajasFisicas,
    crearCajaFisica,
    desactivarCajaFisica,
    reactivarCajaFisica,
    actualizarPermisoFiscalCajaFisica,
    obtenerCajasAbiertas,
    obtenerCajaAbierta,
    obtenerHistorialCajas,
    abrirCaja,
    reabrirCajaConPermiso,
    cerrarCaja,
    obtenerDatosCierreParaNotificacion
};
