import type { Metadata } from "next";

import { HubSessionGate } from "@/features/auth/components/hub-session-gate";
import { requirePortalSessionPresence } from "@/features/auth/server/portal-presence";

export const metadata: Metadata = {
  title: "AgentPro Hub",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function HubPage() {
  await requirePortalSessionPresence("/hub");

  return <HubSessionGate section="overview" />;
}
