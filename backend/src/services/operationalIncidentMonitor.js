'use strict';

const {
  pool,
} = require('../config/database');

const {
  performanceSnapshot,
} = require(
  './performanceTelemetryService'
);

const {
  reconcileOperationalIncidents,
} = require(
  './operationalIncidentService'
);

const {
  logger,
} = require('../utils/logger');

const INCIDENT_MONITOR_LOCK_KEY =
  214672151;

const DEFAULT_INTERVAL_MS =
  60 * 1000;

function telemetryEnabled(
  env = process.env
) {
  return String(
    env.PERFORMANCE_TELEMETRY_ENABLED ||
      ''
  ).toLowerCase() === 'true';
}

async function tryAcquireLeadership({
  dbPool = pool,
  lockKey =
    INCIDENT_MONITOR_LOCK_KEY,
} = {}) {
  const client =
    await dbPool.connect();

  try {
    const result =
      await client.query(
        `SELECT
           pg_try_advisory_lock($1)
             AS acquired`,
        [lockKey]
      );

    const acquired =
      result.rows[0]?.acquired === true;

    if (!acquired) {
      client.release();

      return null;
    }

    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}

async function releaseLeadership({
  client,
  lockKey =
    INCIDENT_MONITOR_LOCK_KEY,
} = {}) {
  if (!client) {
    return;
  }

  try {
    await client.query(
      `SELECT
         pg_advisory_unlock($1)
           AS released`,
      [lockKey]
    );
  } finally {
    client.release();
  }
}

async function runIncidentReconciliation({
  snapshotFn =
    performanceSnapshot,
  reconcileFn =
    reconcileOperationalIncidents,
} = {}) {
  const snapshot =
    await snapshotFn();

  return reconcileFn(
    snapshot.operational_alerts,
    {
      observedAt:
        snapshot.timestamp,
    }
  );
}

function startOperationalIncidentMonitor({
  dbPool = pool,
  intervalMs =
    DEFAULT_INTERVAL_MS,
  snapshotFn =
    performanceSnapshot,
  reconcileFn =
    reconcileOperationalIncidents,
  env = process.env,
} = {}) {
  if (!telemetryEnabled(env)) {
    return async () => {};
  }

  const interval =
    Math.max(
      10 * 1000,
      Number(intervalMs) ||
        DEFAULT_INTERVAL_MS
    );

  let stopped = false;
  let currentRun = null;
  let leaderClient = null;

  const tick = () => {
    if (stopped || currentRun) {
      return currentRun;
    }

    currentRun =
      Promise.resolve()
        .then(async () => {
          if (!leaderClient) {
            leaderClient =
              await tryAcquireLeadership({
                dbPool,
              });

            if (!leaderClient) {
              return {
                leader: false,
                reconciled: false,
              };
            }

            logger.info(
              'Operational incident monitor leadership acquired'
            );
          }

          await runIncidentReconciliation({
            snapshotFn,
            reconcileFn,
          });

          return {
            leader: true,
            reconciled: true,
          };
        })
        .catch(async (error) => {
          logger.error(
            'Operational incident monitor run failed',
            {
              errorCode:
                error?.code,
            }
          );

          if (
            leaderClient &&
            (
              leaderClient.released ||
              error?.code ===
                '57P01' ||
              error?.code ===
                '57P02' ||
              error?.code ===
                '57P03' ||
              error?.code ===
                '08000' ||
              error?.code ===
                '08003' ||
              error?.code ===
                '08006' ||
              error?.code ===
                '08001'
            )
          ) {
            try {
              if (
                !leaderClient.released
              ) {
                leaderClient.release(
                  true
                );
              }
            } catch (_) {
              // Pool/client cleanup must
              // not stop future retries.
            }

            leaderClient = null;
          }

          return {
            leader:
              Boolean(
                leaderClient
              ),
            reconciled: false,
          };
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
    typeof timer.unref ===
      'function'
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

    if (leaderClient) {
      const client =
        leaderClient;

      leaderClient = null;

      await releaseLeadership({
        client,
      });

      logger.info(
        'Operational incident monitor leadership released'
      );
    }
  };
}

module.exports = {
  INCIDENT_MONITOR_LOCK_KEY,
  DEFAULT_INTERVAL_MS,
  telemetryEnabled,
  tryAcquireLeadership,
  releaseLeadership,
  runIncidentReconciliation,
  startOperationalIncidentMonitor,
};
