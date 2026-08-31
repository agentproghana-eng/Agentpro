import type { Metadata } from "next";

import { MarketplaceDetail } from "@/features/marketplace/components/marketplace-detail";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Marketplace Listing",
  description: "View an AgentPro Marketplace listing and contact the seller.",
  path: "/marketplace",
});

type Props = {
  params: Promise<{
    adId: string;
  }>;
};

export default async function MarketplaceListingPage({ params }: Props) {
  const { adId } = await params;

  return <MarketplaceDetail adId={adId} />;
}
