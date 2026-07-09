import { Sequelize } from 'sequelize';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { agentDebugLog } from '../utils/agentDebugLog.js';
import { getDbPoolStats } from '../utils/dbPoolMonitor.js';

export const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: env.db.dialect,
  logging: env.nodeEnv === 'development' ? (sql) => logger.info(sql) : false,
  pool: {
    max: env.db.poolMax,
    min: env.db.poolMin,
    acquire: env.db.connectTimeoutMs,
    idle: env.db.poolIdleMs,
    evict: Math.max(30_000, Math.floor(env.db.poolIdleMs / 2)),
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
    // #region agent log
    agentDebugLog({
      location: 'sequelize.js:connectDB',
      message: 'DB authenticate success',
      hypothesisId: 'A',
      data: getDbPoolStats(),
    });
    // #endregion
    logger.success('Conexion con base de datos establecida correctamente');
  } catch (error) {
    // #region agent log
    agentDebugLog({
      location: 'sequelize.js:connectDB',
      message: 'DB authenticate failed',
      hypothesisId: 'A',
      data: {
        errorName: error?.name || null,
        errorCode: error?.parent?.code || error?.original?.code || error?.code || null,
        errorMessage: String(error?.message || '').slice(0, 200),
        pool: getDbPoolStats(),
      },
    });
    // #endregion
    logger.error(`No se pudo conectar a la base de datos: ${error.message}`);
    throw error;
  }
};
