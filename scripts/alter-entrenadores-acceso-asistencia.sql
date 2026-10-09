-- Acceso a pestañas de Asistencia por entrenador.
-- historial = solo Historial
-- asistencia_historial = Registrar + Historial (default)
-- Ejecutar una vez en MySQL.

ALTER TABLE entrenadores
  ADD COLUMN acceso_asistencia VARCHAR(32) NOT NULL DEFAULT 'asistencia_historial'
  COMMENT 'historial | asistencia_historial';
