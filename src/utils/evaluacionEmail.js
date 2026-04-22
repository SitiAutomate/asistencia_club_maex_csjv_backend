import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { resolveUploadsAbsoluteFromPublicPath } from './storagePaths.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');

const LOGO_CLUB_CID = 'logoClub@cdsj';
const LOGO_MAEX_CID = 'logoMaex@cdsj';

const resolveFirstExistingPath = (paths) =>
  paths.find((candidate) => candidate && fs.existsSync(candidate)) || null;

const tryConvertWebpToPng = async (sourcePath) => {
  if (!sourcePath?.toLowerCase().endsWith('.webp')) return sourcePath;
  const outputPath = sourcePath.replace(/\.webp$/i, '.png');
  await execFileAsync('sips', ['-s', 'format', 'png', sourcePath, '--out', outputPath]);
  return outputPath;
};

/** PNG/JPEG primero (mejor soporte en clientes de correo); WebP como último recurso. */
export const resolveLogoPathForEmail = () =>
  resolveFirstExistingPath([
    env.evaluaciones.logoPath ? path.resolve(env.evaluaciones.logoPath) : null,
    env.evaluaciones.logoPath ? path.resolve(process.cwd(), env.evaluaciones.logoPath) : null,
    path.resolve(process.cwd(), 'src', 'assets', 'logo.png'),
    path.resolve(backendRoot, 'src', 'assets', 'logo.png'),
    path.resolve(process.cwd(), 'assets', 'logo.png'),
    path.resolve(process.cwd(), 'src', 'assets', 'logo.jpg'),
    path.resolve(process.cwd(), 'src', 'assets', 'logo.jpeg'),
    path.resolve(backendRoot, 'src', 'assets', 'logo.jpg'),
    path.resolve(backendRoot, 'src', 'assets', 'logo.jpeg'),
    path.resolve(process.cwd(), 'src', 'assets', 'logo.webp'),
    path.resolve(backendRoot, 'src', 'assets', 'logo.webp'),
    path.resolve(process.cwd(), 'assets', 'logo.webp'),
    path.resolve(process.cwd(), 'assets', 'logo.png'),
  ]);

/** Logo Maex (opcional): coloca logo-maex.png o maex.png en src/assets o assets/. */
export const resolveMaexLogoPathForEmail = () =>
  resolveFirstExistingPath([
    env.evaluaciones.logoMaexPath ? path.resolve(env.evaluaciones.logoMaexPath) : null,
    env.evaluaciones.logoMaexPath ? path.resolve(process.cwd(), env.evaluaciones.logoMaexPath) : null,
    path.resolve(backendRoot, 'src', 'assets', 'logo-maex.png'),
    path.resolve(process.cwd(), 'src', 'assets', 'logo-maex.png'),
    path.resolve(backendRoot, 'src', 'assets', 'maex.png'),
    path.resolve(process.cwd(), 'src', 'assets', 'maex.png'),
    path.resolve(process.cwd(), 'assets', 'logo-maex.png'),
    path.resolve(process.cwd(), 'assets', 'maex.png'),
    path.resolve(backendRoot, 'src', 'assets', 'logo-maex.webp'),
    path.resolve(process.cwd(), 'src', 'assets', 'logo-maex.webp'),
  ]);

export const resolveInformeAbsolutePath = (informePublicPath) => {
  return resolveUploadsAbsoluteFromPublicPath(informePublicPath);
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildInformeCorreoCuerpo = ({ participante, nombreCategoria }) => {
  const p = participante || 'Participante';
  const c = nombreCategoria || 'Categoría';
  return `Queridas familias,

Reciban un cordial saludo.

Adjunto a este correo encontrarás el informe de desempeño correspondiente a:

Participante: ${p}
Categoría: ${c}
Este informe hace parte del proceso de formación integral que promovemos en el Club Deportivo San José de Las Vegas y Maex, donde buscamos potenciar no solo las habilidades deportivas, sino también el desarrollo personal de cada uno de nuestros estudiantes

Si tienes alguna inquietud o comentario, envíanos un correo a clubdeportivo@sanjosevegas.edu.co Estaremos encantados de acompañarte en este camino.

¡Gracias por la confianza y el compromiso con el proceso!

Club Deportivo San José de Las Vegas Maex

Este correo es informativo, por favor no responderlo`;
};

export const buildInformeCorreoHtml = ({
  participante,
  nombreCategoria,
  includeClubLogo,
  includeMaexLogo,
}) => {
  const p = escapeHtml(participante || 'Participante');
  const c = escapeHtml(nombreCategoria || 'Categoría');

  const bgPage = '#f4f4f4';
  const card = '#ffffff';
  const titleBlue = '#2c3e50';
  const muted = '#7f8c8d';
  const bodyText = '#2c2c2c';
  const line = '#e8e8e8';
  const linkBlue = '#2563eb';
  const footerBg = '#ececec';
  const ff = 'Arial,Helvetica,sans-serif';

  const logoCells = [];
  if (includeMaexLogo) {
    logoCells.push(
      `<td valign="middle" align="center" style="padding:0 12px;"><img src="cid:${LOGO_MAEX_CID}" alt="Maex" height="44" style="display:block;height:44px;width:auto;max-width:160px;border:0;" /></td>`,
    );
  }
  if (includeClubLogo) {
    logoCells.push(
      `<td valign="middle" align="center" style="padding:0 12px;"><img src="cid:${LOGO_CLUB_CID}" alt="Club Deportivo San José" height="52" style="display:block;height:52px;width:auto;max-width:180px;border:0;" /></td>`,
    );
  }
  const logosRow =
    logoCells.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr>${logoCells.join('')}</tr></table>`
      : '';

  const row = (label, value) => `<tr>
<td style="padding:14px 0;border-bottom:1px solid ${line};font-family:${ff};font-size:15px;line-height:1.5;color:${bodyText};">
<strong style="color:${titleBlue};">${label}</strong>
<span style="color:${bodyText};"> ${value}</span>
</td>
</tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe de desempeño</title>
</head>
<body style="margin:0;padding:0;background:${bgPage};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bgPage};">
<tr>
<td align="center" style="padding:28px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${card};border-radius:12px;border-collapse:separate;border:1px solid ${line};box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<tr>
<td style="padding:28px 32px 8px;font-family:${ff};" align="center">
${logosRow}
<p style="margin:18px 0 0;font-size:17px;font-weight:700;color:${titleBlue};line-height:1.35;">Club Deportivo y Maex</p>
</td>
</tr>
<tr>
<td style="padding:0 32px 20px;"><div style="height:1px;background:${line};line-height:0;font-size:0;">&nbsp;</div></td>
</tr>
<tr>
<td style="padding:0 32px 8px;font-family:${ff};">
<p style="margin:0;font-size:18px;font-weight:700;color:${titleBlue};line-height:1.35;">✓ Informe de desempeño</p>
<p style="margin:10px 0 0;font-size:14px;line-height:1.55;color:${muted};">Queridas familias, reciban un cordial saludo. Adjunto encontrarán el documento correspondiente al siguiente detalle:</p>
</td>
</tr>
<tr>
<td style="padding:8px 32px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
${row('Participante:', p)}
${row('Categoría:', c)}
</table>
</td>
</tr>
<tr>
<td style="padding:0 32px 20px;font-family:${ff};font-size:15px;line-height:1.65;color:${muted};">
<p style="margin:0;">Este informe hace parte del proceso de formación integral que promovemos en el Club Deportivo San José de Las Vegas y Maex, donde buscamos potenciar no solo las habilidades deportivas, sino también el desarrollo personal de cada uno de nuestros estudiantes.</p>
</td>
</tr>
<tr>
<td style="padding:0 32px 18px;font-family:${ff};">
<p style="margin:0;font-size:16px;font-weight:700;line-height:1.45;color:#a40000;">Este correo es informativo, por favor no responderlo</p>
</td>
</tr>
<tr>
<td style="padding:0 32px 22px;font-family:${ff};font-size:15px;line-height:1.6;color:${muted};">
Si tienen alguna inquietud o comentario, contáctenos en <a href="mailto:clubdeportivo@sanjosevegas.edu.co" style="color:${linkBlue};text-decoration:underline;">clubdeportivo@sanjosevegas.edu.co</a>. Estaremos encantados de acompañarlos en este camino.
</td>
</tr>
<tr>
<td style="padding:0 32px 24px;font-family:${ff};font-size:15px;line-height:1.55;color:${bodyText};">
<p style="margin:0;">¡Gracias por la confianza y el compromiso con el proceso!</p>
</td>
</tr>
<tr>
<td style="padding:16px 32px;background:${footerBg};border-radius:0 0 11px 11px;font-family:${ff};font-size:12px;line-height:1.5;color:${muted};text-align:center;">
Club Deportivo y Maex · San José de Las Vegas
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
};

async function prepareLogoFileForCid(absolutePath) {
  if (!absolutePath) return null;
  if (absolutePath.toLowerCase().endsWith('.webp')) {
    try {
      return await tryConvertWebpToPng(absolutePath);
    } catch {
      return null;
    }
  }
  return absolutePath;
}

/** Evita repetir conversión WebP (sips) y lecturas en cada envío. */
let cachedInlineLogoPayload = null;

async function buildInlineLogoAttachments() {
  const extras = [];
  const clubPath = await prepareLogoFileForCid(resolveLogoPathForEmail());
  const maexPath = await prepareLogoFileForCid(resolveMaexLogoPathForEmail());
  if (clubPath) {
    extras.push({
      filename: path.basename(clubPath),
      path: clubPath,
      cid: LOGO_CLUB_CID,
    });
  }
  if (maexPath) {
    extras.push({
      filename: path.basename(maexPath),
      path: maexPath,
      cid: LOGO_MAEX_CID,
    });
  }
  return {
    attachments: extras,
    includeClubLogo: Boolean(clubPath),
    includeMaexLogo: Boolean(maexPath),
  };
}

async function getCachedInlineLogoPayload() {
  if (!cachedInlineLogoPayload) {
    cachedInlineLogoPayload = await buildInlineLogoAttachments();
  }
  return cachedInlineLogoPayload;
}

let sharedTransporter = null;

function getInformeMailTransporter() {
  const { host, port, user, pass, secure } = env.email;
  if (!host) return null;
  if (!sharedTransporter) {
    sharedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass != null && pass !== '' ? { user, pass } : undefined,
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
    });
  }
  return sharedTransporter;
}

export const sendEvaluacionInformeEmail = async ({
  to,
  participante,
  nombreCategoria,
  attachmentPath,
}) => {
  const { user } = env.email;

  const transporter = getInformeMailTransporter();
  if (!transporter) {
    throw new Error('Transporte de correo no configurado');
  }

  const text = buildInformeCorreoCuerpo({ participante, nombreCategoria });
  const { attachments: logoAttachments, includeClubLogo, includeMaexLogo } =
    await getCachedInlineLogoPayload();
  const html = buildInformeCorreoHtml({
    participante,
    nombreCategoria,
    includeClubLogo,
    includeMaexLogo,
  });
  const filename = path.basename(attachmentPath);

  const attachments = [{ path: attachmentPath, filename }, ...logoAttachments];

  await transporter.sendMail({
    from: user,
    to,
    subject: `Informe de desempeño — ${participante || 'participante'}`,
    text,
    html,
    attachments,
  });
};

export const isInformeFileReadable = (absolutePath) =>
  Boolean(absolutePath && fs.existsSync(absolutePath));
