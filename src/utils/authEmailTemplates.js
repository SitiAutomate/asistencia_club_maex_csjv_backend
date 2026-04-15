import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveLogoPathForEmail } from './evaluacionEmail.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');

const LOGO_CID = 'logoAuthClub@cdsj';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const resolveFirstExistingPath = (paths) =>
  paths.find((candidate) => candidate && fs.existsSync(candidate)) || null;

/**
 * Logo solo del club para correos transaccionales (sin Maex u otros).
 * Coloca `logo-email.png` en `src/assets/` con el escudo únicamente; si no existe, usa logo.png.
 */
export function resolveAuthEmailLogoPath() {
  return (
    resolveFirstExistingPath([
      path.resolve(backendRoot, 'src', 'assets', 'logo-email.png'),
      path.resolve(backendRoot, 'src', 'assets', 'logo-escudo.png'),
      path.resolve(process.cwd(), 'src', 'assets', 'logo-email.png'),
      path.resolve(process.cwd(), 'src', 'assets', 'logo-escudo.png'),
      path.resolve(process.cwd(), 'assets', 'logo-email.png'),
      path.resolve(process.cwd(), 'assets', 'logo-escudo.png'),
    ]) || resolveLogoPathForEmail()
  );
}

const wrapEmailHtml = ({ inner }) => `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e8eef4;font-family:Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8eef4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(21,61,95,0.12);">
          <tr>
            <td style="padding:28px 28px 8px 28px;text-align:center;">
              ${inner}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;border-top:1px solid #e2e8f0;">
              <p style="margin:12px 0 0 0;font-size:12px;line-height:1.5;color:#64748b;text-align:center;">
                Club Deportivo San José de Las Vegas · Sistema de asistencia
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

/**
 * Botón compatible con Gmail/Outlook: color sólido (sin gradiente) y ancla con bgcolor explícito.
 */
const ctaButton = (href, label) => {
  const hAttr = escapeHtml(href);
  const l = escapeHtml(label);
  const bg = '#153d5f';
  return `
  <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin:24px auto;border-collapse:separate;">
    <tr>
      <td align="center" bgcolor="${bg}" style="background-color:${bg};border-radius:8px;">
        <a href="${hAttr}" target="_blank" rel="noopener noreferrer"
          style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;line-height:1.25;color:#ffffff;text-decoration:none;border-radius:8px;background-color:${bg};font-family:Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;mso-line-height-rule:exactly;">
          ${l}
        </a>
      </td>
    </tr>
  </table>`;
};

export function buildProveedorVerifyEmail({ nombre, verifyUrl }) {
  const name = String(nombre || '').trim() || 'proveedor';
  const greeting = `Estimado/a proveedor <strong>${escapeHtml(name)}</strong>,`;
  const logoPath = resolveAuthEmailLogoPath();
  const logoHtml = logoPath
    ? `<img src="cid:${LOGO_CID}" alt="Club Deportivo San José de Las Vegas" width="180" style="max-width:180px;height:auto;display:block;margin:0 auto 20px;border:0;" />`
    : '';

  const inner = `
    ${logoHtml}
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;color:#0d2840;text-align:left;">${greeting}</p>
    <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#334155;text-align:left;">
      Le damos la bienvenida al sistema de asistencia del Club Deportivo San José de Las Vegas.
      Para activar su cuenta y poder iniciar sesión como proveedor, confirme que esta dirección de correo es correcta.
    </p>
    <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#334155;text-align:left;">
      Pulse el botón siguiente para completar el registro:
    </p>
    ${ctaButton(verifyUrl, 'Confirmar mi cuenta')}
    <p style="margin:20px 0 0 0;font-size:13px;line-height:1.55;color:#64748b;text-align:left;">
      Si el botón no responde, copie y pegue este enlace en su navegador:<br/>
      <a href="${escapeHtml(verifyUrl)}" target="_blank" rel="noopener noreferrer" style="color:#1a5080;word-break:break-all;">${escapeHtml(verifyUrl)}</a>
    </p>
    <p style="margin:20px 0 0 0;font-size:13px;line-height:1.55;color:#64748b;text-align:left;">
      Si usted no solicitó este registro, ignore este mensaje; no se creará ninguna cuenta.
    </p>
    <p style="margin:24px 0 0 0;font-size:14px;line-height:1.5;color:#0d2840;text-align:left;">
      Cordialmente,<br/><strong>Club Deportivo San José de Las Vegas</strong>
    </p>
  `;

  const text = `Estimado/a proveedor ${name},

Le damos la bienvenida al sistema de asistencia del Club Deportivo San José de Las Vegas.

Para activar su cuenta, abra el siguiente enlace en su navegador:
${verifyUrl}

Si no solicitó este registro, ignore este mensaje.

Cordialmente,
Club Deportivo San José de Las Vegas`;

  const attachments = logoPath
    ? [{ filename: 'logo.png', path: logoPath, cid: LOGO_CID }]
    : [];

  return { html: wrapEmailHtml({ inner }), text, attachments };
}

export function buildProveedorResetEmail({ nombre, resetUrl }) {
  const name = String(nombre || '').trim() || 'proveedor';
  const greeting = `Estimado/a proveedor <strong>${escapeHtml(name)}</strong>,`;
  const logoPath = resolveAuthEmailLogoPath();
  const logoHtml = logoPath
    ? `<img src="cid:${LOGO_CID}" alt="Club Deportivo San José de Las Vegas" width="180" style="max-width:180px;height:auto;display:block;margin:0 auto 20px;border:0;" />`
    : '';

  const inner = `
    ${logoHtml}
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;color:#0d2840;text-align:left;">${greeting}</p>
    <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#334155;text-align:left;">
      Hemos recibido una solicitud para restablecer la contraseña de su cuenta como proveedor en nuestro sistema de asistencia.
    </p>
    <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#334155;text-align:left;">
      Si fue usted quien la solicitó, pulse el botón siguiente para elegir una contraseña nueva de forma segura:
    </p>
    ${ctaButton(resetUrl, 'Restablecer contraseña')}
    <p style="margin:20px 0 0 0;font-size:13px;line-height:1.55;color:#64748b;text-align:left;">
      Si el botón no responde, copie y pegue este enlace en su navegador:<br/>
      <a href="${escapeHtml(resetUrl)}" target="_blank" rel="noopener noreferrer" style="color:#1a5080;word-break:break-all;">${escapeHtml(resetUrl)}</a>
    </p>
    <p style="margin:20px 0 0 0;font-size:13px;line-height:1.55;color:#64748b;text-align:left;">
      Si no solicitó este cambio, puede ignorar este correo: su contraseña actual no se modificará.
    </p>
    <p style="margin:24px 0 0 0;font-size:14px;line-height:1.5;color:#0d2840;text-align:left;">
      Cordialmente,<br/><strong>Club Deportivo San José de Las Vegas</strong>
    </p>
  `;

  const text = `Estimado/a proveedor ${name},

Hemos recibido una solicitud para restablecer la contraseña de su cuenta como proveedor.

Si fue usted, abra el siguiente enlace en su navegador:
${resetUrl}

Si no solicitó este cambio, ignore este mensaje.

Cordialmente,
Club Deportivo San José de Las Vegas`;

  const attachments = logoPath
    ? [{ filename: 'logo.png', path: logoPath, cid: LOGO_CID }]
    : [];

  return { html: wrapEmailHtml({ inner }), text, attachments };
}
