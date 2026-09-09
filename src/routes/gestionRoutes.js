/** Mantener sincronizado con docs/openapi.yaml */
import { Router } from 'express';
import { requireAuth, requireRoles } from '../middlewares/auth.js';
import { ROLES } from '../constants/roles.js';
import { GESTION_ACCIONES, GESTION_MODULOS } from '../constants/gestionPermisos.js';
import {
  requireAnyGestionPermiso,
  requireGestionPermiso,
  requireInscripcionGestionPermiso,
} from '../services/gestionPermisosService.js';
import {
  listarInscripcionesGestion,
  obtenerInscripcionGestion,
  crearInscripcionGestion,
  actualizarInscripcionGestion,
  eliminarInscripcionGestion,
  previsualizarPaseMesInscripciones,
  ejecutarPaseMesInscripciones,
  listarTiposGestion,
  listarCursosGestion,
  crearCursoGestion,
  actualizarCursoGestion,
  metaFiltrosGestion,
  listarCausalesGestion,
  listarActividadesCatalogo,
  listarDepartamentosCatalogo,
  listarCiudadesCatalogo,
  listarLineasCatalogo,
  listarEntrenadoresCatalogo,
  listarParticipantesGestion,
  obtenerParticipanteGestion,
  crearParticipanteGestion,
  actualizarParticipanteGestion,
  listarResponsablesGestion,
  obtenerResponsableGestion,
  crearResponsableGestion,
  actualizarResponsableGestion,
} from '../controllers/GestionController.js';
import {
  obtenerMisPermisosGestion,
  listarAdminsPermisos,
  obtenerPermisosUsuario,
  guardarPermisosUsuario,
  listarAuditoriaGestion,
} from '../controllers/GestionAdminConfigController.js';
import {
  listarColumnasInscripciones,
  listarCamposTipoGestion,
  upsertCampoTipoGestion,
  eliminarCampoTipoGestion,
  listarCatalogosGestion,
  listarOpcionesCatalogoGestion,
} from '../controllers/GestionTipoCamposController.js';

const router = Router();

router.use(requireAuth, requireRoles(ROLES.ADMINISTRADOR, ROLES.SUPER_ADMINISTRADOR));
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/me/permisos', obtenerMisPermisosGestion);

router.get('/tipos', listarTiposGestion);
router.get('/filtros-meta', metaFiltrosGestion);
router.get('/causales', listarCausalesGestion);
router.get('/catalogos/actividades', listarActividadesCatalogo);
router.get('/catalogos/departamentos', listarDepartamentosCatalogo);
router.get('/catalogos/ciudades', listarCiudadesCatalogo);
router.get('/catalogos/lineas', listarLineasCatalogo);
router.get('/catalogos/entrenadores', listarEntrenadoresCatalogo);

router.get(
  '/cursos',
  requireAnyGestionPermiso([
    { modulo: GESTION_MODULOS.CURSOS, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.INSCRIPCIONES, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.OTROS, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.INSCRIPCIONES, accion: GESTION_ACCIONES.CREAR },
    { modulo: GESTION_MODULOS.OTROS, accion: GESTION_ACCIONES.CREAR },
  ]),
  listarCursosGestion,
);
router.post(
  '/cursos',
  requireGestionPermiso(GESTION_MODULOS.CURSOS, GESTION_ACCIONES.CREAR),
  crearCursoGestion,
);
router.patch(
  '/cursos/:id',
  requireGestionPermiso(GESTION_MODULOS.CURSOS, GESTION_ACCIONES.EDITAR),
  actualizarCursoGestion,
);

router.get(
  '/inscripciones',
  requireInscripcionGestionPermiso(GESTION_ACCIONES.LEER),
  listarInscripcionesGestion,
);
/** Antes de /inscripciones/:id para no capturar "pasar-mes" como id. Solo SuperAdmin. */
router.get(
  '/inscripciones/pasar-mes/preview',
  requireRoles(ROLES.SUPER_ADMINISTRADOR),
  previsualizarPaseMesInscripciones,
);
router.post(
  '/inscripciones/pasar-mes',
  requireRoles(ROLES.SUPER_ADMINISTRADOR),
  ejecutarPaseMesInscripciones,
);
router.get(
  '/inscripciones/:id',
  requireInscripcionGestionPermiso(GESTION_ACCIONES.LEER),
  obtenerInscripcionGestion,
);
router.post(
  '/inscripciones',
  requireInscripcionGestionPermiso(GESTION_ACCIONES.CREAR),
  crearInscripcionGestion,
);
router.patch(
  '/inscripciones/:id',
  requireInscripcionGestionPermiso(GESTION_ACCIONES.EDITAR),
  actualizarInscripcionGestion,
);
router.delete(
  '/inscripciones/:id',
  requireInscripcionGestionPermiso(GESTION_ACCIONES.ELIMINAR),
  eliminarInscripcionGestion,
);

router.get(
  '/participantes',
  requireAnyGestionPermiso([
    { modulo: GESTION_MODULOS.PARTICIPANTES, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.INSCRIPCIONES, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.OTROS, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.INSCRIPCIONES, accion: GESTION_ACCIONES.CREAR },
    { modulo: GESTION_MODULOS.OTROS, accion: GESTION_ACCIONES.CREAR },
  ]),
  listarParticipantesGestion,
);
router.get(
  '/participantes/:doc',
  requireAnyGestionPermiso([
    { modulo: GESTION_MODULOS.PARTICIPANTES, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.INSCRIPCIONES, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.OTROS, accion: GESTION_ACCIONES.LEER },
  ]),
  obtenerParticipanteGestion,
);
router.post(
  '/participantes',
  requireGestionPermiso(GESTION_MODULOS.PARTICIPANTES, GESTION_ACCIONES.CREAR),
  crearParticipanteGestion,
);
router.patch(
  '/participantes/:doc',
  requireGestionPermiso(GESTION_MODULOS.PARTICIPANTES, GESTION_ACCIONES.EDITAR),
  actualizarParticipanteGestion,
);

router.get(
  '/responsables',
  requireAnyGestionPermiso([
    { modulo: GESTION_MODULOS.RESPONSABLES, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.INSCRIPCIONES, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.OTROS, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.INSCRIPCIONES, accion: GESTION_ACCIONES.CREAR },
    { modulo: GESTION_MODULOS.OTROS, accion: GESTION_ACCIONES.CREAR },
  ]),
  listarResponsablesGestion,
);
router.get(
  '/responsables/:doc',
  requireAnyGestionPermiso([
    { modulo: GESTION_MODULOS.RESPONSABLES, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.INSCRIPCIONES, accion: GESTION_ACCIONES.LEER },
    { modulo: GESTION_MODULOS.OTROS, accion: GESTION_ACCIONES.LEER },
  ]),
  obtenerResponsableGestion,
);
router.post(
  '/responsables',
  requireGestionPermiso(GESTION_MODULOS.RESPONSABLES, GESTION_ACCIONES.CREAR),
  crearResponsableGestion,
);
router.patch(
  '/responsables/:doc',
  requireGestionPermiso(GESTION_MODULOS.RESPONSABLES, GESTION_ACCIONES.EDITAR),
  actualizarResponsableGestion,
);

router.get(
  '/auditoria',
  requireGestionPermiso(GESTION_MODULOS.AUDITORIA, GESTION_ACCIONES.LEER),
  listarAuditoriaGestion,
);

router.get(
  '/permisos/admins',
  requireGestionPermiso(GESTION_MODULOS.PERMISOS, GESTION_ACCIONES.LEER),
  listarAdminsPermisos,
);
router.get(
  '/permisos/:usuarioId',
  requireGestionPermiso(GESTION_MODULOS.PERMISOS, GESTION_ACCIONES.LEER),
  obtenerPermisosUsuario,
);
router.put(
  '/permisos/:usuarioId',
  requireGestionPermiso(GESTION_MODULOS.PERMISOS, GESTION_ACCIONES.EDITAR),
  guardarPermisosUsuario,
);

router.get('/config/tipo-campos', listarCamposTipoGestion);
router.get('/config/catalogos', listarCatalogosGestion);
router.get('/config/catalogos/:key', listarOpcionesCatalogoGestion);
router.get(
  '/config/columnas-inscripciones',
  requireGestionPermiso(GESTION_MODULOS.TIPO_CAMPOS, GESTION_ACCIONES.LEER),
  listarColumnasInscripciones,
);
router.post(
  '/config/tipo-campos',
  requireGestionPermiso(GESTION_MODULOS.TIPO_CAMPOS, GESTION_ACCIONES.EDITAR),
  upsertCampoTipoGestion,
);
router.delete(
  '/config/tipo-campos/:id',
  requireGestionPermiso(GESTION_MODULOS.TIPO_CAMPOS, GESTION_ACCIONES.ELIMINAR),
  eliminarCampoTipoGestion,
);

export default router;
