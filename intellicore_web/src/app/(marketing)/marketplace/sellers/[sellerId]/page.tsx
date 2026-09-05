import type { Metadata } from "next";

import { MarketplaceSellerStorefront } from "@/features/marketplace/components/marketplace-seller-storefront";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Seller Storefront",
  description:
    "Browse active advertisements from an AgentPro Marketplace seller.",
  path: "/marketplace",
});

type Props = {
  params: Promise<{
    sellerId: string;
  }>;
};

export default async function MarketplaceSellerPage({ params }: Props) {
  const { sellerId } = await params;

  return <MarketplaceSellerStorefront sellerId={sellerId} />;
}
