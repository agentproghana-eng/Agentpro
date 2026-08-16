'use strict';

const {
  validateFlowMetadata,
} = require('../../src/utils/ussdFlowMetadataValidation');

function validate(overrides = {}) {
  return validateFlowMetadata({
    dial_code: '*170#',
    success_markers: ['successful'],
    failure_markers: ['failed'],
    ...overrides,
  });
}

describe('USSD Flow metadata validation', () => {
  test('accepts normal Ghana-style USSD dial codes', () => {
    expect(validate()).toBeNull();

    expect(
      validate({
        dial_code: '*123*1#',
      })
    ).toBeNull();
  });

  test('rejects arbitrary telephone URI/control syntax', () => {
    for (const dialCode of [
      'tel:*170#',
      '*170#,123',
      '*170;123#',
      '0240000000',
      '*170',
      '##',
    ]) {
      expect(
        validate({
          dial_code: dialCode,
        })
      ).not.toBeNull();
    }
  });

  test('enforces the database dial-code length boundary', () => {
    expect(
      validate({
        dial_code: `*${'1'.repeat(29)}#`,
      })
    ).toContain('cannot exceed 30');
  });

  test('allows empty marker lists', () => {
    expect(
      validate({
        success_markers: [],
        failure_markers: [],
      })
    ).toBeNull();
  });

  test('rejects blank markers', () => {
    expect(
      validate({
        success_markers: ['successful', '   '],
      })
    ).toContain('cannot be blank');
  });

  test('rejects duplicate markers case-insensitively', () => {
    expect(
      validate({
        success_markers: [
          'successful',
          ' Successful ',
        ],
      })
    ).toContain('duplicate marker');
  });

  test('rejects ambiguous success/failure overlap', () => {
    expect(
      validate({
        success_markers: ['transaction complete'],
        failure_markers: ['TRANSACTION COMPLETE'],
      })
    ).toContain(
      'cannot be both a success and failure marker'
    );
  });

  test('rejects non-array marker payloads', () => {
    expect(
      validate({
        success_markers: 'successful',
      })
    ).toContain('must be a list');
  });
});
