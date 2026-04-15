# Guia Sequelize: CRUD y consultas a BD

## 1) Preparar entorno

1. Copia `.env.example` a `.env`
2. Ajusta tus credenciales reales de base de datos
3. Verifica la conexion iniciando el backend con `npm run dev`

## 2) Consultar, insertar, actualizar y eliminar con Sequelize (ORM)

Usa un modelo (por ejemplo `ExampleModel`) dentro de un servicio/controlador:

```js
import { ExampleModel } from '../database/models/ExampleModel.js';

// INSERT
const created = await ExampleModel.create({ name: 'Carlos', isActive: true });

// SELECT ALL
const rows = await ExampleModel.findAll();

// SELECT ONE
const one = await ExampleModel.findByPk(1);

// UPDATE
await ExampleModel.update({ isActive: false }, { where: { id: 1 } });

// DELETE
await ExampleModel.destroy({ where: { id: 1 } });
```

## 3) Consultas SQL directas (raw queries)

Si necesitas ejecutar SQL manual:

```js
import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';

// SELECT
const players = await sequelize.query('SELECT id, name FROM players WHERE is_active = :status', {
  replacements: { status: 1 },
  type: QueryTypes.SELECT,
});

// INSERT / UPDATE / DELETE
await sequelize.query('INSERT INTO players (name, is_active) VALUES (:name, :active)', {
  replacements: { name: 'Ana', active: 1 },
});
```

## 4) Comandos CLI utiles (migraciones/seeders)

```bash
npm run sequelize:migration:create -- --name create-players-table
npm run sequelize:model:create -- --name Player --attributes name:string,isActive:boolean
npm run sequelize:migrate
npm run sequelize:migrate:undo
npm run sequelize:seed
npm run sequelize:seed:undo
```

## 5) Recomendaciones profesionales

- Mantener migraciones y seeders versionados en git
- Nunca editar migraciones ya aplicadas en produccion
- Crear una migracion nueva para cada cambio de estructura
- Preferir transacciones en operaciones criticas
