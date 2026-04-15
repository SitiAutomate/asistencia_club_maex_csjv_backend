import fs from 'fs';
import path from 'path';

export const toPublicUploadPath = (absolutePath) => {
  if (!absolutePath) return null;
  const relative = path.relative(process.cwd(), absolutePath);
  return `/${relative.replace(/\\/g, '/')}`;
};

export const safeRemoveInformeFile = (informePublicPath) => {
  if (!informePublicPath) return;
  try {
    const rel = String(informePublicPath).replace(/^\/+/, '');
    const abs = path.resolve(process.cwd(), rel);
    const uploadsBase = path.resolve(process.cwd(), 'uploads');
    if (!abs.startsWith(uploadsBase) || !fs.existsSync(abs)) return;
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
