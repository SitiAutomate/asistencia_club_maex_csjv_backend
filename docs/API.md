# Referencia de API

Documentación interactiva:

- **Portal visual (recomendado):** en el frontend, menú **Documentación** → `/documentacion` (roles Desarrollador y Administrador). Incluye guías en español y **Exportar PDF**.
- **Swagger UI:** `/api-docs` (solo **Desarrollador** + JWT).
- **Guía de IDs:** [GUIA_IDENTIFICADORES.md](GUIA_IDENTIFICADORES.md) — de dónde sacar `ID_Curso`, documentos, etc.
- **Glosario de schemas:** [GLOSARIO_SCHEMAS.md](GLOSARIO_SCHEMAS.md) — qué significa `success`, `data`, cada cuerpo.

Especificación OpenAPI: [openapi.yaml](openapi.yaml). **Actualice `openapi.yaml` cada vez que modifique rutas en `src/routes/`.**

API de contenido markdown: `GET /api/docs/catalog`, `GET /api/docs/content/:id` (mismo acceso que el portal).

## Convenciones

### Formato de respuesta

Éxito:

```json
{
  "success": true,
  "message": "Texto descriptivo",
  "data": { }
}
```

Error:

```json
{
  "success": false,
  "message": "Motivo del error",
  "error": "Detalle opcional"
}
```

### Autenticación

| Tipo | Header | Uso |
|------|--------|-----|
| JWT sesión | `Authorization: Bearer <token>` | Rutas de asistencia, rúbricas, evaluaciones, inscritos, cursos, admin, uploads |
| Token fijo | `Authorization: Bearer <BEARERINS>` | `/api/integracion-club/*` |

### Roles en rutas protegidas

| Rutas | Roles permitidos |
|-------|------------------|
| `/api/asistencia`, `/api/rubricas`, `/api/evaluaciones`, `/api/inscritos`, `/api/cursos` | Administrador, Entrenador, Proveedor |
| `/api/admin/*` | Solo Administrador |
| `/api-docs` | Solo Desarrollador |

---

## Índice de endpoints

### Salud

| Método | Ruta | Auth |
|--------|------|------|
| GET | `/api/health` | No |

### Autenticación (`/api/auth`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/register` | No | Registro proveedor |
| POST | `/login` | No | Login proveedor / desarrollador |
| GET/POST | `/verify-email` | No | Confirmar cuenta |
| GET | `/microsoft/url` | No | URL OAuth Microsoft (incluye `state`) |
| POST | `/microsoft/token` | No | Intercambiar code + state por JWT |
| POST | `/forgot-password` | No | Solicitar reset |
| POST/GET | `/reset-password` | No | Nueva contraseña |
| GET | `/me` | JWT | Perfil actual |

### Datos del club

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/inscritos` | JWT | Inscritos (query: `idCurso`, `estado`, `lite`, `withRutaExtra`) |
| GET | `/api/cursos` | JWT | Cursos (query: `correo`, `soloMisCursos`, `scope=all` solo Admin) |
| GET | `/api/cursos/docente/:correo` | JWT | Cursos por docente (solo propio correo salvo Admin) |

### Asistencia (`/api/asistencia`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/` | JWT | Listar (query: `fechaInicio`, `fechaFin`, `q`) |
| POST | `/` | JWT | Registrar/actualizar del día |

### Rúbricas (`/api/rubricas`)

| Método | Ruta | Auth |
|--------|------|------|
| GET | `/` | JWT |
| POST | `/` | JWT |
| PUT | `/:id` | JWT |

### Evaluaciones (`/api/evaluaciones`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/` | JWT | Crear/actualizar (multipart, campo `foto`) |
| GET | `/participante/:identificacion` | JWT | Historial |
| GET | `/ventana-envio` | JWT | Ventana de envío de informes |
| POST | `/:id/enviar` | JWT | Encolar envío por correo |

### Administración (`/api/admin`)

| Método | Ruta | Auth |
|--------|------|------|
| GET | `/informes/resumen` | JWT + Admin |
| GET | `/informes/entrenadores` | JWT + Admin |
| GET | `/informes/categorias` | JWT + Admin |
| GET | `/informes/grafico-categorias` | JWT + Admin |
| GET | `/informes` | JWT + Admin (paginado) |

Filtros comunes: `fechaInicio`, `fechaFin`, `anio`, `categoria`, `entrenador`, `linea`, `periodo`, `estado`, `page`, `limit`.

### Integración

| Método | Ruta | Auth |
|--------|------|------|
| GET | `/api/integracion-club/:sedeNombre` | BEARERINS |

### Otros

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/callback-microsoft` | Redirect OAuth → frontend |
| GET | `/api/uploads/*` | JWT | Fotos e informes (reemplaza `/uploads` público) |
| GET | `/api-docs` | Swagger (Desarrollador) |
