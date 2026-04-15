import { Router } from 'express';
import { listarExtraclasesMesActual } from '../controllers/IntegracionClubController.js';

const router = Router();

router.get('/:sedeNombre', listarExtraclasesMesActual);

export default router;
