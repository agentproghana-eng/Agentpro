import type { Metadata } from "next";

import { HubSessionGate } from "@/features/auth/components/hub-session-gate";
import { requirePortalSessionPresence } from "@/features/auth/server/portal-presence";

export const metadata: Metadata = {
  title: "Agent Community Discussion",
  robots: {
    index: false,
    follow: false,
  },
};

type Props = {
  params: Promise<{
    postId: string;
  }>;
};

export default async function AgentCommunityDiscussionPage({ params }: Props) {
  const { postId } = await params;

  const returnPath = `/hub/community/agent/${encodeURIComponent(postId)}`;

  await requirePortalSessionPresence(returnPath);

  return (
    <HubSessionGate
      section="community"
      returnPath={returnPath}
      communityPost={{
        kind: "agent",
        postId,
      }}
    />
  );
}
