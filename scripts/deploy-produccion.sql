-- =============================================================================
-- DEPLOY PRODUCCIÓN — Gestión + LVL UP + índices
-- =============================================================================
-- Ejecutar en la BD de producción (Hostinger / MySQL 8 o MariaDB).
-- Idempotente donde es posible (CREATE IF NOT EXISTS / INSERT IGNORE).
--
-- NO requiere tablas nuevas para «Sin asistencia hoy» (Asistencia): es solo API+UI.
--
-- ORDEN:
--   A) Gestión admin (permisos, auditoría, campos por tipo)
--   B) Índice listados de inscripciones
--   C) Tablas LVL UP
--   D) Columna grupo_lvlup_id en inscripciones_1 (omitir si ya existe)
--   E) Collation LVL UP (si hay error 1267 al juntar con inscripciones_1)
--   F) Cursos Nivel 2 en cursos_2025 (si faltan 2353/2354)
--   G) Permisos: SuperAdministrador = todo. Admins con filas en admin_permisos
--      deben recibir módulos nuevos (asistencia, lvlup, etc.) desde la UI.
-- =============================================================================

-- =============================================================================
-- A) GESTIÓN ADMIN
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_permisos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  modulo VARCHAR(64) NOT NULL,
  puede_leer TINYINT(1) NOT NULL DEFAULT 1,
  puede_crear TINYINT(1) NOT NULL DEFAULT 0,
  puede_editar TINYINT(1) NOT NULL DEFAULT 0,
  puede_eliminar TINYINT(1) NOT NULL DEFAULT 0,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_permisos_usuario_modulo (usuario_id, modulo),
  KEY idx_admin_permisos_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auditoria_admin (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT NULL,
  email VARCHAR(190) NULL,
  rol VARCHAR(64) NULL,
  accion VARCHAR(32) NOT NULL,
  modulo VARCHAR(64) NOT NULL,
  entidad VARCHAR(64) NULL,
  entidad_id VARCHAR(64) NULL,
  resumen VARCHAR(500) NULL,
  antes_json MEDIUMTEXT NULL,
  despues_json MEDIUMTEXT NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_auditoria_creado (creado_en),
  KEY idx_auditoria_usuario (usuario_id),
  KEY idx_auditoria_modulo (modulo),
  KEY idx_auditoria_entidad (entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gestion_tipo_campos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo INT NOT NULL,
  campo_key VARCHAR(64) NOT NULL,
  columna_db VARCHAR(120) NOT NULL,
  label VARCHAR(120) NOT NULL,
  tipo_input VARCHAR(32) NOT NULL DEFAULT 'text',
  visible_lista TINYINT(1) NOT NULL DEFAULT 0,
  visible_detalle TINYINT(1) NOT NULL DEFAULT 1,
  visible_form TINYINT(1) NOT NULL DEFAULT 1,
  requerido TINYINT(1) NOT NULL DEFAULT 0,
  orden INT NOT NULL DEFAULT 0,
  opciones_json TEXT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gestion_tipo_campo (tipo, campo_key),
  KEY idx_gestion_tipo_campos_tipo (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gestion_tipo_campos
  (tipo, campo_key, columna_db, label, tipo_input, visible_lista, visible_detalle, visible_form, requerido, orden)
VALUES
  (2, 'horasEntrenamiento', 'Horas_Entrenamiento', 'Horas', 'text', 1, 1, 1, 0, 10),
  (2, 'periodo', 'Periodo', 'Periodo', 'text', 1, 1, 1, 0, 20),
  (2, 'modalidad', 'Modalidad', 'Modalidad', 'text', 0, 1, 1, 0, 30),
  (2, 'observaciones', 'OBSERVACION', 'Observaciones', 'textarea', 0, 1, 1, 0, 40),
  (3, 'horasEntrenamiento', 'Horas_Entrenamiento', 'Horas adicionales', 'text', 1, 1, 1, 0, 10),
  (3, 'observaciones', 'OBSERVACION', 'Observaciones', 'textarea', 0, 1, 1, 0, 20),
  (4, 'asignatura', 'Asignatura', 'Asignatura', 'text', 1, 1, 1, 0, 10),
  (4, 'sesion', 'Sesión', 'Sesión', 'text', 1, 1, 1, 0, 20),
  (4, 'modalidad', 'Modalidad', 'Modalidad', 'text', 1, 1, 1, 0, 30),
  (4, 'observaciones', 'OBSERVACION', 'Observaciones', 'textarea', 0, 1, 1, 0, 40),
  (5, 'categoria', 'categoria', 'Categoría', 'text', 1, 1, 1, 0, 10),
  (5, 'club', 'club', 'Club', 'text', 1, 1, 1, 0, 20),
  (5, 'observaciones', 'OBSERVACION', 'Observaciones', 'textarea', 0, 1, 1, 0, 30),
  (8, 'periodo', 'Periodo', 'Periodo', 'text', 1, 1, 1, 0, 10),
  (8, 'horasEntrenamiento', 'Horas_Entrenamiento', 'Horas', 'text', 0, 1, 1, 0, 20),
  (8, 'observaciones', 'OBSERVACION', 'Observaciones', 'textarea', 0, 1, 1, 0, 30);

-- =============================================================================
-- B) ÍNDICE GESTIÓN (inscripciones)
-- =============================================================================
-- Si el índice ya existe, omite este bloque (error Duplicate key name).
-- Verificar: SHOW INDEX FROM inscripciones_1 WHERE Key_name = 'idx_insc1_gestion';

CREATE INDEX idx_insc1_gestion
  ON inscripciones_1 (Tipo, año, Mes, Estado, IDCurso);

-- =============================================================================
-- C) LVL UP — tablas
-- =============================================================================
-- Niveles: 2351/2352 = N1 · 2353/2354 = N2
-- Paquetes: 8H | 16H | 3M (3M solo N2 en reglas de negocio)

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS asignacion_lvlup (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  maestro_id              INT UNSIGNED NOT NULL,
  sede                    VARCHAR(80) NOT NULL,
  id_curso                VARCHAR(20) NOT NULL,
  id_asignatura           INT UNSIGNED NOT NULL COMMENT 'FK asignaturas.IDAsignatura',
  sesion                  ENUM('Grupal','Individual') NOT NULL,
  grupo_id                INT UNSIGNED NULL COMMENT 'Grupal: obligatorio. Individual: NULL',
  validador_participante  VARCHAR(30) NULL COMMENT 'Individual: obligatorio. Grupal: NULL',
  anio                    SMALLINT UNSIGNED NOT NULL,
  mes                     TINYINT UNSIGNED NOT NULL,
  tipo_paquete            ENUM('8H','16H','3M') NOT NULL COMMENT '8h | 16h | 3 meses (3M solo N2)',
  horas_asignadas         DECIMAL(5,2) NULL COMMENT 'Horas del paquete para esta asignación',
  horas_diagnostico       DECIMAL(5,2) NOT NULL DEFAULT 0,
  horas_informe_final     DECIMAL(5,2) NOT NULL DEFAULT 0,
  fecha_inicio_paquete    DATE NULL COMMENT 'Obligatorio si tipo_paquete=3M',
  fecha_fin_paquete       DATE NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sesion_lvlup (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asignacion_id           INT UNSIGNED NOT NULL,
  maestro_id              INT UNSIGNED NOT NULL,
  grupo_id                INT UNSIGNED NOT NULL,
  fecha                   DATE NOT NULL,
  hora                    TIME NOT NULL,
  horas_sesion            DECIMAL(5,2) NOT NULL,
  tipo_registro           ENUM('REGULAR','DIAGNOSTICO','INFORME_FINAL') NOT NULL DEFAULT 'REGULAR',
  comentarios             VARCHAR(500) NULL,
  registrado_por          VARCHAR(120) NOT NULL,
  creado_en               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sesion_lvlup_asignacion FOREIGN KEY (asignacion_id) REFERENCES asignacion_lvlup(id),
  CONSTRAINT fk_sesion_lvlup_maestro FOREIGN KEY (maestro_id) REFERENCES maestros_academicos(id),
  CONSTRAINT fk_sesion_lvlup_grupo FOREIGN KEY (grupo_id) REFERENCES grupos_lvlup(id),
  KEY idx_sesion_lvlup_fecha (fecha),
  UNIQUE KEY uk_sesion_grupo_dia (asignacion_id, fecha, tipo_registro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
  asistio                 TINYINT(1) NOT NULL DEFAULT 1,
  horas_asistidas         DECIMAL(5,2) NOT NULL DEFAULT 0,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Triggers creado_en (AppSheet puede mandar NULL)
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

-- =============================================================================
-- D) inscripciones_1.grupo_lvlup_id
-- =============================================================================
-- Verificar antes:
--   SHOW COLUMNS FROM inscripciones_1 LIKE 'grupo_lvlup_id';
--   SHOW INDEX FROM inscripciones_1 WHERE Key_name = 'idx_insc_grupo_lvlup';
-- Si ya existen, OMITE este bloque completo.

ALTER TABLE inscripciones_1
  ADD COLUMN grupo_lvlup_id INT UNSIGNED NULL
    COMMENT 'FK grupos_lvlup.id — solo si Sesion=Grupal'
    AFTER asignatura;

CREATE INDEX idx_insc_grupo_lvlup
  ON inscripciones_1 (grupo_lvlup_id);

ALTER TABLE inscripciones_1
  ADD CONSTRAINT fk_insc_grupo_lvlup
  FOREIGN KEY (grupo_lvlup_id) REFERENCES grupos_lvlup(id);

-- Sesión / asignatura: normalmente ya existen por AppSheet.
-- Si faltan, descomenta:
-- ALTER TABLE inscripciones_1
--   ADD COLUMN `Sesión` VARCHAR(20) NULL COMMENT 'LVL UP: Grupal | Individual';
-- ALTER TABLE inscripciones_1
--   ADD COLUMN asignatura INT UNSIGNED NULL COMMENT 'IDAsignatura';

-- =============================================================================
-- E) COLLATION (solo si hay Illegal mix of collations)
-- =============================================================================
-- SET FOREIGN_KEY_CHECKS = 0;
-- ALTER TABLE maestros_academicos CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
-- ALTER TABLE grupos_lvlup CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
-- ALTER TABLE asignacion_lvlup CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
-- ALTER TABLE sesion_lvlup CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
-- ALTER TABLE asistencia_lvlup CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
-- SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- F) CURSOS LVL UP N2 en catálogo (si no están)
-- =============================================================================
-- Ajusta columnas extra según tu cursos_2025 real (SHOW COLUMNS FROM cursos_2025).

INSERT INTO cursos_2025 (ID_Curso, Nombre_del_curso, Nombre_Corto_Curso, Tipo, Estado_del_curso, Sede)
SELECT '2353', 'LEVEL UP LEARNING 2 · MEDELLÍN', 'LVL UP 2 MED', 4, 'ACTIVO', 'MEDELLÍN'
WHERE NOT EXISTS (SELECT 1 FROM cursos_2025 WHERE TRIM(ID_Curso) = '2353');

INSERT INTO cursos_2025 (ID_Curso, Nombre_del_curso, Nombre_Corto_Curso, Tipo, Estado_del_curso, Sede)
SELECT '2354', 'LEVEL UP LEARNING 2 · RETIRO', 'LVL UP 2 RET', 4, 'ACTIVO', 'RETIRO'
WHERE NOT EXISTS (SELECT 1 FROM cursos_2025 WHERE TRIM(ID_Curso) = '2354');

-- =============================================================================
-- G) VERIFICACIÓN
-- =============================================================================
-- SHOW TABLES LIKE '%lvlup%';
-- SHOW TABLES LIKE 'admin_%';
-- SHOW TABLES LIKE 'gestion_tipo_campos';
-- SHOW COLUMNS FROM inscripciones_1 LIKE 'grupo_lvlup_id';
-- SHOW INDEX FROM inscripciones_1 WHERE Key_name IN ('idx_insc1_gestion','idx_insc_grupo_lvlup');
-- SELECT ID_Curso, Nombre_del_curso, Sede FROM cursos_2025 WHERE TRIM(ID_Curso) IN ('2351','2352','2353','2354');
