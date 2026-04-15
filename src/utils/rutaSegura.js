import { env } from '../config/env.js';

const getHoyBogota = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export const normalizarSede = (sede) =>
  (sede || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const getConfigRutaSeguraPorSede = (sede) => {
  const sedeNormalizada = normalizarSede(sede);

  if (sedeNormalizada.includes('MEDELLIN')) {
    return {
      integrationId: env.rutaSegura.integrationIdMed,
      bearer: env.rutaSegura.bearerMed,
    };
  }

  if (sedeNormalizada.includes('RETIRO')) {
    return {
      integrationId: env.rutaSegura.integrationIdRet,
      bearer: env.rutaSegura.bearerRet,
    };
  }

  return null;
};

const fetchRutasExtrasPorSede = async (sede) => {
  try {
    const config = getConfigRutaSeguraPorSede(sede);
    if (!config || !config.integrationId || !config.bearer || !env.rutaSegura.baseUrl) {
      return new Map();
    }

    const base = env.rutaSegura.baseUrl.replace(/\/+$/, '');
    const date = getHoyBogota();
    const url = `${base}/${config.integrationId}/passengers/routes?date=${date}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.bearer}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return new Map();
    }

    const data = await response.json();
    const pasajeros = Array.isArray(data?.passengers) ? data.passengers : [];
    const rutasPorDocumento = new Map();

    pasajeros.forEach((pasajero) => {
      const documento = String(pasajero?.documentID || '').trim();
      if (!documento) return;

      const rutas = Array.isArray(pasajero?.routes) ? pasajero.routes : [];
      const rutaExtra = rutas.find((ruta) =>
        Array.isArray(ruta?.tags) && ruta.tags.some((tag) => String(tag).toUpperCase() === 'EXTRA'),
      );

      if (rutaExtra) {
        rutasPorDocumento.set(documento, rutaExtra);
      }
    });

    return rutasPorDocumento;
  } catch {
    return new Map();
  }
};

const requestRutaSegura = async (sede, endpoint, method, payload) => {
  const config = getConfigRutaSeguraPorSede(sede);
  if (!config || !config.integrationId || !config.bearer || !env.rutaSegura.baseUrl) {
    return { ok: false, skipped: true };
  }

  const base = env.rutaSegura.baseUrl.replace(/\/+$/, '');
  const url = `${base}/${config.integrationId}/${endpoint.replace(/^\/+/, '')}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Ruta Segura ${endpoint} fallo (${response.status})`);
  }
  return { ok: true };
};

export const registrarNovedadRutaSegura = async ({ sede, document, note }) => {
  try {
    if (!sede || !document) return { ok: false, skipped: true };
    return await requestRutaSegura(sede, 'absences', 'POST', {
      absences: [{ document: String(document).trim(), note: String(note || '').trim() }],
    });
  } catch {
    return { ok: false, skipped: true };
  }
};

export const eliminarNovedadRutaSegura = async ({ sede, document }) => {
  try {
    if (!sede || !document) return { ok: false, skipped: true };
    return await requestRutaSegura(sede, 'absence', 'DELETE', {
      document: String(document).trim(),
    });
  } catch {
    return { ok: false, skipped: true };
  }
};

export const enriquecerConRutaExtra = async (inscritos) => {
  const sedes = [...new Set(inscritos.map((inscrito) => inscrito.Sede).filter(Boolean))];
  const rutasPorSede = new Map();

  for (const sede of sedes) {
    const rutas = await fetchRutasExtrasPorSede(sede);
    rutasPorSede.set(normalizarSede(sede), rutas);
  }

  return inscritos.map((inscrito) => {
    const documento = String(inscrito?.participante?.idParticipante || '').trim();
    const mapaSede = rutasPorSede.get(normalizarSede(inscrito.Sede)) || new Map();
    const rutaExtra = documento ? mapaSede.get(documento) : null;
    const data = inscrito.toJSON();

    return {
      ...data,
      participante: {
        ...(data.participante || {}),
        rutaExtra: rutaExtra
          ? {
              name: rutaExtra.name,
              tags: rutaExtra.tags,
            }
          : null,
      },
    };
  });
};
