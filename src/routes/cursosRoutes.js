/** Mantener sincronizado con docs/openapi.yaml */
import { Router } from 'express';
import { obtenerCursos } from '../controllers/CursosController.js';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles(ROLES.ADMINISTRADOR, ROLES.SUPER_ADMINISTRADOR, ROLES.ENTRENADOR, ROLES.PROVEEDOR));

router.get('/', obtenerCursos);
router.get('/docente/:correo', obtenerCursos);

export default router;
