-- Correcciones si ya creaste las tablas con VARCHAR o el CHECK estricto falla.
-- Ejecutar por bloques según lo que aplique en tu BD.

-- 1) id_asignatura → INT (grupos_lvlup, asignacion_lvlup, asistencia_lvlup)
-- ALTER TABLE grupos_lvlup
--   MODIFY COLUMN id_asignatura INT UNSIGNED NOT NULL COMMENT 'FK asignaturas.IDAsignatura';
-- ALTER TABLE asignacion_lvlup
--   MODIFY COLUMN id_asignatura INT UNSIGNED NOT NULL;
-- ALTER TABLE asistencia_lvlup
--   MODIFY COLUMN id_asignatura INT UNSIGNED NOT NULL;

-- 2) CHECK más tolerante (MariaDB: DROP CONSTRAINT, no DROP CHECK)
-- Ver nombre real del constraint:
-- SELECT CONSTRAINT_NAME, CHECK_CLAUSE
-- FROM information_schema.CHECK_CONSTRAINTS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asignacion_lvlup';

ALTER TABLE asignacion_lvlup DROP CONSTRAINT IF EXISTS chk_asig_lvlup_sesion;

ALTER TABLE asignacion_lvlup
  ADD CONSTRAINT chk_asig_lvlup_sesion CHECK (
    (
      sesion = 'Individual'
      AND grupo_id IS NULL
      AND NULLIF(TRIM(validador_participante), '') IS NOT NULL
    )
    OR
    (
      sesion = 'Grupal'
      AND grupo_id IS NOT NULL
      AND NULLIF(TRIM(validador_participante), '') IS NULL
    )
  );

-- 3) Limpiar filas con '' en lugar de NULL (si AppSheet dejó cadenas vacías)
-- UPDATE asignacion_lvlup
-- SET validador_participante = NULL
-- WHERE sesion = 'Grupal' AND TRIM(COALESCE(validador_participante, '')) = '';

-- 4) Ejemplo INSERT grupal correcto
-- INSERT INTO asignacion_lvlup (
--   maestro_id, sede, id_curso, id_asignatura, sesion, grupo_id,
--   validador_participante, anio, mes, tipo_paquete, estado
-- ) VALUES (
--   1, 'RETIRO', '2351', 12, 'Grupal', 1,
--   NULL, 2026, 6, '16H', 'ACTIVO'
-- );

-- 5) Ejemplo INSERT individual correcto
-- INSERT INTO asignacion_lvlup (
--   maestro_id, sede, id_curso, id_asignatura, sesion, grupo_id,
--   validador_participante, anio, mes, tipo_paquete, estado
-- ) VALUES (
--   1, 'RETIRO', '2351', 12, 'Individual', NULL,
--   '1234567890', 2026, 6, '8H', 'ACTIVO'
-- );
