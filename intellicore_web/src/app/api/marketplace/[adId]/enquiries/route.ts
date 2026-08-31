import { NextRequest, NextResponse } from "next/server";

import {
  readJson,
  validateAuthMutation,
} from "@/features/auth/server/request-security";
import {
  authenticatedMarketplaceRequest,
  marketplaceResponse,
} from "@/features/marketplace/server/session-request";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = {
  params: Promise<{
    adId: string;
  }>;
};

export async function POST(request: NextRequest, context: Context) {
  const rejected = validateAuthMutation(request);

  if (rejected) {
    return rejected;
  }

  const { adId } = await context.params;

  if (!UUID.test(adId)) {
    return NextResponse.json(
      {
        success: false,
        message: "Listing not found.",
      },
      {
        status: 404,
      },
    );
  }

  const parsed = await readJson(request);

  if (!parsed.ok) {
    return parsed.response;
  }

  if (
    typeof parsed.value !== "object" ||
    parsed.value === null ||
    Array.isArray(parsed.value)
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "Enter a message for the seller.",
      },
      {
        status: 422,
      },
    );
  }

  const value = parsed.value as Record<string, unknown>;

  const message = typeof value.message === "string" ? value.message.trim() : "";

  if (message.length === 0 || message.length > 2000) {
    return NextResponse.json(
      {
        success: false,
        message: "Message is required and must not exceed 2000 characters.",
      },
      {
        status: 422,
      },
    );
  }

  try {
    const result = await authenticatedMarketplaceRequest(
      request,
      `/${adId}/enquiries`,
      {
        method: "POST",
        body: {
          message,
        },
      },
    );

    return marketplaceResponse(result);
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "MARKETPLACE_UNAVAILABLE",
        message: "Marketplace is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
