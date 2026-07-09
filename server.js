import app from './src/app.js';
import { env } from './src/config/env.js';
import { logger } from './src/config/logger.js';
import { connectDB } from './src/database/sequelize.js';
import { startInformeEmailQueueWorker } from './src/utils/informeEmailQueue.js';
import { startDbPoolMonitor } from './src/utils/dbPoolMonitor.js';
import './src/database/models/index.js';

const startServer = async () => {
  try {
    if (!env.jwt.secret) {
      logger.error('JWT_SECRET es obligatorio. Definalo en el entorno antes de iniciar el servidor.');
      process.exit(1);
    }

    logger.info(
      `Iniciando backend en puerto ${env.port} (DB: ${env.db.dialect}://${env.db.host}:${env.db.port}/${env.db.name})`,
    );

    if (!env.startWithoutDb) {
      await connectDB();
      await startInformeEmailQueueWorker();
      startDbPoolMonitor();
    } else {
      logger.warn('START_WITHOUT_DB=true -> servidor inicia sin validar conexion a BD');
    }

    app.listen(env.port, () => {
      logger.success(`Servidor iniciado en http://localhost:${env.port}`);
      logger.info(`Entorno activo: ${env.nodeEnv}`);
    });
  } catch (error) {
    logger.error(`Error al iniciar el servidor: ${error.message}`);
    process.exit(1);
  }
};

startServer();
