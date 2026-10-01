-- Curso posterior / anterior y recomendaciones por inscripción
-- Ejecutar una vez en MySQL.

ALTER TABLE cursos_2025
  ADD COLUMN cursoAnterior VARCHAR(255) NULL;

ALTER TABLE inscripciones_1
  ADD COLUMN cursoRecomendado VARCHAR(255) NULL;
