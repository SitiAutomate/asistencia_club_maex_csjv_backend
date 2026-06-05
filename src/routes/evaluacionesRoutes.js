/** Mantener sincronizado con docs/openapi.yaml */
import { Router } from 'express';
import {
  crearEvaluacion,
  enviarEvaluacion,
  getVentanaInformeEnvio,
  obtenerEvaluacionParticipante,
} from '../controllers/EvaluacionesController.js';
import { uploadEvaluacionFoto } from '../middlewares/uploadEvaluacion.js';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles(ROLES.ADMINISTRADOR, ROLES.ENTRENADOR, ROLES.PROVEEDOR));

router.post(
  '/',
  uploadEvaluacionFoto,
  crearEvaluacion,
);

router.get('/participante/:identificacion', obtenerEvaluacionParticipante);

router.get('/ventana-envio', getVentanaInformeEnvio);

router.post('/:id/enviar', enviarEvaluacion);

export default router;
