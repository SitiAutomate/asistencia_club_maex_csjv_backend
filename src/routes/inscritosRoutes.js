import express from 'express';
import { obtenerInscritosActivos } from '../controllers/InscritosController.js';

const router = express.Router();

router.get('/', obtenerInscritosActivos);

export default router;