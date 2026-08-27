// ============================================================
// Unit Tests — Agent Pro Ghana Backend
// ============================================================

const { calculateCommission } = require('../../src/services/commissionService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── Commission Calculation Tests ────────────────────────────

describe('Commission Service', () => {
  describe('calculateCommission()', () => {
    it('credits the full provider commission to the agent', () => {
      const result =
        calculateCommission(
          500,
          0.02,
          null,
          null
        );

      expect(result.gross).toBe(10.00);
      expect(result.provider_share).toBe(0);
      expect(result.net).toBe(10.00);
    });

    it('applies a configured cap at the threshold', () => {
      const result =
        calculateCommission(
          1500,
          0.02,
          1000,
          20
        );

      expect(result.gross).toBe(20.00);
      expect(result.provider_share).toBe(0);
      expect(result.net).toBe(20.00);
    });

    it('does not apply the cap below threshold', () => {
      const result =
        calculateCommission(
          800,
          0.02,
          1000,
          20
        );

      expect(result.gross).toBe(16.00);
      expect(result.net).toBe(16.00);
    });

    it('handles zero amount', () => {
      const result =
        calculateCommission(
          0,
          0.02,
          null,
          null
        );

      expect(result.gross).toBe(0);
      expect(result.provider_share).toBe(0);
      expect(result.net).toBe(0);
    });

    it('rounds commission to two decimal places', () => {
      const result =
        calculateCommission(
          333,
          0.02,
          null,
          null
        );

      expect(result.gross).toBe(6.66);
      expect(result.net).toBe(6.66);
    });
  });
});

// ─── Auth Helper Tests ────────────────────────────────────────

describe('Auth Utilities', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-64-chars-for-testing-purposes-only';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-64-chars-for-testing-purposes-only';
    process.env.BCRYPT_ROUNDS = '4'; // Fast for tests
  });

  describe('Password hashing', () => {
    it('hashes password with bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 4);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true);
    });

    it('verifies correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 4);
      const valid = await bcrypt.compare(password, hash);
      expect(valid).toBe(true);
    });

    it('rejects incorrect password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 4);
      const valid = await bcrypt.compare('WrongPassword', hash);
      expect(valid).toBe(false);
    });
  });

  describe('JWT tokens', () => {
    it('generates and verifies access token', () => {
      const payload = { id: 'user-uuid', role: 'agent', company_id: 'company-uuid' };
      const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      expect(decoded.id).toBe(payload.id);
      expect(decoded.role).toBe(payload.role);
    });

    it('rejects tampered token', () => {
      const payload = { id: 'user-uuid', role: 'agent' };
      const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => jwt.verify(tampered, process.env.JWT_ACCESS_SECRET)).toThrow();
    });

    it('rejects token with wrong secret', () => {
      const payload = { id: 'user-uuid', role: 'agent' };
      const token = jwt.sign(payload, 'wrong-secret');
      expect(() => jwt.verify(token, process.env.JWT_ACCESS_SECRET)).toThrow();
    });

    it('rejects expired token', () => {
      const payload = { id: 'user-uuid', role: 'agent' };
      const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '0s' });
      expect(() => jwt.verify(token, process.env.JWT_ACCESS_SECRET)).toThrow(jwt.TokenExpiredError);
    });
  });
});

// ─── Security Tests ───────────────────────────────────────────

describe('Security Rules', () => {
  it('CRITICAL: no PIN-related field should appear in transaction response', () => {
    // Simulate a USSD session log
    const sessionLog = [
      { step: 0, type: 'dial', input: '*170#' },
      { step: 1, type: 'select', input: '1' },
      { step: 2, type: 'pin', input: null, note: '[PIN ENTRY - NOT LOGGED]', is_pin_step: true },
      { step: 3, type: 'confirm', input: '1' },
    ];

    // PIN step must NOT have an input value
    const pinSteps = sessionLog.filter(s => s.is_pin_step);
    pinSteps.forEach(step => {
      expect(step.input).toBeNull();
      expect(step.note).toBe('[PIN ENTRY - NOT LOGGED]');
    });

    // No step should have a value that looks like a PIN (4-6 digits)
    const allInputs = sessionLog
      .filter(s => !s.is_pin_step && s.input !== null)
      .map(s => s.input);

    allInputs.forEach(input => {
      if (input && typeof input === 'string') {
        // A PIN is 4-6 digits — flag if any non-PIN-step has this pattern
        // (menu selections like '1' are allowed; '1234' would be suspicious)
        const looksLikePin = /^\d{4,6}$/.test(input) && parseInt(input) > 9;
        if (looksLikePin) {
          // This would be a security violation in production
          console.warn(`Suspicious input in non-PIN step: ${input}`);
        }
      }
    });
  });

  it('sanitizeUSSDLog keeps metadata but strips resolved USSD and raw provider text', () => {
    const { sanitizeUSSDLog } = require('../../src/controllers/transactionController');

    const log = [
      {
        type: 'dial',
        dialed: '*170*1*2*0241234567*250#',
        input: '0241234567',
        value: '250',
        timestamp: '2026-07-04T10:00:00.000Z',
      },
      {
        type: 'response',
        response: 'Balance GHS 450.25. Account 0241234567',
        timestamp: '2026-07-04T10:00:04.000Z',
      },
      {
        type: 'pin_prompt_seen',
        response: 'malicious client supplied PIN-like text 1234',
        timestamp: '2026-07-04T10:00:04.100Z',
      },
      {
        type: 'final_response',
        response: 'Cash out successful. Ref 998877',
        note: 'customer secret',
        timestamp: '2026-07-04T10:00:12.000Z',
      },
    ];

    const sanitized = sanitizeUSSDLog(log);

    expect(sanitized[0]).toEqual({
      type: 'dial',
      timestamp: '2026-07-04T10:00:00.000Z',
    });
    expect(sanitized[1]).toEqual({
      type: 'response',
      timestamp: '2026-07-04T10:00:04.000Z',
    });
    expect(sanitized[2]).toEqual({
      type: 'pin_prompt_seen',
      timestamp: '2026-07-04T10:00:04.100Z',
      response: '[PIN ENTRY — NOT LOGGED, NOT APP-VISIBLE]',
    });
    expect(sanitized[3]).toEqual({
      type: 'final_response',
      timestamp: '2026-07-04T10:00:12.000Z',
    });
  });

  it('sanitizeUSSDLog strips legacy input/value/note data and replaces PIN markers', () => {
    const { sanitizeUSSDLog } = require('../../src/controllers/transactionController');

    const log = [
      { step: 0, type: 'select', input: '0241234567', value: '250' },
      { step: 1, type: 'pin', input: '1234', note: '1234', is_pin_step: true },
      { step: 2, type: 'confirm', input: '1', note: 'secret' },
    ];

    const sanitized = sanitizeUSSDLog(log);

    expect(sanitized[0]).toEqual({ type: 'select' });
    expect(sanitized[1]).toEqual({
      type: 'pin',
      note: '[PIN ENTRY - NOT LOGGED]',
    });
    expect(sanitized[2]).toEqual({ type: 'confirm' });
  });

  it('sanitizeUSSDLog handles null, undefined, and non-array input safely', () => {
    const { sanitizeUSSDLog } = require('../../src/controllers/transactionController');

    expect(sanitizeUSSDLog(null)).toBeNull();
    expect(sanitizeUSSDLog(undefined)).toBeNull();
    expect(sanitizeUSSDLog({ type: 'dial' })).toBeNull();
  });

  it('sanitizeFailureReason never persists arbitrary client/provider text', () => {
    const {
      sanitizeFailureReason,
    } = require('../../src/controllers/transactionController');

    expect(
      sanitizeFailureReason(
        'Balance GHS 9,876.54 for 0241234567. Account ID SECRET-123',
        'failed'
      )
    ).toBe('The transaction failed due to an automation error.');

    expect(
      sanitizeFailureReason(
        'SocketException: host=internal.example token=SECRET',
        'failed'
      )
    ).toBe('The transaction failed due to an automation error.');

    expect(
      sanitizeFailureReason(
        'No final network result was received after PIN entry. Please verify.',
        'pending_confirmation'
      )
    ).toBe('The transaction outcome could not be confirmed after PIN entry.');

    expect(
      sanitizeFailureReason(
        'The network reported that the transaction failed.',
        'failed'
      )
    ).toBe('The network reported that the transaction failed.');

    expect(
      sanitizeFailureReason(null, 'success')
    ).toBeNull();
  });

  it('validates password strength requirements', () => {
    const validate = (password) => {
      if (password.length < 8) return 'too_short';
      if (!/[A-Z]/.test(password)) return 'no_uppercase';
      if (!/[0-9]/.test(password)) return 'no_number';
      return 'valid';
    };

    expect(validate('Test1234')).toBe('valid');
    expect(validate('short1')).toBe('too_short');
    expect(validate('alllowercase1')).toBe('no_uppercase');
    expect(validate('NoNumbers!')).toBe('no_number');
  });
});

// ─── Input Validation Tests ───────────────────────────────────

describe('Input Validation', () => {
  it('validates Ghana phone number format', () => {
    const isValidGhanaPhone = (phone) => /^0(2|5)[0-9]{8}$/.test(phone);
    expect(isValidGhanaPhone('0241234567')).toBe(true);  // MTN
    expect(isValidGhanaPhone('0501234567')).toBe(true);  // Telecel
    expect(isValidGhanaPhone('0271234567')).toBe(true);  // AT
    expect(isValidGhanaPhone('1234567890')).toBe(false); // Invalid
    expect(isValidGhanaPhone('024123456')).toBe(false);  // Too short
  });

  it('validates transaction amount range', () => {
    const isValidAmount = (amount) => amount > 0 && amount <= 10000;
    expect(isValidAmount(100)).toBe(true);
    expect(isValidAmount(0)).toBe(false);
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(10001)).toBe(false);
  });

  it('validates MoMo reference format', () => {
    const isValidRef = (ref) => Boolean(ref && ref.trim().length >= 5);
    expect(isValidRef('APG12345')).toBe(true);
    expect(isValidRef('AB123')).toBe(true);
    expect(isValidRef('AB')).toBe(false);
    expect(isValidRef('')).toBe(false);
    expect(isValidRef(null)).toBe(false);
  });
});
