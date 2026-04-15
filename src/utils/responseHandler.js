/**
 * Formato estándar para respuestas de error
 * Todos los errores siguen este formato para facilitar el manejo en el frontend
 */

/**
 * Envía una respuesta de error estándar
 * @param {Object} res - Response object de Express
 * @param {Number} statusCode - Código HTTP de estado (400, 404, 409, 500, etc.)
 * @param {String} message - Mensaje de error para mostrar al usuario
 * @param {String} [technicalError] - Detalle técnico (opcional, solo para logging)
 */
export const sendError = (res, statusCode, message, technicalError = null) => {
  const response = {
    success: false,
    message: message
  };

  // En desarrollo, incluir el error técnico si existe
  if (technicalError && process.env.NODE_ENV === 'development') {
    response.error = technicalError;
  }

  // Log del error técnico en consola
  if (technicalError) {
    console.error(`[${statusCode}] ${message}`, technicalError);
  }

  return res.status(statusCode).json(response);
};

/**
 * Envía una respuesta exitosa estándar
 * @param {Object} res - Response object de Express
 * @param {Number} statusCode - Código HTTP de estado (200, 201, etc.)
 * @param {String} message - Mensaje de éxito (opcional)
 * @param {Object} data - Datos a enviar en la respuesta
 */
export const sendSuccess = (res, statusCode, data, message = null) => {
  const response = {
    success: true,
    ...data
  };

  if (message) {
    response.message = message;
  }

  return res.status(statusCode).json(response);
};

/**
 * Maneja errores de Sequelize y otros errores de forma estándar
 * @param {Object} res - Response object de Express
 * @param {Error} error - Objeto de error
 * @param {String} defaultMessage - Mensaje por defecto si no se puede extraer del error
 */
export const handleError = (res, error, defaultMessage = 'Error interno del servidor') => {
  console.error('Error capturado:', error);

  // Errores de validación de Sequelize
  if (error?.name === 'SequelizeValidationError') {
    const messages = error.errors?.map(e => e.message).join(', ') || error.message;
    return sendError(res, 400, `Error de validación: ${messages}`, error.message);
  }

  // Errores de restricción única (duplicados)
  if (error?.name === 'SequelizeUniqueConstraintError') {
    return sendError(res, 409, 'El registro ya existe en la base de datos', error.message);
  }

  // Errores de foreign key
  if (error?.name === 'SequelizeForeignKeyConstraintError') {
    return sendError(res, 400, 'Referencia inválida: el registro relacionado no existe', error.message);
  }

  // Errores de base de datos
  if (error?.name === 'SequelizeDatabaseError') {
    return sendError(res, 500, 'Error en la base de datos', error.message);
  }

  // Error genérico
  const message = error?.message || defaultMessage;
  return sendError(res, 500, message, error?.stack);
};
