import { Router } from 'express';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';
import {
  getResumenInformes,
  getEntrenadoresInformes,
  getCategoriasInformes,
  listarInformesAdmin,
  getGraficoCategoriasInformes,
} from '../controllers/AdminInformesController.js';

const router = Router();

router.use(requireAuth, requireRoles(ROLES.ADMINISTRADOR));

router.get('/informes/resumen', getResumenInformes);
router.get('/informes/entrenadores', getEntrenadoresInformes);
router.get('/informes/categorias', getCategoriasInformes);
router.get('/informes', listarInformesAdmin);
router.get('/informes/grafico-categorias', getGraficoCategoriasInformes);

export default router;
