import { createHash } from "node:crypto";

import type { BackendEnvelope, RefreshResult } from "@/features/auth/types";
import { applyWebRateLimitIdentity } from "@/features/security/server/rate-limit-identity";

const AUTH_TIMEOUT_MS = 15_000;

function getBackendBase(): string {
  const raw = process.env.AGENTPRO_API_BASE_URL?.trim();

  if (!raw) {
    throw new Error("AGENTPRO_API_BASE_URL is not configured.");
  }

  const parsed = new URL(raw);

  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("Production AgentPro API must use HTTPS.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Unsupported AgentPro API protocol.");
  }

  return raw.replace(/\/+$/, "");
}

function authEndpoint(path: string): string {
  const base = getBackendBase();

  if (base.endsWith("/api/v1/auth")) {
    return `${base}${path}`;
  }

  if (base.endsWith("/api/v1")) {
    return `${base}/auth${path}`;
  }

  return `${base}/api/v1/auth${path}`;
}

async function parseBackendBody(response: Response): Promise<BackendEnvelope> {
  const type = response.headers.get("content-type") ?? "";

  if (!type.includes("application/json")) {
    return {
      success: false,
      message: response.ok
        ? "Unexpected authentication response."
        : "Authentication service request failed.",
    };
  }

  try {
    const body = await response.json();

    if (typeof body === "object" && body !== null) {
      return body as BackendEnvelope;
    }
  } catch {
    // Fall through to the generic response.
  }

  return {
    success: false,
    message: "Authentication service returned an invalid response.",
  };
}

export async function backendAuthRequest(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    accessToken?: string;
    userAgent?: string | null;
    rateLimitKeyMaterial?: string;
  } = {},
) {
  const headers = new Headers({
    accept: "application/json",
  });

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (options.accessToken) {
    headers.set("authorization", `Bearer ${options.accessToken}`);
  }

  if (options.userAgent) {
    headers.set("user-agent", options.userAgent.slice(0, 500));
  }

  await applyWebRateLimitIdentity(headers, {
    serverKeyMaterial: options.rateLimitKeyMaterial,
  });

  const response = await fetch(authEndpoint(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });

  const body = await parseBackendBody(response);

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

function getDataRecord(body: BackendEnvelope): Record<string, unknown> | null {
  if (
    typeof body.data !== "object" ||
    body.data === null ||
    Array.isArray(body.data)
  ) {
    return null;
  }

  return body.data as Record<string, unknown>;
}

export function extractSessionTokens(body: BackendEnvelope) {
  const data = getDataRecord(body);

  const accessToken =
    typeof data?.access_token === "string" ? data.access_token : null;

  const refreshToken =
    typeof data?.refresh_token === "string" ? data.refresh_token : null;

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

export function extractUser(body: BackendEnvelope): unknown {
  const data = getDataRecord(body);

  return data?.user ?? null;
}

export function extractMfaResponse(body: BackendEnvelope) {
  const data = getDataRecord(body);

  const challengeToken =
    typeof data?.challenge_token === "string" ? data.challenge_token : null;

  if (!challengeToken) {
    return null;
  }

  let enrollment:
    | {
        secret: string;
        otpauth_uri: string;
      }
    | undefined;

  if (
    typeof data?.enrollment === "object" &&
    data.enrollment !== null &&
    !Array.isArray(data.enrollment)
  ) {
    const value = data.enrollment as Record<string, unknown>;

    if (
      typeof value.secret === "string" &&
      typeof value.otpauth_uri === "string"
    ) {
      enrollment = {
        secret: value.secret,
        otpauth_uri: value.otpauth_uri,
      };
    }
  }

  return {
    challenge_token: challengeToken,
    mfa_required: data?.mfa_required === true,
    mfa_enrollment_required: data?.mfa_enrollment_required === true,
    ...(enrollment ? { enrollment } : {}),
  };
}

export function extractRecoveryCodes(
  body: BackendEnvelope,
): string[] | undefined {
  const data = getDataRecord(body);

  if (!Array.isArray(data?.recovery_codes)) {
    return undefined;
  }

  const values = data.recovery_codes.filter(
    (value): value is string => typeof value === "string",
  );

  return values.length > 0 ? values : undefined;
}

const refreshFlights = new Map<string, Promise<RefreshResult>>();

function refreshFlightKey(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

async function performRefreshAccessToken(
  refreshToken: string,
  userAgent?: string | null,
): Promise<RefreshResult> {
  try {
    const result = await backendAuthRequest("/refresh", {
      method: "POST",
      body: {
        refresh_token: refreshToken,
      },
      userAgent,
      rateLimitKeyMaterial: refreshToken,
    });

    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        code:
          typeof result.body.code === "string" ? result.body.code : undefined,
        message:
          typeof result.body.message === "string"
            ? result.body.message
            : "Session refresh failed.",
      };
    }

    const data = getDataRecord(result.body);

    const accessToken =
      typeof data?.access_token === "string" ? data.access_token : null;

    if (!accessToken) {
      return {
        ok: false,
        status: 502,
        message: "Authentication service returned an invalid refresh response.",
      };
    }

    return {
      ok: true,
      accessToken,
    };
  } catch {
    return {
      ok: false,
      status: 503,
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "Authentication is temporarily unavailable.",
    };
  }
}

export function refreshAccessToken(
  refreshToken: string,
  userAgent?: string | null,
): Promise<RefreshResult> {
  const key = refreshFlightKey(refreshToken);
  const existing = refreshFlights.get(key);

  if (existing) {
    return existing;
  }

  const flight = performRefreshAccessToken(refreshToken, userAgent).finally(
    () => {
      if (refreshFlights.get(key) === flight) {
        refreshFlights.delete(key);
      }
    },
  );

  refreshFlights.set(key, flight);

  return flight;
}

const sensitiveKeys = new Set([
  "access_token",
  "refresh_token",
  "password",
  "password_hash",
  "token_hash",
  "token_digest",
  "mfa_totp_secret_enc",
  "mfa_recovery_code_hashes",
]);

export function sanitizeBackendValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeBackendValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitiveKeys.has(key))
        .map(([key, child]) => [key, sanitizeBackendValue(child)]),
    );
  }

  return value;
}

export function clientErrorBody(body: BackendEnvelope) {
  return {
    success: false,
    ...(typeof body.code === "string" ? { code: body.code } : {}),
    message:
      typeof body.message === "string"
        ? body.message
        : "Authentication request failed.",
  };
}
