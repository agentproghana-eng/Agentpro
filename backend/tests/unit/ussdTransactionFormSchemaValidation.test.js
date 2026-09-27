'use strict';

const {
  validateTransactionFormSchema,
} = require('../../src/utils/ussdTransactionFormSchemaValidation');

describe('USSD transaction form schema validation', () => {
  test('accepts the future MTN EVD Sell Airtime shape', () => {
    expect(
      validateTransactionFormSchema([
        {
          key: 'customer_phone',
          type: 'phone',
          label: 'Customer Number',
          required: true,
          min_length: 10,
          max_length: 10,
        },
        {
          key: 'amount',
          type: 'amount',
          label: 'Amount',
          required: true,
        },
      ]),
    ).toBeNull();
  });

  test('accepts an empty schema for legacy flows', () => {
    expect(
      validateTransactionFormSchema([]),
    ).toBeNull();

    expect(
      validateTransactionFormSchema(undefined),
    ).toBeNull();
  });

  test('rejects PIN and accounting destinations', () => {
    for (const key of [
      'pin',
      'sim_role',
      'balance_adjustment',
      'commission',
      'posting_policy',
      'ledger_account',
    ]) {
      expect(
        validateTransactionFormSchema([
          {
            key,
            type: 'text',
            label: 'Unsafe',
          },
        ]),
      ).not.toBeNull();
    }
  });

  test('rejects arbitrary request destinations', () => {
    expect(
      validateTransactionFormSchema([
        {
          key: 'admin_override',
          type: 'text',
          label: 'Override',
        },
      ]),
    ).toMatch(/not supported/);
  });

  test('rejects duplicate semantic keys', () => {
    expect(
      validateTransactionFormSchema([
        {
          key: 'amount',
          type: 'amount',
          label: 'Amount',
        },
        {
          key: 'amount',
          type: 'amount',
          label: 'Amount Again',
        },
      ]),
    ).toMatch(/duplicate field/);
  });

  test('rejects incompatible semantic key and type', () => {
    expect(
      validateTransactionFormSchema([
        {
          key: 'amount',
          type: 'phone',
          label: 'Amount',
        },
      ]),
    ).toMatch(/cannot use type/);
  });

  test('rejects malformed constraints', () => {
    expect(
      validateTransactionFormSchema([
        {
          key: 'customer_phone',
          type: 'phone',
          label: 'Customer Number',
          min_length: '10',
        },
      ]),
    ).toMatch(/min_length must be an integer/);

    expect(
      validateTransactionFormSchema([
        {
          key: 'customer_phone',
          type: 'phone',
          label: 'Customer Number',
          min_length: 11,
          max_length: 10,
        },
      ]),
    ).toMatch(/cannot exceed max_length/);
  });

  test('rejects options on non-selection fields', () => {
    expect(
      validateTransactionFormSchema([
        {
          key: 'reference',
          type: 'reference',
          label: 'Reference',
          options: [
            { value: 'x', label: 'X' },
          ],
        },
      ]),
    ).toMatch(/Only selection/);
  });

  test('selection validation fails closed', () => {
    // No current semantic destination is intentionally mapped to
    // selection yet. A future selection key must first be added to
    // the installed client adapter and TYPE_BY_KEY.
    expect(
      validateTransactionFormSchema([
        {
          key: 'network',
          type: 'selection',
          label: 'Network',
          options: [
            { value: 'mtn', label: 'MTN' },
          ],
        },
      ]),
    ).toMatch(/not supported/);
  });
});
