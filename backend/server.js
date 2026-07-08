require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const { logger } = require('./src/utils/logger');
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const { initFirebase } = require('./src/config/firebase');
const errorHandler = require('./src/middleware/errorHandler');
const { apiLimiter } = require('./src/middleware/rateLimit');

// Route imports
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const transactionRoutes = require('./src/routes/transaction.routes');
const floatRoutes = require('./src/routes/float.routes');
const commissionRoutes = require('./src/routes/commission.routes');
const subscriptionRoutes = require('./src/routes/subscription.routes');
const marketplaceRoutes = require('./src/routes/marketplace.routes');
const reportRoutes = require('./src/routes/report.routes');
const aiRoutes = require('./src/routes/ai.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const adminRoutes = require('./src/routes/admin.routes');
const branchRoutes = require('./src/routes/branch.routes');

const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: [
    process.env.APP_URL,
    process.env.ADMIN_URL,
    process.env.FRONTEND_URL,
    // Allow mobile app
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Add request ID to each request
app.use((req, res, next) => {
  req.requestId = require('uuid').v4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

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

  const status = dbStatus === 'healthy' && redisStatus === 'healthy' ? 200 : 503;

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
app.use(`${API}/commissions`, commissionRoutes);
app.use(`${API}/subscriptions`, subscriptionRoutes);
app.use(`${API}/marketplace`, marketplaceRoutes);
app.use(`${API}/reports`, reportRoutes);
app.use(`${API}/ai`, aiRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/admin`, adminRoutes);

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

async function startServer() {
  try {
    // Connect to PostgreSQL
    await connectDB();
    logger.info('✅ PostgreSQL connected');

    // Connect to Redis
    await connectRedis();
    logger.info('✅ Redis connected');

// Initialize Firebase (skip during tests)
if (process.env.NODE_ENV !== 'test') {
  initFirebase();
  logger.info('✅ Firebase initialized');
} else {
  logger.info('⏭️ Skipping Firebase initialization in test environment');
};

    // Start background job scheduler (production only)
    if (process.env.NODE_ENV === 'production') {
      const { startScheduler } = require('./src/jobs/scheduler');
      startScheduler();
    }

    app.listen(PORT, () => {
      logger.info(`🚀 Agent Pro Ghana API running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
