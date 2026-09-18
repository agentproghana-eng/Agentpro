import type { Metadata } from "next";

import { HubSessionGate } from "@/features/auth/components/hub-session-gate";
import { requirePortalSessionPresence } from "@/features/auth/server/portal-presence";

export const metadata: Metadata = {
  title: "Business Hub | AgentPro Ghana",
  description:
    "Manage your Marketplace listings and seller performance on AgentPro Ghana.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function BusinessHubPage() {
  await requirePortalSessionPresence(
    "/hub/business",
  );

  return (
    <HubSessionGate section="business" />
  );
}
