require('dotenv').config();

const base = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'club_asistencia',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  dialect: process.env.DB_DIALECT || 'mysql',
};

module.exports = {
  development: {
    ...base,
  },
  test: {
    ...base,
    database: `${base.database}_test`,
  },
  production: {
    ...base,
  },
};
