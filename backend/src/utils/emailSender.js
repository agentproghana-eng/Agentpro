'use strict';

const TEST_EMAIL_FROM =
  'AgentPro <onboarding@resend.dev>';

function senderSafetyError(
  code,
  message
) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function resolveEmailFrom(
  env = process.env
) {
  const configured =
    String(
      env.EMAIL_FROM || ''
    ).trim();

  const production =
    String(
      env.NODE_ENV || ''
    )
      .trim()
      .toLowerCase() ===
    'production';

  const resendEnabled =
    Boolean(
      String(
        env.RESEND_API_KEY || ''
      ).trim()
    );

  if (
    production &&
    resendEnabled
  ) {
    if (!configured) {
      throw senderSafetyError(
        'EMAIL_FROM_REQUIRED_IN_PRODUCTION',
        'EMAIL_FROM is required when Resend email delivery is enabled in production'
      );
    }

    if (
      /@resend\.dev(?:>|$)/i.test(
        configured
      )
    ) {
      throw senderSafetyError(
        'EMAIL_FROM_TEST_SENDER_FORBIDDEN',
        'Resend test sender cannot be used for production email delivery'
      );
    }
  }

  return (
    configured ||
    TEST_EMAIL_FROM
  );
}

module.exports = {
  TEST_EMAIL_FROM,
  resolveEmailFrom,
};
