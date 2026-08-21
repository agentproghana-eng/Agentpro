const fs = require('fs');
const path = require('path');

describe('Firebase startup logging contract', () => {
  const serverPath = path.join(__dirname, '../../server.js');
  const firebasePath = path.join(
    __dirname,
    '../../src/config/firebase.js'
  );

  const serverSource = fs.readFileSync(serverPath, 'utf8');
  const firebaseSource = fs.readFileSync(firebasePath, 'utf8');

  test('server does not unconditionally report Firebase initialization success', () => {
    expect(serverSource).not.toContain(
      "logger.info('✅ Firebase initialized')"
    );
  });

  test('Firebase adapter reports success only inside successful initialization path', () => {
    expect(firebaseSource).toContain(
      "logger.info('Firebase Admin initialized')"
    );

    expect(firebaseSource).toContain(
      "logger.warn('Continuing without Firebase Admin')"
    );

    expect(firebaseSource).toContain(
      'firebaseApp = null;'
    );
  });
});
