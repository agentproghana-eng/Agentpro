import { NextRequest, NextResponse } from "next/server";

import {
  marketplaceResponse,
  publicMarketplaceRequest,
} from "@/features/marketplace/server/session-request";

const ALLOWED_QUERY_KEYS = new Set([
  "category_id",
  "search",
  "location",
  "min_price",
  "max_price",
  "min_rating",
  "sort",
  "page",
  "limit",
]);

export async function GET(request: NextRequest) {
  const params = new URLSearchParams();

  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (ALLOWED_QUERY_KEYS.has(key)) {
      params.append(key, value);
    }
  }

  const query = params.toString();

  try {
    const result = await publicMarketplaceRequest(
      request,
      query ? `/?${query}` : "/",
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
