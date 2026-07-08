-- =============================================================================
-- inscripciones_1 — columnas necesarias para LVL UP (Tipo = 4)
-- Ejecutar DESPUÉS de crear grupos_lvlup (schema-lvlup-tipo4.sql).
-- =============================================================================
--
-- La app usa estos campos al listar participantes:
--   Tipo = 4
--   validador_participante, IDCurso, Sede, Estado
--   `Sesión` ('Grupal' | 'Individual')  ← ojo: el nombre lleva tilde, usar backticks
--   asignatura (ID numérico de asignaturas.IDAsignatura)
--   grupo_lvlup_id (solo Grupal; FK a grupos_lvlup.id)
--
-- Verificar estado actual:
-- SHOW COLUMNS FROM inscripciones_1 LIKE 'Sesión';
-- SHOW COLUMNS FROM inscripciones_1 LIKE 'asignatura';
-- SHOW COLUMNS FROM inscripciones_1 LIKE 'grupo_lvlup_id';

-- -----------------------------------------------------------------------------
-- 1) Sesion — si no existe en tu BD (muchas ya la tienen por AppSheet)
-- -----------------------------------------------------------------------------
-- ALTER TABLE inscripciones_1
--   ADD COLUMN Sesion VARCHAR(20) NULL
--     COMMENT 'LVL UP: Grupal | Individual'
--     AFTER IDCurso;

-- -----------------------------------------------------------------------------
-- 2) asignatura — si no existe (ID de asignaturas.IDAsignatura)
-- -----------------------------------------------------------------------------
-- ALTER TABLE inscripciones_1
--   ADD COLUMN asignatura INT UNSIGNED NULL
--     COMMENT 'LVL UP: FK lógica a asignaturas.IDAsignatura'
--     AFTER Sesion;

-- -----------------------------------------------------------------------------
-- 3) grupo_lvlup_id — columna nueva principal para LVL UP grupal
-- -----------------------------------------------------------------------------
-- NOTA: MySQL NO soporta "ADD COLUMN IF NOT EXISTS" ni "CREATE INDEX IF NOT EXISTS"
-- (eso es solo MariaDB). Ejecuta cada bloque una vez; si ya existe, omítelo.
-- Verifica antes con: SHOW COLUMNS FROM inscripciones_1 LIKE 'grupo_lvlup_id';

ALTER TABLE inscripciones_1
  ADD COLUMN grupo_lvlup_id INT UNSIGNED NULL
    COMMENT 'FK grupos_lvlup.id — solo si Sesion=Grupal'
    AFTER asignatura;

-- Índice para joins con asignacion_lvlup / grupos_lvlup
-- Verifica antes con: SHOW INDEX FROM inscripciones_1 WHERE Key_name = 'idx_insc_grupo_lvlup';
CREATE INDEX idx_insc_grupo_lvlup
  ON inscripciones_1 (grupo_lvlup_id);

-- FK (omitir si grupos_lvlup aún no existe o si ya está creada)
-- Verifica antes con:
-- SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inscripciones_1'
--   AND CONSTRAINT_TYPE = 'FOREIGN KEY';
ALTER TABLE inscripciones_1
  ADD CONSTRAINT fk_insc_grupo_lvlup
  FOREIGN KEY (grupo_lvlup_id) REFERENCES grupos_lvlup(id);

-- -----------------------------------------------------------------------------
-- 4) Ejemplo: actualizar una inscripción Tipo=4 existente (grupal)
-- -----------------------------------------------------------------------------
-- SET @documento = '1234567890';
-- SET @grupo_id = (SELECT id FROM grupos_lvlup WHERE codigo = 'G1-TEST' LIMIT 1);
--
-- UPDATE inscripciones_1
-- SET
--   `Sesión` = 'Grupal',
--   asignatura = 1,
--   grupo_lvlup_id = @grupo_id,
--   Estado = 'CONFIRMADO'
-- WHERE Tipo = 4
--   AND TRIM(validador_participante) = TRIM(@documento)
--   AND TRIM(IDCurso) = '2351'
--   AND TRIM(Sede) = 'RETIRO';

-- -----------------------------------------------------------------------------
-- 5) Ejemplo: actualizar inscripción individual
-- -----------------------------------------------------------------------------
-- UPDATE inscripciones_1
-- SET
--   `Sesión` = 'Individual',
--   asignatura = 1,
--   grupo_lvlup_id = NULL,
--   Estado = 'CONFIRMADO'
-- WHERE Tipo = 4
--   AND TRIM(validador_participante) = '9876543210';
