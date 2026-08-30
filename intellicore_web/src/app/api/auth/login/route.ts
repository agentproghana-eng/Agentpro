import { NextRequest, NextResponse } from "next/server";

import {
  backendAuthRequest,
  clientErrorBody,
  extractMfaResponse,
  extractSessionTokens,
  extractUser,
} from "@/features/auth/server/backend";
import { setSessionCookies } from "@/features/auth/server/cookies";
import {
  readJson,
  validateAuthMutation,
} from "@/features/auth/server/request-security";
import { loginSchema } from "@/features/auth/validation";

export async function POST(request: NextRequest) {
  const rejected = validateAuthMutation(request);

  if (rejected) {
    return rejected;
  }

  const parsedBody = await readJson(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validation = loginSchema.safeParse(parsedBody.value);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Enter a valid email and password.",
      },
      {
        status: 422,
      },
    );
  }

  try {
    const result = await backendAuthRequest("/login", {
      method: "POST",
      body: {
        ...validation.data,
        device_info: {
          platform: "web",
        },
      },
      userAgent: request.headers.get("user-agent"),
    });

    if (result.status === 202) {
      const mfa = extractMfaResponse(result.body);

      if (!mfa) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid MFA challenge response.",
          },
          {
            status: 502,
          },
        );
      }

      return NextResponse.json(
        {
          success: true,
          code: result.body.code,
          message: result.body.message,
          data: mfa,
        },
        {
          status: 202,
        },
      );
    }

    if (!result.ok) {
      return NextResponse.json(clientErrorBody(result.body), {
        status: result.status,
      });
    }

    const tokens = extractSessionTokens(result.body);

    if (!tokens) {
      return NextResponse.json(
        {
          success: false,
          message: "Authentication service returned an invalid session.",
        },
        {
          status: 502,
        },
      );
    }

    const response = NextResponse.json({
      success: true,
      message: result.body.message ?? "Login successful",
      data: {
        user: extractUser(result.body),
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
