# Guía práctica: de dónde salen los IDs y campos

Esta guía explica **qué identificador usar** en cada endpoint y **cómo obtenerlo** con otra llamada previa.

## Flujo recomendado (orden típico)

```text
1. POST /api/auth/login  →  guardar accessToken (JWT)
2. GET  /api/cursos?correo=TU_EMAIL  →  obtener ID_Curso de cada curso
3. GET  /api/inscritos?idCurso=ID_Curso  →  documento del participante
4. GET  /api/rubricas  →  id de cada rúbrica
5. POST /api/asistencia o /api/evaluaciones  →  usar esos valores
```

En Swagger: pulse **Authorize**, pegue `Bearer <su_JWT>` y ejecute los GET en ese orden.

---

## ID del curso (`idCurso` / `idcurso` / `ID_Curso`)

| Campo en API | Origen en BD | Cómo obtenerlo |
|--------------|--------------|----------------|
| `ID_Curso` en respuesta | Tabla `cursos_2025` | `GET /api/cursos?correo=email@club.com` |
| `idCurso` (query inscritos) | Mismo valor | Copiar `data.cursos[].ID_Curso` |
| `idcurso` (body asistencia) | Mismo valor | String, ej. `"1847"` |

**Ejemplo de respuesta** (`GET /api/cursos`):

```json
{
  "success": true,
  "data": {
    "cursos": [
      {
        "ID_Curso": "1847",
        "Nombre_del_curso": "Fútbol categoría A",
        "Nombre_Corto_Curso": "FUT-A",
        "Linea": 3,
        "nombreLinea": "Deportes"
      }
    ]
  }
}
```

Use `"1847"` como `idCurso` en inscritos y como `idcurso` al registrar asistencia.

**Ver todos los cursos (admin):** `GET /api/cursos?scope=all` (según permisos del correo consultado).

---

## Documento del participante (`documento` / `identificacion`)

| Uso | Campo | Cómo obtenerlo |
|-----|-------|----------------|
| Asistencia POST | `documento` | `GET /api/inscritos?idCurso=...` → `validador_participante` o documento del participante |
| Evaluaciones | `identificacion` | Mismo documento (cédula / código del niño) |

**Ejemplo** (`GET /api/inscritos?idCurso=1847&estado=CONFIRMADO,ACTIVO`):

Los inscritos traen datos del participante; el identificador suele ser el campo de documento vinculado a `validador_participante` en inscripciones.

---

## ID de rúbrica (`id_rubrica` / `id` en PUT)

| Uso | Cómo obtenerlo |
|-----|----------------|
| Crear evaluación (array `rubricas`) | `GET /api/rubricas` → cada ítem tiene `id` |
| Editar rúbrica | `PUT /api/rubricas/:id` → `id` del listado |

Valores de calificación permitidos: `Satisfactorio Alto`, `Satisfactorio Medio`, `Satisfactorio Básico`.

---

## ID de evaluación (`evaluacionId` / `:id` en enviar)

| Uso | Cómo obtenerlo |
|-----|----------------|
| Actualizar evaluación existente | Al crear, la respuesta incluye el id de la evaluación |
| Enviar informe | `POST /api/evaluaciones/{id}/enviar` → `id` numérico de la evaluación |
| Historial | `GET /api/evaluaciones/participante/{identificacion}` |

---

## Categoría y línea

- **Categoría del curso:** viene en datos del curso / participante (edad o grupo del programa).
- **Línea:** `Linea` (número) y `nombreLinea` en `GET /api/cursos`.
- Filtros admin: `GET /api/admin/informes/categorias`.

---

## Correo del docente (`correo`)

Es el **email con el que inicia sesión** (JWT). Se usa en:

- `GET /api/cursos?correo=...`
- `GET /api/cursos/docente/{correo}`
- Campo `responsable` implícito en asistencia (se toma del token, no lo envía el cliente).

---

## Token JWT (`Authorization`)

1. `POST /api/auth/login` con email/contraseña (Proveedor o Desarrollador), o
2. `POST /api/auth/microsoft/token` (Entrenador / Administrador).

Respuesta:

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "email": "...", "rol": "Entrenador" }
  }
}
```

Header en rutas protegidas: `Authorization: Bearer eyJhbGciOiJIUzI1NiIs...`

---

## Integración club (`BEARERINS`)

No usa JWT de usuario. Header fijo configurado en el servidor:

`Authorization: Bearer <valor de BEARERINS en .env>`
