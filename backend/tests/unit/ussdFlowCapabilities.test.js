'use strict';

jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
}));

const {
  getRegisteredProviders,
  getTransactionCapabilities,
  getFlowBuilderEligibility,
  getGlobalFlowBuilderEligibility,
  getInitiationCapability,
  getFlowBuilderCapabilities,
} = require('../../src/utils/ussdFlowCapabilities');

describe('USSD Flow Builder capabilities', () => {
  test('registered providers come from PostgreSQL enum order', async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [
        { value: 'mtn' },
        { value: 'telecel' },
        { value: 'at_money' },
        { value: 'future_provider' },
      ],
    });

    await expect(getRegisteredProviders(queryFn)).resolves.toEqual([
      'mtn',
      'telecel',
      'at_money',
      'future_provider',
    ]);

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryFn.mock.calls[0][0]).toContain("t.typname = 'provider'");
  });

  test.each(['business', 'personal'])(
    'transaction capabilities are queried by %s mode',
    async (mode) => {
      const queryFn = jest.fn().mockResolvedValue({
        rows: [{ value: 'example_type', label: 'Example Type' }],
      });

      await expect(
        getTransactionCapabilities(mode, queryFn)
      ).resolves.toEqual([
        { value: 'example_type', label: 'Example Type' },
      ]);

      expect(queryFn).toHaveBeenCalledWith(
        expect.stringContaining('ussd_flow_capabilities'),
        [mode]
      );
    }
  );

  test('invalid account mode is rejected before querying', async () => {
    const queryFn = jest.fn();

    await expect(
      getTransactionCapabilities('anything', queryFn)
    ).rejects.toThrow('accountMode must be either business or personal');

    expect(queryFn).not.toHaveBeenCalled();
  });

  test.each(['business', 'personal'])(
    'Flow Builder eligibility uses active configuration for %s mode without requiring initiation',
    async (mode) => {
      const queryFn = jest.fn().mockResolvedValue({
        rows: [{
          provider_registered: true,
          transaction_type_builder_enabled: true,
        }],
      });

      await expect(
        getFlowBuilderEligibility(
          mode,
          'future_provider',
          'future_type',
          queryFn
        )
      ).resolves.toEqual({
        provider_registered: true,
        transaction_type_builder_enabled: true,
      });

      const [sql, params] = queryFn.mock.calls[0];

      expect(sql).toContain("t.typname = 'provider'");
      expect(sql).toContain('is_active = TRUE');
      expect(sql).not.toContain('can_initiate = TRUE');
      expect(params).toEqual([
        'future_provider',
        mode,
        'future_type',
      ]);
    }
  );

  test('Flow Builder eligibility rejects invalid account mode before querying', async () => {
    const queryFn = jest.fn();

    await expect(
      getFlowBuilderEligibility(
        'anything',
        'mtn',
        'cash_in',
        queryFn
      )
    ).rejects.toThrow(
      'accountMode must be either business or personal'
    );

    expect(queryFn).not.toHaveBeenCalled();
  });

  test('Global Flow Builder eligibility reports the enabled account modes', async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [{
        provider_registered: true,
        business_enabled: false,
        personal_enabled: true,
      }],
    });

    await expect(
      getGlobalFlowBuilderEligibility(
        'future_provider',
        'personal_only_type',
        queryFn
      )
    ).resolves.toEqual({
      provider_registered: true,
      transaction_type_builder_enabled: true,
      business_enabled: false,
      personal_enabled: true,
    });

    const [sql, params] = queryFn.mock.calls[0];

    expect(sql).toContain(
      "account_mode = 'business'"
    );

    expect(sql).toContain(
      "account_mode = 'personal'"
    );

    expect(sql).toContain(
      'is_active = TRUE'
    );

    expect(sql).not.toContain(
      'can_initiate = TRUE'
    );

    expect(params).toEqual([
      'future_provider',
      'personal_only_type',
    ]);
  });

  test('initiation capability is resolved from registered provider and mode-specific flag', async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [{
        provider_registered: true,
        transaction_type_initiable: true,
      }],
    });

    await expect(
      getInitiationCapability(
        'business',
        'future_provider',
        'future_type',
        queryFn
      )
    ).resolves.toEqual({
      provider_registered: true,
      transaction_type_initiable: true,
    });

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('can_initiate = TRUE'),
      ['future_provider', 'business', 'future_type']
    );
  });

  test('initiation capability can reject provider and type independently', async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [{
        provider_registered: false,
        transaction_type_initiable: false,
      }],
    });

    await expect(
      getInitiationCapability(
        'personal',
        'unknown_provider',
        'unknown_type',
        queryFn
      )
    ).resolves.toEqual({
      provider_registered: false,
      transaction_type_initiable: false,
    });
  });

  test('initiation capability rejects invalid account mode before querying', async () => {
    const queryFn = jest.fn();

    await expect(
      getInitiationCapability(
        'anything',
        'mtn',
        'cash_in',
        queryFn
      )
    ).rejects.toThrow(
      'accountMode must be either business or personal'
    );

    expect(queryFn).not.toHaveBeenCalled();
  });

  test('combined response contains providers and mode-specific types', async () => {
    const queryFn = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ value: 'mtn' }, { value: 'future_provider' }],
      })
      .mockResolvedValueOnce({
        rows: [{ value: 'buy_data', label: 'Buy Data' }],
      });

    await expect(
      getFlowBuilderCapabilities('personal', queryFn)
    ).resolves.toEqual({
      account_mode: 'personal',
      providers: ['mtn', 'future_provider'],
      transaction_types: [
        { value: 'buy_data', label: 'Buy Data' },
      ],
    });
  });
});
