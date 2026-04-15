import { Router } from 'express';
import { crearRubrica, editarRubrica, obtenerRubricas } from '../controllers/RubricasController.js';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles(ROLES.ADMINISTRADOR, ROLES.ENTRENADOR, ROLES.PROVEEDOR));

router.get('/', obtenerRubricas);
router.post('/', crearRubrica);
router.put('/:id', editarRubrica);

export default router;
