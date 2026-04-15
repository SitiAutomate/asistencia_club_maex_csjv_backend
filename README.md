# Backend - Asistencia Club Deportivo

Backend base profesional con `Express`, `Sequelize` y utilidades de desarrollo para acelerar el trabajo del proyecto.

## Stack

- Express 5
- Sequelize + Sequelize CLI
- MySQL2 (tambien listo para PostgreSQL por dependencias instaladas)
- Dotenv, Helmet, CORS, Morgan
- Colors para logs en terminal
- Nodemon, ESLint, Prettier

## Instalacion

```bash
npm install
cp .env.example .env
```

## Scripts principales

```bash
npm run dev         # modo desarrollo con nodemon
npm run start       # modo produccion
npm run lint        # revisar calidad
npm run lint:fix    # corregir algunos errores automaticamente
npm run format      # formatear codigo
```

## Estructura

```txt
server.js
src/
  app.js
  config/
    env.js
    logger.js
    sequelize-cli.cjs
  routes/
    health.routes.js
  middlewares/
    errorHandler.js
  database/
    sequelize.js
    models/
      ExampleModel.js
```

## Modelo de ejemplo

Existe un modelo de ejemplo en `src/database/models/ExampleModel.js` para que veas el patron de definicion en Sequelize. Puedes usar esa base para tus tablas reales.

## Guia Sequelize

Revisa `docs/sequelize-guide.md` para ver CRUD con Sequelize, raw queries SQL y comandos CLI.

## Frontend

Cuando quieras, te ayudo a montar el frontend con React + Bootstrap para conectarlo con este backend.
