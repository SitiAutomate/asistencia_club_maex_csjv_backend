-- =============================================================================
-- Alinear collations LVL UP con inscripciones_1 (evita error 1267)
-- =============================================================================
-- Problema: inscripciones_1 (AppSheet) usa utf8mb4_general_ci y las tablas LVL UP
-- creadas en MySQL 8 usan utf8mb4_0900_ai_ci. Al comparar columnas de texto en
-- los JOIN sale: "Illegal mix of collations ... for operation '='".
--
-- Solución permanente: convertir las tablas LVL UP a utf8mb4_general_ci para que
-- coincidan con inscripciones_1. Tras esto, la app no necesita cláusulas COLLATE.
--
-- 1) Confirmar la collation real de inscripciones_1 (debe ser utf8mb4_general_ci)
-- SELECT TABLE_NAME, TABLE_COLLATION
-- FROM information_schema.TABLES
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME IN ('inscripciones_1','participantes',
--                      'grupos_lvlup','asignacion_lvlup','sesion_lvlup','asistencia_lvlup');
--
-- Si inscripciones_1 usa otra collation (p.ej. utf8mb4_unicode_ci), reemplaza
-- utf8mb4_general_ci por esa en TODOS los ALTER de abajo.

-- 2) Convertir tablas LVL UP. El orden respeta las FKs (hijas primero al revertir,
--    pero CONVERT no borra datos). Si alguna FK bloquea el CONVERT, desactiva
--    temporalmente la verificación:
-- SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE maestros_academicos
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

ALTER TABLE grupos_lvlup
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

ALTER TABLE asignacion_lvlup
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

ALTER TABLE sesion_lvlup
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

ALTER TABLE asistencia_lvlup
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- SET FOREIGN_KEY_CHECKS = 1;

-- 3) Verificar que quedaron todas en utf8mb4_general_ci
-- SELECT TABLE_NAME, TABLE_COLLATION
-- FROM information_schema.TABLES
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME IN ('grupos_lvlup','asignacion_lvlup','sesion_lvlup','asistencia_lvlup','maestros_academicos');
