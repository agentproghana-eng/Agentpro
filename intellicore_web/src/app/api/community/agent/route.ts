import { NextRequest, NextResponse } from "next/server";

import {
  authenticatedCommunityRequest,
  communityResponse,
} from "@/features/community/server/session-request";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_PAGE = 100_000;
const MAX_LIMIT = 50;

const allowedTypes = new Set([
  "general",
  "question",
  "network_issue",
  "fraud_alert",
  "business_tip",
  "announcement",
]);

function normalizedPositiveInteger(
  raw: string | null,
  fallback: number,
  maximum: number,
) {
  if (!raw) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const output = new URLSearchParams({
    page: String(
      normalizedPositiveInteger(params.get("page"), DEFAULT_PAGE, MAX_PAGE),
    ),
    limit: String(
      normalizedPositiveInteger(params.get("limit"), DEFAULT_LIMIT, MAX_LIMIT),
    ),
  });

  const type = params.get("type");

  if (type && allowedTypes.has(type)) {
    output.set("type", type);
  }

  try {
    const result = await authenticatedCommunityRequest(
      request,
      `/agent-posts?${output.toString()}`,
    );

    return communityResponse(result);
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "COMMUNITY_UNAVAILABLE",
        message: "Community is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
