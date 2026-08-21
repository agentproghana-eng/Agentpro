'use strict';

const os = require('os');

const {
  claimOutboxBatch,
  markOutboxProcessed,
  markOutboxFailed,
  normalizeOutboxErrorCode,
} = require('./outboxService');

const {
  logger,
} = require('../utils/logger');

function buildWorkerId() {
  return `${os.hostname()}:${process.pid}`
    .slice(0, 100);
}

function retryDelaySeconds(attemptNumber) {
  const exponent = Math.max(
    0,
    Math.min(
      Number(attemptNumber) - 1,
      10
    )
  );

  return Math.min(
    3600,
    5 * (2 ** exponent)
  );
}

async function runOutboxBatch({
  dispatchEvent,
  workerId = buildWorkerId(),
  batchSize = 20,
  staleAfterSeconds = 300,
} = {}) {
  if (typeof dispatchEvent !== 'function') {
    const error = new Error(
      'dispatchEvent function is required'
    );

    error.code =
      'OUTBOX_DISPATCHER_REQUIRED';

    throw error;
  }

  const events =
    await claimOutboxBatch({
      workerId,
      batchSize,
      staleAfterSeconds,
    });

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await dispatchEvent(event);

      await markOutboxProcessed({
        eventId: event.id,
        workerId,
      });

      processed += 1;
    } catch (error) {
      const attemptNumber =
        Number(event.attempts || 0) + 1;

      const errorCode =
        normalizeOutboxErrorCode(error);

      await markOutboxFailed({
        eventId: event.id,
        workerId,
        retryDelaySeconds:
          retryDelaySeconds(
            attemptNumber
          ),
        errorCode,
      });

      failed += 1;

      logger.error(
        'Outbox delivery failed',
        {
          eventId: event.id,
          eventType: event.event_type,
          attempt: attemptNumber,
          errorCode,
        }
      );
    }
  }

  return {
    claimed: events.length,
    processed,
    failed,
  };
}

function startOutboxWorker({
  dispatchEvent,
  workerId = buildWorkerId(),
  batchSize = 20,
  staleAfterSeconds = 300,
  intervalMs = 5000,
} = {}) {
  if (typeof dispatchEvent !== 'function') {
    const error = new Error(
      'dispatchEvent function is required'
    );

    error.code =
      'OUTBOX_DISPATCHER_REQUIRED';

    throw error;
  }

  const interval =
    Math.max(
      1000,
      Number(intervalMs) || 5000
    );

  let stopped = false;
  let currentRun = null;

  const tick = () => {
    if (stopped || currentRun) {
      return currentRun;
    }

    currentRun = runOutboxBatch({
      dispatchEvent,
      workerId,
      batchSize,
      staleAfterSeconds,
    })
      .catch((error) => {
        logger.error(
          'Outbox worker batch failed',
          {
            errorCode:
              normalizeOutboxErrorCode(
                error
              ),
          }
        );
      })
      .finally(() => {
        currentRun = null;
      });

    return currentRun;
  };

  void tick();

  const timer =
    setInterval(
      () => {
        void tick();
      },
      interval
    );

  if (
    typeof timer.unref === 'function'
  ) {
    timer.unref();
  }

  return async () => {
    if (!stopped) {
      stopped = true;
      clearInterval(timer);
    }

    if (currentRun) {
      await currentRun;
    }
  };
}

module.exports = {
  buildWorkerId,
  retryDelaySeconds,
  runOutboxBatch,
  startOutboxWorker,
};
