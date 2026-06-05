/** Catálogo y contenido markdown para el portal de documentación (rol Desarrollador / Administrador) */
import { Router } from 'express';
import { getDocContent, listDocsCatalog } from '../controllers/DocsController.js';
import { requireDocsAccess } from '../middlewares/requireDocsAccess.js';

const router = Router();

router.use(...requireDocsAccess);

router.get('/catalog', listDocsCatalog);
router.get('/content/:id', getDocContent);

export default router;
