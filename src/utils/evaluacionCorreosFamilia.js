import Inscripciones, { INSCRIPCIONES_ATTRS_BASE } from '../database/models/InscripcionesModel.js';
import Participantes from '../database/models/ParticipantesModel.js';
import Padres from '../database/models/PadresModel.js';
import Responsable from '../database/models/ResponsableModel.js';

const correoDestinoValido = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const normalizarCorreo = (value) => String(value || '').trim().toLowerCase();

export const correosFamiliaFromInscrito = (inscrito) => {
  const participante = inscrito?.participante || {};
  const padreInfo = participante?.padreInfo || {};
  const responsableInfo = participante?.responsableInfo || {};
  const raw = [padreInfo?.emailPadre, padreInfo?.emailMadre, responsableInfo?.Correo_Responsable]
    .map(normalizarCorreo)
    .filter(Boolean)
    .filter(correoDestinoValido);
  return [...new Set(raw)];
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

export const resolveCorreosFamiliaInforme = async (identificacion) => {
  const inscrito = await obtenerInscritoParaCorreos(identificacion);
  return correosFamiliaFromInscrito(inscrito);
};
