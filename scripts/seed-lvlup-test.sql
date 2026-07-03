-- Datos de prueba LVL UP — ajusta correo, documentos y asignatura a tu BD real.
-- Requiere: tablas creadas + inscripciones_1 Tipo=4 existentes.

-- 1) Maestro (usa TU correo Microsoft)
INSERT INTO maestros_academicos (documento, nombre, correo, sede, nivel_1, dx_nivel_2, activo)
VALUES ('900000001', 'Maestro Prueba LVL UP', 'tu.correo@ejemplo.com', 'RETIRO', 1, 'Si', 1)
ON DUPLICATE KEY UPDATE activo = 1, nombre = VALUES(nombre);

SET @maestro_id = (SELECT id FROM maestros_academicos WHERE correo = 'tu.correo@ejemplo.com' LIMIT 1);

-- 2) Grupo grupal de prueba (ajusta id_curso, id_asignatura numérico, mes, año)
INSERT INTO grupos_lvlup (codigo, nombre, sede, id_curso, id_asignatura, anio, mes, estado)
VALUES ('G1-TEST', 'Grupo prueba MAT', 'RETIRO', '2351', 1, 2026, 6, 'ACTIVO');

SET @grupo_id = LAST_INSERT_ID();

-- 3) Vincular inscripciones grupales (reemplaza documentos reales)
-- UPDATE inscripciones_1
-- SET grupo_lvlup_id = @grupo_id
-- WHERE Tipo = 4 AND TRIM(Sesion) = 'Grupal'
--   AND validador_participante IN ('DOC1','DOC2','DOC3')
--   AND año = 2026 AND CAST(Mes AS UNSIGNED) = 6;

-- 4) Asignación grupal
INSERT INTO asignacion_lvlup (
  maestro_id, sede, id_curso, id_asignatura, sesion, grupo_id,
  validador_participante, anio, mes, tipo_paquete, horas_diagnostico, horas_informe_final, estado
) VALUES (
  @maestro_id, 'RETIRO', '2351', 1, 'Grupal', @grupo_id,
  NULL, 2026, 6, '16H', 2, 2, 'ACTIVO'
);

-- 5) Asignación individual (reemplaza documento alumno)
-- INSERT INTO asignacion_lvlup (
--   maestro_id, sede, id_curso, id_asignatura, sesion, grupo_id,
--   validador_participante, anio, mes, tipo_paquete, estado
-- ) VALUES (
--   @maestro_id, 'RETIRO', '2351', 'MAT01', 'Individual', NULL,
--   'DOC_ALUMNO', 2026, 6, '8H', 'ACTIVO'
-- );
