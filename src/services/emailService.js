const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
try { if (process.env.NODE_ENV !== 'production') require('dotenv').config(); } catch (_) {}

let transporter;

function getFromAddress() {
  // Prefer explicit SMTP_FROM, then GMAIL_USER as a fallback
  return (process.env.SMTP_FROM || process.env.GMAIL_USER || 'no-reply@miumg.edu.gt');
}

function isSmtpConfigured() {
  const hasCustom = !!process.env.SMTP_HOST;
  const hasUserPass = !!((process.env.SMTP_USER || process.env.GMAIL_USER) && (process.env.SMTP_PASS || process.env.GMAIL_PASS));
  return hasCustom || hasUserPass;
}

function getTransporter() {
  if (!transporter) {
    const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_PASS;
    const wantDevPreview = String(process.env.EMAIL_DEV_PREVIEW || '').toLowerCase() === '1' || (process.env.NODE_ENV !== 'production' && !isSmtpConfigured());

    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || Number(process.env.SMTP_PORT) === 465,
        auth: (smtpUser && smtpPass) ? { user: smtpUser, pass: smtpPass } : undefined,
      });
      transporter._mode = 'smtp';
    } else if (smtpUser && smtpPass) {
      // Gmail service fallback
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: smtpUser, pass: smtpPass },
      });
      transporter._mode = 'gmail';
    } else if (wantDevPreview) {
      // Dev preview mode: do not attempt to send; generate a local preview instead
      transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
      transporter._mode = 'preview';
    } else {
      // As a last resort, attempt localhost (MailHog/MailDev scenarios)
      transporter = nodemailer.createTransport({ host: 'localhost', port: 25, secure: false });
      transporter._mode = 'localhost';
    }
    try { console.log('[mail] transporter mode:', transporter._mode || 'unknown'); } catch (_) {}
  }
  return transporter;
}

function loadLogoBuffer() {
  try {
    // Priority: explicit env path
    const candidateEnv = process.env.EMAIL_LOGO_PATH && path.resolve(process.env.EMAIL_LOGO_PATH);
    const candidates = [];
    if (candidateEnv) candidates.push(candidateEnv);
    // Try known frontend assets (used in login/dashboard)
    candidates.push(
      path.resolve(__dirname, '..', '..', '..', 'Frontend', 'src', 'assets', 'e762c9dbacb670beb9121f81eed1bec4e72be0ad.png'),
      path.resolve(__dirname, '..', '..', '..', 'Frontend', 'src', 'assets', '9ab11aee0fe9352a84efeead46e0f2cdedfe1ff1.png')
    );
    for (const p of candidates) {
      try {
        if (p && fs.existsSync(p)) {
          return { buffer: fs.readFileSync(p), contentType: 'image/png' };
        }
      } catch (_) {}
    }
  } catch (_) {}
  return null;
}

async function sendVerificationCode(email, code) {
  const transport = getTransporter();
  const html = '<p>Tu código de verificación es <strong>' + escapeHtml(String(code)) + '</strong>.</p>';
  const mailOptions = {
    from: 'Portal UMG <' + getFromAddress() + '>',
    to: email,
    subject: 'Código de verificación - Portal Estudiantil UMG',
    html,
  };

  const info = await transport.sendMail(mailOptions);

  // In preview mode, also save an HTML file for quick viewing
  if (transport._mode === 'preview' || String(process.env.EMAIL_DEV_PREVIEW || '').toLowerCase() === '1') {
    try {
      const outDir = path.join(__dirname, '..', '..', 'emails', 'outbox');
      fs.mkdirSync(outDir, { recursive: true });
      const safeTo = String(email || 'unknown').replace(/[^a-z0-9_.@-]/gi, '_');
      const fname = `${Date.now()}-verification-${safeTo}.html`;
      fs.writeFileSync(path.join(outDir, fname), wrapBasicHtml(html, 'Código de verificación'));
      console.log('[mail:preview] Guardado en', path.join(outDir, fname));
    } catch (e) {
      console.warn('No se pudo guardar vista previa del correo:', e && e.message ? e.message : e);
    }
  }
}

module.exports = {
  sendVerificationCode,
};

/**
 * Send an enrollment confirmation email with event details and an inline QR code.
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {Object} params.event - Event information
 * @param {string|number} params.event.id
 * @param {string} params.event.title
 * @param {string} params.event.date - e.g. '2026-02-06'
 * @param {string} params.event.time - e.g. '18:00'
 * @param {string} params.event.location
 * @param {string} [params.studentName]
 * @param {string} [params.carnet]
 */
async function sendEnrollmentConfirmation({ to, event, studentName, carnet }) {
  const transport = getTransporter();
  const logo = loadLogoBuffer();
  const hasLogo = !!(logo && logo.buffer);

  const displayDate = buildDisplayDate(event && event.date);
  const displayDateTime = event && event.time ? `${displayDate}, ${escapeHtml(String(event.time))}` : displayDate;

  // Build QR payload; simple approach uses the carnet as the value.
  // Generate a PNG buffer and attach it inline via CID so Gmail/clients display it.
  const qrValue = String(carnet || '').trim() || `WORK-${event.id}-${Date.now()}`;
  const qrPngBuffer = await QRCode.toBuffer(qrValue, { width: 512, margin: 2, errorCorrectionLevel: 'M', type: 'png' });

  // Inline CSS for broad email client support (centered, spacious, larger QR)
  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif; color:#111;">
    <div style="background:#0d47a1; padding:24px; border-radius:14px 14px 0 0; color:#fff; text-align:center;">
      ${hasLogo ? `<img src="cid:umglogo" alt="UMG" style="display:block; margin:0 auto 10px; width:120px; height:auto;" />` : ''}
      <h2 style="margin:0; font-size:22px;">Inscripción confirmada</h2>
      <p style="margin:8px 0 0; font-size:15px;">Has quedado inscrito correctamente en: <strong>${escapeHtml(event.title || 'Taller')}</strong></p>
    </div>

    <div style="border:1px solid #e5e7eb; border-top:0; border-radius:0 0 14px 14px; padding:24px;">
      ${studentName ? `<p style="margin:0 0 10px; font-size:15px;">Hola, <strong>${escapeHtml(studentName)}</strong> 👋</p>` : ''}
      <p style="margin:0 0 18px; font-size:14px; line-height:1.5;">Tu registro se realizó con éxito. Presenta tu código QR al llegar para registrar tu asistencia.</p>

      <div style="text-align:center; margin: 8px 0 18px;">
        <img src="cid:qrimg" alt="Código QR" width="256" height="256" style="display:block; margin:0 auto; border:12px solid #111; background:#fff; border-radius:12px;" />
      </div>

      <div style="max-width:520px; margin:0 auto;">
  <p style="margin:0 0 8px;"><strong>Fecha y hora:</strong> ${displayDateTime}</p>
        <p style="margin:0 0 8px;"><strong>Lugar:</strong> ${escapeHtml(event.location || 'Por confirmar')}</p>
        ${event.id ? `<p style="margin:0 0 8px;"><strong>Código del evento:</strong> #${escapeHtml(String(event.id))}</p>` : ''}
        ${carnet ? `<p style="margin:0 0 8px;"><strong>Carné:</strong> ${escapeHtml(String(carnet))}</p>` : ''}
      </div>

      <div style="margin-top:20px; padding:14px; background:#f1f5f9; border-radius:10px; text-align:center;">
        <p style="margin:0;">Recuerda ser puntual el <strong>${displayDateTime}</strong> en <strong>${escapeHtml(event.location || '')}</strong>.</p>
      </div>

      <p style="margin:18px 0 0; font-size:12px; color:#666; text-align:center;">Si no te inscribiste tú, ignora este correo.</p>
    </div>
  </div>`;

  const mailOptions = {
    from: 'UMG Workshops <' + getFromAddress() + '>',
    to,
    subject: `Inscripción confirmada: ${event.title || 'Taller'}`,
    html,
    attachments: [
      {
        filename: 'qr.png',
        content: qrPngBuffer,
        contentType: 'image/png',
        cid: 'qrimg'
      },
      ...(hasLogo ? [{ filename: 'umg-logo.png', content: logo.buffer, contentType: logo.contentType, cid: 'umglogo' }] : [])
    ]
  };

  const info = await transport.sendMail(mailOptions);

  // If we are in preview mode, also write an HTML preview with embedded QR for easy inspection
  if (transport._mode === 'preview' || String(process.env.EMAIL_DEV_PREVIEW || '').toLowerCase() === '1') {
    try {
      const outDir = path.join(__dirname, '..', '..', 'emails', 'outbox');
      fs.mkdirSync(outDir, { recursive: true });
      const safeTo = String(to || 'unknown').replace(/[^a-z0-9_.@-]/gi, '_');
      const safeId = String(event && event.id || 'event').replace(/[^a-z0-9_.@-]/gi, '_');
      const fname = `${Date.now()}-enrollment-${safeId}-${safeTo}.html`;
      const dataUri = `data:image/png;base64,${qrPngBuffer.toString('base64')}`;
      let previewHtml = html.replace('cid:qrimg', dataUri);
      if (hasLogo) {
        const logoDataUri = `data:${logo.contentType};base64,${logo.buffer.toString('base64')}`;
        previewHtml = previewHtml.replace('cid:umglogo', logoDataUri);
      }
      fs.writeFileSync(path.join(outDir, fname), wrapBasicHtml(previewHtml, `Inscripción confirmada: ${event.title || 'Taller'}`));
      console.log('[mail:preview] Guardado en', path.join(outDir, fname));
    } catch (e) {
      console.warn('No se pudo guardar vista previa del correo:', e && e.message ? e.message : e);
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports.sendEnrollmentConfirmation = sendEnrollmentConfirmation;

function wrapBasicHtml(inner, title) {
  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title || 'Vista previa')}</title>
    </head>
    <body style="background:#f5f6f8; padding:24px;">
      <div style="max-width:720px; margin:0 auto;">${inner}</div>
    </body>
  </html>`;
}

// --- Helpers: fecha/hora ---
function buildDisplayDate(dateStr) {
  // Returns a formatted date string only (no time)
  const fallback = 'Fecha por confirmar';
  try {
    const isDateObj = (dateStr instanceof Date) && !isNaN(dateStr.getTime());
    const rawDate = isDateObj ? dateStr : (dateStr || '');
    const ds = isDateObj ? '' : String(rawDate).trim();
    if (!isDateObj && !ds) return fallback;

    // Matches YYYY-MM-DD
    const mDate = ds.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let y, mo, d;

    if (isDateObj || mDate) {
      if (isDateObj) {
        // Extract UTC parts from TIMESTAMPTZ value
        y = dateStr.getUTCFullYear();
        mo = dateStr.getUTCMonth() + 1;
        d = dateStr.getUTCDate();
      } else {
      y = parseInt(mDate[1], 10);
      mo = parseInt(mDate[2], 10);
      d = parseInt(mDate[3], 10);
      }
      // IMPORTANT: Build date at 12:00 UTC (noon) to avoid timezone shifting the calendar day
      // When formatting for 'America/Guatemala' (UTC-6), creating at 00:00 UTC would render as previous day.
      const dt = new Date(Date.UTC(y, (mo - 1), d, 12, 0, 0));
      if (isNaN(dt.getTime())) return fallback;

      const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Guatemala' };
      return dt.toLocaleString('es-GT', opts);
    }

    // Last resort: try native Date parsing (date-only)
    const naive = new Date(ds);
    if (!isNaN(naive.getTime())) {
      // Shift to noon UTC equivalent date to avoid off-by-one when formatting for GT timezone
      const y2 = naive.getUTCFullYear();
      const mo2 = naive.getUTCMonth();
      const d2 = naive.getUTCDate();
      const safe = new Date(Date.UTC(y2, mo2, d2, 12, 0, 0));
      const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Guatemala' };
      return safe.toLocaleString('es-GT', opts);
    }

    return fallback;
  } catch (_) {
    return fallback;
  }
}
