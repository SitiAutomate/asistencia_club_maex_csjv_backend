import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { toPublicUploadPath } from './evaluacionUploads.js';
import {
  getEvaluacionesFotosDir,
  getEvaluacionesInformesDir,
  getUploadsRootDir,
  resolveUploadsAbsoluteFromPublicPath,
} from './storagePaths.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 34;
const SUBTITLE_BLUE = '#2C7FB8';

const resolveFirstExistingPath = (paths) =>
  paths.find((candidate) => candidate && fs.existsSync(candidate)) || null;

const resolveBackgroundPath = () => {
  const configuredPath = env.evaluaciones.fondoPath
    ? path.resolve(process.cwd(), env.evaluaciones.fondoPath)
    : null;

  return resolveFirstExistingPath([
    configuredPath,
    path.resolve(process.cwd(), 'src', 'assets', 'fondo.jpg'),
    path.resolve(process.cwd(), 'src', 'assets', 'fondo.jpeg'),
    path.resolve(process.cwd(), 'src', 'assets', 'fondo.png'),
    path.resolve(backendRoot, 'src', 'assets', 'fondo.jpg'),
    path.resolve(backendRoot, 'src', 'assets', 'fondo.jpeg'),
    path.resolve(backendRoot, 'src', 'assets', 'fondo.png'),
    path.resolve(process.cwd(), 'assets', 'fondo.jpg'),
    path.resolve(process.cwd(), 'assets', 'fondo.png'),
  ]);
};

const resolveLogoPath = () =>
  resolveFirstExistingPath([
    env.evaluaciones.logoPath ? path.resolve(env.evaluaciones.logoPath) : null,
    env.evaluaciones.logoPath ? path.resolve(process.cwd(), env.evaluaciones.logoPath) : null,
    path.resolve(process.cwd(), 'src', 'assets', 'logo.webp'),
    path.resolve(process.cwd(), 'src', 'assets', 'logo.png'),
    path.resolve(backendRoot, 'src', 'assets', 'logo.webp'),
    path.resolve(backendRoot, 'src', 'assets', 'logo.png'),
    path.resolve(process.cwd(), 'assets', 'logo.webp'),
    path.resolve(process.cwd(), 'assets', 'logo.png'),
  ]);

const sanitizeForFileName = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'SIN_DATO';

/**
 * Limpia artefactos de codificación (ej: "Ð") y controles no imprimibles
 * para que no aparezcan símbolos raros en el PDF final.
 */
const sanitizeForPdfText = (value) =>
  String(value ?? '')
    .replace(/\u00D0/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/./g, (ch) => {
      const code = ch.charCodeAt(0);
      const isForbiddenControl =
        code === 0x7f || (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d);
      return isForbiddenControl ? '' : ch;
    })
    .trim();

const formatDateForFileName = (dateInput) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) return 'SIN_FECHA';
  return date.toISOString().slice(0, 10);
};

const tryConvertWebpToPng = async (sourcePath) => {
  if (!sourcePath?.toLowerCase().endsWith('.webp')) return sourcePath;
  const outputPath = sourcePath.replace(/\.webp$/i, '.png');
  await execFileAsync('sips', ['-s', 'format', 'png', sourcePath, '--out', outputPath]);
  return outputPath;
};

const resolvePhotoPath = (fotoPublicPath) => {
  if (!fotoPublicPath) return null;

  const fromPublic = resolveUploadsAbsoluteFromPublicPath(fotoPublicPath);
  if (fromPublic && fs.existsSync(fromPublic)) return fromPublic;

  const normalized = String(fotoPublicPath).replace(/\\/g, '/');
  const fileName = path.basename(normalized);
  const uploadsRoot = getUploadsRootDir();
  const fotosDir = getEvaluacionesFotosDir();

  return resolveFirstExistingPath([
    path.resolve(fotosDir, fileName),
    path.resolve(uploadsRoot, 'evaluaciones', fileName),
  ]);
};

const drawSection = (doc, title, subtitle, items, yStart, drawBackground) => {
  let y = yStart;
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#0B4B7A').text(title, MARGIN_X, y);
  y += 28;
  doc
    .moveTo(MARGIN_X, y)
    .lineTo(PAGE_WIDTH - MARGIN_X, y)
    .lineWidth(1)
    .strokeColor('#0B4B7A')
    .stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(SUBTITLE_BLUE).text(subtitle, MARGIN_X, y);
  y += 28;

  if (items.length === 0) {
    doc
      .font('Helvetica-Oblique')
      .fontSize(11)
      .fillColor('#486581')
      .text('No hay rúbricas para esta sección.', MARGIN_X, y);
    return y + 24;
  }

  for (const item of items) {
    const blockWidth = PAGE_WIDTH - MARGIN_X * 2;
    const badgePaddingX = 10;
    const badgeHeight = 18;
    const rawBadgeText = sanitizeForPdfText(item.valor || '');
    const badgeText =
      rawBadgeText.length > 22 ? `${rawBadgeText.slice(0, 21).trim()}…` : rawBadgeText;
    const badgeWidth = Math.min(
      180,
      Math.max(110, doc.font('Helvetica-Bold').fontSize(10).widthOfString(badgeText) + 16),
    );
    const textWidth = blockWidth - 32 - badgeWidth - badgePaddingX;
    const titleText = sanitizeForPdfText(item.nombre || 'Rúbrica');
    const generalDescBaseText =
      sanitizeForPdfText(item.descripcionGeneral) || 'Sin descripción general de la rúbrica.';
    const generalDescText = `Descripción: ${generalDescBaseText}`;
    const nivelDescBaseText =
      sanitizeForPdfText(item.descripcion) || 'Sin descripción configurada para este nivel.';
    const nivelDescText = `Calificación otorgada: ${nivelDescBaseText}`;
    const titleHeight = doc.font('Helvetica-Bold').fontSize(13).heightOfString(titleText, {
      width: textWidth,
    });
    const generalDescHeight = doc.font('Helvetica').fontSize(11.5).heightOfString(generalDescText, {
      width: textWidth,
      lineGap: 2,
    });
    const nivelDescHeight = doc.font('Helvetica').fontSize(11.5).heightOfString(nivelDescText, {
      width: textWidth,
      lineGap: 2,
    });
    const blockHeight = Math.max(
      96,
      16 + badgeHeight + 8 + titleHeight + 8 + generalDescHeight + 6 + nivelDescHeight + 16,
    );

    if (y + blockHeight > PAGE_HEIGHT - 40) {
      doc.addPage({ size: 'A4', margin: 0 });
      drawBackground();
      y = 44;
    }

    const badgeX = MARGIN_X + blockWidth - badgeWidth - 14;
    const badgeY = y + 12;

    doc
      .roundedRect(MARGIN_X, y, blockWidth, blockHeight, 8)
      .fillAndStroke('#EAF0F6', '#D9E2EC');
    doc.roundedRect(MARGIN_X, y, 5, blockHeight, 4).fill('#0A5B8F');
    doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fill('#0A5B8F');
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#FFFFFF')
      .text(badgeText, badgeX + 8, badgeY + 5, {
        width: badgeWidth - 16,
        align: 'center',
        lineBreak: false,
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#102A43')
      .text(titleText, MARGIN_X + 16, y + 12 + badgeHeight + 8, { width: textWidth });
    doc
      .font('Helvetica')
      .fontSize(11.5)
      .fillColor('#243B53')
      .text(generalDescText, MARGIN_X + 16, y + 12 + badgeHeight + 8 + titleHeight + 8, {
        width: textWidth,
        lineGap: 2,
      });
    doc
      .font('Helvetica')
      .fontSize(11.5)
      .fillColor('#243B53')
      .text(
        nivelDescText,
        MARGIN_X + 16,
        y + 12 + badgeHeight + 8 + titleHeight + 8 + generalDescHeight + 6,
        {
        width: textWidth,
        lineGap: 2,
        },
      );
    y += blockHeight + 14;
  }

  return y;
};

export const generateInformePdf = async ({
  participante,
  categoriaNombre,
  fechaCreacion,
  fotoPublicPath,
  comentario,
  responsableNombre,
  desempenosDestacados,
  desempenosActitudinales,
}) => {
  const participanteLimpio = sanitizeForPdfText(participante) || 'N/A';
  const categoriaLimpia = sanitizeForPdfText(categoriaNombre) || 'N/A';
  const comentarioLimpio = sanitizeForPdfText(comentario) || 'Sin comentarios del entrenador.';
  const responsableLimpio = sanitizeForPdfText(responsableNombre) || 'No definido';

  const destacadosLimpios = (desempenosDestacados || []).map((item) => ({
    ...item,
    nombre: sanitizeForPdfText(item?.nombre || 'Rúbrica'),
    valor: sanitizeForPdfText(item?.valor || ''),
    descripcionGeneral: sanitizeForPdfText(item?.descripcionGeneral || ''),
    descripcion: sanitizeForPdfText(item?.descripcion || ''),
  }));
  const actitudinalesLimpios = (desempenosActitudinales || []).map((item) => ({
    ...item,
    nombre: sanitizeForPdfText(item?.nombre || 'Rúbrica'),
    valor: sanitizeForPdfText(item?.valor || ''),
    descripcionGeneral: sanitizeForPdfText(item?.descripcionGeneral || ''),
    descripcion: sanitizeForPdfText(item?.descripcion || ''),
  }));

  const uploadsDir = getEvaluacionesInformesDir();
  fs.mkdirSync(uploadsDir, { recursive: true });

  const backgroundPath = resolveBackgroundPath();
  if (!backgroundPath) {
    throw new Error('No se encontro fondo en rutas esperadas. Configura EVALUACION_FONDO_PATH');
  }

  const logoPath = resolveLogoPath();
  const fileName = `INFORME_${sanitizeForFileName(participanteLimpio)}_${sanitizeForFileName(
    categoriaLimpia,
  )}_${formatDateForFileName(fechaCreacion)}.pdf`;
  const outputPath = path.join(uploadsDir, fileName);
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const drawBackground = () =>
    doc
      .save()
      .opacity(0.18)
      .image(backgroundPath, 0, 0, { width: PAGE_WIDTH, height: PAGE_HEIGHT })
      .restore();
  drawBackground();

  if (logoPath) {
    try {
      const safeLogoPath = await tryConvertWebpToPng(logoPath);
      doc.image(safeLogoPath, PAGE_WIDTH / 2 - 95, 42, { fit: [190, 86], align: 'center' });
    } catch {
      // Continue without logo if format fails.
    }
  }

  let y = 145;
  doc
    .font('Times-Bold')
    .fontSize(21)
    .fillColor('#0B3F6B')
    .text('Club Deportivo San José de Las Vegas y', MARGIN_X, y, {
      width: PAGE_WIDTH - MARGIN_X * 2,
      align: 'center',
    });
  y += 34;
  doc
    .font('Times-Bold')
    .fontSize(21)
    .fillColor('#0B3F6B')
    .text('Experiential Learning', MARGIN_X, y, {
      width: PAGE_WIDTH - MARGIN_X * 2,
      align: 'center',
    });
  y += 40;
  doc
    .font('Times-Bold')
    .fontSize(17)
    .fillColor('#0A5B8F')
    .text('Informe de avance de procesos formativos', MARGIN_X, y, {
      width: PAGE_WIDTH - MARGIN_X * 2,
      align: 'center',
    });
  y += 48;
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#111111')
    .text('CATEGORÍA:', MARGIN_X + 20, y, { continued: true })
    .font('Helvetica')
    .text(` ${categoriaLimpia}`);
  y += 34;
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#111111')
    .text('PARTICIPANTE:', MARGIN_X + 20, y, { continued: true })
    .font('Helvetica')
    .text(` ${participanteLimpio}`);
  y += 22;

  const fotoAbsolutePath = resolvePhotoPath(fotoPublicPath);
  if (fotoAbsolutePath && fs.existsSync(fotoAbsolutePath)) {
    try {
      const safePhotoPath = await tryConvertWebpToPng(fotoAbsolutePath);
      const frameWidth = 230;
      const frameHeight = 230;
      const frameY = y + 12;
      const imageOptions = { fit: [frameWidth - 16, frameHeight - 16] };
      const imageSize = doc.openImage(safePhotoPath);
      const maxW = imageOptions.fit[0];
      const maxH = imageOptions.fit[1];
      const ratio = Math.min(maxW / imageSize.width, maxH / imageSize.height);
      const drawW = Math.max(1, Math.round(imageSize.width * ratio));
      const drawH = Math.max(1, Math.round(imageSize.height * ratio));
      const dynamicFrameW = drawW + 16;
      const dynamicFrameH = drawH + 16;
      const dynamicFrameX = (PAGE_WIDTH - dynamicFrameW) / 2;
      const dynamicFrameY = frameY;

      doc
        .roundedRect(dynamicFrameX + 3, dynamicFrameY + dynamicFrameH - 1, dynamicFrameW, 4, 2)
        .fillColor('#B7BEC8')
        .fill();
      doc
        .roundedRect(dynamicFrameX + dynamicFrameW - 1, dynamicFrameY + 3, 4, dynamicFrameH, 2)
        .fillColor('#B7BEC8')
        .fill();

      doc
        .roundedRect(dynamicFrameX, dynamicFrameY, dynamicFrameW, dynamicFrameH, 10)
        .lineWidth(2)
        .stroke('#0A5B8F');
      doc.image(safePhotoPath, dynamicFrameX + 8, dynamicFrameY + 8, {
        width: drawW,
        height: drawH,
        align: 'center',
        valign: 'center',
      });
      y = dynamicFrameY + dynamicFrameH + 26;
    } catch {
      // Si la imagen no se puede procesar, se mantiene la primera página sin foto.
    }
  }

  doc.addPage({ size: 'A4', margin: 0 });
  drawBackground();
  y = 44;

  y = drawSection(
    doc,
    'Desempeños destacados',
    'Desempeños físicos, técnicos y/o tácticos',
    destacadosLimpios,
    y,
    drawBackground,
  );

  y += 12;
  if (y > PAGE_HEIGHT - 220) {
    doc.addPage({ size: 'A4', margin: 0 });
    drawBackground();
    y = 44;
  }

  y = drawSection(
    doc,
    'Desempeños actitudinales',
    'Evaluación del componente actitudinal',
    actitudinalesLimpios,
    y,
    drawBackground,
  );

  const commentText = comentarioLimpio;
  const commentHeight = doc.font('Helvetica').fontSize(11.5).heightOfString(commentText, {
    width: PAGE_WIDTH - MARGIN_X * 2 - 28,
    lineGap: 2,
  });
  const blockHeight = Math.max(84, 22 + commentHeight + 24);

  if (y + blockHeight + 56 > PAGE_HEIGHT - 40) {
    doc.addPage({ size: 'A4', margin: 0 });
    drawBackground();
    y = 44;
  } else {
    y += 8;
  }

  doc
    .roundedRect(MARGIN_X, y, PAGE_WIDTH - MARGIN_X * 2, blockHeight, 8)
    .fillAndStroke('#F0F4F8', '#D9E2EC');
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#102A43')
    .text('Comentarios del entrenador', MARGIN_X + 14, y + 12, {
      width: PAGE_WIDTH - MARGIN_X * 2 - 28,
    });
  doc
    .font('Helvetica')
    .fontSize(11.5)
    .fillColor('#243B53')
    .text(commentText, MARGIN_X + 14, y + 34, {
      width: PAGE_WIDTH - MARGIN_X * 2 - 28,
      lineGap: 2,
    });
  y += blockHeight + 20;

  doc
    .font('Helvetica-Bold')
    .fontSize(12.5)
    .fillColor('#102A43')
    .text('ENTRENADOR:', MARGIN_X, y, { continued: true })
    .font('Helvetica-Bold')
    .fontSize(12.5)
    .text(` ${responsableLimpio.toUpperCase()}`);

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return toPublicUploadPath(outputPath);
};
