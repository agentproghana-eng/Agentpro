import { NextRequest, NextResponse } from "next/server";

const MAX_AUTH_BODY_BYTES = 64 * 1024;

export function validateAuthMutation(
  request: NextRequest,
): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    return NextResponse.json(
      {
        success: false,
        message: "Expected application/json.",
      },
      {
        status: 415,
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > MAX_AUTH_BODY_BYTES) {
    return NextResponse.json(
      {
        success: false,
        message: "Authentication request is too large.",
      },
      {
        status: 413,
      },
    );
  }

  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    return NextResponse.json(
      {
        success: false,
        code: "CROSS_SITE_REQUEST_REJECTED",
        message: "Cross-site authentication requests are not allowed.",
      },
      {
        status: 403,
      },
    );
  }

  const origin = request.headers.get("origin");

  if (origin) {
    try {
      const parsedOrigin = new URL(origin);

      const expectedHost =
        request.headers.get("x-forwarded-host") ??
        request.headers.get("host") ??
        request.nextUrl.host;

      if (parsedOrigin.host !== expectedHost) {
        return NextResponse.json(
          {
            success: false,
            code: "ORIGIN_MISMATCH",
            message: "Authentication request origin was rejected.",
          },
          {
            status: 403,
          },
        );
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_ORIGIN",
          message: "Authentication request origin was rejected.",
        },
        {
          status: 403,
        },
      );
    }
  }

  return null;
}

export async function readJson(request: NextRequest) {
  try {
    return {
      ok: true as const,
      value: await request.json(),
    };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          success: false,
          message: "Invalid JSON request.",
        },
        {
          status: 400,
        },
      ),
    };
  }
}
