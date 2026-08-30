import { NextRequest, NextResponse } from "next/server";

import {
  backendAuthRequest,
  clientErrorBody,
} from "@/features/auth/server/backend";
import { clearSessionCookies } from "@/features/auth/server/cookies";
import {
  readJson,
  validateAuthMutation,
} from "@/features/auth/server/request-security";
import { resetPasswordSchema } from "@/features/auth/validation";

export async function POST(request: NextRequest) {
  const rejected = validateAuthMutation(request);

  if (rejected) {
    return rejected;
  }

  const parsedBody = await readJson(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validation = resetPasswordSchema.safeParse(parsedBody.value);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        message: "The password reset request is invalid.",
      },
      {
        status: 422,
      },
    );
  }

  try {
    const result = await backendAuthRequest("/reset-password", {
      method: "POST",
      body: validation.data,
      userAgent: request.headers.get("user-agent"),
    });

    if (!result.ok) {
      return NextResponse.json(clientErrorBody(result.body), {
        status: result.status,
      });
    }

    const response = NextResponse.json({
      success: true,
      message: result.body.message ?? "Password reset successfully.",
    });

    clearSessionCookies(response);

    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Password reset is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
