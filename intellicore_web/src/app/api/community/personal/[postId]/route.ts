import { NextRequest } from "next/server";

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
      `/personal-community/posts/${encodeURIComponent(postId)}`,
    );

    return communityResponse(result);
  } catch {
    return communityUnavailable();
  }
}
