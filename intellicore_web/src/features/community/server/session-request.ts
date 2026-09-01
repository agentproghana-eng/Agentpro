import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authCookies } from "@/features/auth/config";
import { refreshAccessToken } from "@/features/auth/server/backend";
import {
  clearSessionCookies,
  setAccessCookie,
} from "@/features/auth/server/cookies";
import { backendCommunityRequest } from "@/features/community/server/backend";

type CommunityRequestResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  refreshedAccessToken?: string;
  clearSession?: boolean;
};

export async function authenticatedCommunityRequest(
  request: NextRequest,
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
  } = {},
): Promise<CommunityRequestResult> {
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
    const first = await backendCommunityRequest(path, {
      method: options.method,
      body: options.body,
      accessToken,
      userAgent,
    });

    if (first.status !== 401) {
      return first as CommunityRequestResult;
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
        ...(refreshed.code ? { code: refreshed.code } : {}),
        message: refreshed.message,
      },
    };
  }

  accessToken = refreshed.accessToken;

  const retry = await backendCommunityRequest(path, {
    method: options.method,
    body: options.body,
    accessToken,
    userAgent,
  });

  return {
    ...(retry as CommunityRequestResult),
    refreshedAccessToken:
      retry.status === 401 ? undefined : refreshed.accessToken,
    clearSession: retry.status === 401,
  };
}

export function communityResponse(result: CommunityRequestResult) {
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
