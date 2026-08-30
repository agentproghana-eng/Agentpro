import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Solutions",
  description:
    "Intellicore Systems builds digital infrastructure for business operations, financial visibility, workforce accountability, commerce and connected communities.",
  path: "/solutions",
});

const sections = [
  {
    eyebrow: "Business operations",
    title: "Digitise the work businesses perform every day.",
    items: [
      {
        title: "Operational workflows",
        description: "Structure important day-to-day business activity.",
      },
      {
        title: "Records and accountability",
        description: "Preserve useful operational history and responsibility.",
      },
    ],
  },
  {
    eyebrow: "Financial operations",
    title: "Improve transaction visibility, reconciliation and reporting.",
    items: [
      {
        title: "Transaction visibility",
        description: "Maintain clearer records around financial activity.",
      },
      {
        title: "Reporting",
        description: "Convert operational activity into useful summaries.",
      },
    ],
  },
  {
    eyebrow: "Workforce management",
    title: "Support staff, permissions and operational accountability.",
    items: [
      {
        title: "Role-aware access",
        description:
          "Different responsibilities require different levels of access.",
      },
      {
        title: "Staff activity",
        description:
          "Help businesses understand relevant activity across teams.",
      },
    ],
  },
  {
    eyebrow: "Digital commerce",
    title: "Connect businesses to customers and economic opportunity.",
    items: [
      {
        title: "Marketplace",
        description: "Help demand find relevant providers.",
      },
      {
        title: "Business profiles",
        description:
          "Give businesses a controlled professional public presence.",
      },
    ],
  },
  {
    eyebrow: "Community infrastructure",
    title: "Connect professionals by geography, industry and business need.",
    items: [
      {
        title: "Professional communities",
        description:
          "Support useful discussions, opportunities and collaboration.",
      },
      {
        title: "Local service requests",
        description: "Match real demand with appropriate nearby providers.",
      },
    ],
  },
] as const;

export default function SolutionsPage() {
  return (
    <PublicInfoPage
      eyebrow="Intellicore Solutions"
      title="Technology organised around outcomes."
      description="Intellicore Systems focuses on practical outcomes for businesses, professionals, institutions and connected commercial ecosystems."
      primaryAction={{
        label: "Explore AgentPro",
        href: "/agentpro",
      }}
      secondaryAction={{
        label: "Talk to Intellicore",
        href: "/contact",
      }}
      highlights={[
        "Business operations",
        "Financial operations",
        "Workforce management",
        "Business intelligence",
        "Digital commerce",
      ]}
      sections={sections}
    />
  );
}
