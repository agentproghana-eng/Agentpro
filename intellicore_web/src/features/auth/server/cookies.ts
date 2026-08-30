import { NextResponse } from "next/server";

import { authCookieLifetime, authCookies } from "@/features/auth/config";

function secureCookie() {
  return process.env.NODE_ENV === "production";
}

export function setSessionCookies(
  response: NextResponse,
  tokens: {
    accessToken: string;
    refreshToken: string;
  },
) {
  response.cookies.set(authCookies.access, tokens.accessToken, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: authCookieLifetime.accessSeconds,
  });

  response.cookies.set(authCookies.refresh, tokens.refreshToken, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: authCookieLifetime.refreshSeconds,
  });
}

export function setAccessCookie(response: NextResponse, accessToken: string) {
  response.cookies.set(authCookies.access, accessToken, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: authCookieLifetime.accessSeconds,
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(authCookies.access, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(authCookies.refresh, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
