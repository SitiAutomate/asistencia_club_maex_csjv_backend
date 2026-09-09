-- Permisos, auditoría y campos por tipo (gestión admin)
-- Ejecutar una vez en MySQL (Hostinger / local).

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

-- Semilla: campos típicos de tipos ≠ 1 (ajustables desde UI)
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
