'use strict';

const fs =
  require('fs');

const path =
  require('path');

function read(relative) {
  return fs.readFileSync(
    path.join(
      __dirname,
      relative,
    ),
    'utf8',
  );
}

const controller =
  read(
    '../../src/controllers/aiController.js',
  );

const service =
  read(
    '../../src/services/askAgentProService.js',
  );

const budget =
  read(
    '../../src/services/askAgentProBudgetService.js',
  );

const routes =
  read(
    '../../src/routes/ai.routes.js',
  );

const migration =
  read(
    '../../migrations/119_ask_agentpro_monthly_budget.sql',
  );

describe(
  'Ask AgentPro v1 contract',
  () => {
    test(
      'automatically separates Basic and Full support',
      () => {
        expect(service)
          .toContain(
            'classifyRequest',
          );

        expect(service)
          .toContain(
            "return 'basic'",
          );

        expect(service)
          .toContain(
            "return 'full'",
          );

        expect(service)
          .toContain(
            'runBasic',
          );

        expect(service)
          .toContain(
            'runFull',
          );
      },
    );

    test(
      'Full mode uses OpenAI Responses with read-only tools',
      () => {
        expect(service)
          .toContain(
            'https://api.openai.com/v1/responses',
          );

        expect(service)
          .toContain(
            "'gpt-5.6-luna'",
          );

        expect(service)
          .toContain(
            'getDiagnosticToolsForMode',
          );

        expect(service)
          .toContain(
            'executeDiagnosticTool',
          );

        expect(service)
          .toContain(
            'store: false',
          );

        expect(service)
          .toContain(
            'parallel_tool_calls',
          );
      },
    );

    test(
      'partial paid Full usage is settled before Basic fallback',
      () => {
        expect(service)
          .toContain(
            'askAgentProUsage',
          );

        expect(service)
          .toContain(
            'partialCostGhs',
          );

        expect(service)
          .toContain(
            'await settleFullRequest({',
          );

        expect(service)
          .toContain(
            'await releaseFullRequest(',
          );

        expect(service)
          .toContain(
            '`openai+${fallback.provider}`',
          );
      },
    );

    test(
      'Basic mode does not use live diagnostics or Full history',
      () => {
        expect(service)
          .toContain(
            'ASK_AGENTPRO_BASIC_GEMINI_API_KEY',
          );

        expect(service)
          .toContain(
            'sanitizeForBasicModel',
          );

        const basicStart =
          service.indexOf(
            'async function runBasic',
          );

        const basicEnd =
          service.indexOf(
            'async function basicResult',
          );

        const basicBlock =
          service.slice(
            basicStart,
            basicEnd,
          );

        expect(basicBlock)
          .not.toContain(
            'executeDiagnosticTool',
          );

        expect(basicBlock)
          .not.toContain(
            'history',
          );
      },
    );

    test(
      'Personal and Business budgets have correct scopes',
      () => {
        expect(budget)
          .toContain(
            'DEFAULT_PERSONAL_BUDGET_GHS = 0.50',
          );

        expect(budget)
          .toContain(
            'DEFAULT_BUSINESS_BUDGET_GHS = 1.00',
          );

        expect(budget)
          .toContain(
            "scopeType: 'personal'",
          );

        expect(budget)
          .toContain(
            'scopeId: user.id',
          );

        expect(budget)
          .toContain(
            "scopeType: 'business'",
          );

        expect(budget)
          .toContain(
            'scopeId: user.company_id',
          );

        expect(budget)
          .toContain(
            'FOR UPDATE',
          );
      },
    );

    test(
      'Full diagnostics are restricted to selected account mode',
      () => {
        expect(service)
          .toContain(
            'getDiagnosticToolsForMode',
          );

        expect(service)
          .toContain(
            'accountMode,',
          );

        const diagnostics =
          read(
            '../../src/services/askAgentProDiagnosticService.js',
          );

        expect(diagnostics)
          .toContain(
            "accountMode === 'personal'",
          );

        expect(diagnostics)
          .toContain(
            "accountMode === 'business'",
          );

        expect(diagnostics)
          .toContain(
            "Business Hub diagnostics are only available in Business mode.",
          );
      },
    );

    test(
      'conversation cannot cross Personal and Business modes',
      () => {
        expect(controller)
          .toContain(
            "context ->> 'mode'",
          );

        expect(controller)
          .toContain(
            'storedMode !== mode',
          );

        expect(controller)
          .toContain(
            'ASK_AGENTPRO_MODE_CHANGED',
          );
      },
    );

    test(
      'route validates mode and conversation id',
      () => {
        expect(routes)
          .toContain(
            "body('mode')",
          );

        expect(routes)
          .toContain(
            "'personal'",
          );

        expect(routes)
          .toContain(
            "'business'",
          );

        expect(routes)
          .toContain(
            "body('conversation_id')",
          );

        expect(routes)
          .toContain(
            '.isUUID()',
          );

        expect(routes)
          .toContain(
            'validationResult',
          );
      },
    );

    test(
      'migration persists monthly spend and response accounting',
      () => {
        expect(migration)
          .toContain(
            'ask_agentpro_monthly_usage',
          );

        expect(migration)
          .toContain(
            'spent_ghs',
          );

        expect(migration)
          .toContain(
            'reserved_ghs',
          );

        expect(migration)
          .toContain(
            'ai_mode',
          );

        expect(migration)
          .toContain(
            'ai_provider',
          );

        expect(migration)
          .toContain(
            'cost_ghs',
          );
      },
    );
  },
);
