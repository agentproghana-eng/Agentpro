import { NextRequest, NextResponse } from "next/server";

import {
  backendAuthRequest,
  clientErrorBody,
  extractRecoveryCodes,
  extractSessionTokens,
  extractUser,
} from "@/features/auth/server/backend";
import { setSessionCookies } from "@/features/auth/server/cookies";
import {
  readJson,
  validateAuthMutation,
} from "@/features/auth/server/request-security";
import { mfaCompleteSchema } from "@/features/auth/validation";

export async function POST(request: NextRequest) {
  const rejected = validateAuthMutation(request);

  if (rejected) {
    return rejected;
  }

  const parsedBody = await readJson(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validation = mfaCompleteSchema.safeParse(parsedBody.value);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Enter a valid MFA credential.",
      },
      {
        status: 422,
      },
    );
  }

  try {
    const result = await backendAuthRequest("/mfa/complete", {
      method: "POST",
      body: validation.data,
      userAgent: request.headers.get("user-agent"),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ...clientErrorBody(result.body),
          ...(typeof result.body.data === "object" && result.body.data !== null
            ? {
                data: result.body.data,
              }
            : {}),
        },
        {
          status: result.status,
        },
      );
    }

    const tokens = extractSessionTokens(result.body);

    if (!tokens) {
      return NextResponse.json(
        {
          success: false,
          message: "Authentication service returned an invalid MFA session.",
        },
        {
          status: 502,
        },
      );
    }

    const recoveryCodes = extractRecoveryCodes(result.body);

    const response = NextResponse.json({
      success: true,
      message: result.body.message ?? "MFA verification complete",
      data: {
        user: extractUser(result.body),
        ...(recoveryCodes
          ? {
              recovery_codes: recoveryCodes,
            }
          : {}),
      },
    });

    setSessionCookies(response, tokens);

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
