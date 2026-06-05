# Variables de entorno — Backend

Copie `.env.example` a `.env` y complete los valores. **No suba `.env` a Git.**

La configuración centralizada está en `src/config/env.js`.

## Servidor

| Variable | Obligatorio | Default | Descripción |
|----------|-------------|---------|-------------|
| `NODE_ENV` | No | `development` | Entorno (`development`, `production`) |
| `PORT` | No | `4000` | Puerto HTTP (en ejemplo local suele ser `3006`) |
| `START_WITHOUT_DB` | No | `false` | Si `true`, arranca sin MySQL ni cola de emails |

## Base de datos (MySQL)

| Variable | Obligatorio | Default | Descripción |
|----------|-------------|---------|-------------|
| `DB_HOST` | Sí* | `localhost` | Host MySQL |
| `DB_PORT` | No | `3306` | Puerto |
| `DB_NAME` | Sí* | `club_asistencia` | Nombre de la base |
| `DB_USER` | Sí* | `root` | Usuario |
| `DB_PASSWORD` | Sí* | — | Contraseña (puede ir URL-encoded) |
| `DB_DIALECT` | No | `mysql` | Dialecto Sequelize |
| `DB_CONNECT_TIMEOUT_MS` | No | `8000` | Timeout de conexión |

\* Requerido en producción con datos reales.

## Autenticación JWT

| Variable | Obligatorio | Descripción |
|----------|-------------|-------------|
| `JWT_SECRET` | Sí | Secreto largo y aleatorio para firmar tokens |
| `JWT_EXPIRES_IN` | No | Caducidad (ej. `7d`) |

## URLs de la aplicación

| Variable | Descripción |
|----------|-------------|
| `APP_PUBLIC_URL` | URL pública del API (enlaces en PDF/correos) |
| `FRONTEND_URL` | URL del SPA React (verificación, reset password, redirect Microsoft) |
| `UPLOADS_DIR` | Ruta absoluta persistente para fotos/PDF (producción en Hostinger, etc.) |

## Microsoft OAuth (Entrenador / Administrador)

| Variable | Descripción |
|----------|-------------|
| `MICROSOFT_CLIENT_ID` | ID de aplicación Azure |
| `MICROSOFT_TENANT_ID` | Tenant |
| `MICROSOFT_CLIENT_SECRET` | Secreto |
| `MICROSOFT_REDIRECT_URI` | URI registrada en Azure (ej. `http://localhost:3006/callback-microsoft`) |

El API reenvía el `code` a `FRONTEND_URL/callback-microsoft`.

## Correo (SMTP)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `EMAIL_HOST` | — | Servidor SMTP |
| `EMAIL_PORT` | `587` | Puerto |
| `EMAIL_USER` | — | Usuario |
| `EMAIL_PASS` | — | Contraseña |
| `EMAIL_FROM` | `EMAIL_USER` | Remitente |
| `EMAIL_SECURE` | `false` | TLS explícito (`true` o puerto 465) |
| `EMAIL_POOL_MAX_CONNECTIONS` | `5` | Pool nodemailer |
| `EMAIL_POOL_MAX_MESSAGES` | `100` | Mensajes por conexión |

## Informes y evaluaciones

| Variable | Descripción |
|----------|-------------|
| `EVALUACION_FONDO_PATH` | Ruta imagen fondo PDF |
| `EVALUACION_LOGO_PATH` | Logo club en PDF |
| `EVALUACION_LOGO_MAEX_PATH` | Logo MAEX en PDF |
| `INFORME_ENVIO_HABILITADO` | `false` desactiva envío por correo |
| `INFORME_ENVIO_DESDE` | Fecha inicio ventana (`YYYY-MM-DD`, Bogotá) |
| `INFORME_ENVIO_HASTA` | Fecha fin ventana |
| `EVALUACION_EMAIL_INCLUIR_CORREOS_FAMILIA` | `true` incluye correos de padres |
| `EVALUACION_EMAIL_QUEUE_CONCURRENCY` | Hilos de la cola de envío |
| `EVALUACION_EMAIL_QUEUE_POLL_MS` | Intervalo de polling activo |
| `EVALUACION_EMAIL_QUEUE_IDLE_POLL_MS` | Intervalo en reposo |

## Ruta Segura (transporte)

| Variable | Descripción |
|----------|-------------|
| `RUTA_SEGURA` | URL base API Ruta Segura |
| `INTEGRATIONIDMED` | ID integración Medellín |
| `INTEGRATIONIDRET` | ID integración Retiro |
| `BEARERMED` | Token Medellín |
| `BEARERRET` | Token Retiro |

## Integración club (API externa)

| Variable | Descripción |
|----------|-------------|
| `BEARERINS` | Token Bearer para `GET /api/integracion-club/:sede` |

## Ejemplo mínimo local

```env
NODE_ENV=development
PORT=3006
DB_HOST=localhost
DB_NAME=club_asistencia
DB_USER=root
DB_PASSWORD=tu_password
JWT_SECRET=genera_un_secreto_largo
FRONTEND_URL=http://localhost:5173
APP_PUBLIC_URL=http://localhost:3006
```
