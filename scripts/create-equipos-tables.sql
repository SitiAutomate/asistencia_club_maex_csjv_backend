-- Inscripción por equipos (detalle). Relación:
--   equipos.IDInscripcion = inscripciones_1.IDInscripcion
--   equipo_deportistas.IDEquipo = equipos.IDEquipo
-- Ejecutar una vez en MySQL (si el otro agente aún no creó las tablas).

CREATE TABLE IF NOT EXISTS equipos (
  IDEquipo INT UNSIGNED NOT NULL AUTO_INCREMENT,
  IDInscripcion INT NOT NULL,
  IDCurso VARCHAR(10) NULL,
  nombre_equipo VARCHAR(150) NOT NULL,
  categoria VARCHAR(80) NULL,
  disciplina VARCHAR(80) NULL,
  rama VARCHAR(80) NULL,
  entrenador_nombre VARCHAR(120) NULL,
  entrenador_documento VARCHAR(30) NULL,
  entrenador_celular VARCHAR(30) NULL,
  asistente_nombre VARCHAR(120) NULL,
  asistente_documento VARCHAR(30) NULL,
  asistente_celular VARCHAR(30) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (IDEquipo),
  KEY idx_equipos_inscripcion (IDInscripcion),
  KEY idx_equipos_curso (IDCurso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equipo_deportistas (
  IDDeportista INT UNSIGNED NOT NULL AUTO_INCREMENT,
  IDEquipo INT UNSIGNED NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  nombre_completo VARCHAR(150) NOT NULL,
  documento VARCHAR(30) NULL,
  fecha_nacimiento DATE NULL,
  PRIMARY KEY (IDDeportista),
  KEY idx_deportistas_equipo (IDEquipo),
  CONSTRAINT fk_deportistas_equipo
    FOREIGN KEY (IDEquipo) REFERENCES equipos (IDEquipo)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
