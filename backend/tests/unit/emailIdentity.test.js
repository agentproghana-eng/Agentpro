'use strict';

const {
  normalizeAccountEmail,
} = require('../../src/utils/emailIdentity');

describe('AgentPro email identity normalization', () => {
  test('canonicalizes dotted Gmail identity', () => {
    expect(
      normalizeAccountEmail('e.owusumante@gmail.com'),
    ).toBe('eowusumante@gmail.com');
  });

  test('canonicalizes Gmail plus aliases', () => {
    expect(
      normalizeAccountEmail('Eric.Test+admin@gmail.com'),
    ).toBe('erictest@gmail.com');
  });

  test('converts googlemail.com to gmail.com', () => {
    expect(
      normalizeAccountEmail('Eric.Test@googlemail.com'),
    ).toBe('erictest@gmail.com');
  });

  test('preserves non-Gmail local punctuation', () => {
    expect(
      normalizeAccountEmail('  First.Last+Ops@Example.COM  '),
    ).toBe('first.last+ops@example.com');
  });
});
