import '../src/config/env.js';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../src/database/sequelize.js';

const cols = await sequelize.query(`SHOW COLUMNS FROM entrenadores LIKE 'acceso_asistencia'`, {
  type: QueryTypes.SELECT,
});

if (cols.length) {
  console.log('COLUMN_EXISTS');
} else {
  await sequelize.query(`
    ALTER TABLE entrenadores
      ADD COLUMN acceso_asistencia VARCHAR(32) NOT NULL DEFAULT 'asistencia_historial'
      COMMENT 'historial | asistencia_historial'
  `);
  console.log('COLUMN_ADDED');
}

await sequelize.close();
