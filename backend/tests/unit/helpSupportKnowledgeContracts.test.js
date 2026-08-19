const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );
}

describe('Help and Support knowledge contracts', () => {
  test('AI guidance avoids assuming a fixed provider or transaction list', () => {
    const source = readSource(
      'src/controllers/aiController.js',
    );

    expect(source).not.toContain(
      'Supported providers: MTN Mobile Money, Telecel Cash, AT Money',
    );

    expect(source).not.toContain(
      'Transaction types: Cash In, Cash Out, Send Money',
    );

    expect(source).toContain(
      'Only describe providers and transaction options that are currently available in the app',
    );

    expect(source).toContain(
      'do not assume a fixed provider or transaction list',
    );
  });

  test('AI guidance distinguishes Personal MTN from MTN Agent SIM support', () => {
    const source = readSource(
      'src/controllers/aiController.js',
    );

    expect(source).toContain(
      'MTN Personal: 100',
    );

    expect(source).toContain(
      'MTN Agent SIM: 114',
    );

    expect(source).toContain(
      'Telecel: 100',
    );

    expect(source).toContain(
      'AT: 100',
    );
  });

  test('AI subscription guidance matches authoritative business seat billing', () => {
    const source = readSource(
      'src/controllers/aiController.js',
    );

    expect(source).not.toContain(
      'Business Plan costs GH₵10/month',
    );

    expect(source).toContain(
      'GH₵10 per paid active seat',
    );

    expect(source).toContain(
      'every 5th active staff member is free',
    );
  });

  test('AI staff onboarding copy matches secure setup-link delivery', () => {
    const source = readSource(
      'src/controllers/aiController.js',
    );

    expect(source).toContain(
      'secure one-time password setup link by email',
    );

    expect(source).toContain(
      'Passwords are never sent by email, SMS, or push notification',
    );

    expect(source).toContain(
      'setup link expires after one hour',
    );

    expect(source).toContain(
      'use Forgot Password',
    );

    expect(source.toLowerCase()).not.toContain(
      'temporary password',
    );
  });

  test('AI guidance stays concise, app-focused, and avoids implementation internals', () => {
    const source = readSource(
      'src/controllers/aiController.js',
    );

    expect(source).toContain(
      'Keep every answer concise, clear, and practical',
    );

    expect(source).toContain(
      'Focus on navigation and actions',
    );

    expect(source).toContain(
      'Do not discuss how Agent Pro Ghana was built or implemented',
    );

    expect(source).toContain(
      'source code, frameworks, architecture, APIs, databases',
    );

    expect(source).toContain(
      'AI models/providers',
    );

    expect(source).not.toContain(
      'Provide business guidance for mobile money agent operations',
    );

    expect(source).not.toContain(
      'active capability configuration',
    );

    expect(source).not.toContain(
      'currently configured account-setup delivery channel',
    );
  });


  test('AI report and security guidance matches current app behavior', () => {
    const source = readSource(
      'src/controllers/aiController.js',
    );

    expect(source).toContain(
      'Business reports can be downloaded as PDF, Excel, or CSV',
    );

    expect(source).toContain(
      'Personal transaction reports can be downloaded as PDF or CSV',
    );

    expect(source).toContain(
      'Phone authentication can be enabled in Settings',
    );

    expect(source).not.toContain(
      'Biometric login can be enabled in Settings',
    );
  });

});
