import fs from 'fs';

const DEBUG_LOG_PATH =
  '/Users/mateomunozmontoya/Desktop/Proyectos/PROYECTOS/ASISTENCIA CLUB REACT/.cursor/debug-24f7f4.log';
const DEBUG_ENDPOINT = 'http://127.0.0.1:7764/ingest/f61519ad-8b3a-4c80-a98c-874442387ef2';
const SESSION_ID = '24f7f4';

/** Debug session logging (NDJSON). No secrets/PII. */
export const agentDebugLog = ({ location, message, data = {}, hypothesisId, runId = 'pre-fix' }) => {
  const payload = {
    sessionId: SESSION_ID,
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };

  // #region agent log
  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION_ID },
    body: JSON.stringify(payload),
  }).catch(() => {});

  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch {
    // ignore when log path unavailable (e.g. remote server)
  }
  // #endregion
};
