-- =============================================================================
-- LVL UP — asistencia por horas (inscripciones_1.Tipo = 4)
-- AppSheet escribe directo a MySQL. La app React solo toma asistencia.
-- =============================================================================
--
-- FLUJO COMPLETO DE LA INFORMACIÓN
-- --------------------------------
--
--  1. inscripciones_1 (Tipo=4)     ← ENTRADA PRINCIPAL (AppSheet / inscripciones)
--     │  Quién está inscrito, sede, IDCurso, Sesion, asignatura, mes, año
--     │
--     ├─ Sesion = Individual  →  grupo_lvlup_id queda NULL
--     │
--     └─ Sesion = Grupal      →  AppSheet asigna grupo_lvlup_id al inscribir
--                                al grupo (UN solo lugar define la pertenencia)
--
--  2. maestros_academicos          ← Catálogo de maestros (AppSheet)
--
--  3. grupos_lvlup                 ← Cabecera del grupo (solo Grupal)
--     │  sede + curso + asignatura + mes/año
--     │  NO lista alumnos: los alumnos vienen de inscripciones_1.grupo_lvlup_id
--     │
--  4. asignacion_lvlup             ← Operación: maestro + paquete + a quién enseña
--     │  Individual → maestro_id + validador_participante (1 alumno)
--     │  Grupal     → maestro_id + grupo_id (todos los inscritos en ese grupo)
--     │
--  5. sesion_lvlup + asistencia_lvlup  ← Solo app React
--
-- TOMA DE ASISTENCIA (diferente por tipo de sesión)
-- ------------------------------------------------
-- INDIVIDUAL:
--   1) Maestro elige alumno (solo hay uno)
--   2) Ingresa horas en bloques para ese alumno
--   3) Una fila en asistencia_lvlup (sin sesion_lvlup_id)
--
-- GRUPAL:
--   1) Maestro elige la asignación / grupo
--   2) PRIMERO selecciona horas de la sesión (ej. 2h) → sesion_lvlup
--   3) LUEGO marca quién asistió (lista del grupo)
--   4) Cada alumno: fila en asistencia_lvlup con asistio Si/No
--      Las horas de la sesión se descuentan del paquete de TODOS los marcados
--      (asistió o faltó; no hay excusas).
--
-- Saldo del paquete: por participante y asignación (suma horas_asistidas).
-- Nivel 2: un alumno puede tener varias asignacion_lvlup (varios maestros);
--   usar horas_asignadas en cada fila para el cupo de ese maestro.
-- anio/mes en asignacion_lvlup son informativos (AppSheet); la app usa estado ACTIVO.
--
-- NO existe grupo_lvlup_miembros: sería duplicar inscripciones_1 + asignacion_lvlup.
--
-- NIVELES (IDCurso en cursos_2025)
-- --------------------------------
-- Nivel 1 : 2351, 2352
-- Nivel 2 : 2353 (MED), 2354 (RET) — Dx
--
-- PAQUETE DE HORAS (tipo_paquete en asignacion_lvlup)
-- ---------------------------------------------------
-- 8H  → 8 horas totales (cualquier nivel)
-- 16H → 16 horas totales (cualquier nivel)
-- 3M  → paquete 3 meses, SOLO Nivel 2 (2353/2354); AppSheet valida
-- Además en la asignación:
--   horas_diagnostico   → máx 2, solo Sesion Grupal
--   horas_informe_final → 1 o 2 (2 solo Grupal)
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. asignaturas — tabla existente en BD del club
-- -----------------------------------------------------------------------------
-- IDAsignatura es INT (no crear si ya existe).
-- CREATE TABLE IF NOT EXISTS asignaturas (
--   IDAsignatura  INT NOT NULL PRIMARY KEY,
--   Asignatura    VARCHAR(200) NOT NULL
-- );

-- -----------------------------------------------------------------------------
-- 2. Maestros LVL UP
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS maestros_academicos (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  documento           VARCHAR(20) NOT NULL,
  nombre              VARCHAR(200) NOT NULL,
  correo              VARCHAR(120) NOT NULL,
  celular             VARCHAR(30) NULL,
  sede                VARCHAR(80) NULL,
  areas_academicas    VARCHAR(500) NULL COMMENT 'Informativo',
  escuelas            VARCHAR(500) NULL COMMENT 'Informativo',
  disponibilidad      VARCHAR(500) NULL COMMENT 'Informativo',
  nivel_1             TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Puede dictar Nivel 1 (2351/2352)',
  dx_nivel_2          ENUM('Si','No') NOT NULL DEFAULT 'No' COMMENT 'Puede dictar Nivel 2 (2353/2354)',
  activo              TINYINT(1) NOT NULL DEFAULT 1,
  creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_maestros_acad_documento (documento),
  UNIQUE KEY uk_maestros_acad_correo (correo),
  KEY idx_maestros_acad_sede (sede),
  KEY idx_maestros_acad_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 3. inscripciones_1 — agregar enlace al grupo (AppSheet)
-- -----------------------------------------------------------------------------
-- Sesion y asignatura ya existen.
--
-- ALTER TABLE inscripciones_1
--   ADD COLUMN grupo_lvlup_id INT UNSIGNED NULL
--     COMMENT 'FK grupos_lvlup.id — solo si Sesion=Grupal'
--     AFTER asignatura;
--
-- ALTER TABLE inscripciones_1
--   ADD CONSTRAINT fk_insc_grupo_lvlup
--   FOREIGN KEY (grupo_lvlup_id) REFERENCES grupos_lvlup(id);

-- -----------------------------------------------------------------------------
-- 4. Grupos LVL UP — cabecera; miembros = inscripciones con mismo grupo_lvlup_id
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS grupos_lvlup (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo          VARCHAR(40) NULL,
  nombre          VARCHAR(120) NULL COMMENT 'Ej: MAT G1 Retiro Jun-2026',
  sede            VARCHAR(80) NOT NULL,
  id_curso        VARCHAR(20) NOT NULL,
  id_asignatura   INT UNSIGNED NOT NULL COMMENT 'FK asignaturas.IDAsignatura',
  anio            SMALLINT UNSIGNED NOT NULL,
  mes             TINYINT UNSIGNED NOT NULL,
  estado          ENUM('ACTIVO','CERRADO') NOT NULL DEFAULT 'ACTIVO',
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Auto; no pedir en AppSheet',
  KEY idx_grupos_lvlup_lookup (sede, id_curso, id_asignatura, anio, mes),
  KEY idx_grupos_lvlup_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 5. Asignación: maestro + paquete + grupo o participante (AppSheet)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS asignacion_lvlup (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  maestro_id              INT UNSIGNED NOT NULL,
  sede                    VARCHAR(80) NOT NULL,
  id_curso                VARCHAR(20) NOT NULL,
  id_asignatura           INT UNSIGNED NOT NULL COMMENT 'FK asignaturas.IDAsignatura',
  sesion                  ENUM('Grupal','Individual') NOT NULL,
  grupo_id                INT UNSIGNED NULL COMMENT 'Grupal: obligatorio. Individual: NULL',
  validador_participante  VARCHAR(30) NULL COMMENT 'Individual: obligatorio. Grupal: NULL o vacío',
  anio                    SMALLINT UNSIGNED NOT NULL,
  mes                     TINYINT UNSIGNED NOT NULL,
  tipo_paquete            ENUM('8H','16H','3M') NOT NULL COMMENT '8h | 16h | 3 meses (3M solo N2)',
  horas_asignadas         DECIMAL(5,2) NULL COMMENT 'Horas del paquete para esta asignación (N2 multi-maestro). Prioridad sobre 8H/16H',
  horas_diagnostico       DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT 'Tope contratado diagnóstico (definido en AppSheet/BD)',
  horas_informe_final     DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT 'Tope contratado informe final (definido en AppSheet/BD)',
  fecha_inicio_paquete    DATE NULL COMMENT 'Obligatorio si tipo_paquete=3M',
  fecha_fin_paquete       DATE NULL COMMENT 'Inicio + 3 meses si 3M',
  estado                  ENUM('ACTIVO','PAUSADO','FINALIZADO') NOT NULL DEFAULT 'ACTIVO',
  observaciones           VARCHAR(500) NULL,
  creado_en               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en          DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_asig_lvlup_maestro FOREIGN KEY (maestro_id) REFERENCES maestros_academicos(id),
  CONSTRAINT fk_asig_lvlup_grupo FOREIGN KEY (grupo_id) REFERENCES grupos_lvlup(id),
  KEY idx_asig_lvlup_maestro (maestro_id, estado, anio, mes),
  KEY idx_asig_lvlup_lookup (sede, id_curso, id_asignatura, anio, mes),
  KEY idx_asig_lvlup_participante (validador_participante),
  CONSTRAINT chk_asig_lvlup_sesion CHECK (
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
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- MariaDB: DROP CONSTRAINT chk_...   |   MySQL 8.0.19+: DROP CHECK chk_...
--   Grupal     → sesion='Grupal', grupo_id=<id>, validador_participante=NULL (no '')
--   Individual → sesion='Individual', grupo_id=NULL, validador_participante=<documento>

-- Horas totales del paquete (columna generada / vista lógica):
--   8H  → 8
--   16H → 16
--   3M  → sin tope fijo de horas; vigencia por fecha_fin_paquete

-- -----------------------------------------------------------------------------
-- 6. Sesión grupal — horas comunes del encuentro (paso 1 del maestro)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sesion_lvlup (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asignacion_id           INT UNSIGNED NOT NULL,
  maestro_id              INT UNSIGNED NOT NULL,
  grupo_id                INT UNSIGNED NOT NULL,
  fecha                   DATE NOT NULL,
  hora                    TIME NOT NULL,
  horas_sesion            DECIMAL(5,2) NOT NULL COMMENT 'Horas del encuentro; iguales para quienes asisten',
  tipo_registro           ENUM('REGULAR','DIAGNOSTICO','INFORME_FINAL') NOT NULL DEFAULT 'REGULAR',
  comentarios             VARCHAR(500) NULL,
  registrado_por          VARCHAR(120) NOT NULL,
  creado_en               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sesion_lvlup_asignacion FOREIGN KEY (asignacion_id) REFERENCES asignacion_lvlup(id),
  CONSTRAINT fk_sesion_lvlup_maestro FOREIGN KEY (maestro_id) REFERENCES maestros_academicos(id),
  CONSTRAINT fk_sesion_lvlup_grupo FOREIGN KEY (grupo_id) REFERENCES grupos_lvlup(id),
  KEY idx_sesion_lvlup_fecha (fecha),
  UNIQUE KEY uk_sesion_grupo_dia (asignacion_id, fecha, tipo_registro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 7. Asistencia por participante (app React)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS asistencia_lvlup (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asignacion_id           INT UNSIGNED NOT NULL,
  sesion_lvlup_id         BIGINT UNSIGNED NULL COMMENT 'Grupal: FK sesion_lvlup. Individual: NULL',
  maestro_id              INT UNSIGNED NOT NULL,
  grupo_id                INT UNSIGNED NULL,
  validador_participante  VARCHAR(30) NOT NULL,
  documento               VARCHAR(30) NOT NULL,
  nombre                  VARCHAR(200) NOT NULL,
  sede                    VARCHAR(80) NOT NULL,
  id_curso                VARCHAR(20) NOT NULL,
  id_asignatura           INT UNSIGNED NOT NULL,
  sesion                  ENUM('Grupal','Individual') NOT NULL,
  fecha                   DATE NOT NULL,
  hora                    TIME NOT NULL,
  asistio                 TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Grupal: marca del maestro. Individual: 1',
  horas_asistidas         DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT 'Horas descontadas del paquete (también si faltó en grupal)',
  tipo_registro           ENUM('REGULAR','DIAGNOSTICO','INFORME_FINAL') NOT NULL DEFAULT 'REGULAR',
  comentarios             VARCHAR(500) NULL,
  registrado_por          VARCHAR(120) NOT NULL,
  creado_en               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_asist_lvlup_asignacion FOREIGN KEY (asignacion_id) REFERENCES asignacion_lvlup(id),
  CONSTRAINT fk_asist_lvlup_sesion FOREIGN KEY (sesion_lvlup_id) REFERENCES sesion_lvlup(id) ON DELETE CASCADE,
  CONSTRAINT fk_asist_lvlup_maestro FOREIGN KEY (maestro_id) REFERENCES maestros_academicos(id),
  KEY idx_asist_lvlup_fecha (fecha),
  KEY idx_asist_lvlup_maestro_fecha (maestro_id, fecha),
  KEY idx_asist_lvlup_participante (validador_participante, fecha),
  UNIQUE KEY uk_asist_participante_dia (
    asignacion_id, validador_participante, fecha, tipo_registro
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- CONSULTAS DE REFERENCIA
-- =============================================================================

-- A) Nivel del curso
-- SELECT CASE
--   WHEN TRIM(:id_curso) IN ('2351','2352') THEN 1
--   WHEN TRIM(:id_curso) IN ('2353','2354') THEN 2
--   ELSE NULL END AS nivel;

-- B) Inscritos Grupal sin grupo (AppSheet: pendientes de agrupar)
-- SELECT i.validador_participante, p.Nombre_Completo,
--        TRIM(i.Sede) AS sede, TRIM(i.IDCurso) AS id_curso,
--        TRIM(i.asignatura) AS id_asignatura
-- FROM inscripciones_1 i
-- LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(i.validador_participante)
-- WHERE i.Tipo = 4
--   AND TRIM(i.Sesion) = 'Grupal'
--   AND i.grupo_lvlup_id IS NULL
--   AND i.año = :anio AND CAST(i.Mes AS UNSIGNED) = :mes
--   AND TRIM(i.Estado) IN ('CONFIRMADO','ACTIVO');

-- C) Miembros de un grupo (desde inscripciones, sin tabla intermedia)
-- SELECT i.validador_participante, p.Nombre_Completo, TRIM(i.Estado) AS estado
-- FROM inscripciones_1 i
-- LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(i.validador_participante)
-- WHERE i.Tipo = 4
--   AND i.grupo_lvlup_id = :grupo_id
--   AND TRIM(i.Estado) IN ('CONFIRMADO','ACTIVO');

-- D) Participantes visibles en una asignación (Individual + Grupal)
-- SELECT i.validador_participante, p.Nombre_Completo AS nombre, TRIM(i.Estado) AS estado
-- FROM asignacion_lvlup al
-- INNER JOIN inscripciones_1 i
--   ON i.Tipo = 4
--  AND TRIM(i.IDCurso) = TRIM(al.id_curso)
--  AND TRIM(i.asignatura) = TRIM(al.id_asignatura)
--  AND TRIM(i.Sede) = TRIM(al.sede)
--  AND i.año = al.anio
--  AND CAST(i.Mes AS UNSIGNED) = al.mes
--  AND TRIM(i.Estado) IN ('CONFIRMADO','ACTIVO')
--  AND (
--        (al.sesion = 'Individual'
--         AND TRIM(i.validador_participante) = TRIM(al.validador_participante))
--     OR (al.sesion = 'Grupal'
--         AND i.grupo_lvlup_id = al.grupo_id)
--      )
-- LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(i.validador_participante)
-- WHERE al.id = :asignacion_id;

-- E) Saldo horas por participante (8H / 16H)
-- SELECT
--   a.validador_participante,
--   CASE al.tipo_paquete WHEN '8H' THEN 8 WHEN '16H' THEN 16 ELSE NULL END AS horas_contratadas,
--   COALESCE(SUM(a.horas_asistidas), 0) AS horas_usadas
-- FROM asignacion_lvlup al
-- LEFT JOIN asistencia_lvlup a ON a.asignacion_id = al.id
-- WHERE al.id = :asignacion_id
--   AND (:participante IS NULL OR TRIM(a.validador_participante) = TRIM(:participante))
-- GROUP BY al.id, a.validador_participante;

-- G) Registrar sesión grupal + asistencia (lógica backend)
-- Paso 1: INSERT sesion_lvlup (horas_sesion = 2.0, tipo_registro, fecha, ...)
-- Paso 2: por cada alumno del grupo:
--   INSERT asistencia_lvlup (
--     sesion_lvlup_id, asistio,
--     horas_asistidas = CASE WHEN asistio THEN (SELECT horas_sesion FROM sesion_lvlup WHERE id = ?) ELSE 0 END,
--     ...
--   );

-- F) Validación paquete
-- SELECT CASE
--   WHEN :tipo_paquete = '3M' AND TRIM(:id_curso) NOT IN ('2353','2354')
--     THEN '3 meses solo Nivel 2 (2353/2354)'
--   WHEN :tipo_paquete = '3M' AND (:fecha_inicio IS NULL OR :fecha_fin IS NULL)
--     THEN '3M requiere fecha_inicio y fecha_fin'
--   WHEN :horas_diagnostico > 0 AND :sesion <> 'Grupal'
--     THEN 'diagnóstico solo sesión Grupal'
--   WHEN :horas_diagnostico > 2 THEN 'diagnóstico máximo 2h'
--   WHEN :horas_informe_final = 2 AND :sesion <> 'Grupal'
--     THEN 'informe 2h solo Grupal'
--   WHEN :horas_informe_final NOT IN (0,1,2) THEN 'informe final inválido'
--   WHEN :dx_nivel_2 = 'No' AND TRIM(:id_curso) IN ('2353','2354')
--     THEN 'maestro sin Dx Nivel 2'
--   WHEN :nivel_1 = 0 AND TRIM(:id_curso) IN ('2351','2352')
--     THEN 'maestro sin Nivel 1'
--   ELSE NULL END AS error;

-- -----------------------------------------------------------------------------
-- 8. creado_en automático (AppSheet no debe pedirlo en formularios)
-- -----------------------------------------------------------------------------
-- Si la BD ya existe sin DEFAULT, ejecutar: alter-lvlup-creado-en-default.sql

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
