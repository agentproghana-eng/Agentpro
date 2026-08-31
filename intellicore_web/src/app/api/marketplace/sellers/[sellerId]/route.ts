import { NextRequest, NextResponse } from "next/server";

import {
  marketplaceResponse,
  publicMarketplaceRequest,
} from "@/features/marketplace/server/session-request";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = {
  params: Promise<{
    sellerId: string;
  }>;
};

export async function GET(request: NextRequest, context: Context) {
  const { sellerId } = await context.params;

  if (!UUID.test(sellerId)) {
    return NextResponse.json(
      {
        success: false,
        message: "Seller not found.",
      },
      {
        status: 404,
      },
    );
  }

  try {
    const result = await publicMarketplaceRequest(
      request,
      `/sellers/${sellerId}`,
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
