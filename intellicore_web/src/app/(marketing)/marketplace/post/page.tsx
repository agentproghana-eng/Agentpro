import type { Metadata } from "next";

import { requirePortalSessionPresence } from "@/features/auth/server/portal-presence";
import { MarketplacePostForm } from "@/features/marketplace/components/marketplace-post-form";

export const metadata: Metadata = {
  title: "Post an Ad | AgentPro Ghana",
  description:
    "Create a Marketplace listing on AgentPro Ghana.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MarketplacePostPage() {
  await requirePortalSessionPresence("/marketplace/post");

  return <MarketplacePostForm />;
}
