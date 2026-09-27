'use strict';

const fs = require('fs');
const path = require('path');

const read = (relativePath) =>
  fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );

describe('server-driven transaction form write contract', () => {
  const controller = read(
    'src/controllers/ussdFlowController.js',
  );

  const adminRoutes = read(
    'src/routes/admin.routes.js',
  );

  const migration = read(
    'migrations/163_server_driven_transaction_form_schema.sql',
  );

  test('Business/Global writes validate form_schema', () => {
    expect(controller).toContain(
      'validateTransactionFormSchema',
    );

    expect(controller).toContain(
      'USSD_FORM_SCHEMA_INVALID',
    );

    expect(controller).toContain(
      'form_schema ?? []',
    );
  });

  test('Admin writes validate form_schema', () => {
    expect(adminRoutes).toContain(
      'validateTransactionFormSchema',
    );

    expect(adminRoutes).toContain(
      'USSD_FORM_SCHEMA_INVALID',
    );

    expect(adminRoutes).toContain(
      'form_schema ?? []',
    );
  });

  test('database keeps structural limits only', () => {
    expect(migration).toContain(
      "jsonb_typeof(form_schema) = 'array'",
    );

    expect(migration).toContain(
      'jsonb_array_length(form_schema) <= 20',
    );

    expect(migration).not.toContain('posting_policy');
    expect(migration).not.toContain('ledger_account');
  });

  test('Personal Flow Builder is not given form_schema yet', () => {
    const personal = read(
      'src/controllers/personalUssdFlowController.js',
    );

    expect(personal).not.toContain(
      'validateTransactionFormSchema',
    );
  });
});
