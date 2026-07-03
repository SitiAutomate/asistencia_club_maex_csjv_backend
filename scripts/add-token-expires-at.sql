-- Añade expiración a tokens de verificación y restablecimiento de contraseña.
-- Ejecutar una vez en la base de datos del club.

ALTER TABLE usuarios
  ADD COLUMN token_expires_at DATETIME NULL DEFAULT NULL
  AFTER token;
