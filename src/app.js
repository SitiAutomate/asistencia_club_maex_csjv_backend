import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import InscritosRoutes from './routes/inscritosRoutes.js';
import CursosRoutes from './routes/cursosRoutes.js';
import AsistenciaRoutes from './routes/asistenciaRoutes.js';
import RubricasRoutes from './routes/rubricasRoutes.js';
import EvaluacionesRoutes from './routes/evaluacionesRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import integracionClubRoutes from './routes/integracionClubRoutes.js';
import lvlupRoutes from './routes/lvlupRoutes.js';
import docsRoutes from './routes/docsRoutes.js';
import uploadsRoutes from './routes/uploadsRoutes.js';
import swaggerUi from 'swagger-ui-express';
import { getOpenApiSpec, swaggerUiOptions } from './config/swagger.js';
import { requireSwaggerAccess, setSwaggerSession } from './middlewares/requireSwaggerAccess.js';
import { apiRateLimiter } from './middlewares/rateLimit.js';
import { sendError } from './utils/responseHandler.js';

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

const corsOrigins = env.app.corsOrigins.length ? env.app.corsOrigins : [env.app.frontendUrl];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use('/api', apiRateLimiter);

app.use('/uploads', (req, res) => {
  sendError(
    res,
    401,
    'Los archivos requieren autenticacion. Use /api/uploads/... con Authorization Bearer.',
  );
});

app.get('/callback-microsoft', (req, res) => {
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(302, `${env.app.frontendUrl}/callback-microsoft${qs}`);
});

app.get('/api-docs/swagger-auth-bridge.html', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Swagger — autenticación</title></head>
<body>
<p>Autenticando con Swagger…</p>
<script>
(function () {
  const STORAGE_KEY = 'swagger_bearer_token';
  function finish(token) {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    if (!token) {
      window.location.replace('/api-docs');
      return;
    }
    fetch('/api-docs/set-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      credentials: 'include',
      body: JSON.stringify({ token }),
    }).finally(function () {
      window.location.replace('/api-docs');
    });
  }
  if (window.opener) {
    window.opener.postMessage({ type: 'swagger-auth-ready' }, '*');
    window.addEventListener('message', function (event) {
      if (!event.data || event.data.type !== 'swagger-auth-token') return;
      finish(String(event.data.token || ''));
    });
    return;
  }
  finish('');
})();
</script>
</body>
</html>`);
});

app.post('/api-docs/set-session', setSwaggerSession);

app.get('/api-docs/swagger-init.js', (_req, res) => {
  res.type('application/javascript').send(`(function () {
  const token = sessionStorage.getItem('swagger_bearer_token');
  if (!token) return;
  sessionStorage.removeItem('swagger_bearer_token');
  const apply = function () {
    if (!window.ui || !window.ui.preauthorizeApiKey) return false;
    window.ui.preauthorizeApiKey('bearerAuth', token);
    return true;
  };
  if (!apply()) {
    const timer = setInterval(function () {
      if (apply()) clearInterval(timer);
    }, 100);
  }
})();`);
});

app.use('/api-docs', swaggerUi.serve);
app.get(
  ['/api-docs', '/api-docs/'],
  requireSwaggerAccess,
  swaggerUi.setup(getOpenApiSpec(), {
    ...swaggerUiOptions,
    customJs: '/api-docs/swagger-init.js',
  }),
);

app.use('/api/docs', docsRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/inscritos', InscritosRoutes);
app.use('/api/cursos', CursosRoutes);
app.use('/api/asistencia', AsistenciaRoutes);
app.use('/api/rubricas', RubricasRoutes);
app.use('/api/evaluaciones', EvaluacionesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/integracion-club', integracionClubRoutes);
app.use('/api/lvlup', lvlupRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
