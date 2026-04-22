import path from 'path';
import { env } from '../config/env.js';

export const getUploadsRootDir = () => path.resolve(env.app.uploadsDir || 'uploads');

export const getEvaluacionesRootDir = () => path.join(getUploadsRootDir(), 'evaluaciones');

export const getEvaluacionesFotosDir = () => path.join(getEvaluacionesRootDir(), 'fotos');

export const getEvaluacionesInformesDir = () => path.join(getEvaluacionesRootDir(), 'informes');

export const toUploadsPublicPathFromAbsolute = (absolutePath) => {
  if (!absolutePath) return null;
  const rel = path.relative(getUploadsRootDir(), absolutePath);
  if (!rel || rel.startsWith('..')) return null;
  return `/uploads/${rel.replace(/\\/g, '/')}`;
};

export const resolveUploadsAbsoluteFromPublicPath = (publicPath) => {
  if (!publicPath) return null;
  const normalized = String(publicPath).replace(/\\/g, '/');
  const rel = normalized.replace(/^\/+/, '').replace(/^uploads\/+/i, '');
  const abs = path.resolve(getUploadsRootDir(), rel);
  if (!abs.startsWith(getUploadsRootDir())) return null;
  return abs;
};
