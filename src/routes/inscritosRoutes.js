/** Mantener sincronizado con docs/openapi.yaml */
import express from 'express';
import {
  obtenerConfigPeriodoInformes,
  obtenerInscritosActivos,
  obtenerInscritosReportes,
} from '../controllers/InscritosController.js';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireRoles(ROLES.ADMINISTRADOR, ROLES.ENTRENADOR, ROLES.PROVEEDOR));

router.get('/periodo-config', obtenerConfigPeriodoInformes);
router.get('/reportes', obtenerInscritosReportes);
router.get('/', obtenerInscritosActivos);

export default router;
