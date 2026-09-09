/** Mantener sincronizado con docs/openapi.yaml */
import { Router } from 'express';
import {
  obtenerAsistencia,
  registrarAsistencia,
  listarCursosSinAsistenciaHoy,
} from '../controllers/AsistenciaController.js';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles(ROLES.ADMINISTRADOR, ROLES.SUPER_ADMINISTRADOR, ROLES.ENTRENADOR, ROLES.PROVEEDOR));

router.get(
  '/cursos-sin-hoy',
  requireRoles(ROLES.ADMINISTRADOR, ROLES.SUPER_ADMINISTRADOR),
  listarCursosSinAsistenciaHoy,
);
router.get('/', obtenerAsistencia);
router.post('/', registrarAsistencia);

export default router;
