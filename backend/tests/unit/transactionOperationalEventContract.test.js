const fs = require('fs');
const path = require('path');

const controllerPath = path.join(
  __dirname,
  '../../src/controllers/transactionController.js'
);

const source = fs.readFileSync(controllerPath, 'utf8');

describe('Agent transaction operational event contract', () => {
  test('records initiation atomically after the strict audit', () => {
    const transactionBlock = source.slice(
      source.indexOf('txResult = await withTransaction'),
      source.indexOf('const transaction = txResult.rows[0]')
    );

    expect(transactionBlock).toContain(
      'eventName: "transaction.initiated"'
    );
    expect(transactionBlock).toContain('dbClient: client');
    expect(transactionBlock).toContain(
      'correlationId: req.requestId'
    );
    expect(transactionBlock).toContain(
      'transaction:${transaction.id}:initiated:v1'
    );

    expect(transactionBlock.indexOf('await auditLog({')).toBeLessThan(
      transactionBlock.indexOf('await recordOperationalEvent({')
    );
  });

  test('maps every accepted final status to one canonical event', () => {
    expect(source).toContain(
      'success: "transaction.completed"'
    );
    expect(source).toContain(
      'failed: "transaction.failed"'
    );
    expect(source).toContain(
      '"transaction.pending_confirmation"'
    );
  });

  test('records outcomes between strict audit and outbox enqueue', () => {
    const completionBlock = source.slice(
      source.indexOf('exports.completeTransaction'),
      source.indexOf('recordTransactionTelemetryEvent({',
        source.indexOf('exports.completeTransaction'))
    );

    const auditAt = completionBlock.lastIndexOf('await auditLog({');
    const eventAt = completionBlock.indexOf(
      'await recordOperationalEvent({'
    );
    const outboxAt = completionBlock.indexOf(
      'await enqueueOutboxEvent({'
    );

    expect(auditAt).toBeGreaterThanOrEqual(0);
    expect(eventAt).toBeGreaterThan(auditAt);
    expect(outboxAt).toBeGreaterThan(eventAt);
    expect(completionBlock).toContain('dbClient: client');
    expect(completionBlock).toContain(
      'correlationId: req.requestId'
    );
    expect(completionBlock).not.toContain('network_reference,\n        attributes');
    expect(completionBlock).not.toContain('ussd_session_log,\n        attributes');
  });
});
