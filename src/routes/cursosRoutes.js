import { Router } from "express";
import { obtenerCursos } from "../controllers/CursosController.js";

const router = Router();

router.get('/', obtenerCursos);
router.get('/docente/:correo', obtenerCursos);

export default router;