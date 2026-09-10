'use strict';

const {
  startTransactionTelemetry,
  stopTransactionTelemetry,
  classifyFailureReason,
  recordTransactionTelemetryEvent,
  transactionTelemetrySnapshot,
} = require(
  '../../src/services/transactionTelemetryService'
);

describe('transaction telemetry service', () => {
  beforeEach(() => {
    stopTransactionTelemetry();
  });

  afterEach(() => {
    stopTransactionTelemetry();
  });

  test('does not collect while disabled', () => {
    recordTransactionTelemetryEvent({
      mode: 'business',
      provider: 'mtn',
      event: 'initiated',
      nowMs: 1_000,
    });

    expect(
      transactionTelemetrySnapshot({
        nowMs: 1_000,
      }).initiated
    ).toBe(0);
  });

  test('tracks newly initiated transactions by mode and provider', () => {
    startTransactionTelemetry();

    recordTransactionTelemetryEvent({
      mode: 'business',
      provider: 'mtn',
      event: 'initiated',
      nowMs: 10_000,
    });

    recordTransactionTelemetryEvent({
      mode: 'personal',
      provider: 'telecel',
      event: 'initiated',
      nowMs: 10_000,
    });

    const snapshot =
      transactionTelemetrySnapshot({
        nowMs: 10_000,
      });

    expect(snapshot.initiated).toBe(2);
    expect(
      snapshot.transactions_per_minute
    ).toBe(2);

    expect(
      snapshot.by_provider.mtn.initiated
    ).toBe(1);

    expect(
      snapshot.by_provider.telecel.initiated
    ).toBe(1);

    expect(
      snapshot.by_mode.business.initiated
    ).toBe(1);

    expect(
      snapshot.by_mode.personal.initiated
    ).toBe(1);
  });

  test('tracks terminal and pending completion outcomes separately', () => {
    startTransactionTelemetry();

    for (const status of [
      'success',
      'success',
      'failed',
      'pending_confirmation',
    ]) {
      recordTransactionTelemetryEvent({
        mode: 'business',
        provider: 'mtn',
        event: 'completed',
        status,
        failureReason:
          status === 'failed'
            ? 'The network reported that the transaction failed.'
            : status === 'pending_confirmation'
              ? 'The transaction outcome could not be confirmed.'
              : null,
        nowMs: 20_000,
      });
    }

    const snapshot =
      transactionTelemetrySnapshot({
        nowMs: 20_000,
      });

    expect(snapshot.completed).toBe(4);
    expect(snapshot.success).toBe(2);
    expect(snapshot.failed).toBe(1);
    expect(
      snapshot.pending_confirmation
    ).toBe(1);

    // Pending confirmation is deliberately excluded:
    // money may have moved and must not be labelled failure.
    expect(
      snapshot.completion_failure_rate
    ).toBe(0.3333);
  });

  test('classifies only server-sanitized failure reasons', () => {
    expect(
      classifyFailureReason(
        'pending_confirmation',
        'The transaction outcome could not be confirmed after PIN entry.'
      )
    ).toBe(
      'outcome_unconfirmed_after_pin'
    );

    expect(
      classifyFailureReason(
        'failed',
        'No response was received from the network.'
      )
    ).toBe(
      'network_no_response'
    );

    expect(
      classifyFailureReason(
        'failed',
        'The network reported that the transaction failed.'
      )
    ).toBe(
      'provider_reported_failure'
    );

    expect(
      classifyFailureReason(
        'failed',
        'USSD automation is not configured correctly for this transaction.'
      )
    ).toBe(
      'automation_misconfigured'
    );

    expect(
      classifyFailureReason(
        'failed',
        'Accessibility permission is required for USSD automation.'
      )
    ).toBe(
      'accessibility_unavailable'
    );

    expect(
      classifyFailureReason(
        'failed',
        'arbitrary raw provider response 0240000000'
      )
    ).toBe(
      'generic_failure'
    );
  });

  test('aggregates failure classes without retaining failure text', () => {
    startTransactionTelemetry();

    recordTransactionTelemetryEvent({
      mode: 'business',
      provider: 'telecel',
      event: 'completed',
      status: 'failed',
      failureReason:
        'The required SIM could not be prepared for this transaction.',
      nowMs: 30_000,
    });

    recordTransactionTelemetryEvent({
      mode: 'personal',
      provider: 'mtn',
      event: 'completed',
      status: 'failed',
      failureReason:
        'The transaction failed due to an automation error.',
      nowMs: 30_000,
    });

    const snapshot =
      transactionTelemetrySnapshot({
        nowMs: 30_000,
      });

    expect(
      snapshot.failure_classes
        .sim_preparation_failure
    ).toBe(1);

    expect(
      snapshot.failure_classes
        .automation_error
    ).toBe(1);

    const serialized =
      JSON.stringify(snapshot)
        .toLowerCase();

    expect(serialized).not.toContain(
      'could not be prepared'
    );

    expect(serialized).not.toContain(
      'automation error.'
    );
  });

  test('bounds unknown providers into other', () => {
    startTransactionTelemetry();

    recordTransactionTelemetryEvent({
      mode: 'business',
      provider: 'future_provider',
      event: 'initiated',
      nowMs: 40_000,
    });

    const snapshot =
      transactionTelemetrySnapshot({
        nowMs: 40_000,
      });

    expect(
      snapshot.by_provider.other.initiated
    ).toBe(1);

    expect(
      snapshot.by_provider.future_provider
    ).toBeUndefined();
  });

  test('expires events outside the rolling 60 second window', () => {
    startTransactionTelemetry();

    recordTransactionTelemetryEvent({
      mode: 'business',
      provider: 'mtn',
      event: 'initiated',
      nowMs: 1_000,
    });

    recordTransactionTelemetryEvent({
      mode: 'personal',
      provider: 'telecel',
      event: 'initiated',
      nowMs: 61_000,
    });

    const snapshot =
      transactionTelemetrySnapshot({
        nowMs: 61_000,
      });

    expect(snapshot.initiated).toBe(1);

    expect(
      snapshot.by_provider.mtn.initiated
    ).toBe(0);

    expect(
      snapshot.by_provider.telecel.initiated
    ).toBe(1);
  });

  test('contains operational aggregates only', () => {
    startTransactionTelemetry();

    recordTransactionTelemetryEvent({
      mode: 'business',
      provider: 'mtn',
      event: 'completed',
      status: 'failed',
      failureReason:
        'The network reported that the transaction failed.',
      nowMs: 50_000,
    });

    const serialized =
      JSON.stringify(
        transactionTelemetrySnapshot({
          nowMs: 50_000,
        })
      ).toLowerCase();

    for (const forbidden of [
      'phone',
      'email',
      'reference',
      'amount',
      'iccid',
      'sim_slot',
      'user_id',
      'company_id',
      'requestid',
      'network_reference',
      'ussd_session_log',
      'authorization',
      'payload',
    ]) {
      expect(serialized)
        .not
        .toContain(forbidden);
    }
  });
});
