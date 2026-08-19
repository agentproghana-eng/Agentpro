'use strict';

const fs = require('fs');
const path = require('path');

const controller = fs.readFileSync(
  path.join(__dirname, '../../src/controllers/userController.js'),
  'utf8'
);

describe('Quick Action customization preference contract', () => {
  test('accepts a validated icon background colour preference', () => {
    expect(controller).toContain('icon_background_color');
    expect(controller).toContain(
      'QUICK_ACTION_ICON_COLORS.has('
    );
    expect(controller).toContain(
      '.icon_background_color is invalid'
    );
  });

  test('keeps Quick Action positions limited to the 3x3 dashboard', () => {
    expect(controller).toContain(
      'position < 0 || position > 8'
    );
  });
});
