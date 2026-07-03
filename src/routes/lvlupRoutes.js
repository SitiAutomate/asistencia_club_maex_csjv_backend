import { Router } from 'express';
import {
  listarAsignacionesLvlup,
  listarAsistenciaLvlup,
  listarHistorialLvlup,
  listarMaestrosLvlup,
  listarParticipantesLvlup,
  obtenerSaldoLvlup,
  registrarAsistenciaGrupalLvlup,
  registrarAsistenciaIndividualLvlup,
} from '../controllers/LvlupController.js';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles(ROLES.ADMINISTRADOR, ROLES.MAESTRO_LVLUP));

router.get('/maestros', listarMaestrosLvlup);
router.get('/historial', listarHistorialLvlup);
router.get('/asignaciones', listarAsignacionesLvlup);
router.get('/asignaciones/:id/participantes', listarParticipantesLvlup);
router.get('/asignaciones/:id/saldo', obtenerSaldoLvlup);
router.get('/asignaciones/:id/asistencia', listarAsistenciaLvlup);
router.post('/asistencia/individual', registrarAsistenciaIndividualLvlup);
router.post('/asistencia/grupal', registrarAsistenciaGrupalLvlup);

export default router;
