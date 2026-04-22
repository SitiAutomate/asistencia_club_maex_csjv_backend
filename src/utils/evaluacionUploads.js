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
