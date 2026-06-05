# Backend — Asistencia Club MAEX

API REST para el sistema de asistencia, evaluaciones e informes del Club Deportivo San José de Las Vegas (MAEX).

**Repositorio GitHub:** [asistencia_club_maex_csjv_backend](https://github.com/SitiAutomate/asistencia_club_maex_csjv_backend)

## Stack

| Tecnología | Uso |
|------------|-----|
| [Node.js](https://nodejs.org/) 20+ | Runtime |
| [Express](https://expressjs.com/) 5 | Servidor HTTP |
| [Sequelize](https://sequelize.org/) 6 + mysql2 | ORM sobre MySQL |
| bcrypt + jsonwebtoken | Autenticación proveedores / desarrolladores |
| multer | Subida de fotos en evaluaciones |
| pdfkit | Generación de informes PDF |
| nodemailer | Correos (verificación, recuperación, informes) |
| helmet, cors, morgan | Seguridad y logs |
| swagger-ui-express | Documentación interactiva OpenAPI |

## Requisitos

- Node.js 20 o superior
- MySQL con el esquema del club (tablas existentes; ver [docs/DATABASE.md](docs/DATABASE.md))
- Variables de entorno (ver [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md))

## Instalación

```bash
git clone https://github.com/SitiAutomate/asistencia_club_maex_csjv_backend.git
cd asistencia_club_maex_csjv_backend
npm install
cp .env.example .env
# Editar .env con credenciales reales
npm run dev
```

El servidor escucha en el puerto definido en `PORT` (por defecto `3006` en `.env.example`, o `4000` si no se define).

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo con nodemon |
| `npm run start` | Producción |
| `npm run lint` | ESLint |
| `npm run lint:fix` | Corregir lint automáticamente |
| `npm run format` | Prettier |
| `npm run sequelize:migrate` | Ejecutar migraciones (si se agregan) |

## Estructura del proyecto

```txt
server.js                 # Entrada: conexión BD, cola de emails, listen
src/
  app.js                  # Express, rutas, Swagger, estáticos /uploads
  config/
    env.js                # Variables de entorno
    logger.js
    swagger.js            # Carga openapi.yaml
  constants/roles.js
  controllers/            # Lógica por dominio
  database/
    sequelize.js
    models/
    migrations/
    seeders/
  middlewares/
    auth.js
    requireSwaggerAccess.js
    errorHandler.js
  routes/
docs/
  openapi.yaml            # Especificación OpenAPI (mantener sincronizada)
  API.md
  DATABASE.md
  ENVIRONMENT.md
  INTEGRACIONES.md
  sequelize-guide.md
```

## API y documentación Swagger

- **Índice legible:** [docs/API.md](docs/API.md)
- **Portal visual (frontend):** ruta `/documentacion` (Desarrollador y Administrador)
- **Swagger UI:** `GET /api-docs` (solo rol **Desarrollador**, con JWT)
- **Markdown vía API:** `GET /api/docs/catalog` y `GET /api/docs/content/:id`
- **Especificación:** [docs/openapi.yaml](docs/openapi.yaml)

En desarrollo, tras iniciar sesión como Desarrollador:

```text
http://localhost:3006/api-docs?access_token=<JWT>
```

O use el enlace **Documentación API** en el menú del frontend (mismo rol).

## Rutas principales

| Prefijo | Descripción |
|---------|-------------|
| `/api/health` | Salud del servicio |
| `/api/auth` | Registro, login, Microsoft OAuth, recuperación |
| `/api/inscritos` | Participantes inscritos |
| `/api/cursos` | Cursos activos |
| `/api/asistencia` | Consulta y registro de asistencia (JWT) |
| `/api/rubricas` | CRUD rúbricas (JWT) |
| `/api/evaluaciones` | Evaluaciones e informes (JWT) |
| `/api/admin` | Panel administrador de informes (JWT + Administrador) |
| `/api/integracion-club` | API externa con `BEARERINS` |
| `/uploads` | Archivos estáticos (fotos, PDF) |

## Roles de usuario

| Rol | Acceso |
|-----|--------|
| **Entrenador** | Microsoft OAuth |
| **Administrador** | Microsoft OAuth (debe existir en BD) |
| **Proveedor** | Email + contraseña, registro público |
| **Desarrollador** | Email + contraseña; acceso a `/api-docs` (crear en BD manualmente) |

## Documentación adicional

- [Variables de entorno](docs/ENVIRONMENT.md)
- [Base de datos y relaciones](docs/DATABASE.md)
- [Integraciones externas](docs/INTEGRACIONES.md)
- [Guía Sequelize](docs/sequelize-guide.md)

## Frontend

El cliente React vive en un repositorio separado: [asistencia_club_maex_csjv_frontend](https://github.com/SitiAutomate/asistencia_club_maex_csjv_frontend).

En desarrollo, el frontend en `:5173` hace proxy de `/api` hacia este backend.
