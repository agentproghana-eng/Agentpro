const {
  PROVIDER_COMMISSION_TRANSACTION_TYPES,
  normalizeCommissionScopeValue,
  isSupportedProviderCommissionCombination,
} = require(
  '../../src/config/commissionRulePolicy'
);

describe(
  'Provider commission rule policy',
  () => {
    test.each([
      ['mtn', 'send_money'],
      ['mtn', 'cash_out'],
      ['telecel', 'cash_in'],
      ['telecel', 'cash_out'],
      ['at_money', 'cash_in'],
      ['at_money', 'cash_out'],
    ])(
      'allows %s / %s',
      (provider, transactionType) => {
        expect(
          isSupportedProviderCommissionCombination(
            provider,
            transactionType
          )
        ).toBe(true);
      }
    );

    test.each([
      ['mtn', 'cash_in'],
      ['mtn', 'airtime'],
      ['telecel', 'send_money'],
      ['telecel', 'airtime'],
      ['at_money', 'send_money'],
      ['at_money', 'data_bundle'],
      ['unknown', 'cash_in'],
      ['', 'cash_in'],
      ['mtn', ''],
    ])(
      'rejects %s / %s',
      (provider, transactionType) => {
        expect(
          isSupportedProviderCommissionCombination(
            provider,
            transactionType
          )
        ).toBe(false);
      }
    );

    test(
      'normalizes provider and transaction scope values',
      () => {
        expect(
          normalizeCommissionScopeValue(
            '  MTN '
          )
        ).toBe('mtn');

        expect(
          isSupportedProviderCommissionCombination(
            ' TELECEL ',
            ' CASH_IN '
          )
        ).toBe(true);
      }
    );

    test(
      'publishes only the six approved provider/type combinations',
      () => {
        expect(
          PROVIDER_COMMISSION_TRANSACTION_TYPES
        ).toEqual({
          mtn: [
            'send_money',
            'cash_out',
          ],
          telecel: [
            'cash_in',
            'cash_out',
          ],
          at_money: [
            'cash_in',
            'cash_out',
          ],
        });
      }
    );
  }
);
