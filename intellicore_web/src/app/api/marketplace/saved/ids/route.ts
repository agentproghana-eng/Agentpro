import { NextRequest, NextResponse } from "next/server";

import {
  authenticatedMarketplaceRequest,
  marketplaceResponse,
} from "@/features/marketplace/server/session-request";

export async function GET(request: NextRequest) {
  try {
    const result = await authenticatedMarketplaceRequest(request, "/saved/ids");

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
