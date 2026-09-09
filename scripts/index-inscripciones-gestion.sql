-- Acelera listados de gestión (Tipo + año + Mes + Estado + curso).
-- Ejecutar una sola vez en u328419981_inscrip_cbmaex (o BD local).

CREATE INDEX idx_insc1_gestion
    ON inscripciones_1 (Tipo, año, Mes, Estado, IDCurso);
