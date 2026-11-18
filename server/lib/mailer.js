// ==========================================
// MÓDULO DE NOTIFICACIONES POR CORREO (SMTP / Nodemailer)
// ==========================================
const nodemailer = require('nodemailer');

let transporterOverride = null;

function configurarTransporterPrueba(transporter = null) {
    transporterOverride = transporter;
}

function obtenerConfiguracionEmail() {
    let dbSmtp = null;
    let dbDestinatarios = [];
    try {
        const { obtenerInstanciaDrizzle } = require('../../database/drizzle');
        const { sqlite } = obtenerInstanciaDrizzle();
        dbSmtp = sqlite.prepare('SELECT * FROM configuracion_smtp WHERE id = 1').get();
        const filas = sqlite.prepare('SELECT email FROM notificacion_destinatarios WHERE verificado = 1 AND activo = 1').all();
        if (filas && filas.length > 0) {
            dbDestinatarios = filas.map(f => String(f.email || '').trim()).filter(Boolean);
        }
    } catch {
        // En caso de inicialización temprana o migraciones
    }

    const host = (dbSmtp && dbSmtp.host && String(dbSmtp.host).trim())
        ? String(dbSmtp.host).trim()
        : (process.env.SMTP_HOST || 'smtp.gmail.com');
    const port = (dbSmtp && dbSmtp.puerto)
        ? Number(dbSmtp.puerto)
        : (Number(process.env.SMTP_PORT) || 465);
    const secure = (dbSmtp && dbSmtp.secure !== null && dbSmtp.secure !== undefined)
        ? Boolean(dbSmtp.secure)
        : (process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : port === 465);
    const user = (dbSmtp && dbSmtp.usuario && String(dbSmtp.usuario).trim())
        ? String(dbSmtp.usuario).trim()
        : String(process.env.SMTP_USER || '').trim();
    const pass = (dbSmtp && dbSmtp.password && String(dbSmtp.password).trim())
        ? String(dbSmtp.password).trim()
        : String(process.env.SMTP_PASS || '').trim();
    const remitenteNombre = (dbSmtp && dbSmtp.remitente_nombre && String(dbSmtp.remitente_nombre).trim())
        ? String(dbSmtp.remitente_nombre).trim()
        : '';

    const destinatarios = dbDestinatarios.length > 0
        ? dbDestinatarios.join(', ')
        : String(process.env.EMAIL_DESTINATARIO_CIERRE || '').trim();

    const remitente = remitenteNombre
        ? `"${remitenteNombre}" <${user || 'pos@local.test'}>`
        : String(process.env.EMAIL_REMITENTE || '').trim();

    const activo = dbSmtp ? (dbSmtp.activo === 1) : true;

    return { host, port, secure, user, pass, destinatarios, remitente, remitenteNombre, activo };
}

function estaEmailConfigurado() {
    if (transporterOverride) return true;
    const cfg = obtenerConfiguracionEmail();
    return Boolean(cfg.user && cfg.pass && cfg.destinatarios);
}

function enmascararEmail(emailStr) {
    if (!emailStr) return '';
    return emailStr
        .split(',')
        .map((e) => {
            const correo = e.trim();
            const partes = correo.split('@');
            if (partes.length !== 2) return correo;
            const [nombre, dominio] = partes;
            if (nombre.length <= 2) return `${nombre}***@${dominio}`;
            return `${nombre.slice(0, 2)}***${nombre.slice(-1)}@${dominio}`;
        })
        .join(', ');
}

function verificarEstadoEmail() {
    const cfg = obtenerConfiguracionEmail();
    const configurado = Boolean((cfg.user && cfg.pass && cfg.destinatarios) || transporterOverride);
    return {
        configurado,
        host: cfg.host,
        port: cfg.port,
        user: cfg.user ? enmascararEmail(cfg.user) : '',
        destinatarios: cfg.destinatarios ? enmascararEmail(cfg.destinatarios) : ''
    };
}

function crearTransporter() {
    if (transporterOverride) {
        return transporterOverride;
    }
    const cfg = obtenerConfiguracionEmail();
    if (!cfg.user || !cfg.pass) {
        throw new Error('Credenciales SMTP no configuradas. Verifica SMTP_USER y SMTP_PASS en .env.local');
    }

    return nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: {
            user: cfg.user,
            pass: cfg.pass
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: {
            rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
    });
}

function formatoMoneda(valor) {
    const n = Number(valor || 0);
    return `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function construirHtmlCierre({ caja, negocio, metricas }) {
    const nombreNegocio = (negocio && negocio.nombre_negocio) ? negocio.nombre_negocio : 'Mi Negocio';
    const turnoId = caja.id;
    const estacion = caja.caja_nombre || 'Caja Principal';
    const cajero = caja.cajero_nombre || 'Operador';
    const fechaApertura = caja.fecha_apertura || '—';
    const fechaCierre = caja.fecha_cierre || new Date().toLocaleString();
    const dif = Number(metricas.diferenciaEfectivo || 0);
    const egresosEf = metricas.totalEgresosEfectivo !== undefined ? Number(metricas.totalEgresosEfectivo) : Number(metricas.totalEgresos || 0);
    const egresosQr = Number(metricas.totalEgresosQR || 0);
    const qrEsp = Number(metricas.qrEsperado || 0);
    const qrReal = metricas.qrReal !== null && metricas.qrReal !== undefined ? Number(metricas.qrReal) : null;
    const difQr = metricas.diferenciaQr !== null && metricas.diferenciaQr !== undefined ? Number(metricas.diferenciaQr) : null;
    const obsCierre = metricas.observacionesCierre || caja.observaciones_cierre || '';

    let bannerBg = '#dcfce7';
    let bannerBorder = '#22c55e';
    let bannerColor = '#15803d';
    let bannerIcon = '✅';
    let bannerTitulo = 'ARQUEO CUADRADO EXACTO';
    let bannerDetalle = 'El dinero físico en el cajón coincide al centavo con lo esperado por el sistema.';

    if (dif < 0) {
        bannerBg = '#fee2e2';
        bannerBorder = '#ef4444';
        bannerColor = '#b91c1c';
        bannerIcon = '⚠️';
        bannerTitulo = `FALTANTE EN CAJA: ${formatoMoneda(dif)}`;
        bannerDetalle = 'El efectivo físico contado fue menor que el total esperado en el cajón.';
    } else if (dif > 0) {
        bannerBg = '#dbeafe';
        bannerBorder = '#3b82f6';
        bannerColor = '#1d4ed8';
        bannerIcon = 'ℹ️';
        bannerTitulo = `SOBRANTE EN CAJA: +${formatoMoneda(dif)}`;
        bannerDetalle = 'El efectivo físico contado superó el total esperado en el cajón.';
    }

    return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cierre de Turno #${turnoId}</title>
</head>
<body style="margin:0; padding:20px; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.06); border:1px solid #e2e8f0;">
    
    <!-- ENCABEZADO -->
    <tr>
      <td style="background:#0f172a; padding:24px 28px; color:#ffffff;">
        <table width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <div style="font-size:12px; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; font-weight:600;">Reporte de Cierre de Caja</div>
              <h1 style="margin:4px 0 0 0; font-size:22px; font-weight:700; color:#ffffff;">${nombreNegocio}</h1>
            </td>
            <td align="right">
              <span style="display:inline-block; background:#1e293b; padding:6px 12px; border-radius:6px; font-size:13px; font-weight:600; color:#38bdf8; border:1px solid #334155;">
                Turno #${turnoId}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- BANNER DE RESULTADO ARQUEO -->
    <tr>
      <td style="padding:20px 28px 10px 28px;">
        <div style="background:${bannerBg}; border-left:4px solid ${bannerBorder}; padding:14px 18px; border-radius:6px;">
          <div style="font-size:15px; font-weight:700; color:${bannerColor}; margin-bottom:2px;">
            ${bannerIcon} ${bannerTitulo}
          </div>
          <div style="font-size:13px; color:#334155;">
            ${bannerDetalle}
          </div>
        </div>
      </td>
    </tr>

    <!-- DATOS OPERATIVOS DEL TURNO -->
    <tr>
      <td style="padding:10px 28px;">
        <table width="100%" cellspacing="0" cellpadding="8" style="background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; font-size:13px;">
          <tr>
            <td style="color:#64748b; width:40%;">📍 Estación / Caja:</td>
            <td style="font-weight:600; color:#0f172a;">${estacion}</td>
          </tr>
          <tr>
            <td style="color:#64748b;">👤 Cajero Responsable:</td>
            <td style="font-weight:600; color:#0f172a;">${cajero}</td>
          </tr>
          <tr>
            <td style="color:#64748b;">🕒 Apertura:</td>
            <td style="color:#0f172a;">${fechaApertura}</td>
          </tr>
          <tr>
            <td style="color:#64748b;">🔒 Cierre:</td>
            <td style="color:#0f172a; font-weight:600;">${fechaCierre}</td>
          </tr>
          ${obsCierre ? `
          <tr>
            <td style="color:#64748b;">📝 Observaciones:</td>
            <td style="color:#0f172a;">${obsCierre}</td>
          </tr>` : ''}
        </table>
      </td>
    </tr>

    <!-- RESUMEN DE VENTAS -->
    <tr>
      <td style="padding:15px 28px 5px 28px;">
        <h3 style="margin:0 0 10px 0; font-size:15px; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
          📊 Resumen de Ventas Comerciales
        </h3>
        <table width="100%" cellspacing="0" cellpadding="8" style="font-size:13px;">
          <tr>
            <td style="color:#475569;">💵 Cobrado en Efectivo:</td>
            <td align="right" style="font-weight:600; color:#0f172a;">${formatoMoneda(metricas.totalVentasEfectivo)}</td>
          </tr>
          <tr>
            <td style="color:#475569;">📱 Cobrado por QR / Banco:</td>
            <td align="right" style="font-weight:600; color:#0f172a;">${formatoMoneda(metricas.totalVentasQR)}</td>
          </tr>
          ${Number(metricas.ventas_apps_total || 0) > 0 ? `
          <tr>
            <td style="color:#475569;">🛵 Ventas por Aplicaciones (Delivery):</td>
            <td align="right" style="font-weight:600; color:#0f172a;">${formatoMoneda(metricas.ventas_apps_total)}</td>
          </tr>` : ''}
          ${Number(metricas.cantidadVentasMixtas || 0) > 0 ? `
          <tr>
            <td style="color:#64748b; font-size:12px;">🔀 Incluye ${metricas.cantidadVentasMixtas} venta(s) con pago mixto (Efectivo + QR)</td>
            <td align="right" style="color:#64748b; font-size:12px;">Desglosadas en su canal</td>
          </tr>` : ''}
          ${Number(metricas.totalDescuentos || 0) > 0 ? `
          <tr>
            <td style="color:#475569;">🏷️ Descuentos Aplicados:</td>
            <td align="right" style="color:#0369a1; font-weight:600;">-${formatoMoneda(metricas.totalDescuentos)}</td>
          </tr>` : ''}
          <tr style="background:#f8fafc; font-size:14px; font-weight:700;">
            <td style="color:#0f172a; padding:10px 8px;">📈 VENTAS TOTALES NETAS (${metricas.cantidadVentas} transacciones):</td>
            <td align="right" style="color:#0f172a; padding:10px 8px;">${formatoMoneda(metricas.totalVentas)}</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CONCILIACIÓN DEL CAJÓN FÍSICO (EFECTIVO) -->
    <tr>
      <td style="padding:15px 28px;">
        <h3 style="margin:0 0 10px 0; font-size:15px; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
          🪙 Conciliación de Efectivo (Cajón Físico)
        </h3>
        <table width="100%" cellspacing="0" cellpadding="6" style="font-size:13px;">
          <tr>
            <td style="color:#475569;">(+) Fondo Inicial de Apertura:</td>
            <td align="right" style="color:#0f172a;">${formatoMoneda(metricas.fondoInicial)}</td>
          </tr>
          <tr>
            <td style="color:#475569;">(+) Ventas en Efectivo:</td>
            <td align="right" style="color:#0f172a;">${formatoMoneda(metricas.totalVentasEfectivo)}</td>
          </tr>
          ${metricas.totalInyeccionSencillo > 0 ? `
          <tr>
            <td style="color:#475569;">(+) Aportes de Cambio / Sencillo:</td>
            <td align="right" style="color:#15803d; font-weight:600;">+${formatoMoneda(metricas.totalInyeccionSencillo)}</td>
          </tr>` : ''}
          ${egresosEf > 0 ? `
          <tr>
            <td style="color:#475569;">(-) Egresos de Efectivo del Cajón:</td>
            <td align="right" style="color:#b91c1c; font-weight:600;">-${formatoMoneda(egresosEf)}</td>
          </tr>` : ''}
          <tr style="border-top:1px dashed #cbd5e1;">
            <td style="color:#0f172a; font-weight:600; padding-top:8px;">(=) Efectivo Físico Esperado:</td>
            <td align="right" style="color:#0f172a; font-weight:600; padding-top:8px;">${formatoMoneda(metricas.efectivoEsperado)}</td>
          </tr>
          <tr style="background:#f1f5f9;">
            <td style="color:#0f172a; font-weight:700; padding:8px;">👁️ Efectivo Contado en Arqueo (Real):</td>
            <td align="right" style="color:#0f172a; font-weight:700; padding:8px; font-size:14px;">${formatoMoneda(metricas.efectivoReal)}</td>
          </tr>
          <tr>
            <td style="color:${bannerColor}; font-weight:700; padding-top:8px;">⚖️ Diferencia de Arqueo:</td>
            <td align="right" style="color:${bannerColor}; font-weight:700; padding-top:8px; font-size:14px;">
              ${dif > 0 ? '+' : ''}${formatoMoneda(dif)}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CONCILIACIÓN QR / BANCO -->
    <tr>
      <td style="padding:5px 28px 15px 28px;">
        <h3 style="margin:0 0 10px 0; font-size:15px; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
          📱 Conciliación de Cobros por QR / Banco
        </h3>
        <table width="100%" cellspacing="0" cellpadding="6" style="font-size:13px;">
          <tr>
            <td style="color:#475569;">(+) Ingresos por Ventas QR:</td>
            <td align="right" style="color:#0f172a;">${formatoMoneda(metricas.totalVentasQR)}</td>
          </tr>
          ${egresosQr > 0 ? `
          <tr>
            <td style="color:#475569;">(-) Egresos por Transferencia / QR:</td>
            <td align="right" style="color:#b91c1c; font-weight:600;">-${formatoMoneda(egresosQr)}</td>
          </tr>` : ''}
          <tr style="border-top:1px dashed #cbd5e1;">
            <td style="color:#0f172a; font-weight:600;">(=) Total QR Esperado en Banco:</td>
            <td align="right" style="color:#0f172a; font-weight:600;">${formatoMoneda(qrEsp)}</td>
          </tr>
          ${qrReal !== null ? `
          <tr>
            <td style="color:#0f172a; font-weight:600;">🏦 QR Conciliado en Extracto:</td>
            <td align="right" style="color:#0f172a; font-weight:600;">${formatoMoneda(qrReal)} (Dif: ${difQr > 0 ? '+' : ''}${formatoMoneda(difQr)})</td>
          </tr>` : ''}
        </table>
      </td>
    </tr>

    <!-- ADJUNTO Y PIE DE PÁGINA -->
    <tr>
      <td style="padding:15px 28px 25px 28px;">
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; font-size:12px; color:#475569;">
          📎 <strong>Archivo Adjunto:</strong> Se incluye el libro oficial <code>Reporte_Turno_${turnoId}.xlsx</code> con el listado detallado de movimientos, ventas, egresos y auditoría.
        </div>
        <div style="text-align:center; font-size:11px; color:#94a3b8; margin-top:20px;">
          Generado automáticamente por el Sistema POS & Control de Cajas Híbrido.<br>
          Fecha del servidor: ${new Date().toLocaleString()}
        </div>
      </td>
    </tr>

  </table>
</body>
</html>
`;
}

async function enviarNotificacionCierreCaja(cajaId) {
    try {
        if (!estaEmailConfigurado()) {
            console.log(`[Mailer] Notificación de cierre omitida: Credenciales SMTP o destinatarios no configurados.`);
            return { enviado: false, motivo: 'no_configurado' };
        }

        const { obtenerDatosCierreParaNotificacion, generarReporteExcel } = require('../queries');
        const datos = await obtenerDatosCierreParaNotificacion(cajaId);
        if (!datos) {
            console.warn(`[Mailer] No se encontraron datos para la caja ID ${cajaId}`);
            return { enviado: false, motivo: 'caja_no_encontrada' };
        }

        const bufferExcel = await generarReporteExcel(cajaId, { usuarioGenerador: datos.caja.cajero_nombre || 'Sistema Cierre' });
        const cfg = obtenerConfiguracionEmail();
        const transporter = crearTransporter();

        const nombreNegocio = datos.negocio?.nombre_negocio || 'POS';
        const asunto = `📊 Cierre de Caja - Turno #${datos.caja.id} (${datos.caja.caja_nombre}) - ${nombreNegocio}`;
        const remitente = cfg.remitente || `"${nombreNegocio}" <${cfg.user || 'pos@local.test'}>`;

        // Despachar a todos los destinatarios activos y verificados en BD (o fallback a cfg.destinatarios)
        let listaDestinatarios = [];
        try {
            const { obtenerInstanciaDrizzle } = require('../../database/drizzle');
            const { sqlite } = obtenerInstanciaDrizzle();
            const filas = sqlite.prepare('SELECT email FROM notificacion_destinatarios WHERE verificado = 1 AND activo = 1').all();
            if (filas && filas.length > 0) {
                listaDestinatarios = filas.map(f => String(f.email || '').trim()).filter(Boolean);
            }
        } catch (errDb) {
            console.warn('[Mailer] Error al consultar destinatarios verificados en BD:', errDb.message);
        }

        if (listaDestinatarios.length === 0 && cfg.destinatarios) {
            listaDestinatarios = cfg.destinatarios.split(',').map(e => e.trim()).filter(Boolean);
        }

        if (listaDestinatarios.length === 0) {
            console.log(`[Mailer] Notificación de cierre omitida: No hay destinatarios verificados.`);
            return { enviado: false, motivo: 'sin_destinatarios' };
        }

        const destino = listaDestinatarios.join(', ');

        const fechaSufijo = datos.caja.fecha_cierre
            ? datos.caja.fecha_cierre.split(' ')[0].replace(/[^0-9-]/g, '')
            : 'cierre';

        const info = await transporter.sendMail({
            from: remitente,
            to: destino,
            subject: asunto,
            html: construirHtmlCierre(datos),
            attachments: [
                {
                    filename: `Reporte_Turno_${cajaId}_${fechaSufijo}.xlsx`,
                    content: bufferExcel,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                }
            ]
        });

        console.log(`[Mailer] Correo de cierre de turno #${cajaId} enviado a [${enmascararEmail(destino)}]. ID: ${info.messageId}`);
        return { enviado: true, messageId: info.messageId, info };
    } catch (err) {
        console.error(`[Mailer] Error al enviar correo de cierre para caja #${cajaId}:`, err.message);
        return { enviado: false, error: err.message };
    }
}

function construirHtmlVerificacion({ codigo, nombreNegocio }) {
    const negocio = nombreNegocio || 'Sistema POS';
    return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Código de Verificación - ${negocio}</title>
</head>
<body style="margin:0; padding:24px 16px; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.06); border:1px solid #e2e8f0;">
    
    <!-- ENCABEZADO -->
    <tr>
      <td style="background:#0f172a; padding:24px 28px; text-align:center;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; font-weight:600; margin-bottom:4px;">Notificaciones de Cierre de Caja</div>
        <h1 style="margin:0; font-size:20px; font-weight:700; color:#ffffff;">${negocio}</h1>
      </td>
    </tr>

    <!-- CUERPO PRINCIPAL -->
    <tr>
      <td style="padding:28px 28px 20px 28px;">
        <h2 style="font-size:17px; font-weight:700; color:#0f172a; margin:0 0 12px 0;">
          🔐 Verificación de Correo Electrónico
        </h2>
        <p style="font-size:14px; line-height:1.5; color:#475569; margin:0 0 16px 0;">
          Has sido registrado para recibir reportes automáticos de cierre de turno y libros contables de <strong>${negocio}</strong>.
        </p>
        <p style="font-size:14px; line-height:1.5; color:#475569; margin:0 0 24px 0;">
          Para validar este buzón y activar tus notificaciones, ingresa el siguiente código de verificación en el panel administrativo:
        </p>

        <!-- CÓDIGO DE 4 CARACTERES DESTACADO -->
        <div style="text-align:center; margin:24px 0;">
          <div style="display:inline-block; background:#f8fafc; border:2px dashed #0284c7; border-radius:10px; padding:18px 36px; text-align:center;">
            <div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:1px; color:#0284c7; margin-bottom:6px;">Tu Código de Verificación</div>
            <div style="font-size:36px; font-weight:800; letter-spacing:10px; color:#0f172a; font-family:'Courier New', Courier, monospace; margin-left:10px;">${codigo}</div>
          </div>
        </div>

        <!-- AVISO DE VIGENCIA -->
        <div style="background:#fef3c7; border-left:4px solid #f59e0b; padding:12px 16px; border-radius:6px; margin:20px 0 0 0;">
          <p style="margin:0; font-size:13px; color:#92400e; line-height:1.4;">
            ⏱️ <strong>Importante:</strong> Este código expira en <strong>15 minutos</strong>. Si no solicitaste este registro, puedes desestimar este mensaje de forma segura.
          </p>
        </div>
      </td>
    </tr>

    <!-- PIE DE PÁGINA -->
    <tr>
      <td style="padding:16px 28px 24px 28px; border-top:1px solid #f1f5f9; text-align:center;">
        <p style="margin:0; font-size:11px; color:#94a3b8; line-height:1.4;">
          Enviado automáticamente por el Sistema POS & Control de Cajas.<br>
          Fecha del servidor: ${new Date().toLocaleString()}
        </p>
      </td>
    </tr>

  </table>
</body>
</html>
`;
}

async function enviarCodigoVerificacionEmail({ email, codigo, nombreNegocio }) {
    try {
        const emailDestino = String(email || '').trim().toLowerCase();
        if (!emailDestino || !emailDestino.includes('@')) {
            throw new Error('Debe proporcionar un correo electrónico válido para enviar el código.');
        }
        const codigoLimpio = String(codigo || '').trim();
        if (!codigoLimpio) {
            throw new Error('Debe proporcionar el código de verificación.');
        }

        let negocioFinal = nombreNegocio;
        if (!negocioFinal) {
            try {
                const { obtenerInstanciaDrizzle } = require('../../database/drizzle');
                const { sqlite } = obtenerInstanciaDrizzle();
                const configNeg = sqlite.prepare('SELECT nombre_negocio FROM configuracion_negocio WHERE id = 1').get();
                if (configNeg && configNeg.nombre_negocio) {
                    negocioFinal = configNeg.nombre_negocio;
                }
            } catch {
                negocioFinal = 'Sistema POS';
            }
        }
        negocioFinal = negocioFinal || 'Sistema POS';

        const cfg = obtenerConfiguracionEmail();
        const transporter = crearTransporter();

        const remitente = cfg.remitente || `"${negocioFinal}" <${cfg.user || 'pos@local.test'}>`;
        const asunto = `🔐 Código de Verificación: ${codigoLimpio} - ${negocioFinal}`;

        const html = construirHtmlVerificacion({
            codigo: codigoLimpio,
            nombreNegocio: negocioFinal
        });

        const info = await transporter.sendMail({
            from: remitente,
            to: emailDestino,
            subject: asunto,
            html
        });

        console.log(`[Mailer] Código de verificación enviado a [${enmascararEmail(emailDestino)}]. ID: ${info.messageId}`);
        return { enviado: true, messageId: info.messageId, info };
    } catch (err) {
        console.error('[Mailer] Error al enviar código de verificación:', err.message);
        return { enviado: false, error: err.message };
    }
}

async function enviarEmailPrueba(destinatarioAlternativo = null) {
    try {
        const cfg = obtenerConfiguracionEmail();
        const destino = String(destinatarioAlternativo || cfg.destinatarios || '').trim();

        if (!transporterOverride && (!cfg.user || !cfg.pass)) {
            throw new Error('Debes definir las credenciales SMTP en la configuración o en el archivo .env.local');
        }
        if (!destino) {
            throw new Error('No hay ningún destinatario configurado. Registra un destinatario en la configuración o define EMAIL_DESTINATARIO_CIERRE.');
        }

        const transporter = crearTransporter();

        const info = await transporter.sendMail({
            from: cfg.remitente || `"Sistema POS" <${cfg.user || 'pos@local.test'}>`,
            to: destino,
            subject: `🧪 Prueba de Notificación de Correo - Sistema POS`,
            html: `
            <div style="font-family:sans-serif; max-width:540px; margin:20px auto; padding:24px; border:1px solid #cbd5e1; border-radius:10px; background:#fff;">
              <h2 style="color:#0f172a; margin-top:0;">✅ Conexión SMTP Exitosa</h2>
              <p style="color:#334155; font-size:14px; line-height:1.5;">
                ¡Felicidades! El Sistema POS y Control de Cajas ha configurado y verificado correctamente el envío de correos electrónicos.
              </p>
              <div style="background:#f8fafc; padding:12px; border-radius:6px; font-size:13px; color:#475569; margin:16px 0;">
                <strong>Servidor SMTP:</strong> ${cfg.host}:${cfg.port}<br>
                <strong>Cuenta remitente:</strong> ${enmascararEmail(cfg.user || 'pos@local.test')}<br>
                <strong>Destinatario verificado:</strong> ${enmascararEmail(destino)}<br>
                <strong>Fecha y hora:</strong> ${new Date().toLocaleString()}
              </div>
              <p style="color:#64748b; font-size:12px;">
                A partir de ahora, cada vez que se cierre un turno de caja, recibirás automáticamente el resumen de arqueo junto con el libro Excel adjunto.
              </p>
            </div>
            `
        });

        console.log(`[Mailer] Correo de prueba enviado con éxito a [${enmascararEmail(destino)}]. ID: ${info.messageId}`);
        return { enviado: true, messageId: info.messageId, destino: enmascararEmail(destino), info };
    } catch (err) {
        console.error('[Mailer] Error en prueba de correo:', err.message);
        return { enviado: false, error: err.message };
    }
}

module.exports = {
    configurarTransporterPrueba,
    obtenerConfiguracionEmail,
    estaEmailConfigurado,
    verificarEstadoEmail,
    construirHtmlCierre,
    construirHtmlVerificacion,
    enviarNotificacionCierreCaja,
    enviarCodigoVerificacionEmail,
    enviarEmailPrueba
};
