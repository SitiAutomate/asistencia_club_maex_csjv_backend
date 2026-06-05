# Integraciones externas

## Microsoft Azure AD (Entrenadores y Administradores)

**Flujo:**

1. Frontend: `GET /api/auth/microsoft/url` → abre URL OAuth.
2. Usuario inicia sesión en Microsoft.
3. Redirect a `MICROSOFT_REDIRECT_URI` (típicamente el API `:3006/callback-microsoft`).
4. El API redirige al SPA: `FRONTEND_URL/callback-microsoft?code=...`
5. Frontend: `POST /api/auth/microsoft/token` con `{ code, redirect_uri }`.
6. Respuesta: `accessToken` JWT.

**Reglas de rol:**

- Si el correo existe en `usuarios` con rol **Administrador** y `confirmado = true` → sesión Administrador.
- Si no está en BD o es Entrenador → sesión **Entrenador**.
- **Proveedor** y **Desarrollador** deben usar login con contraseña (`POST /api/auth/login`).

**Variables:** ver [ENVIRONMENT.md](ENVIRONMENT.md) sección Microsoft.

---

## Ruta Segura (transporte escolar)

Cuando un participante tiene ruta asignada y se registra **Faltó** o **Excusa**, el sistema notifica a la API de Ruta Segura. Si pasa a **Asistió** tras una novedad previa, se elimina la novedad.

**Variables:**

- `RUTA_SEGURA` — URL base
- `INTEGRATIONIDMED` / `INTEGRATIONIDRET` — IDs por sede
- `BEARERMED` / `BEARERRET` — tokens Bearer

**Código:** `src/utils/rutaSegura.js`, usado desde `AsistenciaController`.

---

## SMTP — Correos transaccionales

| Evento | Plantilla |
|--------|-----------|
| Registro proveedor | Verificación de cuenta |
| Olvidé contraseña | Enlace de restablecimiento |
| Envío de informe | PDF adjunto (cola asíncrona) |

**Cola de informes:** al arrancar el servidor se inicia `informeEmailQueue.js`, que procesa filas en `informe_email_jobs`.

**Ventana de envío:** controlada por `INFORME_ENVIO_*` (fechas en zona Colombia). El frontend consulta `GET /api/evaluaciones/ventana-envio`.

---

## API Integración Club

Endpoint para sistemas externos del club:

```http
GET /api/integracion-club/:sedeNombre
Authorization: Bearer <BEARERINS>
```

**Sedes:** `RETIRO`, `MEDELLÍN`, o códigos `1` / `2`.

Devuelve extraclases del mes actual (año/mes en `America/Bogota`).

**Código:** `IntegracionClubController.js` (consulta SQL directa).

---

## Archivos estáticos (`/uploads`)

Fotos de evaluaciones e informes PDF se sirven en `/uploads/*`.

En producción configure `UPLOADS_DIR` fuera del directorio de despliegue para que los archivos persistan entre releases.
