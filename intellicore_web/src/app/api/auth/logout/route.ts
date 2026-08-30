import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authCookies } from "@/features/auth/config";
import {
  backendAuthRequest,
  refreshAccessToken,
} from "@/features/auth/server/backend";
import { clearSessionCookies } from "@/features/auth/server/cookies";
import { validateAuthMutation } from "@/features/auth/server/request-security";

export async function POST(request: NextRequest) {
  const rejected = validateAuthMutation(request);

  if (rejected) {
    return rejected;
  }

  const store = await cookies();

  let accessToken = store.get(authCookies.access)?.value;

  const refreshToken = store.get(authCookies.refresh)?.value;

  const userAgent = request.headers.get("user-agent");

  try {
    if (!accessToken && refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken, userAgent);

      if (refreshed.ok) {
        accessToken = refreshed.accessToken;
      } else if (refreshed.status >= 500) {
        const response = NextResponse.json(
          {
            success: false,
            code: "LOGOUT_REVOCATION_UNCONFIRMED",
            message:
              "Signed out on this device, but server session revocation could not be confirmed.",
          },
          {
            status: 503,
          },
        );

        clearSessionCookies(response);

        return response;
      }
    }

    if (accessToken) {
      const result = await backendAuthRequest("/logout", {
        method: "POST",
        body: {},
        accessToken,
        userAgent,
      });

      if (!result.ok && result.status !== 401) {
        const response = NextResponse.json(
          {
            success: false,
            code: "LOGOUT_REVOCATION_UNCONFIRMED",
            message:
              "Signed out on this device, but server session revocation could not be confirmed.",
          },
          {
            status: 503,
          },
        );

        clearSessionCookies(response);

        return response;
      }
    }

    const response = NextResponse.json({
      success: true,
      message: "Signed out successfully.",
    });

    clearSessionCookies(response);

    return response;
  } catch {
    const response = NextResponse.json(
      {
        success: false,
        code: "LOGOUT_REVOCATION_UNCONFIRMED",
        message:
          "Signed out on this device, but server session revocation could not be confirmed.",
      },
      {
        status: 503,
      },
    );

    clearSessionCookies(response);

    return response;
  }
}
