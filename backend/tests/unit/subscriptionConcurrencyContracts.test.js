const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );
}

function functionSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('Subscription payment concurrency contracts', () => {
  test(
    'Business payment submission serializes pending check and insert',
    () => {
      const source = readSource(
        'src/controllers/subscriptionController.js',
      );

      const submitPayment = functionSlice(
        source,
        'exports.submitPayment = async',
        'exports.verifyPayment = async',
      );

      expect(submitPayment).toContain('withTransaction');
      expect(submitPayment).toContain('FOR UPDATE');
      expect(submitPayment).toContain(
        'const pending = await client.query(',
      );
      expect(submitPayment).toContain(
        'payment = await client.query(',
      );
      expect(submitPayment).toContain(
        'INSERT INTO subscription_payments',
      );
    },
  );

  test(
    'Personal payment submission serializes pending check and insert',
    () => {
      const source = readSource(
        'src/controllers/personalSubscriptionController.js',
      );

      const submitPayment = functionSlice(
        source,
        'exports.submitPayment = async',
        'exports.verifyPayment = async',
      );

      expect(submitPayment).toContain('withTransaction');
      expect(submitPayment).toContain('FOR UPDATE');
      expect(submitPayment).toContain(
        'const pending = await client.query(',
      );
      expect(submitPayment).toContain(
        'result = await client.query(',
      );
      expect(submitPayment).toContain(
        'INSERT INTO personal_subscription_payments',
      );
    },
  );
  test(
    'Business payment verification locks the payment before status check',
    () => {
      const source = readSource(
        'src/controllers/subscriptionController.js',
      );

      const verifyPayment = functionSlice(
        source,
        'exports.verifyPayment = async',
        'exports.listPendingPayments = async',
      );

      const transactionIndex =
        verifyPayment.indexOf('withTransaction');

      const paymentReadIndex = verifyPayment.indexOf(
        'const paymentResult = await client.query(',
      );

      expect(transactionIndex).toBeGreaterThanOrEqual(0);
      expect(paymentReadIndex).toBeGreaterThan(
        transactionIndex,
      );

      expect(verifyPayment).toContain(
        'SELECT * FROM subscription_payments WHERE id = $1 FOR UPDATE',
      );
    },
  );

  test(
    'Personal payment verification locks the payment before status check',
    () => {
      const source = readSource(
        'src/controllers/personalSubscriptionController.js',
      );

      const verifyPayment = functionSlice(
        source,
        'exports.verifyPayment = async',
        'exports.listPendingPayments = async',
      );

      const transactionIndex =
        verifyPayment.indexOf('withTransaction');

      const paymentReadIndex = verifyPayment.indexOf(
        'const paymentResult = await client.query(',
      );

      expect(transactionIndex).toBeGreaterThanOrEqual(0);
      expect(paymentReadIndex).toBeGreaterThan(
        transactionIndex,
      );

      expect(verifyPayment).toContain(
        'SELECT * FROM personal_subscription_payments WHERE id = $1 FOR UPDATE',
      );
    },
  );

  test(
    'Business payment verification defers external notifications until after commit',
    () => {
      const source = readSource(
        'src/controllers/subscriptionController.js',
      );

      const verifyPayment = functionSlice(
        source,
        'exports.verifyPayment = async',
        'exports.listPendingPayments = async',
      );

      const transactionStart = verifyPayment.indexOf(
        'await withTransaction',
      );

      const postTransactionGuard = verifyPayment.indexOf(
        'if (verificationError)',
      );

      expect(transactionStart).toBeGreaterThanOrEqual(0);
      expect(postTransactionGuard).toBeGreaterThan(
        transactionStart,
      );

      const transactionSection = verifyPayment.slice(
        transactionStart,
        postTransactionGuard,
      );

      expect(transactionSection).not.toContain(
        'sendWelcomeEmail(',
      );

      expect(transactionSection).not.toContain(
        'sendToUser(',
      );

      expect(transactionSection).not.toContain(
        'sendSubscriptionRenewalSMS(',
      );

      const postCommitSection = verifyPayment.slice(
        postTransactionGuard,
      );

      expect(postCommitSection).toContain(
        'sendWelcomeEmail(',
      );

      expect(postCommitSection).toContain(
        'sendToUser(',
      );
    },
  );

});
