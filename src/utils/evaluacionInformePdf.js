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
import { normalizeMultilineTextForPdf } from './textNormalize.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 34;
const PAGE_MARGIN_Y = 100; // ~1cm

const resolveFirstExistingPath = (paths) =>
  paths.find((candidate) => candidate && fs.existsSync(candidate)) || null;

const resolveBackgroundPath = (linea) => {
  const lineaNumber = Number(linea || 1);
  const configuredPath = env.evaluaciones.fondoPath ? path.resolve(process.cwd(), env.evaluaciones.fondoPath) : null;
  const preferredFile = lineaNumber === 2 ? 'fondo_2' : 'fondo';

  return resolveFirstExistingPath([
    lineaNumber === 1 ? configuredPath : null,
    path.resolve(process.cwd(), 'src', 'assets', `${preferredFile}.jpg`),
    path.resolve(process.cwd(), 'src', 'assets', `${preferredFile}.jpeg`),
    path.resolve(process.cwd(), 'src', 'assets', `${preferredFile}.png`),
    path.resolve(backendRoot, 'src', 'assets', `${preferredFile}.jpg`),
    path.resolve(backendRoot, 'src', 'assets', `${preferredFile}.jpeg`),
    path.resolve(backendRoot, 'src', 'assets', `${preferredFile}.png`),
    path.resolve(process.cwd(), 'assets', `${preferredFile}.jpg`),
    path.resolve(process.cwd(), 'assets', `${preferredFile}.png`),
    // Fallback universal al fondo original.
    path.resolve(process.cwd(), 'src', 'assets', 'fondo.jpg'),
    path.resolve(backendRoot, 'src', 'assets', 'fondo.jpg'),
  ]);
};

const buildColorTheme = (linea) => {
  const lineaNumber = Number(linea || 1);
  if (lineaNumber === 2) {
    return {
      primary: '#FF6D00',
      primaryDark: '#111111',
      subtitle: '#2B2B2B',
      accentBorder: '#FF6D00',
      sectionTitle: '#111111',
      cardBg: '#F7F7F7',
      cardBorder: '#E2E2E2',
      cardTitle: '#1A1A1A',
      cardText: '#2E2E2E',
      commentBg: '#F7F7F7',
      commentBorder: '#E2E2E2',
      labelText: '#111111',
    };
  }
  return {
    primary: '#0A5B8F',
    primaryDark: '#0B3F6B',
    subtitle: '#2C7FB8',
    accentBorder: '#0A5B8F',
    sectionTitle: '#0B4B7A',
    cardBg: '#EAF0F6',
    cardBorder: '#D9E2EC',
    cardTitle: '#102A43',
    cardText: '#243B53',
    commentBg: '#F0F4F8',
    commentBorder: '#D9E2EC',
    labelText: '#102A43',
  };
};

const sanitizeForFileName = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'SIN_DATO';

/** Limpia texto de una línea para PDF (sin saltos de línea). */
const sanitizeForPdfText = (value) =>
  normalizeMultilineTextForPdf(value).replace(/\n/g, ' ').replace(/[^\S]+/g, ' ').trim();

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

const drawSection = (doc, title, subtitle, items, yStart, addStyledPage, theme) => {
  let y = yStart;
  doc.font('Helvetica-Bold').fontSize(20).fillColor(theme.sectionTitle).text(title, MARGIN_X, y);
  y += 28;
  doc
    .moveTo(MARGIN_X, y)
    .lineTo(PAGE_WIDTH - MARGIN_X, y)
    .lineWidth(1)
    .strokeColor(theme.primaryDark)
    .stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(theme.subtitle).text(subtitle, MARGIN_X, y);
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
    const nivelDescBaseText =
      sanitizeForPdfText(item.descripcion) || 'Sin descripción configurada para este nivel.';
    const nivelDescText = `Calificación otorgada: ${nivelDescBaseText}`;
    const titleHeight = doc.font('Helvetica-Bold').fontSize(13).heightOfString(titleText, {
      width: textWidth,
    });
    const nivelDescHeight = doc.font('Helvetica').fontSize(11.5).heightOfString(nivelDescText, {
      width: textWidth,
      lineGap: 2,
    });
    const blockHeight = Math.max(
      84,
      16 + badgeHeight + 8 + titleHeight + 8 + nivelDescHeight + 16,
    );

    if (y + blockHeight > PAGE_HEIGHT - PAGE_MARGIN_Y) {
      addStyledPage();
      y = PAGE_MARGIN_Y;
    }

    const badgeX = MARGIN_X + blockWidth - badgeWidth - 14;
    const badgeY = y + 12;

    doc
      .roundedRect(MARGIN_X, y, blockWidth, blockHeight, 8)
      .fillAndStroke(theme.cardBg, theme.cardBorder);
    doc.roundedRect(MARGIN_X, y, 5, blockHeight, 4).fill(theme.accentBorder);
    doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fill(theme.accentBorder);
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
      .fillColor(theme.cardTitle)
      .text(titleText, MARGIN_X + 16, y + 12 + badgeHeight + 8, { width: textWidth });
    doc
      .font('Helvetica')
      .fontSize(11.5)
      .fillColor(theme.cardText)
      .text(nivelDescText, MARGIN_X + 16, y + 12 + badgeHeight + 8 + titleHeight + 8, {
        width: textWidth,
        lineGap: 2,
      });
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
  linea,
  desempenosDestacados,
  desempenosActitudinales,
}) => {
  const participanteLimpio = sanitizeForPdfText(participante) || 'N/A';
  const categoriaLimpia = sanitizeForPdfText(categoriaNombre) || 'N/A';
  const comentarioLimpio =
    normalizeMultilineTextForPdf(comentario) || 'Sin comentarios del entrenador.';
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

  const theme = buildColorTheme(linea);
  const backgroundPath = resolveBackgroundPath(linea);
  if (!backgroundPath) {
    throw new Error('No se encontro fondo en rutas esperadas. Configura EVALUACION_FONDO_PATH');
  }

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
      .opacity(0.28)
      .image(backgroundPath, 0, 0, { width: PAGE_WIDTH, height: PAGE_HEIGHT })
      .restore();

  const addStyledPage = () => {
    doc.addPage({ size: 'A4', margin: 0 });
    drawBackground();
  };
  drawBackground();

  const lineaNum = Number(linea || 1);
  const tituloInstitucional =
    lineaNum === 2
      ? 'Experiential Learning Fundación Maex'
      : 'Club Deportivo San José de Las Vegas';

  let y = 92;
  doc
    .font('Times-Bold')
    .fontSize(21)
    .fillColor(theme.primaryDark)
    .text(tituloInstitucional, MARGIN_X, y, {
      width: PAGE_WIDTH - MARGIN_X * 2,
      align: 'center',
    });
  y += 44;
  doc
    .font('Times-Bold')
    .fontSize(17)
    .fillColor(theme.primary)
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
        .stroke(theme.accentBorder);
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

  addStyledPage();
  y = PAGE_MARGIN_Y;

  y = drawSection(
    doc,
    'Desempeños destacados',
    'Desempeños físicos, técnicos y/o tácticos',
    destacadosLimpios,
    y,
    addStyledPage,
    theme,
  );

  y += 12;
  if (y > PAGE_HEIGHT - (PAGE_MARGIN_Y + 180)) {
    addStyledPage();
    y = PAGE_MARGIN_Y;
  }

  y = drawSection(
    doc,
    'Desempeños actitudinales',
    'Evaluación del componente actitudinal',
    actitudinalesLimpios,
    y,
    addStyledPage,
    theme,
  );

  const commentWidth = PAGE_WIDTH - MARGIN_X * 2 - 28;
  const commentLines =
    comentarioLimpio === 'Sin comentarios del entrenador.'
      ? [comentarioLimpio]
      : comentarioLimpio.split('\n');
  const commentLineGap = 2;
  const commentLineHeight =
    doc.font('Helvetica').fontSize(11.5).currentLineHeight() + commentLineGap;
  const commentHeight = commentLines.reduce((sum, line) => {
    const h = doc.font('Helvetica').fontSize(11.5).heightOfString(line || ' ', {
      width: commentWidth,
      lineGap: commentLineGap,
    });
    return sum + Math.max(commentLineHeight, h);
  }, 0);
  const blockHeight = Math.max(84, 22 + commentHeight + 24);

  if (y + blockHeight + 56 > PAGE_HEIGHT - PAGE_MARGIN_Y) {
    addStyledPage();
    y = PAGE_MARGIN_Y;
  } else {
    y += 8;
  }

  doc
    .roundedRect(MARGIN_X, y, PAGE_WIDTH - MARGIN_X * 2, blockHeight, 8)
    .fillAndStroke(theme.commentBg, theme.commentBorder);
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(theme.cardTitle)
    .text('Comentarios del entrenador', MARGIN_X + 14, y + 12, {
      width: PAGE_WIDTH - MARGIN_X * 2 - 28,
    });
  let commentY = y + 34;
  doc.font('Helvetica').fontSize(11.5).fillColor(theme.cardText);
  for (const line of commentLines) {
    doc.text(line || ' ', MARGIN_X + 14, commentY, {
      width: commentWidth,
      lineGap: commentLineGap,
      lineBreak: false,
    });
    commentY += commentLineHeight;
  }
  y += blockHeight + 20;

  doc
    .font('Helvetica-Bold')
    .fontSize(12.5)
    .fillColor(theme.labelText)
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
