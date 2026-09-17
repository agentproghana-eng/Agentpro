import { applyWebRateLimitIdentity } from "@/features/security/server/rate-limit-identity";
import type { BusinessDashboardResponse } from "@/features/business/types";

const BUSINESS_TIMEOUT_MS = 15_000;

function backendBase() {
  const raw = process.env.AGENTPRO_API_BASE_URL?.trim();

  if (!raw) {
    throw new Error("AGENTPRO_API_BASE_URL is not configured.");
  }

  const parsed = new URL(raw);

  if (
    process.env.NODE_ENV === "production" &&
    parsed.protocol !== "https:"
  ) {
    throw new Error("Production AgentPro API must use HTTPS.");
  }

  if (
    parsed.protocol !== "https:" &&
    parsed.protocol !== "http:"
  ) {
    throw new Error("Unsupported AgentPro API protocol.");
  }

  return raw.replace(/\/+$/, "");
}

function reportsEndpoint(path: string) {
  const base = backendBase();

  if (base.endsWith("/api/v1/reports")) {
    return `${base}${path}`;
  }

  if (base.endsWith("/api/v1")) {
    return `${base}/reports${path}`;
  }

  return `${base}/api/v1/reports${path}`;
}

async function parseResponse(
  response: Response,
): Promise<BusinessDashboardResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {
      success: false,
      message: response.ok
        ? "AgentPro returned an unexpected business response."
        : "Business data could not be loaded.",
    };
  }

  try {
    const value = await response.json();

    if (typeof value === "object" && value !== null) {
      return value as BusinessDashboardResponse;
    }
  } catch {
    // Fall through.
  }

  return {
    success: false,
    message: "AgentPro returned an invalid business response.",
  };
}

export async function backendBusinessDashboardRequest(options: {
  accessToken: string;
  userAgent?: string | null;
  rateLimitKeyMaterial?: string;
}) {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${options.accessToken}`,
  });

  if (options.userAgent) {
    headers.set(
      "user-agent",
      options.userAgent.slice(0, 500),
    );
  }

  await applyWebRateLimitIdentity(headers, {
    serverKeyMaterial: options.rateLimitKeyMaterial,
  });

  const response = await fetch(
    reportsEndpoint("/dashboard"),
    {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(BUSINESS_TIMEOUT_MS),
    },
  );

  return {
    ok: response.ok,
    status: response.status,
    body: await parseResponse(response),
  };
}
