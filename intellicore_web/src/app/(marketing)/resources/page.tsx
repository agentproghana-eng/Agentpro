import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Resources",
  description:
    "Intellicore and AgentPro resources, guides, tutorials, product updates, business education and security information.",
  path: "/resources",
});

const sections = [
  {
    eyebrow: "Learn",
    title: "Useful information for businesses and AgentPro users.",
    items: [
      {
        title: "Help Center",
        description:
          "Support content for common AgentPro questions and workflows.",
      },
      {
        title: "AgentPro tutorials",
        description: "Learn how to use important product capabilities.",
      },
      {
        title: "Business education",
        description:
          "Practical information for operating and understanding a business.",
      },
      {
        title: "Product updates",
        description:
          "Follow important AgentPro and Intellicore platform developments.",
      },
      {
        title: "Security information",
        description:
          "Understand important account, privacy and security practices.",
      },
      {
        title: "Developer documentation",
        description:
          "Technical documentation will be published where external integrations are supported.",
      },
    ],
  },
] as const;

export default function ResourcesPage() {
  return (
    <PublicInfoPage
      eyebrow="Resources"
      title="Learn, operate and get support."
      description="Resources for AgentPro users, businesses, partners and the wider Intellicore ecosystem."
      primaryAction={{
        label: "Contact Support",
        href: "/contact?topic=support",
      }}
      highlights={[
        "Help Center",
        "Guides",
        "Product updates",
        "Security information",
      ]}
      sections={sections}
    />
  );
}
