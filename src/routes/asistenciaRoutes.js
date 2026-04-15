import { Router } from 'express';
import { obtenerAsistencia, registrarAsistencia } from '../controllers/AsistenciaController.js';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles(ROLES.ADMINISTRADOR, ROLES.ENTRENADOR, ROLES.PROVEEDOR));

router.get('/', obtenerAsistencia);
router.post('/', registrarAsistencia);

export default router;
