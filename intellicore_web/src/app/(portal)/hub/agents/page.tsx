import type { Metadata } from "next";

import { HubSessionGate } from "@/features/auth/components/hub-session-gate";
import { requirePortalSessionPresence } from "@/features/auth/server/portal-presence";

export const metadata: Metadata = {
  title: "Agents Hub",
  description:
    "Your authenticated AgentPro Mobile Money operations workspace.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AgentsHubPage() {
  await requirePortalSessionPresence(
    "/hub/agents",
  );

  return (
    <HubSessionGate section="agents" />
  );
}
