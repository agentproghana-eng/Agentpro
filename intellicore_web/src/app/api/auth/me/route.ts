import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authCookies } from "@/features/auth/config";
import {
  backendAuthRequest,
  refreshAccessToken,
  sanitizeBackendValue,
} from "@/features/auth/server/backend";
import {
  clearSessionCookies,
  setAccessCookie,
} from "@/features/auth/server/cookies";

export async function GET(request: NextRequest) {
  const store = await cookies();

  let accessToken = store.get(authCookies.access)?.value;

  const refreshToken = store.get(authCookies.refresh)?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json(
      {
        success: false,
        code: "SESSION_REQUIRED",
        message: "Please sign in.",
      },
      {
        status: 401,
      },
    );
  }

  const userAgent = request.headers.get("user-agent");

  let refreshedToken: string | null = null;

  try {
    if (accessToken) {
      const result = await backendAuthRequest("/me", {
        accessToken,
        userAgent,
      });

      if (result.ok) {
        return NextResponse.json(sanitizeBackendValue(result.body));
      }

      if (result.status !== 401) {
        return NextResponse.json(sanitizeBackendValue(result.body), {
          status: result.status,
        });
      }
    }

    if (!refreshToken) {
      const response = NextResponse.json(
        {
          success: false,
          code: "SESSION_EXPIRED",
          message: "Please sign in again.",
        },
        {
          status: 401,
        },
      );

      clearSessionCookies(response);

      return response;
    }

    const refreshed = await refreshAccessToken(refreshToken, userAgent);

    if (!refreshed.ok) {
      const response = NextResponse.json(
        {
          success: false,
          ...(refreshed.code
            ? {
                code: refreshed.code,
              }
            : {}),
          message: refreshed.message,
        },
        {
          status: refreshed.status,
        },
      );

      if (refreshed.status === 401) {
        clearSessionCookies(response);
      }

      return response;
    }

    refreshedToken = refreshed.accessToken;

    accessToken = refreshed.accessToken;

    const retry = await backendAuthRequest("/me", {
      accessToken,
      userAgent,
    });

    const response = NextResponse.json(sanitizeBackendValue(retry.body), {
      status: retry.status,
    });

    if (retry.ok && refreshedToken) {
      setAccessCookie(response, refreshedToken);
    }

    if (retry.status === 401) {
      clearSessionCookies(response);
    }

    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "AUTH_SERVICE_UNAVAILABLE",
        message: "Authentication is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
