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
import {
  catalogosAdminLvlup,
  crearAsignacionLvlup,
  crearGrupoLvlup,
  crearMaestroLvlup,
  actualizarAsignacionLvlup,
  actualizarGrupoLvlup,
  actualizarMaestroLvlup,
  buscarParticipantesAdminLvlup,
  eliminarAsignacionLvlup,
  eliminarGrupoLvlup,
  eliminarMaestroLvlup,
  listarAsignacionesAdminLvlup,
  listarGruposAdminLvlup,
  listarMaestrosAdminLvlup,
} from '../controllers/LvlupAdminController.js';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles(ROLES.ADMINISTRADOR, ROLES.SUPER_ADMINISTRADOR, ROLES.MAESTRO_LVLUP));

router.get('/maestros', listarMaestrosLvlup);
router.get('/historial', listarHistorialLvlup);
router.get('/asignaciones', listarAsignacionesLvlup);
router.get('/asignaciones/:id/participantes', listarParticipantesLvlup);
router.get('/asignaciones/:id/saldo', obtenerSaldoLvlup);
router.get('/asignaciones/:id/asistencia', listarAsistenciaLvlup);
router.post('/asistencia/individual', registrarAsistenciaIndividualLvlup);
router.post('/asistencia/grupal', registrarAsistenciaGrupalLvlup);

/** Administración (solo Admin / SuperAdmin — validado en controller). */
router.get('/admin/catalogos', catalogosAdminLvlup);
router.get('/admin/maestros', listarMaestrosAdminLvlup);
router.post('/admin/maestros', crearMaestroLvlup);
router.patch('/admin/maestros/:id', actualizarMaestroLvlup);
router.delete('/admin/maestros/:id', eliminarMaestroLvlup);
router.get('/admin/grupos', listarGruposAdminLvlup);
router.post('/admin/grupos', crearGrupoLvlup);
router.patch('/admin/grupos/:id', actualizarGrupoLvlup);
router.delete('/admin/grupos/:id', eliminarGrupoLvlup);
router.get('/admin/participantes', buscarParticipantesAdminLvlup);
router.get('/admin/asignaciones', listarAsignacionesAdminLvlup);
router.post('/admin/asignaciones', crearAsignacionLvlup);
router.patch('/admin/asignaciones/:id', actualizarAsignacionLvlup);
router.delete('/admin/asignaciones/:id', eliminarAsignacionLvlup);

export default router;
