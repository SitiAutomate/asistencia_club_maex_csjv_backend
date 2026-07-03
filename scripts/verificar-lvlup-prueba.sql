-- =============================================================================
-- Verificar cadena LVL UP antes de probar en /lvlup
-- Ejecutar en MariaDB y revisar que cada paso devuelva filas.
-- =============================================================================

-- A) Maestros activos
SELECT id, nombre, correo, sede, activo FROM maestros_academicos WHERE activo = 1;

-- B) Grupos activos
SELECT id, codigo, nombre, sede, id_curso, id_asignatura, anio, mes, estado
FROM grupos_lvlup
WHERE estado = 'ACTIVO'
ORDER BY id DESC;

-- C) Inscripciones con grupo (debe coincidir sede/curso/asignatura/mes/año del grupo)
SELECT
  i.validador_participante,
  p.Nombre_Completo,
  TRIM(i.Sede) AS sede,
  TRIM(i.IDCurso) AS id_curso,
  i.asignatura,
  TRIM(i.Sesion) AS sesion,
  i.grupo_lvlup_id,
  i.Estado,
  i.año,
  CAST(i.Mes AS UNSIGNED) AS mes
FROM inscripciones_1 i
LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(i.validador_participante)
WHERE i.Tipo = 4
  AND i.grupo_lvlup_id IS NOT NULL
ORDER BY i.grupo_lvlup_id, p.Nombre_Completo;

-- D) ¿Falta asignacion_lvlup? (maestro + grupo + mismo mes/año)
SELECT
  g.id AS grupo_id,
  g.nombre AS grupo_nombre,
  m.id AS maestro_id,
  m.nombre AS maestro_nombre,
  m.correo,
  al.id AS asignacion_id,
  al.estado AS asignacion_estado
FROM grupos_lvlup g
CROSS JOIN maestros_academicos m
LEFT JOIN asignacion_lvlup al
  ON al.grupo_id = g.id
 AND al.maestro_id = m.id
 AND al.anio = g.anio
 AND al.mes = g.mes
 AND al.estado = 'ACTIVO'
WHERE g.estado = 'ACTIVO' AND m.activo = 1
ORDER BY g.id, m.id;

-- E) Crear asignación grupal (AJUSTA ids y reemplaza si asignacion_id es NULL arriba)
-- SET @maestro_id = 1;
-- SET @grupo_id = 1;
-- INSERT INTO asignacion_lvlup (
--   maestro_id, sede, id_curso, id_asignatura, sesion, grupo_id,
--   validador_participante, anio, mes, tipo_paquete, horas_diagnostico, horas_informe_final, estado
-- )
-- SELECT
--   @maestro_id,
--   g.sede,
--   g.id_curso,
--   g.id_asignatura,
--   'Grupal',
--   g.id,
--   NULL,
--   g.anio,
--   g.mes,
--   '16H',
--   2,
--   2,
--   'ACTIVO'
-- FROM grupos_lvlup g
-- WHERE g.id = @grupo_id;

-- F) Simular lo que ve la app: participantes de una asignación (cambia :asignacion_id)
-- SET @asignacion_id = 1;
-- SELECT i.validador_participante AS documento, p.Nombre_Completo AS nombre
-- FROM asignacion_lvlup al
-- INNER JOIN inscripciones_1 i
--   ON i.Tipo = 4
--  AND TRIM(i.IDCurso) = TRIM(al.id_curso)
--  AND CAST(i.asignatura AS UNSIGNED) = al.id_asignatura
--  AND TRIM(i.Sede) = TRIM(al.sede)
--  AND i.año = al.anio
--  AND CAST(i.Mes AS UNSIGNED) = al.mes
--  AND TRIM(i.Estado) IN ('CONFIRMADO','ACTIVO')
--  AND i.grupo_lvlup_id = al.grupo_id
-- LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(i.validador_participante)
-- WHERE al.id = @asignacion_id;
