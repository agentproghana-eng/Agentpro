import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata =
  createPageMetadata({
    title: "Business Hub",
    description:
      "Manage Marketplace listings, buyer interest and seller performance with AgentPro Business Hub.",
    path: "/business-hub",
  });

const sections = [
  {
    eyebrow: "Seller performance",
    title:
      "Know how your Marketplace storefront is performing.",
    items: [
      {
        title: "Listing performance",
        description:
          "Track views, saves, enquiries and the listings attracting the most buyer interest.",
      },
      {
        title: "Buyer activity",
        description:
          "See recent Marketplace interest and identify new enquiries that need attention.",
      },
      {
        title: "Seller reputation",
        description:
          "Follow ratings and reviews that help buyers understand your storefront.",
      },
      {
        title: "Attention signals",
        description:
          "Spot listings that are expiring or are receiving little engagement.",
      },
    ],
  },
  {
    eyebrow: "Marketplace management",
    title:
      "Manage your listings from one workspace.",
    items: [
      {
        title: "My Ads",
        description:
          "See active, pending, expired and other listing statuses without losing track of submitted ads.",
      },
      {
        title: "Post an Ad",
        description:
          "Create new Marketplace listings with reviewed photos and clear product details.",
      },
      {
        title: "Publishing status",
        description:
          "Follow review and publishing progress before a listing becomes visible to buyers.",
      },
      {
        title: "Storefront growth",
        description:
          "Use real Marketplace activity to improve the listings that need attention.",
      },
    ],
  },
  {
    eyebrow: "Separate by design",
    title:
      "Marketplace Business Hub is not Mobile Money Agents Hub.",
    items: [
      {
        title: "Business Hub",
        description:
          "Marketplace seller tools, listings and storefront performance.",
      },
      {
        title: "Agents Hub",
        description:
          "Mobile Money operations remain available only to approved AgentPro agent-business roles.",
      },
    ],
  },
] as const;

export default function BusinessHubPage() {
  return (
    <PublicInfoPage
      eyebrow="AgentPro Business Hub"
      title="Run your Marketplace storefront with better visibility."
      description="Business Hub is the private Marketplace seller workspace for managing ads, buyer interest and storefront performance."
      primaryAction={{
        label: "Sign In to Business Hub",
        href: "/login?next=/hub/business",
      }}
      secondaryAction={{
        label: "Browse Marketplace",
        href: "/",
      }}
      highlights={[
        "My Ads and listing status",
        "Views, saves and enquiries",
        "Seller ratings",
        "Marketplace performance",
      ]}
      sections={sections}
    />
  );
}
