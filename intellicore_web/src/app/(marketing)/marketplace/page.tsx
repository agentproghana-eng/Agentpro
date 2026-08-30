import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Marketplace",
  description:
    "Discover businesses and service providers by category, service, location, availability, verification and relevance.",
  path: "/marketplace",
});

const sections = [
  {
    eyebrow: "Discovery",
    title: "Find relevant businesses and professionals.",
    items: [
      {
        title: "Search",
        description: "Search by business, profession, service or local need.",
      },
      {
        title: "Location",
        description:
          "Use country, region, city, area and approximate distance appropriately.",
      },
      {
        title: "Availability",
        description:
          "Prioritise providers who are relevant and available where possible.",
      },
      {
        title: "Verification",
        description:
          "Display trust states clearly without treating verification as a service-quality guarantee.",
      },
    ],
  },
  {
    eyebrow: "Marketplace profile",
    title: "Public information remains controlled by the business.",
    items: [
      {
        title: "Services",
        description:
          "Show useful information about what the business actually provides.",
      },
      {
        title: "Location & service areas",
        description:
          "Expose appropriate service coverage without publishing private residential coordinates.",
      },
      {
        title: "Ratings & reviews",
        description:
          "Prefer reviews tied to genuine interactions where possible.",
      },
      {
        title: "Contact options",
        description:
          "Allow communication without automatically revealing private phone numbers.",
      },
    ],
  },
] as const;

export default function MarketplacePage() {
  return (
    <PublicInfoPage
      eyebrow="AgentPro Marketplace"
      title="Connect demand with the right business."
      description="Marketplace is the discovery environment where customers find businesses and providers without exposing their private Business Hub information."
      primaryAction={{
        label: "Browse Marketplace",
        href: "/marketplace#discover",
      }}
      secondaryAction={{
        label: "Request a Service",
        href: "/community#service-requests",
      }}
      highlights={[
        "Category and service search",
        "Location-aware discovery",
        "Business profiles",
        "Ratings and reviews",
      ]}
      sections={sections}
    />
  );
}
