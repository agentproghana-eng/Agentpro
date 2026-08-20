'use strict';

const fs = require('fs');
const path = require('path');

const {
  sanitizeProductionLogText,
  sanitizeProductionLogValue,
  sanitizeRequestPath,
  isSensitiveLogKey,
} = require('../../src/utils/logger');

describe('production log privacy', () => {
  test('sanitizes secrets PII phone numbers emails and monetary values in text', () => {
    const result = sanitizeProductionLogText(
      'Bearer secret-token password=hello PIN=1234 ' +
        'person@example.com 0244000000 GHS 500.00',
    );

    expect(result).not.toContain('secret-token');
    expect(result).not.toContain('hello');
    expect(result).not.toContain('1234');
    expect(result).not.toContain('person@example.com');
    expect(result).not.toContain('0244000000');
    expect(result).not.toContain('500.00');

    expect(result).toContain('[REDACTED]');
    expect(result).toContain('[REDACTED_EMAIL]');
    expect(result).toContain('[REDACTED_PHONE]');
    expect(result).toContain('[REDACTED_AMOUNT]');
  });

  test('redacts sensitive metadata while preserving request correlation', () => {
    const result = sanitizeProductionLogValue({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      operation: 'POST /api/v1/transactions',
      userId: 'user-secret',
      phone: '0244000000',
      amount: '500.00',
      token: 'secret-token',
      requestBody: {
        pin: '1234',
      },
    });

    expect(result.requestId).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(result.operation).toBe(
      'POST /api/v1/transactions',
    );

    expect(result.userId).toBe('[REDACTED]');
    expect(result.phone).toBe('[REDACTED]');
    expect(result.amount).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');

    expect(JSON.stringify(result)).not.toContain('0244000000');
    expect(JSON.stringify(result)).not.toContain('500.00');
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  test('reduces Error objects to non-message operational metadata', () => {
    const error = new Error(
      'authorization Bearer secret-token for 0244000000',
    );

    error.code = '42P08';

    const result = sanitizeProductionLogValue(error);

    expect(result).toEqual({
      name: 'Error',
      code: '42P08',
    });

    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(JSON.stringify(result)).not.toContain('0244000000');
    expect(JSON.stringify(result)).not.toContain('stack');
  });

  test('sanitizes entity identifiers from request paths', () => {
    expect(
      sanitizeRequestPath(
        '/api/v1/transactions/550e8400-e29b-41d4-a716-446655440000'
      )
    ).toBe('/api/v1/transactions/:id');

    expect(
      sanitizeRequestPath('/api/v1/users/12345/profile')
    ).toBe('/api/v1/users/:id/profile');

    expect(
      sanitizeRequestPath(
        '/marketplace/507f1f77bcf86cd799439011?include=details'
      )
    ).toBe('/marketplace/:id');
  });

  test('request ID remains explicitly non-sensitive', () => {
    expect(isSensitiveLogKey('requestId')).toBe(false);
    expect(isSensitiveLogKey('userId')).toBe(true);
    expect(isSensitiveLogKey('companyId')).toBe(true);
    expect(isSensitiveLogKey('branchId')).toBe(true);
    expect(isSensitiveLogKey('companyName')).toBe(true);
    expect(isSensitiveLogKey('authorization')).toBe(true);
    expect(isSensitiveLogKey('payment_phone')).toBe(true);
    expect(isSensitiveLogKey('amount')).toBe(true);
  });

  test('production database logging excludes raw SQL and database messages', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/config/database.js'),
      'utf8',
    );

    expect(source).toContain(
      "logger.error('Database query failed'",
    );

    expect(source).toContain(
      'errorCode: error?.code',
    );

    expect(source).toContain(
      'durationMs: duration',
    );

    expect(source).not.toContain(
      "logger.error('Query error:', { text, error: error.message })",
    );
  });

  test('marketplace routes do not bypass the central logger', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/routes/marketplace.routes.js'),
      'utf8',
    );

    expect(source).toContain(
      "require('../utils/logger')",
    );

    expect(source).not.toContain(
      'console.error(',
    );
  });

  test('notification logs do not embed direct user identity', () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '../../src/services/notificationService.js',
      ),
      'utf8',
    );

    expect(source).not.toContain(
      'FCM send error for user ${userId}',
    );

    expect(source).not.toContain(
      'FCM ephemeral send error for user ${userId}',
    );
  });

  test('registration logging does not contain applicant identity', () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '../../src/controllers/authController.js',
      ),
      'utf8',
    );

    expect(source).toContain(
      'New Business Owner registration submitted',
    );

    expect(source).not.toContain(
      'New Business Owner registration: ${email}',
    );
  });

  test('email operational logs do not contain recipient subject or provider ID', () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '../../src/services/emailService.js',
      ),
      'utf8',
    );

    expect(source).toContain(
      'Email skipped because RESEND_API_KEY is not configured',
    );

    expect(source).toContain(
      'Email sent successfully',
    );

    expect(source).not.toContain(
      '${subject} -> ${to}',
    );

    expect(source).not.toContain(
      'Email sent to ${to}',
    );

    expect(source).not.toContain(
      '${data?.id}',
    );
  });


  test('SMS success logging does not include phone or provider message IDs', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/services/smsService.js'),
      'utf8',
    );

    expect(source).toContain(
      'SMS sent successfully',
    );

    expect(source).not.toContain(
      'SMS sent to ${to}',
    );
  });
});
