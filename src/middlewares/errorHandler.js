import { logger } from '../config/logger.js';

export const notFound = (req, res) => {
  res.status(404).json({
    ok: false,
    message: `No existe ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (err, req, res) => {
  logger.error(`${req.method} ${req.originalUrl} - ${err.message}`);

  if (err?.name === 'MulterError' && err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      ok: false,
      success: false,
      message: 'La foto supera el tamaño máximo permitido. Elige otra imagen o reduce su tamaño.',
    });
  }

  res.status(err.status || 500).json({
    ok: false,
    message: err.message || 'Error interno del servidor',
  });
};
