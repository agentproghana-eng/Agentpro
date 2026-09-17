import { NextRequest, NextResponse } from "next/server";

import {
  authenticatedBusinessDashboardRequest,
  businessDashboardResponse,
} from "@/features/business/server/session-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const result =
      await authenticatedBusinessDashboardRequest(
        request,
      );

    return businessDashboardResponse(result);
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "BUSINESS_DASHBOARD_UNAVAILABLE",
        message:
          "Business information is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
