/** Mantener sincronizado con docs/openapi.yaml */
import express from 'express';
import { sequelize } from '../database/sequelize.js';
import { env } from '../config/env.js';
import { getDbPoolStats } from '../utils/dbPoolMonitor.js';
import { agentDebugLog } from '../utils/agentDebugLog.js';

const router = express.Router();

let dbHealthCache = {
  ok: null,
  checkedAt: 0,
  error: null,
};

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Backend funcionando correctamente',
    timestamp: new Date().toISOString(),
  });
});

router.get('/health/db', async (req, res) => {
  const pool = getDbPoolStats();
  const now = Date.now();
  const cacheMs = env.db.healthCacheMs;

  if (dbHealthCache.ok !== null && now - dbHealthCache.checkedAt < cacheMs) {
    return res.status(dbHealthCache.ok ? 200 : 503).json({
      ok: dbHealthCache.ok,
      db: dbHealthCache.ok ? 'connected' : 'unavailable',
      pool,
      error: dbHealthCache.error,
      cached: true,
      timestamp: new Date().toISOString(),
    });
  }

  let dbOk = false;
  let dbError = null;

  try {
    await sequelize.query('SELECT 1');
    dbOk = true;
    dbHealthCache = { ok: true, checkedAt: now, error: null };
  } catch (error) {
    dbError = {
      name: error?.name || null,
      code: error?.parent?.code || error?.original?.code || error?.code || null,
      message: String(error?.message || '').slice(0, 200),
    };
    dbHealthCache = { ok: false, checkedAt: now, error: dbError };
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
    cached: false,
    timestamp: new Date().toISOString(),
  });
});

export default router;
