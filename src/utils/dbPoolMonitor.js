import { sequelize } from '../database/sequelize.js';
import { agentDebugLog } from './agentDebugLog.js';

export const getDbPoolStats = () => {
  const pool = sequelize?.connectionManager?.pool;
  if (!pool) {
    return { available: false };
  }
  return {
    available: true,
    size: pool.size ?? null,
    availableConnections: pool.available ?? null,
    using: pool.using ?? null,
    waiting: pool.waiting ?? null,
    max: pool.max ?? null,
    min: pool.min ?? null,
  };
};

export const logDbPoolStats = (location, message, hypothesisId, extra = {}) => {
  agentDebugLog({
    location,
    message,
    hypothesisId,
    data: { ...getDbPoolStats(), ...extra },
  });
};

let monitorHandle = null;

export const startDbPoolMonitor = (intervalMs = 15000) => {
  if (monitorHandle) return;
  logDbPoolStats('dbPoolMonitor.js:start', 'Pool monitor started', 'B');

  monitorHandle = setInterval(() => {
    const stats = getDbPoolStats();
    if ((stats.using ?? 0) >= 7 || (stats.waiting ?? 0) > 0) {
      logDbPoolStats('dbPoolMonitor.js:interval', 'Pool under pressure', 'B', {
        threshold: 'using>=7 or waiting>0',
      });
    }
  }, intervalMs);
};
