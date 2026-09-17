import { NextRequest, NextResponse } from "next/server";

import {
  readJson,
  validateJsonMutation,
} from "@/features/auth/server/request-security";
import {
  authenticatedCommunityRequest,
  communityResponse,
} from "@/features/community/server/session-request";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_PAGE = 100_000;
const MAX_LIMIT = 50;
const MAX_CONTENT_LENGTH = 10_000;

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

function postError(
  message: string,
  code = "INVALID_COMMUNITY_POST",
) {
  return NextResponse.json(
    {
      success: false,
      code,
      message,
    },
    {
      status: 422,
    },
  );
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

export async function POST(request: NextRequest) {
  const rejected = validateJsonMutation(
    request,
    "Community post",
  );

  if (rejected) {
    return rejected;
  }

  const parsed = await readJson(request);

  if (!parsed.ok) {
    return parsed.response;
  }

  if (
    typeof parsed.value !== "object" ||
    parsed.value === null ||
    Array.isArray(parsed.value)
  ) {
    return postError("Write something before posting.");
  }

  const value = parsed.value as Record<string, unknown>;

  const content =
    typeof value.content === "string"
      ? value.content.trim()
      : "";

  if (!content) {
    return postError("Write something before posting.");
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return postError(
      `Community posts must be ${MAX_CONTENT_LENGTH.toLocaleString()} characters or fewer.`,
      "COMMUNITY_POST_TOO_LONG",
    );
  }

  const postType =
    typeof value.post_type === "string"
      ? value.post_type
      : "general";

  if (!allowedTypes.has(postType)) {
    return postError(
      "Choose a valid Agent Community post type.",
      "INVALID_COMMUNITY_POST_TYPE",
    );
  }

  try {
    const result = await authenticatedCommunityRequest(
      request,
      "/agent-posts",
      {
        method: "POST",
        body: {
          content,
          post_type: postType,
        },
      },
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
