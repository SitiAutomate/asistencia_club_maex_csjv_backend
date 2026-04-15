import dotenv from 'dotenv';
import { normalizarFechaEnv } from '../utils/informeEnvioWindow.js';

dotenv.config();

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
    pass: process.env.EMAIL_PASS || '',
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || '',
    secure:
      process.env.EMAIL_SECURE === 'true' || Number(process.env.EMAIL_PORT) === 465,
  },
  evaluacionEmail: {
    incluirCorreosFamilia:
      String(process.env.EVALUACION_EMAIL_INCLUIR_CORREOS_FAMILIA || 'false').toLowerCase() ===
      'true',
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
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'club_asistencia',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dialect: process.env.DB_DIALECT || 'mysql',
    connectTimeoutMs: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 8000,
  },
};
