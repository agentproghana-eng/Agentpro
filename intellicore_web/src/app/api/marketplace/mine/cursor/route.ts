import { NextRequest, NextResponse } from "next/server";

import {
  authenticatedMarketplaceRequest,
  marketplaceResponse,
} from "@/features/marketplace/server/session-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = new URLSearchParams();

  const cursor = request.nextUrl.searchParams.get("cursor");
  const rawLimit = request.nextUrl.searchParams.get("limit");

  if (cursor) {
    params.set("cursor", cursor);
  }

  if (rawLimit) {
    const limit = Number.parseInt(rawLimit, 10);

    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_MARKETPLACE_LIMIT",
          message: "Invalid Marketplace page size.",
        },
        {
          status: 422,
        },
      );
    }

    params.set("limit", String(limit));
  }

  const query = params.toString();

  try {
    const result = await authenticatedMarketplaceRequest(
      request,
      query ? `/mine/cursor?${query}` : "/mine/cursor",
    );

    return marketplaceResponse(result);
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "MARKETPLACE_LISTINGS_UNAVAILABLE",
        message:
          "Your Marketplace listings are temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
