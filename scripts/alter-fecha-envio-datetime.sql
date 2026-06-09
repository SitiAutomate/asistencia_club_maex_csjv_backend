-- Ejecutar una vez en MySQL/MariaDB de producción.
-- Convierte fechaEnvio a DATETIME para guardar fecha y hora de envío (hora Colombia en aplicación).

ALTER TABLE evaluaciones
  MODIFY COLUMN fechaEnvio DATETIME NULL DEFAULT NULL;

-- Índices recomendados para panel administrador (opcional, acelera filtros por periodo):
-- CREATE INDEX idx_eval_fecha_creacion ON evaluaciones (fecha_creacion);
-- CREATE INDEX idx_eval_ident_cat ON evaluaciones (identificacion(32), categoria(32));
