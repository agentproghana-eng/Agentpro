import { NextRequest, NextResponse } from "next/server";

import {
  marketplaceResponse,
  publicMarketplaceRequest,
} from "@/features/marketplace/server/session-request";

export async function GET(request: NextRequest) {
  try {
    const result = await publicMarketplaceRequest(request, "/categories");

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
