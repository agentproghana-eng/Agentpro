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
  COMMUNITY_REACTIONS,
  communityNotFound,
  communityUnavailable,
  isCommunityUuid,
} from "@/features/community/server/validation";
import type { CommunityReaction } from "@/features/community/types";

type Context = {
  params: Promise<{
    commentId: string;
  }>;
};

export async function POST(request: NextRequest, context: Context) {
  const rejected = validateJsonMutation(request, "Community");

  if (rejected) {
    return rejected;
  }

  const { commentId } = await context.params;

  if (!isCommunityUuid(commentId)) {
    return communityNotFound("Comment not found.");
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
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_REACTION",
        message: "Choose a valid reaction.",
      },
      {
        status: 422,
      },
    );
  }

  const value = parsed.value as Record<string, unknown>;

  const reaction =
    typeof value.reaction_type === "string" ? value.reaction_type : "";

  if (!COMMUNITY_REACTIONS.has(reaction as CommunityReaction)) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_REACTION",
        message: "Choose a valid reaction.",
      },
      {
        status: 422,
      },
    );
  }

  try {
    const result = await authenticatedCommunityRequest(
      request,
      `/personal-community/comments/${encodeURIComponent(commentId)}/react`,
      {
        method: "POST",
        body: {
          reaction_type: reaction,
        },
      },
    );

    return communityResponse(result);
  } catch {
    return communityUnavailable();
  }
}
