import { NextRequest, NextResponse } from "next/server";

import {
  backendAuthRequest,
  clientErrorBody,
} from "@/features/auth/server/backend";
import {
  readJson,
  validateAuthMutation,
} from "@/features/auth/server/request-security";
import { forgotPasswordSchema } from "@/features/auth/validation";

export async function POST(request: NextRequest) {
  const rejected = validateAuthMutation(request);

  if (rejected) {
    return rejected;
  }

  const parsedBody = await readJson(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validation = forgotPasswordSchema.safeParse(parsedBody.value);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Enter a valid email address.",
      },
      {
        status: 422,
      },
    );
  }

  try {
    const result = await backendAuthRequest("/forgot-password", {
      method: "POST",
      body: validation.data,
      userAgent: request.headers.get("user-agent"),
    });

    if (!result.ok) {
      return NextResponse.json(clientErrorBody(result.body), {
        status: result.status,
      });
    }

    return NextResponse.json({
      success: true,
      message:
        result.body.message ??
        "If that email is registered, reset instructions will be sent.",
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Password recovery is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
