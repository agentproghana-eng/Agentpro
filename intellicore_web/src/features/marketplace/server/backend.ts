import { applyWebRateLimitIdentity } from "@/features/security/server/rate-limit-identity";

const MARKETPLACE_TIMEOUT_MS = 15_000;

export type MarketplaceBackendEnvelope = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: unknown;
  meta?: unknown;
  [key: string]: unknown;
};

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

function marketplaceEndpoint(path: string): string {
  const base = getBackendBase();

  if (base.endsWith("/api/v1/marketplace")) {
    return `${base}${path}`;
  }

  if (base.endsWith("/api/v1")) {
    return `${base}/marketplace${path}`;
  }

  return `${base}/api/v1/marketplace${path}`;
}

async function parseBackendBody(
  response: Response,
): Promise<MarketplaceBackendEnvelope> {
  const type = response.headers.get("content-type") ?? "";

  if (!type.includes("application/json")) {
    return {
      success: false,
      message: response.ok
        ? "Unexpected Marketplace response."
        : "Marketplace service request failed.",
    };
  }

  try {
    const body = await response.json();

    if (typeof body === "object" && body !== null) {
      return body as MarketplaceBackendEnvelope;
    }
  } catch {
    // Fall through to the generic response.
  }

  return {
    success: false,
    message: "Marketplace service returned an invalid response.",
  };
}

export async function backendMarketplaceRequest(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    accessToken?: string;
    userAgent?: string | null;
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

  await applyWebRateLimitIdentity(headers);

  const response = await fetch(marketplaceEndpoint(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(MARKETPLACE_TIMEOUT_MS),
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await parseBackendBody(response),
  };
}
