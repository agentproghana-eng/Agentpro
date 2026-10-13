'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../../..', relativePath),
    'utf8',
  );
}

describe('Fraud signal escalation contracts', () => {
  const service = read('backend/src/services/fraudSignalReviewService.js');
  const routes = read('backend/src/routes/admin.routes.js');
  const migration = read(
    'backend/migrations/172_fraud_signal_escalation.sql',
  );
  const queue = read(
    'admin_portal/src/features/support/FraudSignalQueue.jsx',
  );
  const counts = read(
    'admin_portal/src/features/shell/useAttentionCounts.js',
  );
  const attention = read(
    'admin_portal/src/features/shell/NeedsAttention.jsx',
  );

  test('escalating alerts every active superuser once, outside the review transaction', () => {
    expect(routes).toContain('notifySuperusersOfEscalation');
    expect(routes).toContain("role = 'superuser' AND status = 'active'");
    expect(routes).toContain('fraud_escalated:${signal.id}:${row.id}');
    expect(routes).toContain("result.review_status === 'escalated'");
  });

  test('a failed alert never undoes the escalation', () => {
    expect(routes).toContain('notifySuperusersOfEscalation(result).catch');
  });

  test('only an escalated signal can be resolved', () => {
    expect(service).toContain("'resolved'");
    expect(service).toContain('FRAUD_SIGNAL_NOT_ESCALATED');
    expect(service).toContain('AND review_status = $4');
  });

  test('migration adds the notification type and resolved status without dropping data', () => {
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'fraud_signal_escalated'");
    expect(migration).toContain("'resolved'");
    expect(migration).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|TRUNCATE/i);
  });

  test('admin portal shows escalated signals until they are resolved', () => {
    expect(queue).toContain('Mark resolved');
    expect(counts).toContain("status: 'escalated'");
    expect(attention).toContain('escalated fraud');
  });
});
