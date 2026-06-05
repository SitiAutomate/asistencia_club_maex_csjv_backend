import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env.js';
import { getEvaluacionesFotosDir } from '../utils/storagePaths.js';

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
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${safeBaseName}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
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

export const uploadEvaluacionFoto = (req, res, next) => {
  uploadEvaluacion.single('foto')(req, res, (err) => {
    if (err) return handleMulterUploadError(err, res);
    next();
  });
};
