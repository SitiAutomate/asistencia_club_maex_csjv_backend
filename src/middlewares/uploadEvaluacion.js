import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env.js';
import { getEvaluacionesFotosDir } from '../utils/storagePaths.js';
import {
  hasSuspiciousDoubleExtension,
  validateImageMagicBytes,
} from '../utils/imageValidation.js';

export const evaluacionFotoMaxBytes = env.evaluaciones.fotoMaxBytes;
export const evaluacionFotoMaxMb = Math.round(evaluacionFotoMaxBytes / (1024 * 1024));

export const evaluacionFotoMaxSizeMessage = () =>
  `La foto supera el tamaño máximo permitido (${evaluacionFotoMaxMb} MB). Elige otra imagen o reduce su tamaño.`;

const fotosDir = getEvaluacionesFotosDir();

fs.mkdirSync(fotosDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, fotosDir);
  },
  filename: (req, file, cb) => {
    const safeBaseName = path
      .parse(file.originalname)
      .name
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 80);
    cb(null, `${Date.now()}-${safeBaseName}.upload`);
  },
});

const fileFilter = (req, file, cb) => {
  if (hasSuspiciousDoubleExtension(file.originalname)) {
    cb(new Error('Nombre de archivo no permitido'));
    return;
  }

  const mime = String(file.mimetype || '').toLowerCase();
  const ext = String(path.extname(file.originalname || '')).toLowerCase();
  const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const isImageByMime = mime.startsWith('image/');
  const isImageByExt = allowedExtensions.has(ext);

  if (!isImageByMime && !isImageByExt) {
    cb(new Error(`Tipo de archivo no permitido para ${file.fieldname}`));
    return;
  }

  cb(null, true);
};

export const uploadEvaluacion = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: evaluacionFotoMaxBytes,
  },
});

export const handleMulterUploadError = (err, res) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      ok: false,
      success: false,
      message: evaluacionFotoMaxSizeMessage(),
    });
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      ok: false,
      success: false,
      message: 'Solo se permite un archivo de foto.',
    });
  }
  return res.status(400).json({
    ok: false,
    success: false,
    message: String(err?.message || 'Error al subir la foto'),
  });
};

const finalizeUploadedImage = (req, res) => {
  if (!req.file?.path) return true;

  const detected = validateImageMagicBytes(req.file.path);
  if (!detected) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({
      ok: false,
      success: false,
      message: 'El archivo no es una imagen valida (JPEG, PNG o WebP).',
    });
    return false;
  }

  const finalName = `${Date.now()}-foto${detected.ext}`;
  const finalPath = path.join(path.dirname(req.file.path), finalName);
  fs.renameSync(req.file.path, finalPath);
  req.file.path = finalPath;
  req.file.filename = finalName;
  return true;
};

export const uploadEvaluacionFoto = (req, res, next) => {
  uploadEvaluacion.single('foto')(req, res, (err) => {
    if (err) return handleMulterUploadError(err, res);
    if (!finalizeUploadedImage(req, res)) return;
    next();
  });
};
