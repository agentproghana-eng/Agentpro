const {
  initializeApp,
  cert,
} = require('firebase-admin/app');
const {
  getMessaging: getFirebaseMessaging,
} = require('firebase-admin/messaging');
const { logger } = require('../utils/logger');

let firebaseApp;

function initFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  const hasValidConfig =
    projectId &&
    clientEmail &&
    privateKey &&
    privateKey.includes('BEGIN PRIVATE KEY');

  if (!hasValidConfig) {
    logger.warn(
      'Firebase Admin skipped because valid Firebase credentials are not configured'
    );
    return null;
  }

  try {
    firebaseApp = initializeApp({
      credential: cert({
        projectId,
        privateKey: privateKey.replace(/\\n/g, '\n'),
        clientEmail,
      }),
    });

    logger.info('Firebase Admin initialized');
    return firebaseApp;
  } catch (error) {
    logger.error('Firebase init error:', error);
    logger.warn('Continuing without Firebase Admin');
    firebaseApp = null;
    return null;
  }
}

function getMessaging() {
  if (!firebaseApp) throw new Error('Firebase not initialized');
  return getFirebaseMessaging(firebaseApp);
}

module.exports = { initFirebase, getMessaging };
