const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );
}

describe('Seller notification contracts', () => {
  test('ad expiry warnings and expired notices are sent once per ad', () => {
    const source = readSource('src/jobs/scheduler.js');

    expect(source).toContain('deliveryKey: `ad_expired:${ad.id}`');
    expect(source).toContain('`ad_expiring:${ad.id}:');
    expect(source).toContain(
      "WHERE status = 'active'\n         AND grace_period_ends_at < NOW()",
    );
  });

  test('sellers are notified of new enquiries and first-time saves', () => {
    const source = readSource('src/routes/marketplace.routes.js');

    expect(source).toContain("type: 'ad_enquiry'");
    expect(source).toContain('`ad_enquiry:${messageResult.rows[0].id}`');
    expect(source).toContain("type: 'ad_saved'");
    expect(source).toContain('`ad_saved:${req.user.id}:${savedAd.id}`');
    expect(source).toContain('savedAd.posted_by !== req.user.id');
  });

  test('notification types exist and copy does not promise a renew feature', () => {
    const service = readSource('src/services/notificationService.js');
    const migration = readSource(
      'migrations/170_ad_enquiry_and_saved_notification_types.sql',
    );

    expect(service).toContain('ad_enquiry: {');
    expect(service).toContain('ad_saved: {');
    expect(service).not.toContain('Renew to');
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'ad_enquiry'");
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'ad_saved'");
  });
});
