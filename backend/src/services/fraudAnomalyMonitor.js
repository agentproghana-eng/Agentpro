'use strict';

const {
  pool,
} = require('../config/database');

const {
  evaluateTransactionAnomalies,
} = require('./fraudAnomalyService');

const {
  persistFraudSignals,
} = require('./fraudSignalService');

const {
  logger,
} = require('../utils/logger');

const FRAUD_MONITOR_LOCK_KEY =
  214672152;

const DEFAULT_INTERVAL_MS =
  60 * 1000;

const LOOKBACK_MINUTES = 10;

const MAX_CANDIDATE_ACTORS = 100;

const MAX_EVENTS_PER_ACTOR = 200;

const RELEVANT_EVENT_NAMES =
  Object.freeze([
    'transaction.initiated',
    'transaction.completed',
    'transaction.failed',
    'transaction.pending_confirmation',
  ]);

function fraudMonitorEnabled(
  env = process.env
) {
  return String(
    env.FRAUD_ANOMALY_MONITOR_ENABLED ||
      ''
  ).toLowerCase() === 'true';
}

async function tryAcquireFraudLeadership({
  dbPool = pool,
  lockKey =
    FRAUD_MONITOR_LOCK_KEY,
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

async function releaseFraudLeadership({
  client,
  lockKey =
    FRAUD_MONITOR_LOCK_KEY,
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

async function selectCandidateActors({
  dbClient,
  evaluatedAt,
  limit =
    MAX_CANDIDATE_ACTORS,
} = {}) {
  const boundedLimit =
    Math.max(
      1,
      Math.min(
        MAX_CANDIDATE_ACTORS,
        Number(limit) ||
          MAX_CANDIDATE_ACTORS
      )
    );

  const result =
    await dbClient.query(
      `SELECT
         actor_user_id,
         MAX(occurred_at)
           AS latest_activity
       FROM operational_events
       WHERE occurred_at >=
             $1::timestamptz -
             INTERVAL '10 minutes'
         AND occurred_at <=
             $1::timestamptz
         AND actor_user_id IS NOT NULL
         AND subject_type IN (
           'transaction',
           'personal_transaction'
         )
         AND event_name = ANY($2::text[])
       GROUP BY actor_user_id
       HAVING
         COUNT(*) FILTER (
           WHERE event_name =
             'transaction.initiated'
             AND occurred_at >=
               $1::timestamptz -
               INTERVAL '5 minutes'
         ) >= 30
         OR
         COUNT(*) FILTER (
           WHERE event_name =
             'transaction.failed'
         ) >= 10
         OR
         COUNT(*) FILTER (
           WHERE event_name =
             'transaction.pending_confirmation'
         ) >= 6
         OR
         (
           COUNT(*) FILTER (
             WHERE event_name IN (
               'transaction.completed',
               'transaction.failed'
             )
           ) >= 12
           AND
           (
             COUNT(*) FILTER (
               WHERE event_name =
                 'transaction.failed'
             )
           )::numeric
           /
           NULLIF(
             COUNT(*) FILTER (
               WHERE event_name IN (
                 'transaction.completed',
                 'transaction.failed'
               )
             ),
             0
           ) >= 0.5
         )
       ORDER BY latest_activity DESC,
                actor_user_id
       LIMIT $3`,
      [
        evaluatedAt,
        RELEVANT_EVENT_NAMES,
        boundedLimit + 1,
      ]
    );

  return {
    actor_user_ids:
      result.rows
        .slice(
          0,
          boundedLimit
        )
        .map(
          row =>
            row.actor_user_id
        ),

    saturated:
      result.rows.length >
        boundedLimit,
  };
}

async function loadCandidateEvents({
  dbClient,
  actorUserIds,
  evaluatedAt,
  maxEventsPerActor =
    MAX_EVENTS_PER_ACTOR,
} = {}) {
  if (
    !Array.isArray(
      actorUserIds
    ) ||
    actorUserIds.length === 0
  ) {
    return [];
  }

  const boundedEvents =
    Math.max(
      1,
      Math.min(
        MAX_EVENTS_PER_ACTOR,
        Number(maxEventsPerActor) ||
          MAX_EVENTS_PER_ACTOR
      )
    );

  const result =
    await dbClient.query(
      `WITH ranked AS (
         SELECT
           id,
           event_name,
           actor_user_id,
           company_id,
           subject_type,
           subject_id,
           correlation_id,
           attributes,
           occurred_at,
           ROW_NUMBER() OVER (
             PARTITION BY actor_user_id
             ORDER BY occurred_at DESC,
                      recorded_at DESC,
                      id DESC
           ) AS actor_rank
         FROM operational_events
         WHERE actor_user_id =
               ANY($1::uuid[])
           AND occurred_at >=
               $2::timestamptz -
               INTERVAL '10 minutes'
           AND occurred_at <=
               $2::timestamptz
           AND subject_type IN (
             'transaction',
             'personal_transaction'
           )
           AND event_name =
               ANY($3::text[])
       )
       SELECT
         id,
         event_name,
         actor_user_id,
         company_id,
         subject_type,
         subject_id,
         correlation_id,
         attributes,
         occurred_at
       FROM ranked
       WHERE actor_rank <= $4
       ORDER BY occurred_at ASC,
                id ASC`,
      [
        actorUserIds,
        evaluatedAt,
        RELEVANT_EVENT_NAMES,
        boundedEvents,
      ]
    );

  return result.rows;
}

async function runFraudAnomalyEvaluation({
  dbClient,
  now = new Date(),
  evaluateFn =
    evaluateTransactionAnomalies,
  persistFn =
    persistFraudSignals,
} = {}) {
  if (
    !dbClient ||
    typeof dbClient.query !==
      'function'
  ) {
    const error =
      new Error(
        'Fraud anomaly monitor requires a database client'
      );

    error.code =
      'FRAUD_MONITOR_DATABASE_CLIENT_REQUIRED';

    throw error;
  }

  const evaluatedAt =
    now instanceof Date
      ? now
      : new Date(now);

  if (
    Number.isNaN(
      evaluatedAt.getTime()
    )
  ) {
    const error =
      new Error(
        'Fraud anomaly monitor evaluation time is invalid'
      );

    error.code =
      'FRAUD_MONITOR_TIME_INVALID';

    throw error;
  }

  await dbClient.query('BEGIN');

  try {
    const candidates =
      await selectCandidateActors({
        dbClient,
        evaluatedAt:
          evaluatedAt.toISOString(),
      });

    const events =
      await loadCandidateEvents({
        dbClient,
        actorUserIds:
          candidates.actor_user_ids,
        evaluatedAt:
          evaluatedAt.toISOString(),
      });

    const evaluation =
      evaluateFn({
        events,
        now: evaluatedAt,
      });

    if (
      evaluation
        .enforcement_action !==
      'none'
    ) {
      const error =
        new Error(
          'Fraud anomaly monitor refuses enforcing evaluation'
        );

      error.code =
        'FRAUD_MONITOR_ENFORCEMENT_REJECTED';

      throw error;
    }

    const persistence =
      await persistFn({
        dbClient,
        evaluation,
      });

    await dbClient.query('COMMIT');

    return {
      evaluated_at:
        evaluation.evaluated_at,

      candidate_actor_count:
        candidates
          .actor_user_ids
          .length,

      candidate_saturated:
        candidates.saturated,

      evaluated_event_count:
        evaluation
          .evaluated_event_count,

      signal_count:
        evaluation.signal_count,

      created_signal_count:
        persistence.created_count,

      existing_signal_count:
        persistence.existing_count,

      enforcement_action:
        'none',
    };
  } catch (error) {
    await dbClient.query(
      'ROLLBACK'
    );

    throw error;
  }
}

function connectionLost(
  client,
  error
) {
  return Boolean(
    client?.released ||
    [
      '57P01',
      '57P02',
      '57P03',
      '08000',
      '08003',
      '08006',
      '08001',
    ].includes(
      error?.code
    )
  );
}

function startFraudAnomalyMonitor({
  dbPool = pool,
  intervalMs =
    DEFAULT_INTERVAL_MS,
  env = process.env,
  runFn =
    runFraudAnomalyEvaluation,
} = {}) {
  if (
    !fraudMonitorEnabled(env)
  ) {
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
    if (
      stopped ||
      currentRun
    ) {
      return currentRun;
    }

    currentRun =
      Promise.resolve()
        .then(async () => {
          if (!leaderClient) {
            leaderClient =
              await tryAcquireFraudLeadership({
                dbPool,
              });

            if (!leaderClient) {
              return {
                leader: false,
                evaluated: false,
              };
            }

            logger.info(
              'Fraud anomaly monitor leadership acquired'
            );
          }

          const result =
            await runFn({
              dbClient:
                leaderClient,
            });

          if (
            result
              .candidate_saturated
          ) {
            logger.warn(
              'Fraud anomaly candidate limit reached',
              {
                candidateActorCount:
                  result
                    .candidate_actor_count,
              }
            );
          }

          return {
            leader: true,
            evaluated: true,
            result,
          };
        })
        .catch((error) => {
          logger.error(
            'Fraud anomaly monitor run failed',
            {
              errorCode:
                error?.code,
            }
          );

          if (
            leaderClient &&
            connectionLost(
              leaderClient,
              error
            )
          ) {
            try {
              if (
                !leaderClient
                  .released
              ) {
                leaderClient.release(
                  true
                );
              }
            } catch (_) {
              // Cleanup must not
              // prevent future retries.
            }

            leaderClient = null;
          }

          return {
            leader:
              Boolean(
                leaderClient
              ),
            evaluated: false,
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

      await releaseFraudLeadership({
        client,
      });

      logger.info(
        'Fraud anomaly monitor leadership released'
      );
    }
  };
}

module.exports = {
  FRAUD_MONITOR_LOCK_KEY,
  DEFAULT_INTERVAL_MS,
  LOOKBACK_MINUTES,
  MAX_CANDIDATE_ACTORS,
  MAX_EVENTS_PER_ACTOR,
  RELEVANT_EVENT_NAMES,
  fraudMonitorEnabled,
  tryAcquireFraudLeadership,
  releaseFraudLeadership,
  selectCandidateActors,
  loadCandidateEvents,
  runFraudAnomalyEvaluation,
  startFraudAnomalyMonitor,
};
