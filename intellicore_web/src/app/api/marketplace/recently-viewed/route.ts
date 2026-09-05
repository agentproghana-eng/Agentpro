import { NextRequest, NextResponse } from "next/server";

import {
  authenticatedMarketplaceRequest,
  marketplaceResponse,
} from "@/features/marketplace/server/session-request";

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit");

  const params = new URLSearchParams();

  if (limit) {
    params.set("limit", limit);
  }

  const query = params.toString();

  try {
    const result = await authenticatedMarketplaceRequest(
      request,
      query ? `/recently-viewed?${query}` : "/recently-viewed",
    );

    return marketplaceResponse(result);
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "MARKETPLACE_UNAVAILABLE",
        message: "Recently viewed listings are temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
