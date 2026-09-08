'use strict';

const fs =
  require('fs');

const path =
  require('path');

const {
  classifyRequest,
  sanitizeForBasicModel,
  calculateOpenAICostGhs,
} = require(
  '../../src/services/askAgentProService',
);

describe(
  'Ask AgentPro automatic routing',
  () => {
    test.each([
      [
        'How do I process a Cash In?',
        'basic',
      ],
      [
        'What does pending confirmation mean?',
        'basic',
      ],
      [
        'How do I renew my subscription?',
        'basic',
      ],
      [
        'Check my recent transactions',
        'full',
      ],
      [
        'Is my subscription active?',
        'full',
      ],
      [
        'Why is my Business Hub listing not showing?',
        'full',
      ],
      [
        'Is AgentPro working normally?',
        'full',
      ],
    ])(
      '%s routes to %s',
      (message, expected) => {
        expect(
          classifyRequest(message),
        ).toBe(expected);
      },
    );

    test(
      'Basic-mode sanitization removes private identifiers',
      () => {
        const safe =
          sanitizeForBasicModel(
            'My PIN is 1234. Email me at user@example.com, phone 0244123456, ref AGP-ABC12345.',
          );

        expect(safe)
          .toContain('[REDACTED]');

        expect(safe)
          .toContain(
            '[REDACTED_EMAIL]',
          );

        expect(safe)
          .toContain(
            '[REDACTED_PHONE]',
          );

        expect(safe)
          .toContain(
            '[REDACTED_REFERENCE]',
          );

        expect(safe)
          .not.toContain(
            '0244123456',
          );

        expect(safe)
          .not.toContain(
            'user@example.com',
          );
      },
    );

    test(
      'Full-mode cost is calculated from actual token categories',
      () => {
        process.env
          .ASK_AGENTPRO_GHS_PER_USD =
          '12';

        const cost =
          calculateOpenAICostGhs({
            inputTokens: 1000,
            cachedInputTokens: 200,
            outputTokens: 500,
          });

        expect(cost)
          .toBe(0.009168);

        delete process.env
          .ASK_AGENTPRO_GHS_PER_USD;
      },
    );

    test(
      'Basic mode requires its dedicated free-tier credential',
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              '../../src/services/askAgentProService.js',
            ),
            'utf8',
          );

        expect(source)
          .toContain(
            'ASK_AGENTPRO_BASIC_GEMINI_API_KEY',
          );

        expect(source)
          .not.toContain(
            'process.env.GEMINI_API_KEY',
          );

        expect(source)
          .toContain(
            'sanitizeForBasicModel',
          );

        expect(source)
          .toContain(
            "'@google/genai'",
          );

        expect(source)
          .not.toContain(
            "'@google/generative-ai'",
          );

        expect(source)
          .toContain(
            'new GoogleGenAI({',
          );

        expect(source)
          .toContain(
            'ai.models',
          );

        expect(source)
          .toContain(
            '.generateContent({',
          );

        expect(source)
          .toContain(
            'systemInstruction:',
          );

        expect(source)
          .toContain(
            'store: false',
          );
      },
    );
  },
);
