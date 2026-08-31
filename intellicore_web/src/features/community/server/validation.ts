import { NextResponse } from "next/server";

import type { CommunityReaction } from "@/features/community/types";

export const COMMUNITY_REACTIONS = new Set<CommunityReaction>([
  "like",
  "love",
  "laugh",
  "wow",
  "sad",
  "pray",
  "dislike",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCommunityUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function communityNotFound(message = "Post not found.") {
  return NextResponse.json(
    {
      success: false,
      message,
    },
    {
      status: 404,
    },
  );
}

export function communityUnavailable() {
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
