import type { Metadata } from "next";

import { MarketplaceBrowse } from "@/features/marketplace/components/marketplace-browse";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Marketplace",
  description:
    "Browse AgentPro Marketplace listings, discover sellers and privately contact businesses after signing in.",
  path: "/marketplace",
});

export default function MarketplacePage() {
  return <MarketplaceBrowse />;
}
