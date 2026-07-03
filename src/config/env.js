import dotenv from 'dotenv';
import path from 'path';
import { normalizarFechaEnv } from '../utils/informeEnvioWindow.js';

dotenv.config();

const decodeIfUrlEncoded = (value) => {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const parseMesInformes = (value, fallback) => {
  const n = Number(String(value ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > 12) return fallback;
  return n;
};

const informeEnvioHabilitadoRaw = process.env.INFORME_ENVIO_HABILITADO;
const informeEnvioHabilitadoClean =
  informeEnvioHabilitadoRaw == null
    ? ''
    : String(informeEnvioHabilitadoRaw).trim().replace(/^\uFEFF/, '');
const informeEnvioHabilitado =
  informeEnvioHabilitadoClean === ''
    ? true
    : informeEnvioHabilitadoClean.toLowerCase() !== 'false';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  startWithoutDb: process.env.START_WITHOUT_DB === 'true',
  evaluaciones: {
    fondoPath: process.env.EVALUACION_FONDO_PATH || '',
    logoPath: process.env.EVALUACION_LOGO_PATH || '',
    logoMaexPath: process.env.EVALUACION_LOGO_MAEX_PATH || '',
    fotoMaxBytes: Math.max(1, Number(process.env.EVALUACION_FOTO_MAX_MB) || 20) * 1024 * 1024,
  },
  /** Mes de inscripción/evaluación por periodo de informes (ids ene_jul / ago_dic). */
  informesPeriodo: {
    periodo1Mes: parseMesInformes(process.env.INFORMES_PERIODO_1_MES, 6),
    periodo2Mes: parseMesInformes(process.env.INFORMES_PERIODO_2_MES, 11),
    periodo1Etiqueta: String(process.env.INFORMES_PERIODO_1_ETIQUETA || '').trim(),
    periodo2Etiqueta: String(process.env.INFORMES_PERIODO_2_ETIQUETA || '').trim(),
  },
  /** Ventana para enviar informes por correo (fecha según America/Bogota). */
  informeEnvio: {
    habilitado: informeEnvioHabilitado,
    desde: normalizarFechaEnv(process.env.INFORME_ENVIO_DESDE),
    hasta: normalizarFechaEnv(process.env.INFORME_ENVIO_HASTA),
  },
  email: {
    host: process.env.EMAIL_HOST || '',
    port: Number(process.env.EMAIL_PORT) || 587,
    user: process.env.EMAIL_USER || '',
    pass: decodeIfUrlEncoded(process.env.EMAIL_PASS || ''),
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || '',
    secure:
      process.env.EMAIL_SECURE === 'true' || Number(process.env.EMAIL_PORT) === 465,
    poolMaxConnections: Number(process.env.EMAIL_POOL_MAX_CONNECTIONS) || 5,
    poolMaxMessages: Number(process.env.EMAIL_POOL_MAX_MESSAGES) || 100,
  },
  evaluacionEmail: {
    incluirCorreosFamilia:
      String(process.env.EVALUACION_EMAIL_INCLUIR_CORREOS_FAMILIA || 'false').toLowerCase() ===
      'true',
    queueConcurrency: Number(process.env.EVALUACION_EMAIL_QUEUE_CONCURRENCY) || 3,
    queuePollMs: Number(process.env.EVALUACION_EMAIL_QUEUE_POLL_MS) || 1200,
    queueIdlePollMs: Number(process.env.EVALUACION_EMAIL_QUEUE_IDLE_POLL_MS) || 6000,
    /** Jobs en `processing` más viejos que esto se marcan failed (evita 409 permanente). */
    staleProcessingMs: Number(process.env.EVALUACION_EMAIL_STALE_PROCESSING_MS) || 10 * 60_000,
  },
  rutaSegura: {
    baseUrl: process.env.RUTA_SEGURA || '',
    integrationIdMed: process.env.INTEGRATIONIDMED || '',
    integrationIdRet: process.env.INTEGRATIONIDRET || '',
    bearerMed: process.env.BEARERMED || '',
    bearerRet: process.env.BEARERRET || '',
  },
  integracionClub: {
    bearerIns: process.env.BEARERINS || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    redirectUri:
      process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5173/callback-microsoft',
  },
  app: {
    publicUrl: process.env.APP_PUBLIC_URL || 'http://localhost:4000',
    /** URL base del frontend (enlaces en correos: verificar cuenta, restablecer contraseña). */
    frontendUrl: (
      process.env.FRONTEND_URL ||
      process.env.APP_FRONTEND_URL ||
      'http://localhost:5173'
    ).replace(/\/$/, ''),
    corsOrigins: String(process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
    uploadsDir: path.resolve(process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads')),
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'club_asistencia',
    user: process.env.DB_USER || 'root',
    password: decodeIfUrlEncoded(process.env.DB_PASSWORD || ''),
    dialect: process.env.DB_DIALECT || 'mysql',
    connectTimeoutMs: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 8000,
  },
};
