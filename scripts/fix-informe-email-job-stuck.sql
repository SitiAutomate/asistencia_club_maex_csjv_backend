-- Diagnóstico y liberación de envíos de informe atascados (409 Conflict)
-- Reemplazar 3554 por el id de evaluación afectada.

-- 1) Ver evaluación
SELECT id, participante, identificacion, categoria, enviado, fechaEnvio, informe IS NOT NULL AS tiene_pdf,
       fecha_creacion, fecha_modificacion
FROM evaluaciones
WHERE id = 3554;

-- 2) Ver jobs de correo para esa evaluación
SELECT id, evaluacion_id, status, attempts, error_message, next_run_at, created_at, updated_at
FROM informe_email_jobs
WHERE evaluacion_id = 3554
ORDER BY id DESC;

-- 3) Liberar jobs abiertos (pending / processing) para permitir reenvío
-- UPDATE informe_email_jobs
-- SET status = 'failed',
--     error_message = 'Cancelado manualmente — job atascado en cola',
--     updated_at = NOW()
-- WHERE evaluacion_id = 3554
--   AND status IN ('pending', 'processing');
