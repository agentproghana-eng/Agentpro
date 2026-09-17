import { NextRequest, NextResponse } from "next/server";

import {
  readJson,
  validateJsonMutation,
} from "@/features/auth/server/request-security";
import {
  authenticatedCommunityRequest,
  communityResponse,
} from "@/features/community/server/session-request";
import {
  communityNotFound,
  isCommunityUuid,
} from "@/features/community/server/validation";

const VALID_REASONS = new Set([
  "spam",
  "fraud",
  "harassment",
  "misinformation",
  "inappropriate",
  "privacy",
  "other",
]);

type Context = {
  params: Promise<{ postId: string }>;
};

export async function POST(
  request: NextRequest,
  context: Context,
) {
  const rejected = validateJsonMutation(request, "Community");

  if (rejected) {
    return rejected;
  }

  const parsed = await readJson(request);

  if (
    !parsed.ok ||
    typeof parsed.value !== "object" ||
    parsed.value === null ||
    Array.isArray(parsed.value)
  ) {
    return parsed.ok
      ? NextResponse.json(
          {
            success: false,
            message: "Choose a valid report reason.",
          },
          { status: 422 },
        )
      : parsed.response;
  }

  const value = parsed.value as Record<string, unknown>;
  const reason =
    typeof value.reason === "string"
      ? value.reason.trim()
      : "";
  const details =
    typeof value.details === "string"
      ? value.details.trim()
      : "";

  if (!VALID_REASONS.has(reason)) {
    return NextResponse.json(
      {
        success: false,
        message: "Choose a valid report reason.",
      },
      { status: 422 },
    );
  }

  if (details.length > 2000) {
    return NextResponse.json(
      {
        success: false,
        message: "Report details cannot exceed 2,000 characters.",
      },
      { status: 422 },
    );
  }

  const { postId } = await context.params;

  if (!isCommunityUuid(postId)) {
    return communityNotFound();
  }

  try {
    const result = await authenticatedCommunityRequest(
      request,
      `/agent-posts/${encodeURIComponent(postId)}/report`,
      {
        method: "POST",
        body: {
          reason,
          details: details || null,
        },
      },
    );

    return communityResponse(result);
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Community is temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
