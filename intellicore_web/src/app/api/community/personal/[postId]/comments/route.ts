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
  communityUnavailable,
  isCommunityUuid,
} from "@/features/community/server/validation";

type Context = {
  params: Promise<{
    postId: string;
  }>;
};

export async function GET(request: NextRequest, context: Context) {
  const { postId } = await context.params;

  if (!isCommunityUuid(postId)) {
    return communityNotFound();
  }

  try {
    const result = await authenticatedCommunityRequest(
      request,
      `/personal-community/posts/${encodeURIComponent(postId)}/comments`,
    );

    return communityResponse(result);
  } catch {
    return communityUnavailable();
  }
}

export async function POST(request: NextRequest, context: Context) {
  const rejected = validateJsonMutation(request, "Community");

  if (rejected) {
    return rejected;
  }

  const { postId } = await context.params;

  if (!isCommunityUuid(postId)) {
    return communityNotFound();
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
        message: "Comment content is required.",
      },
      {
        status: 422,
      },
    );
  }

  const value = parsed.value as Record<string, unknown>;

  const content = typeof value.content === "string" ? value.content.trim() : "";

  const parentCommentId =
    typeof value.parent_comment_id === "string"
      ? value.parent_comment_id
      : null;

  if (!content) {
    return NextResponse.json(
      {
        success: false,
        message: "Comment content is required.",
      },
      {
        status: 422,
      },
    );
  }

  if (parentCommentId && !isCommunityUuid(parentCommentId)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid reply target.",
      },
      {
        status: 422,
      },
    );
  }

  try {
    const result = await authenticatedCommunityRequest(
      request,
      `/personal-community/posts/${encodeURIComponent(postId)}/comments`,
      {
        method: "POST",
        body: {
          content,
          ...(parentCommentId
            ? {
                parent_comment_id: parentCommentId,
              }
            : {}),
        },
      },
    );

    return communityResponse(result);
  } catch {
    return communityUnavailable();
  }
}
