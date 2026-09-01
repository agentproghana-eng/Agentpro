import { NextRequest, NextResponse } from "next/server";

import { validateSameOriginMutation } from "@/features/auth/server/request-security";
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

async function handle(
  request: NextRequest,
  context: Context,
  method: "POST" | "DELETE",
) {
  const rejected = validateSameOriginMutation(request, "Marketplace");

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

  try {
    const result = await authenticatedMarketplaceRequest(
      request,
      `/${adId}/save`,
      {
        method,
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

export async function POST(request: NextRequest, context: Context) {
  return handle(request, context, "POST");
}

export async function DELETE(request: NextRequest, context: Context) {
  return handle(request, context, "DELETE");
}
