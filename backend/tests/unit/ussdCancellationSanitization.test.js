const {
  sanitizeFailureReason,
} = require(
  '../../src/controllers/transactionController'
);

describe(
  'USSD provider cancellation sanitization',
  () => {
    test(
      'before-PIN cancellation is definite',
      () => {
        expect(
          sanitizeFailureReason(
            'Transaction cancelled by user before PIN',
            'failed'
          )
        ).toBe(
          'Transaction cancelled by the user before PIN entry.'
        );
      }
    );

    test(
      'PIN-prompt cancellation is definite',
      () => {
        expect(
          sanitizeFailureReason(
            'Transaction cancelled by user at PIN prompt',
            'failed'
          )
        ).toBe(
          'Transaction cancelled by the user at the PIN prompt.'
        );
      }
    );

    test(
      'post-PIN cancellation remains ambiguous',
      () => {
        expect(
          sanitizeFailureReason(
            'Transaction cancelled by user after PIN. Verify the network outcome before retrying.',
            'pending_confirmation'
          )
        ).toBe(
          'The provider prompt was cancelled after PIN entry; verify the transaction outcome before retrying.'
        );
      }
    );
  }
);
