import fs from 'fs';
import { resolveUploadsAbsoluteFromPublicPath, toUploadsPublicPathFromAbsolute } from './storagePaths.js';

export const toPublicUploadPath = (absolutePath) => {
  return toUploadsPublicPathFromAbsolute(absolutePath);
};

export const safeRemoveInformeFile = (informePublicPath) => {
  if (!informePublicPath) return;
  try {
    const abs = resolveUploadsAbsoluteFromPublicPath(informePublicPath);
    if (!abs || !fs.existsSync(abs)) return;
    fs.unlinkSync(abs);
  } catch {
    // Ignorar fallos al borrar PDF anterior.
  }
};

const pickNonEmptyUploadPath = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  return s;
};

export const parseEvaluacionId = (raw) => {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Prioridad: archivo nuevo subido → ruta enviada por el cliente → foto ya guardada en BD. */
export const resolveFotoEvaluacion = ({ fotoNueva, fotoExistente, fotoDb }) => {
  return (
    pickNonEmptyUploadPath(fotoNueva) ||
    pickNonEmptyUploadPath(fotoExistente) ||
    pickNonEmptyUploadPath(fotoDb) ||
    ''
  );
};

export const getUploadedFieldPath = (req, fieldName) => {
  const filesByField = Array.isArray(req.files?.[fieldName]) ? req.files[fieldName] : [];
  if (filesByField[0]?.path) {
    return toPublicUploadPath(filesByField[0].path);
  }

  if (Array.isArray(req.files)) {
    const preferred =
      req.files.find((file) => file.fieldname === fieldName) ||
      req.files.find((file) => Boolean(file.path));
    if (preferred?.path) {
      return toPublicUploadPath(preferred.path);
    }
  }

  if (req.file?.path && (!fieldName || req.file.fieldname === fieldName)) {
    return toPublicUploadPath(req.file.path);
  }

  return null;
};
