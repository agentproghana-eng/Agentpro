'use strict';

const {
  parseDisabledTransactionTypes,
  serializeDisabledTransactionTypes,
} = require('../../src/utils/featureFlagConfig');

describe('featureFlagConfig', () => {
  test('accepts provider transaction kill-switch keys', () => {
    expect(
      parseDisabledTransactionTypes(
        '["telecel:cash_out","mtn:cash_in","at_money:send_money"]',
      ),
    ).toEqual([
      'telecel:cash_out',
      'mtn:cash_in',
      'at_money:send_money',
    ]);
  });

  test('normalizes whitespace, case, and duplicates', () => {
    expect(
      parseDisabledTransactionTypes([
        ' Telecel:Cash_Out ',
        'telecel:cash_out',
      ]),
    ).toEqual([
      'telecel:cash_out',
    ]);
  });

  test('rejects malformed JSON', () => {
    expect(() =>
      parseDisabledTransactionTypes(
        '["telecel:cash_out"',
      ),
    ).toThrow(
      'disabled_transaction_types must be valid JSON',
    );
  });

  test('rejects non-array configuration', () => {
    expect(() =>
      parseDisabledTransactionTypes(
        '{"telecel:cash_out":true}',
      ),
    ).toThrow(
      'disabled_transaction_types must be a JSON array',
    );
  });

  test('rejects malformed feature keys', () => {
    expect(() =>
      parseDisabledTransactionTypes([
        'telecel cash out',
      ]),
    ).toThrow(
      'Invalid disabled transaction key',
    );
  });

  test('serializes normalized configuration', () => {
    expect(
      serializeDisabledTransactionTypes([
        ' TELECEL:CASH_OUT ',
      ]),
    ).toBe(
      '["telecel:cash_out"]',
    );
  });
});
