import fs from 'fs';
import { sendError } from '../utils/responseHandler.js';
import { resolveUploadsAbsoluteFromPublicPath } from '../utils/storagePaths.js';
import { userCanAccessUploadPath } from '../utils/courseAccess.js';

export const serveAuthenticatedUpload = async (req, res) => {
  try {
    const relPath = String(req.path || '').replace(/^\/+/, '');
    if (!relPath || relPath.includes('..')) {
      return sendError(res, 400, 'Ruta de archivo invalida');
    }

    const publicPath = `/uploads/${relPath}`;
    const allowed = await userCanAccessUploadPath(req.user, publicPath);
    if (!allowed) {
      return sendError(res, 403, 'No tiene permisos para acceder a este archivo');
    }

    const absolutePath = resolveUploadsAbsoluteFromPublicPath(publicPath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return sendError(res, 404, 'Archivo no encontrado');
    }

    res.sendFile(absolutePath);
  } catch (error) {
    return sendError(res, 500, 'Error al servir el archivo', error.message);
  }
};
