import { NextRequest, NextResponse } from "next/server";

import {
  authenticatedMarketplaceRequest,
  marketplaceResponse,
} from "@/features/marketplace/server/session-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const result = await authenticatedMarketplaceRequest(
      request,
      "/dashboard",
    );

    return marketplaceResponse(result);
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "MARKETPLACE_DASHBOARD_UNAVAILABLE",
        message:
          "Marketplace Business Hub is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
