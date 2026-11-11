import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import Inscripciones, { INSCRIPCIONES_ATTRS_BASE } from '../database/models/InscripcionesModel.js';
import Participantes from '../database/models/ParticipantesModel.js';
import Padres from '../database/models/PadresModel.js';
import Responsable from '../database/models/ResponsableModel.js';

const correoDestinoValido = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const normalizarCorreo = (value) => String(value || '').trim().toLowerCase();

/** Extrae uno o varios correos de un campo (coma / punto y coma / espacios). */
const extraerCorreos = (value) =>
  String(value || '')
    .split(/[,;/\s]+/)
    .map(normalizarCorreo)
    .filter(Boolean)
    .filter(correoDestinoValido);

const dedupeCorreos = (list) => [...new Set(list.filter(Boolean))];

export const correosFamiliaFromInscrito = (inscrito) => {
  const participante = inscrito?.participante || {};
  const padreInfo = participante?.padreInfo || {};
  const responsableInfo = participante?.responsableInfo || {};
  const raw = [
    ...extraerCorreos(padreInfo?.emailPadre),
    ...extraerCorreos(padreInfo?.emailMadre),
    ...extraerCorreos(responsableInfo?.Correo_Responsable),
  ];
  return dedupeCorreos(raw);
};

/**
 * Resolución robusta (como integración/información): JOIN con TRIM.
 * No depende solo de asociaciones Sequelize (fallan con espacios en Doc. Alumno / IDs).
 */
export const resolveCorreosFamiliaInforme = async (identificacion) => {
  const ident = String(identificacion || '').trim();
  if (!ident) return [];

  const collected = [];

  const padresRows = await sequelize.query(
    `SELECT
       pad.\`E-mail padre\` AS emailPadre,
       pad.\`E-mail madre\` AS emailMadre
     FROM padres pad
     WHERE TRIM(pad.\`Doc. Alumno\`) = TRIM(:ident)
     LIMIT 5`,
    { replacements: { ident }, type: QueryTypes.SELECT },
  );
  for (const row of padresRows || []) {
    collected.push(...extraerCorreos(row.emailPadre), ...extraerCorreos(row.emailMadre));
  }

  const [respParticipante] = await sequelize.query(
    `SELECT r.Correo_Responsable AS correo
     FROM participantes p
     LEFT JOIN responsables r ON TRIM(r.IDResponsable) = TRIM(p.IDResponsable)
     WHERE TRIM(p.IDParticipante) = TRIM(:ident)
     LIMIT 1`,
    { replacements: { ident }, type: QueryTypes.SELECT },
  );
  if (respParticipante?.correo) collected.push(...extraerCorreos(respParticipante.correo));

  const [respInscripcion] = await sequelize.query(
    `SELECT r.Correo_Responsable AS correo
     FROM inscripciones_1 i
     LEFT JOIN responsables r ON TRIM(r.IDResponsable) = TRIM(i.validador_responsable)
     WHERE i.Tipo = 1
       AND TRIM(i.validador_participante) = TRIM(:ident)
     ORDER BY i.año DESC, CAST(i.Mes AS UNSIGNED) DESC
     LIMIT 1`,
    { replacements: { ident }, type: QueryTypes.SELECT },
  );
  if (respInscripcion?.correo) collected.push(...extraerCorreos(respInscripcion.correo));

  const unicos = dedupeCorreos(collected);
  if (unicos.length) return unicos;

  // Fallback legado (asociaciones Sequelize) por si el SQL no encontró filas.
  const inscrito = await obtenerInscritoParaCorreos(ident);
  return correosFamiliaFromInscrito(inscrito);
};

export const obtenerInscritoParaCorreos = async (identificacion) => {
  const ident = String(identificacion || '').trim();
  if (!ident) return null;
  return Inscripciones.findOne({
    attributes: INSCRIPCIONES_ATTRS_BASE,
    where: {
      validador_participante: ident,
      Tipo: 1,
    },
    order: [
      ['año', 'DESC'],
      ['Mes', 'DESC'],
    ],
    include: [
      {
        model: Participantes,
        as: 'participante',
        attributes: ['idParticipante', 'responsable'],
        required: false,
        include: [
          {
            model: Padres,
            as: 'padreInfo',
            attributes: ['emailPadre', 'emailMadre'],
            required: false,
          },
          {
            model: Responsable,
            as: 'responsableInfo',
            attributes: ['Correo_Responsable'],
            required: false,
          },
        ],
      },
    ],
  });
};
