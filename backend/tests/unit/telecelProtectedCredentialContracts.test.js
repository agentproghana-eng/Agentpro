'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );
}

describe('Telecel protected credential contracts', () => {
  test('login responses do not expose plaintext Operator ID', () => {
    const auth = read(
      'src/controllers/authController.js',
    );

    expect(auth).not.toContain(
      'telecel_operator_id: user.telecel_operator_id',
    );

    expect(auth).not.toContain(
      'telecel_operator_id:\\n            result.user',
    );
  });

  test('settings encrypt protected credentials before persistence', () => {
    const controller = read(
      'src/controllers/userController.js',
    );

    expect(controller).toContain(
      'encryptTelecelCredential',
    );

    expect(controller).toContain(
      'telecel_agent_operator_id_enc',
    );

    expect(controller).toContain(
      'telecel_merchant_operator_id_enc',
    );

    expect(controller).toContain(
      'telecel_agent_organisation_shortcode_enc',
    );

    expect(controller).toContain(
      'telecel_merchant_organisation_shortcode_enc',
    );
  });

  test('settings responses expose configured state, not credential values', () => {
    const controller = read(
      'src/controllers/userController.js',
    );

    expect(controller).toContain(
      'telecel_agent_operator_id_configured',
    );

    expect(controller).toContain(
      'telecel_merchant_operator_id_configured',
    );

    expect(controller).not.toContain(
      'newValues: { telecel_operator_id }',
    );
  });


  test('Organisation Shortcode is Merchant-only', () => {
    const settings = read(
      'src/controllers/userController.js',
    );

    expect(settings).toContain(
      'simRole === "agent"',
    );

    expect(settings).toContain(
      '"INVALID_TELECEL_CREDENTIAL_FOR_SIM_ROLE"',
    );

    expect(settings).toContain(
      '"Organisation Shortcode is not supported for a Telecel Agent SIM"',
    );

    const execution = read(
      'src/controllers/ussdFlowController.js',
    );

    expect(execution).toContain(
      'simRole === "agent" &&',
    );

    expect(execution).toContain(
      'needsOrganisationShortcode',
    );

    expect(execution).toContain(
      '"INVALID_TELECEL_CREDENTIAL_FOR_SIM_ROLE"',
    );
  });

  test('account deletion erases all protected Telecel credentials', () => {
    const auth = read(
      'src/controllers/authController.js',
    );

    for (const column of [
      'telecel_agent_operator_id_enc = NULL',
      'telecel_agent_organisation_shortcode_enc = NULL',
      'telecel_merchant_operator_id_enc = NULL',
      'telecel_merchant_organisation_shortcode_enc = NULL',
    ]) {
      expect(auth).toContain(column);
    }
  });

  test('dedicated status endpoint never decrypts credentials', () => {
    const controller = read(
      'src/controllers/userController.js',
    );

    const start = controller.indexOf(
      'exports.getMyTelecelCredentialStatus',
    );

    expect(start).toBeGreaterThan(-1);

    const statusBlock = controller.slice(
      start,
      start + 2200,
    );

    expect(statusBlock).not.toContain(
      'decryptTelecelCredential',
    );
  });
});
