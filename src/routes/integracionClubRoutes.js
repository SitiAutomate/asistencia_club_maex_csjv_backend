/** Mantener sincronizado con docs/openapi.yaml */
import { Router } from 'express';
import {
  listarExtraclasesMesActual,
  listarTransporteAnioActual,
} from '../controllers/IntegracionClubController.js';
import { integracionRateLimiter } from '../middlewares/rateLimit.js';

const router = Router();

router.use(integracionRateLimiter);
router.get('/transporte/:sedeNombre', listarTransporteAnioActual);
router.get('/:sedeNombre', listarExtraclasesMesActual);

export default router;
