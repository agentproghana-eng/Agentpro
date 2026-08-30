import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Partners",
  description:
    "Partner with Intellicore Systems across telecom, financial services, enterprise, government, technology and business ecosystems.",
  path: "/partners",
});

const sections = [
  {
    eyebrow: "Partner ecosystem",
    title: "Build stronger infrastructure together.",
    items: [
      {
        title: "Telecommunications",
        description:
          "Explore integrations and business infrastructure around connectivity and telecom operations.",
      },
      {
        title: "Banks & fintechs",
        description:
          "Collaborate around business visibility, payments and financial operations.",
      },
      {
        title: "Government & institutions",
        description:
          "Explore responsible digital infrastructure for business ecosystems and service delivery.",
      },
      {
        title: "Business associations",
        description:
          "Connect communities of businesses and professionals to digital tools and opportunity.",
      },
      {
        title: "Technology partners",
        description: "Integrate complementary infrastructure and services.",
      },
      {
        title: "Investors",
        description:
          "Engage with Intellicore's long-term platform and market vision.",
      },
    ],
  },
] as const;

export default function PartnersPage() {
  return (
    <PublicInfoPage
      eyebrow="Partners"
      title="Build with Intellicore."
      description="Intellicore Systems is building a platform ecosystem designed for collaboration with institutions that serve businesses and communities."
      primaryAction={{
        label: "Partner With Intellicore",
        href: "/contact?topic=partnership",
      }}
      secondaryAction={{
        label: "Build With AgentPro",
        href: "/contact?topic=agentpro-partnership",
      }}
      highlights={[
        "Telecom",
        "Financial services",
        "Government",
        "Enterprise",
        "Technology",
      ]}
      sections={sections}
    />
  );
}
