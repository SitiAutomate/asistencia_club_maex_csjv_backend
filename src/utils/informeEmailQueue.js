import { Op } from 'sequelize';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { sequelize } from '../database/sequelize.js';
import Evaluaciones from '../database/models/EvaluacionesModel.js';
import InformeEmailJob from '../database/models/InformeEmailJobModel.js';
import {
  isInformeFileReadable,
  resolveInformeAbsolutePath,
  sendEvaluacionInformeEmail,
} from './evaluacionEmail.js';
import { nowColombiaSqlDatetime } from './fechaColombia.js';
import {
  describeInformeEnvioWindowBlock,
  isInformeEnvioWorkerPermitido,
} from './informeEnvioWindow.js';

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 45_000;
const RETRY_MAX_DELAY_MS = 5 * 60_000;
const STALE_PROCESSING_MS = Math.max(
  60_000,
  Number(env.evaluacionEmail?.staleProcessingMs || 10 * 60_000),
);
const MAX_CONCURRENT_JOBS = Math.max(1, Number(env.evaluacionEmail?.queueConcurrency || 3));
const ACTIVE_POLL_MS = Math.max(500, Number(env.evaluacionEmail?.queuePollMs || 1200));
const IDLE_POLL_MS = Math.max(
  ACTIVE_POLL_MS,
  Number(env.evaluacionEmail?.queueIdlePollMs || 6000),
);
const WINDOW_RECHECK_MS = Math.max(60_000, IDLE_POLL_MS * 5);

let timeoutHandle = null;
let activeWorkers = 0;
let workerPausedLogged = false;

const isWorkerPermitido = () => isInformeEnvioWorkerPermitido(env.informeEnvio);

const clearScheduledLoop = () => {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
};

const scheduleLoop = (delayMs) => {
  clearScheduledLoop();
  timeoutHandle = setTimeout(runWorkerCycle, delayMs);
};

const computeBackoffMs = (attempts) => {
  const next = RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(next, RETRY_MAX_DELAY_MS);
};

const now = () => new Date();

const normalizePayload = (payload) => {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  if (typeof payload === 'object') return payload;
  return {};
};

export const ensureInformeEmailQueueTable = async () => {
  await InformeEmailJob.sync();
};

/** Jobs en `processing` tras un reinicio o caída quedan bloqueando nuevos envíos. */
export const releaseStaleInformeEmailJobs = async (evaluacionId = null) => {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const where = {
    status: 'processing',
    updated_at: { [Op.lt]: staleBefore },
  };
  if (evaluacionId != null && Number.isInteger(Number(evaluacionId))) {
    where.evaluacion_id = Number(evaluacionId);
  }

  const staleJobs = await InformeEmailJob.findAll({ where });
  for (const job of staleJobs) {
    await job.update({
      status: 'failed',
      error_message:
        'Envío interrumpido (tiempo de procesamiento excedido). Puedes intentar enviar de nuevo.',
      updated_at: now(),
    });
    logger.warn(
      `Job de informe ${job.id} (evaluación ${job.evaluacion_id}) liberado por timeout en processing`,
    );
  }
  return staleJobs.length;
};

const claimNextPendingJob = async () => {
  return sequelize.transaction(async (transaction) => {
    const job = await InformeEmailJob.findOne({
      where: {
        status: 'pending',
        next_run_at: { [Op.lte]: now() },
      },
      order: [
        ['next_run_at', 'ASC'],
        ['id', 'ASC'],
      ],
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
      transaction,
    });
    if (!job) return null;
    await job.update(
      {
        status: 'processing',
        updated_at: now(),
      },
      { transaction },
    );
    return job;
  });
};

export const enqueueInformeEmailJob = async ({
  evaluacionId,
  destinatarios,
  participante,
  nombreCategoria,
  linea,
  attachmentPath,
}) => {
  if (!Number.isInteger(Number(evaluacionId)) || Number(evaluacionId) < 1) {
    throw new Error('evaluacionId invalido para cola de correo');
  }

  await releaseStaleInformeEmailJobs(Number(evaluacionId));

  const existingOpenJob = await InformeEmailJob.findOne({
    where: {
      evaluacion_id: Number(evaluacionId),
      status: { [Op.in]: ['pending', 'processing'] },
    },
    order: [['id', 'DESC']],
  });

  if (existingOpenJob) {
    return { queued: false, job: existingOpenJob };
  }

  const job = await InformeEmailJob.create({
    evaluacion_id: Number(evaluacionId),
    payload: {
      to: destinatarios,
      participante,
      nombreCategoria,
      linea,
      attachmentPath,
    },
    status: 'pending',
    attempts: 0,
    next_run_at: now(),
    created_at: now(),
    updated_at: now(),
  });

  return { queued: true, job };
};

async function processOneJob() {
  let currentJob = null;
  let handled = false;

  try {
    if (!isWorkerPermitido()) {
      return { handled };
    }

    currentJob = await claimNextPendingJob();

    if (!currentJob) return { handled };
    handled = true;

    const payload = normalizePayload(currentJob.payload);
    let attachmentPath = String(payload.attachmentPath || '').trim();
    if (!attachmentPath) {
      const evaluacion = await Evaluaciones.findByPk(currentJob.evaluacion_id, {
        attributes: ['informe'],
      });
      const informePublicPath = String(evaluacion?.informe || '').trim();
      attachmentPath = resolveInformeAbsolutePath(informePublicPath);
    }
    if (!isInformeFileReadable(attachmentPath)) {
      throw new Error('No se pudo resolver el adjunto PDF para el envío');
    }

    await sendEvaluacionInformeEmail({
      to: payload.to || [],
      participante: payload.participante,
      nombreCategoria: payload.nombreCategoria,
      linea: payload.linea,
      attachmentPath,
    });

    const fecha = nowColombiaSqlDatetime();
    await Evaluaciones.update(
      {
        enviado: true,
        fechaEnvio: fecha,
        fecha_modificacion: now(),
      },
      { where: { id: currentJob.evaluacion_id } },
    );

    await currentJob.update({
      status: 'sent',
      error_message: null,
      updated_at: now(),
    });
  } catch (error) {
    logger.error(
      `Fallo en cola de correo de informes (job ${currentJob?.id ?? 'n/a'}): ${error?.message || 'error desconocido'}`,
    );
    if (!currentJob) return;

    const attempts = Number(currentJob.attempts || 0) + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await currentJob.update({
      status: exhausted ? 'failed' : 'pending',
      attempts,
      error_message: String(error?.message || 'Error enviando correo'),
      next_run_at: exhausted ? currentJob.next_run_at : new Date(Date.now() + computeBackoffMs(attempts)),
      updated_at: now(),
    });
  } finally {
    activeWorkers = Math.max(0, activeWorkers - 1);
  }
  return { handled };
}

const runWorkerCycle = async () => {
  timeoutHandle = null;
  try {
    if (!isWorkerPermitido()) {
      if (!workerPausedLogged) {
        logger.info(
          `Worker de informes pausado: ${describeInformeEnvioWindowBlock(env.informeEnvio)}`,
        );
        workerPausedLogged = true;
      }
      scheduleLoop(WINDOW_RECHECK_MS);
      return;
    }

    if (workerPausedLogged) {
      logger.info(
        `Worker de informes activo: ventana de envío abierta (concurrencia ${MAX_CONCURRENT_JOBS})`,
      );
    }
    workerPausedLogged = false;

    await releaseStaleInformeEmailJobs();
    const slots = MAX_CONCURRENT_JOBS - activeWorkers;
    if (slots <= 0) {
      scheduleLoop(ACTIVE_POLL_MS);
      return;
    }

    const runs = [];
    for (let i = 0; i < slots; i += 1) {
      activeWorkers += 1;
      const run = processOneJob().catch((error) => {
        activeWorkers = Math.max(0, activeWorkers - 1);
        logger.error(`Error en worker de cola de informes: ${error?.message || 'error desconocido'}`);
        return { handled: false };
      });
      runs.push(run);
    }

    const results = await Promise.all(runs);
    const hadWork = results.some((result) => result?.handled);
    const nextMs = hadWork ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    scheduleLoop(nextMs);
  } catch (error) {
    logger.error(
      `Error en ciclo de cola de informes (se reintentará): ${error?.message || 'error desconocido'}`,
    );
    scheduleLoop(IDLE_POLL_MS);
  }
};

export const startInformeEmailQueueWorker = async () => {
  if (timeoutHandle) return;
  await ensureInformeEmailQueueTable();

  if (!isWorkerPermitido()) {
    logger.info(
      `Worker de informes no iniciado: ${describeInformeEnvioWindowBlock(env.informeEnvio)}`,
    );
    workerPausedLogged = true;
    scheduleLoop(WINDOW_RECHECK_MS);
    return;
  }

  await releaseStaleInformeEmailJobs();
  logger.info(`Worker de informes iniciado con concurrencia ${MAX_CONCURRENT_JOBS}`);
  scheduleLoop(ACTIVE_POLL_MS);
};

