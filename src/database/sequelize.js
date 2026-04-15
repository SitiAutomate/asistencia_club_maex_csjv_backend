import { Sequelize } from 'sequelize';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: env.db.dialect,
  logging: env.nodeEnv === 'development' ? (sql) => logger.info(sql) : false,
  pool: {
    max: 10,
    min: 0,
    acquire: env.db.connectTimeoutMs,
    idle: 10000,
  },
  dialectOptions: {
    connectTimeout: env.db.connectTimeoutMs,
  },
  timezone: '-05:00',
});

export const connectDB = async () => {
  try {
    const authPromise = sequelize.authenticate();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Timeout conectando a DB (${env.db.connectTimeoutMs}ms). Revisa DB_HOST/DB_PORT/DB_USER/DB_PASSWORD.`,
          ),
        );
      }, env.db.connectTimeoutMs);
    });

    await Promise.race([authPromise, timeoutPromise]);
    logger.success('Conexion con base de datos establecida correctamente');
  } catch (error) {
    logger.error(`No se pudo conectar a la base de datos: ${error.message}`);
    throw error;
  }
};
