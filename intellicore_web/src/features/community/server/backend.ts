import type { BackendEnvelope } from "@/features/auth/types";

const COMMUNITY_TIMEOUT_MS = 15_000;

function backendBase() {
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

function communityEndpoint(path: string) {
  const base = backendBase();

  if (base.endsWith("/api/v1")) {
    return `${base}${path}`;
  }

  return `${base}/api/v1${path}`;
}

async function parseBackendBody(response: Response): Promise<BackendEnvelope> {
  const type = response.headers.get("content-type") ?? "";

  if (!type.includes("application/json")) {
    return {
      success: false,
      message: response.ok
        ? "Unexpected Community response."
        : "Community service request failed.",
    };
  }

  try {
    const body = await response.json();

    if (typeof body === "object" && body !== null) {
      return body as BackendEnvelope;
    }
  } catch {
    // Fall through.
  }

  return {
    success: false,
    message: "Community service returned an invalid response.",
  };
}

export async function backendCommunityRequest(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    accessToken: string;
    userAgent?: string | null;
  },
) {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${options.accessToken}`,
  });

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (options.userAgent) {
    headers.set("user-agent", options.userAgent.slice(0, 500));
  }

  const response = await fetch(communityEndpoint(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(COMMUNITY_TIMEOUT_MS),
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await parseBackendBody(response),
  };
}
