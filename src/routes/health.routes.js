/** Mantener sincronizado con docs/openapi.yaml */
import express from 'express';
import { sequelize } from '../database/sequelize.js';
import { getDbPoolStats } from '../utils/dbPoolMonitor.js';
import { agentDebugLog } from '../utils/agentDebugLog.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Backend funcionando correctamente',
    timestamp: new Date().toISOString(),
  });
});

router.get('/health/db', async (req, res) => {
  const pool = getDbPoolStats();
  let dbOk = false;
  let dbError = null;

  try {
    await sequelize.authenticate();
    dbOk = true;
  } catch (error) {
    dbError = {
      name: error?.name || null,
      code: error?.parent?.code || error?.original?.code || error?.code || null,
      message: String(error?.message || '').slice(0, 200),
    };
    // #region agent log
    agentDebugLog({
      location: 'health.routes.js:/health/db',
      message: 'DB health check failed',
      hypothesisId: 'A',
      data: { pool, dbError },
    });
    // #endregion
  }

  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    db: dbOk ? 'connected' : 'unavailable',
    pool,
    error: dbError,
    timestamp: new Date().toISOString(),
  });
});

export default router;
