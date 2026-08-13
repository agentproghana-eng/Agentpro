'use strict';

const {
  createInitiationCapabilityGuard,
} = require('../../src/middleware/transactionCapability');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('transaction initiation capability guard', () => {
  test('allows a registered provider and initiable transaction type', async () => {
    const lookup = jest.fn().mockResolvedValue({
      provider_registered: true,
      transaction_type_initiable: true,
    });

    const guard =
      createInitiationCapabilityGuard('business', lookup);

    const req = {
      body: {
        provider: 'future_provider',
        transaction_type: 'future_type',
      },
    };

    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(lookup).toHaveBeenCalledWith(
      'business',
      'future_provider',
      'future_type'
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  test('rejects an unregistered provider', async () => {
    const lookup = jest.fn().mockResolvedValue({
      provider_registered: false,
      transaction_type_initiable: true,
    });

    const guard =
      createInitiationCapabilityGuard('personal', lookup);

    const req = {
      body: {
        provider: 'unknown_provider',
        transaction_type: 'buy_data',
      },
    };

    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation failed',
      errors: [
        {
          field: 'provider',
          message: 'Invalid provider',
        },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a non-initiable transaction type', async () => {
    const lookup = jest.fn().mockResolvedValue({
      provider_registered: true,
      transaction_type_initiable: false,
    });

    const guard =
      createInitiationCapabilityGuard('business', lookup);

    const req = {
      body: {
        provider: 'mtn',
        transaction_type: 'cash_out_commission',
      },
    };

    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation failed',
      errors: [
        {
          field: 'transaction_type',
          message: 'Invalid transaction type',
        },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('reports provider and type errors together', async () => {
    const lookup = jest.fn().mockResolvedValue({
      provider_registered: false,
      transaction_type_initiable: false,
    });

    const guard =
      createInitiationCapabilityGuard('personal', lookup);

    const req = {
      body: {
        provider: 'unknown_provider',
        transaction_type: 'unknown_type',
      },
    };

    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation failed',
      errors: [
        {
          field: 'provider',
          message: 'Invalid provider',
        },
        {
          field: 'transaction_type',
          message: 'Invalid transaction type',
        },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('passes lookup failures to Express error handling', async () => {
    const error = new Error('database unavailable');
    const lookup = jest.fn().mockRejectedValue(error);

    const guard =
      createInitiationCapabilityGuard('business', lookup);

    const req = {
      body: {
        provider: 'mtn',
        transaction_type: 'cash_in',
      },
    };

    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(error);
  });

  test('rejects invalid account mode when guard is created', () => {
    expect(() =>
      createInitiationCapabilityGuard('anything')
    ).toThrow(
      'accountMode must be either business or personal'
    );
  });
});
