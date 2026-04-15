import { logger } from '../config/logger.js';

export const notFound = (req, res) => {
  res.status(404).json({
    ok: false,
    message: `No existe ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (err, req, res) => {
  logger.error(`${req.method} ${req.originalUrl} - ${err.message}`);

  res.status(err.status || 500).json({
    ok: false,
    message: err.message || 'Error interno del servidor',
  });
};
