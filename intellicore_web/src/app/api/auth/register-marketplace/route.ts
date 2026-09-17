import { NextRequest, NextResponse } from "next/server";

import {
  backendAuthRequest,
  clientErrorBody,
  extractSessionTokens,
  extractUser,
} from "@/features/auth/server/backend";
import { setSessionCookies } from "@/features/auth/server/cookies";
import {
  readJson,
  validateAuthMutation,
} from "@/features/auth/server/request-security";
import { marketplaceSellerRegisterSchema } from "@/features/auth/validation";

export async function POST(request: NextRequest) {
  const rejected = validateAuthMutation(request);

  if (rejected) {
    return rejected;
  }

  const parsedBody = await readJson(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validation =
    marketplaceSellerRegisterSchema.safeParse(parsedBody.value);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Check your business and account details and try again.",
      },
      {
        status: 422,
      },
    );
  }

  try {
    const result = await backendAuthRequest(
      "/register-marketplace-seller",
      {
        method: "POST",
        body: validation.data,
        userAgent: request.headers.get("user-agent"),
        rateLimitKeyMaterial: validation.data.email.toLowerCase(),
      },
    );

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
          message:
            "Registration completed without a valid session. Please sign in.",
        },
        {
          status: 502,
        },
      );
    }

    const response = NextResponse.json(
      {
        success: true,
        message:
          result.body.message ?? "Marketplace seller account created successfully.",
        data: {
          user: extractUser(result.body),
        },
      },
      {
        status: 201,
      },
    );

    setSessionCookies(response, tokens);

    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "AUTH_SERVICE_UNAVAILABLE",
        message:
          "Registration is temporarily unavailable. Please try again.",
      },
      {
        status: 503,
      },
    );
  }
}
