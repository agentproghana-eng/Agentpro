'use strict';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';

function extractHostname(baseUrl) {
  const match = String(baseUrl).match(
    /^https?:\/\/(\[[^\]]+\]|[^/:?#]+)(?::\d+)?(?:[/?#]|$)/i
  );

  if (!match) {
    throw new Error(
      `Invalid AGENTPRO_BASE_URL: ${baseUrl}`
    );
  }

  return match[1]
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .toLowerCase();
}

export function loadConfig() {
  const baseUrl = String(
    __ENV.AGENTPRO_BASE_URL || DEFAULT_BASE_URL
  ).replace(/\/+$/, '');

  const destructive =
    String(__ENV.AGENTPRO_ALLOW_DESTRUCTIVE || '')
      .trim()
      .toLowerCase() === 'true';

  const productionHosts = new Set([
    'agentpro-api-izi3.onrender.com',
  ]);

  const hostname = extractHostname(baseUrl);

  if (destructive && productionHosts.has(hostname)) {
    throw new Error(
      'Destructive AgentPro load tests are forbidden against production.'
    );
  }

  return {
    baseUrl,
    destructive,
    hostname,
  };
}
