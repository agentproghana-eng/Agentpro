import type { Metadata } from "next";

import { MarketplaceBrowse } from "@/features/marketplace/components/marketplace-browse";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Marketplace",
  description:
    "Buy, sell and discover products, services and businesses across Ghana with AgentPro Marketplace.",
  path: "/",
});

export default function HomePage() {
  return <MarketplaceBrowse basePath="/" />;
}
