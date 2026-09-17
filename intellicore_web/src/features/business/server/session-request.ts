import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authCookies } from "@/features/auth/config";
import {
  refreshAccessToken,
  sanitizeBackendValue,
} from "@/features/auth/server/backend";
import {
  clearSessionCookies,
  setAccessCookie,
} from "@/features/auth/server/cookies";
import { backendBusinessDashboardRequest } from "@/features/business/server/backend";
import type { BusinessDashboardResponse } from "@/features/business/types";

type Result = {
  ok: boolean;
  status: number;
  body: BusinessDashboardResponse;
  refreshedAccessToken?: string;
  clearSession?: boolean;
};

export async function authenticatedBusinessDashboardRequest(
  request: NextRequest,
): Promise<Result> {
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
    const first = await backendBusinessDashboardRequest({
      accessToken,
      userAgent,
      rateLimitKeyMaterial: refreshToken,
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

  const refreshed = await refreshAccessToken(
    refreshToken,
    userAgent,
  );

  if (!refreshed.ok) {
    return {
      ok: false,
      status: refreshed.status,
      clearSession: refreshed.status === 401,
      body: {
        success: false,
        ...(refreshed.code
          ? { code: refreshed.code }
          : {}),
        message: refreshed.message,
      },
    };
  }

  accessToken = refreshed.accessToken;

  const retry = await backendBusinessDashboardRequest({
    accessToken,
    userAgent,
    rateLimitKeyMaterial: refreshToken,
  });

  return {
    ...retry,
    refreshedAccessToken:
      retry.status === 401
        ? undefined
        : refreshed.accessToken,
    clearSession: retry.status === 401,
  };
}

export function businessDashboardResponse(result: Result) {
  const response = NextResponse.json(
    sanitizeBackendValue(result.body),
    {
      status: result.status,
    },
  );

  if (result.refreshedAccessToken) {
    setAccessCookie(
      response,
      result.refreshedAccessToken,
    );
  }

  if (result.clearSession) {
    clearSessionCookies(response);
  }

  return response;
}
