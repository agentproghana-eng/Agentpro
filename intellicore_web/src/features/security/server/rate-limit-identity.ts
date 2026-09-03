import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { headers as incomingHeaders } from "next/headers";

const WEB_ID_HEADER = "x-agentpro-web-rate-limit-id";
const WEB_SIGNATURE_HEADER =
  "x-agentpro-web-rate-limit-signature";

const HASH_CONTEXT = "agentpro-web-client:v1:";
const SIGNING_CONTEXT = "agentpro-web-rate-limit:v1:";

type HeaderReader = {
  get(name: string): string | null;
};

function validIp(value: string | null): string | null {
  const candidate = value?.trim() ?? "";

  return isIP(candidate) ? candidate : null;
}

function resolveClientIp(store: HeaderReader): string | null {
  // Render public traffic passes through Cloudflare.
  // CF-Connecting-IP is overwritten by the trusted edge.
  //
  // Do not fall back to X-Forwarded-For here. If the trusted
  // edge identity is absent, safely omit the signed BFF
  // identity and let the API use its ordinary IP fallback.
  return validIp(store.get("cf-connecting-ip"));
}

function sharedSecret(): string | null {
  const value =
    process.env.AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET?.trim() ?? "";

  // Missing configuration must degrade to the backend's
  // ordinary IP limiter, never to an unsigned identity.
  return value.length >= 32 ? value : null;
}

export async function applyWebRateLimitIdentity(
  outgoing: Headers,
): Promise<void> {
  const secret = sharedSecret();

  if (!secret) {
    return;
  }

  const store = await incomingHeaders();
  const clientIp = resolveClientIp(store);

  if (!clientIp) {
    return;
  }

  // The API never receives the visitor's raw IP in these
  // identity headers.
  const identity = createHmac("sha256", secret)
    .update(`${HASH_CONTEXT}${clientIp}`)
    .digest("hex");

  const signature = createHmac("sha256", secret)
    .update(`${SIGNING_CONTEXT}${identity}`)
    .digest("hex");

  outgoing.set(WEB_ID_HEADER, identity);
  outgoing.set(WEB_SIGNATURE_HEADER, signature);
}
