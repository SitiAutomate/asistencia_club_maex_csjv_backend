import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getEvaluacionesFotosDir } from '../utils/storagePaths.js';

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
    fileSize: 10 * 1024 * 1024,
  },
});
