-- creado_en: DEFAULT + trigger para AppSheet (inserta NULL sin enviar fecha manual).
-- Ejecutar en MySQL/MariaDB (Hostinger) después de crear tablas LVL UP.
-- En AppSheet: no incluir creado_en en formularios de alta, o marcarlo solo lectura.

-- 1) Valor por defecto en columna (si la tabla se creó sin DEFAULT)
ALTER TABLE maestros_academicos
  MODIFY COLUMN creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE grupos_lvlup
  MODIFY COLUMN creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE asignacion_lvlup
  MODIFY COLUMN creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE sesion_lvlup
  MODIFY COLUMN creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE asistencia_lvlup
  MODIFY COLUMN creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2) Triggers: si AppSheet manda NULL o fecha vacía, usar NOW()
DROP TRIGGER IF EXISTS bi_maestros_academicos_creado_en;
CREATE TRIGGER bi_maestros_academicos_creado_en
BEFORE INSERT ON maestros_academicos
FOR EACH ROW
SET NEW.creado_en = IF(
  NEW.creado_en IS NULL OR NEW.creado_en IN ('0000-00-00 00:00:00', '0000-00-00'),
  CURRENT_TIMESTAMP,
  NEW.creado_en
);

DROP TRIGGER IF EXISTS bi_grupos_lvlup_creado_en;
CREATE TRIGGER bi_grupos_lvlup_creado_en
BEFORE INSERT ON grupos_lvlup
FOR EACH ROW
SET NEW.creado_en = IF(
  NEW.creado_en IS NULL OR NEW.creado_en IN ('0000-00-00 00:00:00', '0000-00-00'),
  CURRENT_TIMESTAMP,
  NEW.creado_en
);

DROP TRIGGER IF EXISTS bi_asignacion_lvlup_creado_en;
CREATE TRIGGER bi_asignacion_lvlup_creado_en
BEFORE INSERT ON asignacion_lvlup
FOR EACH ROW
SET NEW.creado_en = IF(
  NEW.creado_en IS NULL OR NEW.creado_en IN ('0000-00-00 00:00:00', '0000-00-00'),
  CURRENT_TIMESTAMP,
  NEW.creado_en
);

DROP TRIGGER IF EXISTS bi_sesion_lvlup_creado_en;
CREATE TRIGGER bi_sesion_lvlup_creado_en
BEFORE INSERT ON sesion_lvlup
FOR EACH ROW
SET NEW.creado_en = IF(
  NEW.creado_en IS NULL OR NEW.creado_en IN ('0000-00-00 00:00:00', '0000-00-00'),
  CURRENT_TIMESTAMP,
  NEW.creado_en
);

DROP TRIGGER IF EXISTS bi_asistencia_lvlup_creado_en;
CREATE TRIGGER bi_asistencia_lvlup_creado_en
BEFORE INSERT ON asistencia_lvlup
FOR EACH ROW
SET NEW.creado_en = IF(
  NEW.creado_en IS NULL OR NEW.creado_en IN ('0000-00-00 00:00:00', '0000-00-00'),
  CURRENT_TIMESTAMP,
  NEW.creado_en
);
