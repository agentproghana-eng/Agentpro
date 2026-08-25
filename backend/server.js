require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');

const { logger, sanitizeRequestPath } = require('./src/utils/logger');
const { connectDB, closeDB } = require('./src/config/database');
const { connectRedis, closeRedis } = require('./src/config/redis');
const { initFirebase } = require('./src/config/firebase');
const errorHandler = require('./src/middleware/errorHandler');
const { apiLimiter } = require('./src/middleware/rateLimit');

// Route imports
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const transactionRoutes = require('./src/routes/transaction.routes');
const floatRoutes = require('./src/routes/float.routes');
const balanceRoutes = require('./src/routes/balance.routes');
const shiftRoutes = require('./src/routes/shift.routes');
const ussdOverrideRoutes = require('./src/routes/ussdOverride.routes');
const agentPostRoutes = require('./src/routes/agentPost.routes');
const commissionRoutes = require('./src/routes/commission.routes');
const subscriptionRoutes = require('./src/routes/subscription.routes');
const marketplaceRoutes = require('./src/routes/marketplace.routes');
const personalTransactionRoutes = require('./src/routes/personalTransaction.routes');
const personalSubscriptionRoutes = require('./src/routes/personalSubscription.routes');
const personalCommunityRoutes = require('./src/routes/personalCommunity.routes');
const personalUssdFlowRoutes = require('./src/routes/personalUssdFlow.routes');
const personalReportRoutes = require('./src/routes/personalReport.routes');
const userSimPurposeRoutes = require('./src/routes/userSimPurpose.routes');
const reportRoutes = require('./src/routes/report.routes');
const aiRoutes = require('./src/routes/ai.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const adminRoutes = require('./src/routes/admin.routes');
const branchRoutes = require('./src/routes/branch.routes');
const ussdFlowRoutes = require('./src/routes/ussdFlow.routes');
const paystackWebhookRoutes = require('./src/routes/paystackWebhook.routes');

const app = express();

// Render terminates public HTTP(S) before forwarding requests to this
// service over its private network. Trust only standard local/private
// proxy networks so req.ip resolves the nearest untrusted public address.
// Never use `true` here: blanket proxy trust can make a client-supplied
// X-Forwarded-For value authoritative.
app.set(
  'trust proxy',
  'loopback, linklocal, uniquelocal'
);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const allowedCorsOrigins = new Set(
  [
    process.env.ADMIN_URL,
    process.env.FRONTEND_URL,

    // Local browser development.
    'http://localhost',
    'http://localhost:5173',
    'http://127.0.0.1:5173',

    // Supported mobile WebView origins.
    'capacitor://localhost',
    'ionic://localhost',
  ].filter(Boolean)
);

app.use(cors({
  origin(origin, callback) {
    // Native clients, curl, service-to-service calls and health probes
    // commonly have no Origin header.
    if (!origin || allowedCorsOrigins.has(origin)) {
      return callback(null, true);
    }

    // CORS is not an authorization boundary. Simply omit permission
    // headers for browser origins that are not explicitly trusted.
    return callback(null, false);
  },
  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
  ],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
  ],

  // Browser/mobile API authentication uses explicit Bearer tokens,
  // not ambient cross-origin cookies.
  credentials: false
}));

app.use(compression());
app.use(express.json({
  limit: '10mb',
  verify(req, res, buffer) {
    const requestPath =
      String(req.originalUrl || '')
        .split('?')[0];

    if (
      requestPath ===
      '/api/v1/webhooks/paystack'
    ) {
      req.rawBody =
        Buffer.from(buffer);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Assign a correlation ID before request logging.
// A caller-supplied ID is accepted only when it is a valid UUID;
// otherwise the API generates a fresh ID.
app.use((req, res, next) => {
  const suppliedRequestId = String(req.get('X-Request-ID') || '').trim();

  req.requestId = uuidValidate(suppliedRequestId)
    ? suppliedRequestId
    : uuidv4();

  res.setHeader('X-Request-ID', req.requestId);

  next();
});

// Keep request logs intentionally minimal.
// Do not emit query strings, authorization headers, cookies,
// IP addresses, request bodies or user agents into application logs.
morgan.token('request-id', (req) => req.requestId || '-');
morgan.token('safe-path', (req) => sanitizeRequestPath(req.path || '/'));

app.use(morgan(
  ':method :safe-path :status :response-time ms request_id=:request-id',
  {
    stream: { write: (message) => logger.info(message.trim()) }
  }
));

// Global rate limiter
app.use('/api/', apiLimiter);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/health', async (req, res) => {
  const { pool } = require('./src/config/database');
  const { redisClient } = require('./src/config/redis');

  let dbStatus = 'unknown';
  let redisStatus = 'unknown';

  try {
    await pool.query('SELECT 1');
    dbStatus = 'healthy';
  } catch (e) {
    dbStatus = 'unhealthy';
  }

  try {
    await redisClient.ping();
    redisStatus = 'healthy';
  } catch (e) {
    redisStatus = 'unhealthy';
  }

  const status = dbStatus === 'healthy' ? 200 : 503;

  res.status(status).json({
    success: status === 200,
    app: process.env.APP_NAME,
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: { database: dbStatus, redis: redisStatus }
  });
});

// ============================================================
// API ROUTES
// ============================================================

const API = '/api/v1';

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/branches`, branchRoutes);
app.use(`${API}/transactions`, transactionRoutes);
app.use(`${API}/float`, floatRoutes);
app.use(`${API}/balances`, balanceRoutes);
app.use(`${API}/shifts`, shiftRoutes);
app.use(`${API}/ussd-overrides`, ussdOverrideRoutes);
app.use(`${API}/agent-posts`, agentPostRoutes);
app.use(`${API}/commissions`, commissionRoutes);
app.use(`${API}/webhooks/paystack`, paystackWebhookRoutes);
app.use(`${API}/subscriptions`, subscriptionRoutes);
app.use(`${API}/marketplace`, marketplaceRoutes);
app.use(`${API}/personal-transactions`, personalTransactionRoutes);
app.use(`${API}/personal-subscription`, personalSubscriptionRoutes);
app.use(`${API}/personal-community`, personalCommunityRoutes);
app.use(`${API}/personal-ussd-flows`, personalUssdFlowRoutes);
app.use(`${API}/personal-reports`, personalReportRoutes);
app.use(`${API}/user-sim-purposes`, userSimPurposeRoutes);
app.use(`${API}/reports`, reportRoutes);
app.use(`${API}/ai`, aiRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/admin`, adminRoutes);
app.use(`${API}/ussd-flows`, ussdFlowRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use(errorHandler);

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

const SHUTDOWN_TIMEOUT_MS = 25_000;

let httpServer = null;
let stopOutboxWorker = null;
let stopScheduler = null;
let shutdownPromise = null;

function closeHttpServer() {
  if (!httpServer || !httpServer.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function runShutdownStage(tasks) {
  const results = await Promise.allSettled(
    tasks.map(({ run }) =>
      Promise.resolve().then(run)
    )
  );

  let failed = false;

  results.forEach((result, index) => {
    if (result.status !== 'rejected') {
      return;
    }

    failed = true;

    logger.error(
      'Graceful shutdown stage failed',
      {
        component: tasks[index].name,
        errorCode: result.reason?.code,
      }
    );
  });

  return failed;
}

function gracefulShutdown(signal) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    logger.info(
      'Graceful shutdown started',
      { signal }
    );

    const deadline = setTimeout(() => {
      logger.error(
        'Graceful shutdown deadline exceeded',
        { signal }
      );

      if (
        httpServer &&
        typeof httpServer.closeAllConnections ===
          'function'
      ) {
        httpServer.closeAllConnections();
      }

      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    // Keep the deadline referenced. If shutdown stalls, this timer
    // must remain capable of forcing process termination.
    let failed = false;

    try {
      const schedulerStop = stopScheduler;
      const outboxStop = stopOutboxWorker;

      stopScheduler = null;
      stopOutboxWorker = null;

      failed =
        await runShutdownStage([
          {
            name: 'http',
            run: closeHttpServer,
          },
          ...(schedulerStop
            ? [{
                name: 'scheduler',
                run: schedulerStop,
              }]
            : []),
          ...(outboxStop
            ? [{
                name: 'outbox',
                run: outboxStop,
              }]
            : []),
        ]) || failed;

      failed =
        await runShutdownStage([
          {
            name: 'redis',
            run: closeRedis,
          },
          {
            name: 'postgresql',
            run: closeDB,
          },
        ]) || failed;

      httpServer = null;

      if (failed) {
        process.exitCode = 1;
      }

      logger.info(
        'Graceful shutdown complete',
        { signal }
      );
    } finally {
      clearTimeout(deadline);
    }
  })();

  return shutdownPromise;
}

function installShutdownHandlers() {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      void gracefulShutdown(signal)
        .catch((error) => {
          logger.error(
            'Graceful shutdown failed',
            {
              signal,
              errorCode: error?.code,
            }
          );

          process.exitCode = 1;
        });
    });
  }
}

async function startServer() {
  try {
    logger.info('Backend telemetry: privacy-safe local logging enabled');

    // Connect to PostgreSQL
    await connectDB();
    logger.info('✅ PostgreSQL connected');

    // Connect to Redis (non-fatal: app runs with reduced functionality
    // - no token blacklisting, no caching - if Redis is unavailable)
    try {
      await connectRedis();
      logger.info('✅ Redis connected');
    } catch (redisErr) {
      logger.warn('⚠️  Redis unavailable, continuing without it:', redisErr.message);
    }

// Initialize Firebase (skip during tests)
let firebaseApp = null;

if (process.env.NODE_ENV !== 'test') {
  firebaseApp = initFirebase();
} else {
  logger.info('⏭️ Skipping Firebase initialization in test environment');
};

    // The transactional outbox worker runs only in production and starts
    // after PostgreSQL and Firebase are ready. Every production instance
    // may safely run a worker because claims use FOR UPDATE SKIP LOCKED.
    //
    // OUTBOX_WORKER_ENABLED=false is an emergency operational kill switch.
    // The default is enabled so committed outbox events cannot silently
    // accumulate after a normal deployment.
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.OUTBOX_WORKER_ENABLED !== 'false' &&
      firebaseApp
    ) {
      const {
        startOutboxWorker
      } = require('./src/services/outboxWorker');

      const {
        dispatchOutboxEvent
      } = require('./src/services/outboxDispatcher');

      stopOutboxWorker = startOutboxWorker({
        dispatchEvent: dispatchOutboxEvent,
      });

      logger.info('✅ Transactional outbox worker started');
    } else if (
      process.env.NODE_ENV === 'production' &&
      process.env.OUTBOX_WORKER_ENABLED !== 'false' &&
      !firebaseApp
    ) {
      logger.warn(
        'Transactional outbox worker not started because Firebase is unavailable'
      );
    }

    // Start background job scheduler (production only)
    if (process.env.NODE_ENV === 'production') {
      const { startScheduler } = require('./src/jobs/scheduler');
      stopScheduler = startScheduler();
    }

    httpServer = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Agent Pro Ghana API running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error(
      'Failed to start server:',
      error
    );

    process.exitCode = 1;

    await gracefulShutdown(
      'startup_failure'
    );
  }
}

if (require.main === module) {
  installShutdownHandlers();
  void startServer();
}

module.exports = app;
