import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authCookies } from "@/features/auth/config";
import { refreshAccessToken } from "@/features/auth/server/backend";
import {
  clearSessionCookies,
  setAccessCookie,
} from "@/features/auth/server/cookies";
import { validateAuthMutation } from "@/features/auth/server/request-security";

export async function POST(request: NextRequest) {
  const rejected = validateAuthMutation(request);

  if (rejected) {
    return rejected;
  }

  const store = await cookies();

  const refreshToken = store.get(authCookies.refresh)?.value;

  if (!refreshToken) {
    const response = NextResponse.json(
      {
        success: false,
        code: "SESSION_REQUIRED",
        message: "Please sign in.",
      },
      {
        status: 401,
      },
    );

    clearSessionCookies(response);

    return response;
  }

  const refreshed = await refreshAccessToken(
    refreshToken,
    request.headers.get("user-agent"),
  );

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

  const response = NextResponse.json({
    success: true,
  });

  setAccessCookie(response, refreshed.accessToken);

  return response;
}
