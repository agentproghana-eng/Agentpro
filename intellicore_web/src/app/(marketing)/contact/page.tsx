import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Contact",
  description:
    "Contact Intellicore Systems for AgentPro support, sales, partnerships, enterprise enquiries and general questions.",
  path: "/contact",
});

const sections = [
  {
    eyebrow: "Contact routing",
    title: "Get your enquiry to the right place.",
    items: [
      {
        title: "General enquiries",
        description: "Questions about Intellicore Systems and its technology.",
      },
      {
        title: "AgentPro support",
        description: "Product and account support for AgentPro users.",
      },
      {
        title: "Sales & enterprise",
        description:
          "Discuss organisational deployment and commercial opportunities.",
      },
      {
        title: "Partnerships",
        description:
          "Telecom, financial, institutional, technology and ecosystem partnerships.",
      },
      {
        title: "Media",
        description: "Corporate information and media-related requests.",
      },
      {
        title: "Security",
        description: "Report a security or privacy concern responsibly.",
      },
    ],
  },
] as const;

export default function ContactPage() {
  return (
    <PublicInfoPage
      eyebrow="Contact Intellicore"
      title="Start the right conversation."
      description="For AgentPro, partnerships, enterprise, media, technical support or general enquiries, contact Intellicore Systems."
      primaryAction={{
        label: "Email Intellicore",
        href: "mailto:support@intellicoresystem.com",
      }}
      highlights={[
        "General enquiries",
        "AgentPro support",
        "Enterprise",
        "Partnerships",
      ]}
      sections={sections}
    />
  );
}
