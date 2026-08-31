import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authCookies } from "@/features/auth/config";
import { refreshAccessToken } from "@/features/auth/server/backend";
import {
  clearSessionCookies,
  setAccessCookie,
} from "@/features/auth/server/cookies";
import {
  backendMarketplaceRequest,
  type MarketplaceBackendEnvelope,
} from "@/features/marketplace/server/backend";

type MarketplaceMethod = "GET" | "POST" | "DELETE";

type MarketplaceRequestResult = {
  ok: boolean;
  status: number;
  body: MarketplaceBackendEnvelope;
  refreshedAccessToken?: string;
  clearSession?: boolean;
};

export async function publicMarketplaceRequest(
  request: NextRequest,
  path: string,
): Promise<MarketplaceRequestResult> {
  const store = await cookies();

  const accessToken = store.get(authCookies.access)?.value;

  const refreshToken = store.get(authCookies.refresh)?.value;

  const userAgent = request.headers.get("user-agent");

  if (!accessToken && !refreshToken) {
    return backendMarketplaceRequest(path, {
      userAgent,
    });
  }

  if (accessToken) {
    const first = await backendMarketplaceRequest(path, {
      accessToken,
      userAgent,
    });

    if (first.status !== 401) {
      return first;
    }
  }

  if (!refreshToken) {
    return backendMarketplaceRequest(path, {
      userAgent,
    });
  }

  const refreshed = await refreshAccessToken(refreshToken, userAgent);

  if (!refreshed.ok) {
    if (refreshed.status === 401) {
      return {
        ...(await backendMarketplaceRequest(path, {
          userAgent,
        })),
        clearSession: true,
      };
    }

    return {
      ok: false,
      status: refreshed.status,
      body: {
        success: false,
        code: refreshed.code,
        message: refreshed.message,
      },
    };
  }

  const retry = await backendMarketplaceRequest(path, {
    accessToken: refreshed.accessToken,
    userAgent,
  });

  return {
    ...retry,
    refreshedAccessToken:
      retry.status === 401 ? undefined : refreshed.accessToken,
    clearSession: retry.status === 401,
  };
}

export async function authenticatedMarketplaceRequest(
  request: NextRequest,
  path: string,
  options: {
    method?: MarketplaceMethod;
    body?: unknown;
  } = {},
): Promise<MarketplaceRequestResult> {
  const store = await cookies();

  let accessToken = store.get(authCookies.access)?.value;

  const refreshToken = store.get(authCookies.refresh)?.value;

  const userAgent = request.headers.get("user-agent");

  if (!accessToken && !refreshToken) {
    return {
      ok: false,
      status: 401,
      body: {
        success: false,
        code: "SESSION_REQUIRED",
        message: "Please sign in.",
      },
    };
  }

  if (accessToken) {
    const first = await backendMarketplaceRequest(path, {
      method: options.method,
      body: options.body,
      accessToken,
      userAgent,
    });

    if (first.status !== 401) {
      return first;
    }
  }

  if (!refreshToken) {
    return {
      ok: false,
      status: 401,
      clearSession: true,
      body: {
        success: false,
        code: "SESSION_EXPIRED",
        message: "Please sign in again.",
      },
    };
  }

  const refreshed = await refreshAccessToken(refreshToken, userAgent);

  if (!refreshed.ok) {
    return {
      ok: false,
      status: refreshed.status,
      clearSession: refreshed.status === 401,
      body: {
        success: false,
        ...(refreshed.code
          ? {
              code: refreshed.code,
            }
          : {}),
        message: refreshed.message,
      },
    };
  }

  accessToken = refreshed.accessToken;

  const retry = await backendMarketplaceRequest(path, {
    method: options.method,
    body: options.body,
    accessToken,
    userAgent,
  });

  return {
    ...retry,
    refreshedAccessToken:
      retry.status === 401 ? undefined : refreshed.accessToken,
    clearSession: retry.status === 401,
  };
}

export function marketplaceResponse(result: MarketplaceRequestResult) {
  const response = NextResponse.json(result.body, {
    status: result.status,
  });

  if (result.refreshedAccessToken) {
    setAccessCookie(response, result.refreshedAccessToken);
  }

  if (result.clearSession) {
    clearSessionCookies(response);
  }

  return response;
}
