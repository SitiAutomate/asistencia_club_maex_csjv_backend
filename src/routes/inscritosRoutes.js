/** Mantener sincronizado con docs/openapi.yaml */
import express from 'express';
import {
  obtenerConfigPeriodoInformes,
  obtenerInscritosActivos,
  obtenerInscritosReportes,
} from '../controllers/InscritosController.js';

const router = express.Router();

router.get('/periodo-config', obtenerConfigPeriodoInformes);
router.get('/reportes', obtenerInscritosReportes);
router.get('/', obtenerInscritosActivos);

export default router;