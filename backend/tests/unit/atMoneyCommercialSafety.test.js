'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const read = (relativePath) =>
  fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );

describe('AT Money commercial safety', () => {
  test('migration 053 remains an intentional no-op', () => {
    const source = read(
      'migrations/053_seed_at_money_agent_flows.sql'
    );

    expect(source).toContain(
      'AT Money Agent USSD automation intentionally NOT seeded'
    );

    expect(source).toContain('SELECT 1;');

    expect(source).not.toMatch(
      /INSERT\s+INTO\s+ussd_flows[\s\S]*['"]at_money['"]/i
    );
  });

  test('bootstrap seed cannot reactivate legacy AT Money templates', () => {
    const source = read('scripts/seed.js');

    expect(source).toContain(
      'AT Money Agent automation is intentionally not seeded here'
    );

    expect(source).not.toMatch(
      /provider:\s*['"]at_money['"]/i
    );

    expect(source).not.toContain('*500*1*3');
    expect(source).not.toContain('*500*1*2');
  });

  test('migration 089 disables unvalidated legacy automation', () => {
    const source = read(
      'migrations/089_disable_unvalidated_at_money_automation.sql'
    );

    expect(source).toMatch(
      /UPDATE\s+ussd_templates[\s\S]*provider\s*=\s*['"]at_money['"][\s\S]*is_active\s*=\s*TRUE/i
    );

    expect(source).toMatch(
      /UPDATE\s+ussd_flows[\s\S]*provider\s*=\s*['"]at_money['"][\s\S]*company_id\s+IS\s+NULL[\s\S]*owner_user_id\s+IS\s+NULL/i
    );

    expect(source).not.toMatch(
      /INSERT\s+INTO\s+ussd_flows/i
    );
  });
});
