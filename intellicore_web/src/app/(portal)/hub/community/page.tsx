import type { Metadata } from "next";

import { HubSessionGate } from "@/features/auth/components/hub-session-gate";
import { requirePortalSessionPresence } from "@/features/auth/server/portal-presence";

export const metadata: Metadata = {
  title: "Community Hub",
  description: "Your authenticated AgentPro Community Hub workspace.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CommunityHubPage() {
  await requirePortalSessionPresence("/hub/community");

  return <HubSessionGate section="community" />;
}
