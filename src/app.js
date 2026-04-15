import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
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
const app = express();

app.use(
  helmet({
    // Permite que el SPA (otro origen en dev, p. ej. :5173) cargue imágenes desde /uploads sin ERR_BLOCKED_BY_RESPONSE.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static('uploads'));

/**
 * Microsoft suele tener registrada la URL del API (ej. :3006/callback-microsoft).
 * El SPA vive en otro origen (ej. :5173): reenviamos ?code= al front para que intercambie el token.
 */
app.get('/callback-microsoft', (req, res) => {
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(302, `${env.app.frontendUrl}/callback-microsoft${qs}`);
});

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/inscritos', InscritosRoutes);
app.use('/api/cursos', CursosRoutes);
app.use('/api/asistencia', AsistenciaRoutes);
app.use('/api/rubricas', RubricasRoutes);
app.use('/api/evaluaciones', EvaluacionesRoutes);
app.use('/api/admin', adminRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
