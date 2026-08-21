const fs = require('fs');
const path = require('path');

describe('notification delivery idempotency migration', () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '../../migrations/093_notification_delivery_idempotency.sql'
    ),
    'utf8'
  );

  test('adds a bounded stable delivery key', () => {
    expect(migration).toContain(
      'ADD COLUMN delivery_key VARCHAR(255)'
    );
  });

  test('enforces uniqueness only for durable keyed deliveries', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX uq_notifications_delivery_key'
    );
    expect(migration).toContain(
      'WHERE delivery_key IS NOT NULL'
    );
  });
});
