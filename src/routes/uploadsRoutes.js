import { Router } from 'express';
import { serveAuthenticatedUpload } from '../controllers/UploadsController.js';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles(ROLES.ADMINISTRADOR, ROLES.ENTRENADOR, ROLES.PROVEEDOR));
router.get(/.*/, serveAuthenticatedUpload);

export default router;
