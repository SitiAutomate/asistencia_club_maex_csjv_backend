-- Horas explícitas por asignación (Nivel 2: varios maestros, horas distintas por alumno).
-- anio/mes en asignacion_lvlup y grupos_lvlup quedan informativos (AppSheet); la app filtra por estado ACTIVO.

ALTER TABLE asignacion_lvlup
  ADD COLUMN IF NOT EXISTS horas_asignadas DECIMAL(5,2) NULL
    COMMENT 'Horas del paquete para esta asignación maestro-alumno/grupo. Prioridad sobre 8H/16H. N2 multi-maestro.'
    AFTER tipo_paquete;
