'use strict';

/**
 * Scheduled Jobs for Agent Pro Ghana
 *
 * Run with: node src/jobs/scheduler.js
 * Or import into server.js to start automatically
 *
 * Jobs:
 * - Every day at 08:00 GMT: subscription renewal reminders
 * - Every day at 00:00 GMT: expire overdue subscriptions and ads
 * - Every hour: check low float alerts
 */

const {
  query,
  withTransaction,
} = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { sendSubscriptionReminder, sendSubscriptionSuspended, sendAdNotification } = require('../services/notificationService');
const { sendSubscriptionReminderEmail } = require('../services/emailService');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function millisecondsUntilNextUtcTime(
  now,
  hour,
  minute = 0
) {
  const target = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour,
    minute,
    0,
    0
  );

  if (target >= now.getTime()) {
    return target - now.getTime();
  }

  return target + DAY_MS - now.getTime();
}

function millisecondsUntilNextUtcHour(now) {
  const target = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    0,
    0,
    0
  );

  if (target >= now.getTime()) {
    return target - now.getTime();
  }

  return target + HOUR_MS - now.getTime();
}

// Wall-clock UTC scheduler. Each job calculates its next UTC boundary
// after completion so deployments and execution time do not shift the
// intended production schedule.
function startScheduler() {
  logger.info('⏰ Starting background job scheduler');

  let stopped = false;
  const inFlight = new Map();
  const timers = new Map();

  const runTracked = (name, job) => {
    if (stopped) {
      return Promise.resolve();
    }

    const existing = inFlight.get(name);
    if (existing) {
      return existing;
    }

    const promise = Promise.resolve()
      .then(job)
      .catch((error) => {
        logger.error(
          'Scheduled job execution failed',
          {
            job: name,
            errorCode: error?.code,
          }
        );
      });

    inFlight.set(name, promise);

    void promise.finally(() => {
      inFlight.delete(name);
    });

    return promise;
  };

  const scheduleUtcJob = (
    name,
    delayFor,
    job
  ) => {
    if (stopped) {
      return;
    }

    const delay = delayFor(new Date());

    const timer = setTimeout(() => {
      timers.delete(name);

      if (stopped) {
        return;
      }

      void runTracked(name, job)
        .finally(() => {
          scheduleUtcJob(
            name,
            delayFor,
            job
          );
        });
    }, delay);

    timers.set(name, timer);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  };

  scheduleUtcJob(
    'reminders',
    (now) =>
      millisecondsUntilNextUtcTime(
        now,
        8,
        0
      ),
    sendSubscriptionReminders
  );

  scheduleUtcJob(
    'expiry',
    (now) =>
      millisecondsUntilNextUtcTime(
        now,
        0,
        0
      ),
    runExpiryJobs
  );

  scheduleUtcJob(
    'hourly',
    millisecondsUntilNextUtcHour,
    runHourlyJobs
  );

  logger.info(
    '✅ Scheduler started with UTC wall-clock timing'
  );

  return async () => {
    if (!stopped) {
      stopped = true;

      for (const timer of timers.values()) {
        clearTimeout(timer);
      }

      timers.clear();
    }

    await Promise.allSettled(
      [...inFlight.values()]
    );

    logger.info('Scheduler stopped');
  };
}

// ── Daily Jobs ────────────────────────────────────────────────

// Compatibility/manual aggregate. Production scheduling invokes
// reminders and expiry jobs at their separate UTC wall-clock times.
async function runDailyJobs() {
  logger.info('Running daily jobs...');
  await Promise.allSettled([
    sendSubscriptionReminders(),
    suspendExpiredSubscriptions(),
    expireOldAds(),
    expirePersonalSubscriptions(),
  ]);
  logger.info('Daily jobs complete');
}

async function runExpiryJobs() {
  logger.info('Running midnight expiry jobs...');
  await Promise.allSettled([
    suspendExpiredSubscriptions(),
    expireOldAds(),
    expirePersonalSubscriptions(),
  ]);
  logger.info('Midnight expiry jobs complete');
}

// ── Hourly Jobs ───────────────────────────────────────────────

async function runHourlyJobs() {
  await Promise.allSettled([
    checkLowFloatAlerts(),
  ]);
}

// ── Expire Personal Subscriptions ────────────────────────────
// Auto-reverts a Personal subscriber back to the free plan once their
// paid period ends - per spec, this must happen automatically, with no
// grace period concept the way Business subscriptions have.

async function expirePersonalSubscriptions() {
  try {
    const expiredSubscriptions =
      await withTransaction(async (client) => {
        const result = await client.query(
          `UPDATE personal_subscriptions
           SET plan = 'free',
               expires_at = NULL,
               updated_at = NOW()
           WHERE plan = 'paid'
             AND expires_at < NOW()
           RETURNING id, user_id`
        );

        for (const subscription of result.rows) {
          await auditLog({
            userId: null,
            companyId: null,
            action: 'PERSONAL_SUBSCRIPTION_EXPIRED',
            entityType: 'personal_subscription',
            entityId: subscription.id,
            newValues: {
              user_id: subscription.user_id,
              plan: 'free',
              expires_at: null,
            },
            dbClient: client,
            strict: true,
          });
        }

        return result.rows;
      });

    if (expiredSubscriptions.length > 0) {
      logger.info(
        `Reverted ${expiredSubscriptions.length} ` +
        'expired Personal subscription(s) to free'
      );
    }
  } catch (error) {
    logger.error(
      'Personal subscription expiry job error:',
      error
    );
  }
}

// ── Subscription Renewal Reminders ───────────────────────────

async function sendSubscriptionReminders() {
  try {
    const result = await query(
      `SELECT s.company_id, s.expires_at,
              EXTRACT(DAY FROM s.expires_at - NOW())::int as days_left
       FROM subscriptions s
       WHERE s.status = 'active'
         AND s.expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'`
    );

    let sent = 0;
    for (const sub of result.rows) {
      const daysLeft = sub.days_left;
      if ([7, 3, 1].includes(daysLeft)) {
        await sendSubscriptionReminder(sub.company_id, daysLeft);

        const owner = await query(
          "SELECT email, first_name FROM users WHERE company_id = $1 AND role = 'business_owner' LIMIT 1",
          [sub.company_id]
        );
        if (owner.rows.length > 0) {
          await sendSubscriptionReminderEmail(
            owner.rows[0].email,
            owner.rows[0].first_name,
            daysLeft,
            sub.expires_at
          );
        }
        sent++;
      }
    }
    if (sent > 0) logger.info(`Renewal reminders: ${sent} sent`);
  } catch (error) {
    logger.error('Renewal reminder job error:', error);
  }
}

// ── Suspend Expired Subscriptions ────────────────────────────

async function suspendExpiredSubscriptions() {
  try {
    const suspendedSubscriptions =
      await withTransaction(async (client) => {
        const result = await client.query(
          `UPDATE subscriptions
           SET status = 'suspended',
               updated_at = NOW()
           WHERE status IN ('active', 'grace_period')
             AND grace_period_ends_at < NOW()
           RETURNING id, company_id`
        );

        for (const subscription of result.rows) {
          await client.query(
            `UPDATE users
             SET status = 'suspended'
             WHERE company_id = $1
               AND role IN (
                 'manager',
                 'agent',
                 'auditor'
               )`,
            [subscription.company_id]
          );

          await auditLog({
            userId: null,
            companyId: subscription.company_id,
            action: 'SUBSCRIPTION_SUSPENDED_EXPIRED',
            entityType: 'subscription',
            entityId: subscription.id,
            newValues: {
              status: 'suspended',
              company_id:
                subscription.company_id,
            },
            dbClient: client,
            strict: true,
          });
        }

        return result.rows;
      });

    for (const subscription of suspendedSubscriptions) {
      try {
        await sendSubscriptionSuspended(
          subscription.company_id
        );
      } catch (notificationError) {
        logger.error(
          'Subscription suspension notification error:',
          notificationError
        );
      }
    }

    if (suspendedSubscriptions.length > 0) {
      logger.info(
        `Suspended ${suspendedSubscriptions.length} ` +
        'expired subscription(s)'
      );
    }
  } catch (error) {
    logger.error(
      'Subscription suspension job error:',
      error
    );
  }
}

// ── Expire Old Ads ────────────────────────────────────────────

async function expireOldAds() {
  try {
    // Move to grace period
    const gracePeriod = await query(
      `UPDATE advertisements
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'active' AND expires_at < NOW() AND grace_period_ends_at > NOW()
       RETURNING id, posted_by, title`
    );

    for (const ad of gracePeriod.rows) {
      await sendAdNotification(ad.posted_by, { type: 'ad_expired', adTitle: ad.title });
    }

    // Hard remove after grace period
    await query(
      `UPDATE advertisements
       SET status = 'expired', updated_at = NOW()
       WHERE status IN ('active', 'expired')
         AND grace_period_ends_at < NOW()`
    );

    // Send 7-day expiry warnings
    const expiringSoon = await query(
      `SELECT id, posted_by, title FROM advertisements
       WHERE status = 'active'
         AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'`
    );
    for (const ad of expiringSoon.rows) {
      await sendAdNotification(ad.posted_by, { type: 'ad_expiring', adTitle: ad.title });
    }

    if (gracePeriod.rows.length > 0) {
      logger.info(`Expired ${gracePeriod.rows.length} advertisement(s)`);
    }
  } catch (error) {
    logger.error('Ad expiry job error:', error);
  }
}

// ── Low Float Alerts ──────────────────────────────────────────

async function checkLowFloatAlerts() {
  try {
    const result = await query(
      `SELECT fa.id, fa.branch_id, fa.provider, fa.current_balance, fa.low_balance_threshold
       FROM float_accounts fa
       INNER JOIN branches b ON fa.branch_id = b.id
       WHERE fa.current_balance <= fa.low_balance_threshold
         AND b.status = 'active'`
    );

    for (const acc of result.rows) {
      const { sendLowFloatAlert } = require('../services/notificationService');
      await sendLowFloatAlert(acc.branch_id, acc.provider, acc.current_balance);
    }
  } catch (error) {
    logger.error('Low float check error:', error);
  }
}

module.exports = {
  startScheduler,
  runDailyJobs,
  runExpiryJobs,
  runHourlyJobs,
  millisecondsUntilNextUtcTime,
  millisecondsUntilNextUtcHour,
};
