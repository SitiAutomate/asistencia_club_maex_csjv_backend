# Glosario de schemas (respuestas y cuerpos)

## Envoltura estándar del API

Casi todas las respuestas JSON siguen este patrón:

### Éxito (`ApiSuccess`)

```json
{
  "success": true,
  "message": "Texto para el usuario o logs",
  "data": { }
}
```

- **success:** siempre `true` en respuestas correctas.
- **message:** descripción humana (puede mostrarse en la UI).
- **data:** objeto con el payload real (cursos, inscritos, token, etc.).

### Error (`ApiError`)

```json
{
  "success": false,
  "message": "Motivo del error",
  "error": "Detalle técnico (solo en development)"
}
```

Códigos HTTP habituales: `400` datos inválidos, `401` sin token, `403` sin permiso, `404` no encontrado, `409` duplicado, `500` error interno.

---

## Schemas de autenticación

### LoginRequest

| Campo | Tipo | Descripción |
|-------|------|-------------|
| email | string | Correo registrado |
| password | string | Mínimo 8 caracteres |

### LoginResponse (dentro de `data`)

| Campo | Descripción |
|-------|-------------|
| accessToken | JWT para header Authorization |
| tokenType | Siempre `Bearer` |
| user.email | Correo de sesión |
| user.rol | Administrador, Entrenador, Proveedor, Desarrollador |
| user.usuarioid | Documento o identificador interno |
| user.nombre | Nombre para mostrar |

---

## Curso (`CursoItem`)

Objeto dentro de `data.cursos[]` al llamar `GET /api/cursos`:

| Campo | Descripción |
|-------|-------------|
| ID_Curso | **ID que debe usar** en inscritos y asistencia |
| Nombre_del_curso | Nombre largo |
| Nombre_Corto_Curso | Nombre corto en UI |
| Linea | ID numérico de línea deportiva |
| nombreLinea | Nombre de la línea (join) |
| Actividad | Código de actividad asignada |

---

## AsistenciaRegistro (POST /api/asistencia)

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| documento | Sí | Documento del participante |
| nombre | Sí | Nombre para mostrar |
| idcurso | Sí | Mismo valor que `ID_Curso` |
| curso | Sí | Nombre del curso (texto) |
| reporte | Sí | `Asistió`, `Faltó` o `Excusa` |
| comentarios | No | Requerido lógicamente si Excusa |
| ruta | No | Si usa transporte / Ruta Segura |
| sede | No | Sede para integración transporte |

---

## RubricaBody (POST/PUT rúbricas)

| Campo | Descripción |
|-------|-------------|
| nombre | Título de la rúbrica |
| tipo | Tipo de evaluación |
| descripcion | Texto largo |
| categoria | Obligatoria si no es común |
| comun | `true` = rúbrica compartida por actividad |
| actividad | Obligatoria si `comun` es true |
| alto, medio, bajo | Textos de cada nivel |
| estado | Activa / inactiva |

---

## Evaluación (multipart POST /api/evaluaciones)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| foto | archivo | Imagen del participante |
| participante | string | Nombre |
| identificacion | string | Documento |
| categoria | string | Categoría evaluada |
| comentario | string | Comentarios del entrenador |
| rubricas | string JSON | `[{"id_rubrica":1,"valor":"Satisfactorio Alto"}]` |
| evaluacionId | number | Si existe, actualiza en lugar de crear |

---

## Paginación admin (`GET /api/admin/informes`)

Query: `page`, `limit` más filtros de fecha, categoría, entrenador, etc.

Respuesta incluye filas de informes con URLs de PDF en `informe` o rutas bajo `/uploads`.
