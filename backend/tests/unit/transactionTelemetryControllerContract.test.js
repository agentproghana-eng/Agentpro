'use strict';

const fs = require('fs');
const path = require('path');

const businessSource =
  fs.readFileSync(
    path.join(
      __dirname,
      '../../src/controllers/transactionController.js'
    ),
    'utf8'
  );

const personalSource =
  fs.readFileSync(
    path.join(
      __dirname,
      '../../src/controllers/personalTransactionController.js'
    ),
    'utf8'
  );

describe('transaction telemetry controller contract', () => {
  test('Business records creation only after a new transaction exists', () => {
    expect(businessSource).toContain(
      'const transaction = txResult.rows[0];'
    );

    expect(businessSource).toContain(
      'mode: "business",\n      provider,\n      event: "initiated",'
    );
  });

  test('Business records only genuine completed outcomes', () => {
    expect(businessSource).toContain(
      'provider: tx.provider,\n      event: "completed",\n      status: finalStatus,'
    );

    expect(businessSource.indexOf(
      'if (manualCashOutRequired)'
    )).toBeLessThan(
      businessSource.indexOf(
        'provider: tx.provider,\n      event: "completed"'
      )
    );
  });

  test('Personal records creation only after a new transaction exists', () => {
    expect(personalSource).toContain(
      'const transaction = result.rows[0];'
    );

    expect(personalSource).toContain(
      "mode: 'personal',\n      provider,\n      event: 'initiated',"
    );
  });

  test('Personal completion reads authoritative provider', () => {
    expect(personalSource).toContain(
      'SELECT id, status, provider'
    );

    expect(personalSource).toContain(
      "provider: completion.provider,\n      event: 'completed',"
    );
  });

  test('telemetry calls do not forward sensitive transaction fields', () => {
    const calls = [
      ...businessSource.matchAll(
        /recordTransactionTelemetryEvent\(\{([\s\S]*?)\}\);/g
      ),
      ...personalSource.matchAll(
        /recordTransactionTelemetryEvent\(\{([\s\S]*?)\}\);/g
      ),
    ].map((match) => match[1]);

    expect(calls.length).toBe(4);

    for (const call of calls) {
      for (const forbidden of [
        'amount',
        'phone',
        'reference',
        'network_reference',
        'sim_iccid',
        'userId',
        'companyId',
        'requestId',
        'ussd_session_log',
      ]) {
        expect(call).not.toContain(
          forbidden
        );
      }
    }
  });
});
