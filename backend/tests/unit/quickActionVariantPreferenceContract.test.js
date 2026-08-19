'use strict';

const fs = require('fs');
const path = require('path');

const controller = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/controllers/userController.js'
  ),
  'utf8'
);

describe('Quick Action variant preference contract', () => {
  test('accepts bounded catalog variant identity fields', () => {
    expect(controller).toContain('bundle_category');
    expect(controller).toContain('recipient_mode');
    expect(controller).toContain(
      '.bundle_category is invalid'
    );
    expect(controller).toContain(
      '.recipient_mode is invalid'
    );
  });

  test('deduplicates by full action variant identity', () => {
    expect(controller).toContain(
      'const actionIdentities = []'
    );

    expect(controller).toContain(
      'cannot contain duplicate action variants'
    );

    expect(controller).toContain(
      '${action_key.trim()}|${normalizedBundleCategory}|${normalizedRecipientMode}'
    );
  });
});
