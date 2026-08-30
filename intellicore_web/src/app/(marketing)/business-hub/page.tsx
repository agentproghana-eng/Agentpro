import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Business Hub",
  description:
    "AgentPro Business Hub is the private, role-aware workspace for running and understanding a business.",
  path: "/business-hub",
});

const sections = [
  {
    eyebrow: "Business dashboard",
    title: "See performance and what needs attention.",
    items: [
      {
        title: "Today's performance",
        description:
          "Surface useful revenue, transaction and operational context.",
      },
      {
        title: "Balances",
        description:
          "Display authorised balance information within the correct business context.",
      },
      {
        title: "Alerts",
        description:
          "Bring pending actions and important business events forward.",
      },
      {
        title: "Recent activity",
        description: "Show relevant recent actions across the business.",
      },
    ],
  },
  {
    eyebrow: "Business management",
    title: "Private operations remain private.",
    items: [
      {
        title: "Transactions",
        description:
          "Review and manage authorised operational transaction information.",
      },
      {
        title: "Reports",
        description: "Understand business performance through useful reports.",
      },
      {
        title: "Staff",
        description: "Support business roles and operational accountability.",
      },
      {
        title: "Permissions",
        description:
          "Backend authorization determines what each business member can access.",
      },
    ],
  },
  {
    eyebrow: "Multi-business",
    title: "One account can work across multiple authorised businesses.",
    items: [
      {
        title: "Business switcher",
        description: "Move between organisations without mixing their data.",
      },
      {
        title: "Business isolation",
        description:
          "Never display one organisation's private information in another business context.",
      },
    ],
  },
] as const;

export default function BusinessHubPage() {
  return (
    <PublicInfoPage
      eyebrow="AgentPro Business Hub"
      title="How is your business performing, and what needs attention?"
      description="Business Hub is the web extension of the private AgentPro business experience for authorised owners, managers and teams."
      primaryAction={{
        label: "Sign In to Business Hub",
        href: "/login?next=/hub/business",
      }}
      secondaryAction={{
        label: "Explore AgentPro",
        href: "/agentpro",
      }}
      highlights={[
        "Private business workspace",
        "Role-aware access",
        "Multi-business support",
        "Reports and performance",
      ]}
      sections={sections}
    />
  );
}
