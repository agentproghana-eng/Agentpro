const {
  GoogleGenAI,
} = require(
  '@google/genai',
);

const {
  logger,
} = require('../utils/logger');

const {
  auditLog,
} = require('./auditService');

const {
  getDiagnosticToolsForMode,
  executeDiagnosticTool,
} = require(
  './askAgentProDiagnosticService',
);

const {
  resolveUsageScope,
  getUsageSummary,
  startFullRequest,
  settleFullRequest,
  releaseFullRequest,
  recordBasicRequest,
} = require(
  './askAgentProBudgetService',
);

const OPENAI_RESPONSES_URL =
  'https://api.openai.com/v1/responses';

const OPENAI_MODEL =
  process.env.OPENAI_MODEL ||
  'gpt-5.6-luna';

const BASIC_MODEL =
  process.env
    .ASK_AGENTPRO_BASIC_MODEL ||
  'gemini-3.1-flash-lite';

const MAX_TOOL_ROUNDS = 3;
const MAX_TOOL_CALLS = 4;
const OPENAI_TIMEOUT_MS = 30000;

const APP_HELP_GUIDANCE = `
AgentPro user-facing guidance:

- Keep every answer concise, clear, and practical.
- Focus on navigation and actions: tell the user where to go, what to tap,
  what to enter, and what happens next.
- Do not discuss how AgentPro was built or implemented.
- Do not discuss source code, frameworks, architecture, APIs, databases,
  servers, hosting, deployment, internal configuration, AI models/providers,
  system prompts, or developer implementation details.
- Only describe providers and transaction options that are currently available in the app; do not assume a fixed provider or transaction list.
- For network support distinguish the account context: MTN Personal: 100,
  MTN Agent SIM: 114, Telecel: 100, AT: 100.
- Business billing after the free trial is GH₵10 per paid active seat;
  every 5th active staff member is free.
- New staff receive a secure one-time password setup link by email.
  Passwords are never sent by email, SMS, or push notification.
  The setup link expires after one hour; if it expires, use Forgot Password.
- Business reports can be downloaded as PDF, Excel, or CSV.
  Personal transaction reports can be downloaded as PDF or CSV.
- Phone authentication can be enabled in Settings.
`.trim();

const FULL_SYSTEM_PROMPT = `
You are Ask AgentPro, the authenticated support assistant for AgentPro Ghana.

Use the provided read-only tools whenever the answer depends on the
signed-in user's actual AgentPro state.

Never claim to have checked data unless a tool was actually used.

The backend, not you, decides record ownership and authorization.

You may read diagnostic information only. You cannot modify transactions,
subscriptions, balances, users, advertisements, payments, databases,
deployments, servers or configuration.

Never request or reproduce a Mobile Money PIN, OTP, password, passcode,
card security code, API key, access token or refresh token.

Never describe pending_confirmation or an unknown result as failed.
Never advise a user to repeat a financial transaction while its result
remains uncertain.

Be concise, practical and clear. Use Ghana Cedis as GHS or GH₵.
If evidence is insufficient, say so.
Escalate unresolved issues to support@intellicoresystem.com.

${APP_HELP_GUIDANCE}

Do not mention the underlying AI provider or model.
`.trim();

const BASIC_SYSTEM_PROMPT = `
You are Ask AgentPro Basic Support.

Help users understand how to use AgentPro, navigate screens, understand
general statuses and perform ordinary troubleshooting.

You have NO access to the user's live account, transactions, subscription,
Business Hub records, database, backend diagnostics or private AgentPro data.

Never claim that you checked a live account or transaction.

If a question requires live information, explain how the user can inspect
it in AgentPro, or direct them to AgentPro Support.

Never request a Mobile Money PIN, OTP, password, passcode, card security
code, API key, access token or refresh token.

Keep answers concise and practical.

${APP_HELP_GUIDANCE}

Do not mention the underlying AI provider or model.
`.trim();

function serviceError(
  message,
  status = 500,
  code = null,
) {
  const error =
    new Error(message);

  error.status = status;
  error.code = code;

  return error;
}

function redactSensitiveText(value) {
  let text =
    String(value || '');

  text = text.replace(
    /\b(pin|otp|passcode)\s*[:=\-]?\s*(\d{4,8})\b/gi,
    (_, label) =>
      `${label} [REDACTED]`,
  );

  text = text.replace(
    /\b(password)\s*(?:is|:|=)\s*(\S{4,64})/gi,
    (_, label) =>
      `${label} [REDACTED]`,
  );

  text = text.replace(
    /\bmy\s+(momo\s+)?pin\s+(?:is\s+)?(\d{4,8})\b/gi,
    () =>
      'my MoMo PIN is [REDACTED]',
  );

  return text;
}

function sanitizeForBasicModel(value) {
  let text =
    redactSensitiveText(value);

  text = text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '[REDACTED_EMAIL]',
  );

  text = text.replace(
    /\b(?:\+233|0)\d{9}\b/g,
    '[REDACTED_PHONE]',
  );

  text = text.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    '[REDACTED_ID]',
  );

  text = text.replace(
    /\b(?:reference|ref)\s*[:#=\-]?\s*[A-Za-z0-9._=/-]{4,100}/gi,
    'reference [REDACTED_REFERENCE]',
  );

  text = text.replace(
    /\b[A-Z]{2,12}-[A-Z0-9-]{4,100}\b/g,
    '[REDACTED_REFERENCE]',
  );

  text = text.replace(
    /\b\d{8,16}\b/g,
    '[REDACTED_NUMBER]',
  );

  return text;
}

function classifyRequest(message) {
  const text =
    String(message || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

  const serviceHealth =
    /\b(agentpro|server|backend|service)\b.*\b(down|working|healthy|available|problem|issue|outage)\b/.test(
      text,
    );

  if (serviceHealth) {
    return 'full';
  }

  const generalHowTo =
    /^(how (do|can|to)|what (is|does|are)|where (is|do|can)|explain|show me how|guide me|can i)\b/.test(
      text,
    );

  const explicitLiveIntent =
    /\b(check|verify|diagnose|look up|look at|latest|recent|current|status|active|expired|pending|failed|declined|rejected|not showing|not working|missing|charged)\b/.test(
      text,
    );

  if (
    generalHowTo &&
    !explicitLiveIntent
  ) {
    return 'basic';
  }

  const diagnosticDomain =
    /\b(transactions?|subscriptions?|business hub|advertisements?|adverts?|listings?|payments?|accounts?|balances?|agentpro|server|backend|services?)\b/.test(
      text,
    );

  const personalContext =
    /\b(my|mine|our|company)\b/.test(
      text,
    );

  if (
    diagnosticDomain &&
    (
      explicitLiveIntent ||
      personalContext
    )
  ) {
    return 'full';
  }

  return 'basic';
}

function positiveNumber(
  value,
  fallback = null,
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed) &&
    parsed > 0
    ? parsed
    : fallback;
}

function fullCostGuardConfigured() {
  return Boolean(
    String(
      process.env.OPENAI_API_KEY ||
      '',
    ).trim(),
  ) &&
    positiveNumber(
      process.env
        .ASK_AGENTPRO_GHS_PER_USD,
      null,
    ) !== null;
}

function calculateOpenAICostGhs(
  usage,
) {
  const ghsPerUsd =
    positiveNumber(
      process.env
        .ASK_AGENTPRO_GHS_PER_USD,
      null,
    );

  if (ghsPerUsd === null) {
    throw serviceError(
      'Full-mode cost conversion is not configured',
      503,
      'ASK_AGENTPRO_COST_GUARD_UNCONFIGURED',
    );
  }

  const inputRate =
    positiveNumber(
      process.env
        .ASK_AGENTPRO_OPENAI_INPUT_USD_PER_MILLION,
      0.20,
    );

  const cachedRate =
    positiveNumber(
      process.env
        .ASK_AGENTPRO_OPENAI_CACHED_INPUT_USD_PER_MILLION,
      0.02,
    );

  const outputRate =
    positiveNumber(
      process.env
        .ASK_AGENTPRO_OPENAI_OUTPUT_USD_PER_MILLION,
      1.20,
    );

  const input =
    Math.max(
      0,
      Number(
        usage?.inputTokens || 0,
      ),
    );

  const cached =
    Math.min(
      input,
      Math.max(
        0,
        Number(
          usage?.cachedInputTokens ||
          0,
        ),
      ),
    );

  const output =
    Math.max(
      0,
      Number(
        usage?.outputTokens || 0,
      ),
    );

  const uncached =
    input - cached;

  const usd =
    (
      uncached * inputRate +
      cached * cachedRate +
      output * outputRate
    ) /
    1000000;

  return Number(
    (usd * ghsPerUsd)
      .toFixed(6),
  );
}

function emptyUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
  };
}

function copyUsage(usage) {
  return {
    inputTokens:
      Number(
        usage?.inputTokens || 0,
      ),
    outputTokens:
      Number(
        usage?.outputTokens || 0,
      ),
    cachedInputTokens:
      Number(
        usage?.cachedInputTokens || 0,
      ),
    totalTokens:
      Number(
        usage?.totalTokens || 0,
      ),
  };
}

function withOpenAIUsage(
  error,
  usage,
) {
  error.askAgentProUsage =
    copyUsage(usage);

  return error;
}

function mergeUsage(
  first,
  second,
) {
  return {
    inputTokens:
      Number(
        first?.inputTokens || 0,
      ) +
      Number(
        second?.inputTokens || 0,
      ),

    outputTokens:
      Number(
        first?.outputTokens || 0,
      ) +
      Number(
        second?.outputTokens || 0,
      ),

    cachedInputTokens:
      Number(
        first?.cachedInputTokens || 0,
      ) +
      Number(
        second?.cachedInputTokens || 0,
      ),

    totalTokens:
      Number(
        first?.totalTokens || 0,
      ) +
      Number(
        second?.totalTokens || 0,
      ),
  };
}

function addOpenAIUsage(
  aggregate,
  response,
) {
  const usage =
    response?.usage || {};

  const input =
    Number(
      usage.input_tokens || 0,
    );

  const output =
    Number(
      usage.output_tokens || 0,
    );

  const cached =
    Number(
      usage
        ?.input_tokens_details
        ?.cached_tokens || 0,
    );

  aggregate.inputTokens += input;
  aggregate.outputTokens += output;
  aggregate.cachedInputTokens +=
    cached;
  aggregate.totalTokens +=
    Number(
      usage.total_tokens ||
      input + output,
    );
}

function extractOutputText(response) {
  const texts = [];

  for (
    const item
    of response?.output || []
  ) {
    if (
      item?.type !== 'message' ||
      !Array.isArray(item.content)
    ) {
      continue;
    }

    for (
      const content
      of item.content
    ) {
      if (
        content?.type ===
          'output_text' &&
        typeof content.text ===
          'string'
      ) {
        texts.push(
          content.text,
        );
      }
    }
  }

  return texts
    .join('\n')
    .trim();
}

async function callOpenAI(body) {
  const apiKey =
    String(
      process.env.OPENAI_API_KEY ||
      '',
    ).trim();

  if (!apiKey) {
    throw serviceError(
      'OpenAI is not configured',
      503,
      'OPENAI_NOT_CONFIGURED',
    );
  }

  const abortController =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        abortController.abort(),
      OPENAI_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        OPENAI_RESPONSES_URL,
        {
          method: 'POST',
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
            'Content-Type':
              'application/json',
          },
          body:
            JSON.stringify(body),
          signal:
            abortController.signal,
        },
      );

    const raw =
      await response.text();

    let data = {};

    try {
      data =
        raw
          ? JSON.parse(raw)
          : {};
    } catch (_) {
      data = {};
    }

    if (!response.ok) {
      throw serviceError(
        'OpenAI request failed',
        response.status,
        data?.error?.code ||
          'OPENAI_REQUEST_FAILED',
      );
    }

    return data;
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw serviceError(
        'OpenAI request timed out',
        504,
        'OPENAI_TIMEOUT',
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function auditDiagnosticRead({
  req,
  conversationId,
  toolName,
}) {
  await auditLog({
    userId:
      req.user.id,
    companyId:
      req.user.company_id ||
      null,
    action:
      'ASK_AGENTPRO_DIAGNOSTIC_READ',
    entityType:
      'ai_conversation',
    entityId:
      conversationId,
    newValues: {
      tool: toolName,
    },
    ipAddress:
      req.ip,
    userAgent:
      req.get('user-agent'),
    requestId:
      req.id || null,
  });
}

async function runFull({
  req,
  conversationId,
  history,
  message,
  accountMode,
}) {
  let input = [
    ...history.map(
      (entry) => ({
        role:
          entry.role,
        content:
          redactSensitiveText(
            entry.content,
          ),
      }),
    ),
    {
      role: 'user',
      content:
        redactSensitiveText(
          message,
        ),
    },
  ];

  const usage =
    emptyUsage();

  let toolCalls = 0;

  for (
    let round = 0;
    round < MAX_TOOL_ROUNDS;
    round += 1
  ) {
    let response;

    try {
      response =
        await callOpenAI({
          model:
            OPENAI_MODEL,
          instructions:
            `${FULL_SYSTEM_PROMPT}\n\nSelected account mode: ${accountMode}.`,
          input,
          tools:
            getDiagnosticToolsForMode(
              accountMode,
            ),
          tool_choice: 'auto',
          parallel_tool_calls:
            false,
          store: false,
          max_output_tokens: 500,
        });
    } catch (error) {
      throw withOpenAIUsage(
        error,
        usage,
      );
    }

    addOpenAIUsage(
      usage,
      response,
    );

    const calls =
      (
        response?.output || []
      ).filter(
        (item) =>
          item?.type ===
          'function_call',
      );

    if (calls.length === 0) {
      const answer =
        extractOutputText(
          response,
        );

      if (!answer) {
        throw withOpenAIUsage(
          serviceError(
            'Full mode returned no answer',
            502,
            'OPENAI_EMPTY_RESPONSE',
          ),
          usage,
        );
      }

      return {
        mode: 'full',
        provider: 'openai',
        message: answer,
        usage,
      };
    }

    input = [
      ...input,
      ...(response.output || []),
    ];

    for (const call of calls) {
      toolCalls += 1;

      if (
        toolCalls >
        MAX_TOOL_CALLS
      ) {
        throw withOpenAIUsage(
          serviceError(
            'Diagnostic tool limit reached',
            502,
            'ASK_AGENTPRO_TOOL_LIMIT',
          ),
          usage,
        );
      }

      let args = {};

      try {
        args =
          JSON.parse(
            call.arguments ||
            '{}',
          );
      } catch (_) {
        args = {};
      }

      let output;

      try {
        output =
          await executeDiagnosticTool({
            name:
              call.name,
            args,
            user:
              req.user,
            accountMode,
          });
      } catch (error) {
        logger.warn(
          'Ask AgentPro diagnostic failed',
          {
            tool:
              call.name,
            message:
              error?.message ||
              'unknown',
          },
        );

        output = {
          ok: false,
          error:
            'This diagnostic is temporarily unavailable.',
        };
      }

      await auditDiagnosticRead({
        req,
        conversationId,
        toolName:
          call.name,
      });

      input.push({
        type:
          'function_call_output',
        call_id:
          call.call_id,
        output:
          JSON.stringify(output),
      });
    }
  }

  throw withOpenAIUsage(
    serviceError(
      'Full mode did not complete',
      502,
      'ASK_AGENTPRO_MAX_ROUNDS',
    ),
    usage,
  );
}

function localBasicFallback(
  reason,
) {
  if (
    reason !==
    'basic_question'
  ) {
    return (
      'Live account diagnostics are not available for this request right now. ' +
      'You can still check Transaction History, Subscription, Business Hub, ' +
      'or How to Use the App. If the issue remains unresolved, contact ' +
      'support@intellicoresystem.com.'
    );
  }

  return (
    'Basic support is temporarily unavailable. ' +
    'Please open Support → How to Use the App for step-by-step guidance, ' +
    'or contact support@intellicoresystem.com.'
  );
}

async function runBasic({
  message,
  reason,
}) {
  const safeMessage =
    sanitizeForBasicModel(
      message,
    );

  const apiKey =
    String(
      process.env
        .ASK_AGENTPRO_BASIC_GEMINI_API_KEY ||
      '',
    ).trim();

  if (!apiKey) {
    return {
      mode: 'basic',
      provider: 'local_help',
      message:
        localBasicFallback(reason),
      usage:
        emptyUsage(),
    };
  }

  try {
    const ai =
      new GoogleGenAI({
        apiKey,
      });

    const response =
      await ai.models
        .generateContent({
          model: BASIC_MODEL,
          contents: safeMessage,
          config: {
            systemInstruction:
              BASIC_SYSTEM_PROMPT +
              (
                reason ===
                'basic_question'
                  ? ''
                  : '\n\nLive diagnostics are unavailable for this turn. Give only generic guidance.'
              ),
          },
        });

    const answer =
      String(
        response?.text || '',
      ).trim();

    const metadata =
      response?.usageMetadata || {};

    return {
      mode: 'basic',
      provider:
        'gemini_free',
      message:
        answer ||
        localBasicFallback(
          reason,
        ),
      usage: {
        inputTokens:
          Number(
            metadata
              .promptTokenCount ||
            0,
          ),
        outputTokens:
          Number(
            metadata
              .candidatesTokenCount ||
            0,
          ),
        cachedInputTokens: 0,
        totalTokens:
          Number(
            metadata
              .totalTokenCount ||
            0,
          ),
      },
    };
  } catch (error) {
    logger.warn(
      'Ask AgentPro Basic provider unavailable',
      {
        message:
          error?.message ||
          'unknown',
      },
    );

    return {
      mode: 'basic',
      provider: 'local_help',
      message:
        localBasicFallback(reason),
      usage:
        emptyUsage(),
    };
  }
}

async function basicResult({
  scope,
  message,
  reason,
}) {
  const result =
    await runBasic({
      message,
      reason,
    });

  await recordBasicRequest(
    scope,
  );

  const summary =
    await getUsageSummary(
      scope,
    );

  return {
    ...result,
    costGhs: 0,
    allowance: summary,
    diagnosticsAvailable:
      fullCostGuardConfigured() &&
      summary.remaining_ghs > 0,
  };
}

async function answerAskAgentPro({
  req,
  conversationId,
  history,
  message,
  accountMode,
}) {
  const scope =
    await resolveUsageScope(
      req.user,
      accountMode,
    );

  if (!scope.ok) {
    throw serviceError(
      'This Ask AgentPro mode is not available for the signed-in account.',
      403,
      'ASK_AGENTPRO_MODE_NOT_AVAILABLE',
    );
  }

  const requestedMode =
    classifyRequest(message);

  if (
    requestedMode ===
    'basic'
  ) {
    return basicResult({
      scope,
      message,
      reason:
        'basic_question',
    });
  }

  if (
    !fullCostGuardConfigured()
  ) {
    return basicResult({
      scope,
      message,
      reason:
        'full_unconfigured',
    });
  }

  const started =
    await startFullRequest(
      scope,
    );

  if (!started.allowed) {
    return basicResult({
      scope,
      message,
      reason:
        started.reason,
    });
  }

  try {
    const result =
      await runFull({
        req,
        conversationId,
        history,
        message,
        accountMode,
      });

    const costGhs =
      calculateOpenAICostGhs(
        result.usage,
      );

    const settlement =
      await settleFullRequest({
        reservation:
          started.reservation,
        costGhs,
      });

    return {
      ...result,
      costGhs,
      allowance:
        settlement.summary,
      diagnosticsAvailable:
        settlement.summary
          .remaining_ghs > 0,
    };
  } catch (error) {
    const partialUsage =
      copyUsage(
        error?.askAgentProUsage,
      );

    const hasPaidUsage =
      partialUsage.inputTokens > 0 ||
      partialUsage.outputTokens > 0 ||
      partialUsage.totalTokens > 0;

    let partialCostGhs = 0;

    if (hasPaidUsage) {
      partialCostGhs =
        calculateOpenAICostGhs(
          partialUsage,
        );

      await settleFullRequest({
        reservation:
          started.reservation,
        costGhs:
          partialCostGhs,
      });
    } else {
      await releaseFullRequest(
        started.reservation,
      );
    }

    logger.warn(
      'Ask AgentPro Full mode fell back to Basic',
      {
        code:
          error?.code || null,
        status:
          error?.status || null,
        partialPaidUsage:
          hasPaidUsage,
      },
    );

    const fallback =
      await basicResult({
        scope,
        message,
        reason:
          'full_provider_fallback',
      });

    if (!hasPaidUsage) {
      return fallback;
    }

    return {
      ...fallback,
      provider:
        `openai+${fallback.provider}`,
      costGhs:
        partialCostGhs,
      usage:
        mergeUsage(
          partialUsage,
          fallback.usage,
        ),
    };
  }
}

module.exports = {
  answerAskAgentPro,
  redactSensitiveText,
  sanitizeForBasicModel,
  classifyRequest,
  calculateOpenAICostGhs,
  fullCostGuardConfigured,
};
