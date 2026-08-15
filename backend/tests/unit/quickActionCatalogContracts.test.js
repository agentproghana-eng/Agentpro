'use strict';

const fs = require('fs');
const path = require('path');

const read = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8');

describe('Global-flow Quick Action catalog contracts', () => {
  const controller = read('src/controllers/userController.js');
  const routes = read('src/routes/user.routes.js');

  test('authenticated user routes expose a dedicated Quick Action catalog', () => {
    expect(routes).toContain(
      "userRouter.get('/me/quick-actions/catalog', userController.getMyQuickActionCatalog)"
    );

    expect(controller).toContain('exports.getMyQuickActionCatalog');
  });

  test('Quick Action provider validation is not a closed three-provider allowlist', () => {
    expect(controller).not.toMatch(
      /QUICK_ACTION_PROVIDERS\s*=\s*\[\s*['"]mtn['"]\s*,\s*['"]telecel['"]\s*,\s*['"]at_money['"]\s*\]/
    );

    expect(controller).toMatch(/getRegisteredProviders/);
  });

  test('catalog is sourced from active true-Global flows and mode-aware initiation capabilities', () => {
    expect(controller).toMatch(/ussd_flows/);
    expect(controller).toMatch(/ussd_flow_capabilities/);

    expect(controller).toMatch(/company_id\s+IS\s+NULL/i);
    expect(controller).toMatch(/owner_user_id\s+IS\s+NULL/i);
    expect(controller).toMatch(/is_active\s*=\s*TRUE/i);

    expect(controller).toMatch(/account_mode/i);
    expect(controller).toMatch(/can_initiate\s*=\s*TRUE/i);
  });

  test('catalog exposes data-driven provider, type, label and grouping metadata', () => {
    expect(controller).toMatch(/provider/);
    expect(controller).toMatch(/transaction_type/);
    expect(controller).toMatch(/display_label/);
    expect(controller).toMatch(/quick_action_group/);
  });

  test('catalog keeps flow variants under transaction capabilities instead of duplicate dashboard action keys', () => {
    expect(controller).toMatch(/bundle_category/);
    expect(controller).toMatch(/recipient_mode/);

    expect(controller).toMatch(
      /GROUP BY|json_agg|jsonb_agg|array_agg|variants/i
    );
  });
});
