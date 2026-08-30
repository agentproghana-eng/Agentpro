import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Security",
  description:
    "Intellicore Systems' security principles for authentication, authorization, session protection, business isolation, monitoring and privacy.",
  path: "/security",
});

const sections = [
  {
    eyebrow: "Authentication",
    title: "Protect access to accounts and sensitive capabilities.",
    items: [
      {
        title: "Secure authentication",
        description:
          "Authentication decisions remain within trusted backend systems.",
      },
      {
        title: "Multi-factor authentication",
        description: "Privileged accounts can require stronger verification.",
      },
      {
        title: "Session protection",
        description:
          "Sessions should expire, refresh securely and be revocable.",
      },
    ],
  },
  {
    eyebrow: "Authorization",
    title:
      "Authentication does not automatically grant access to business data.",
    items: [
      {
        title: "Role-based access",
        description: "Authorised roles determine permitted capabilities.",
      },
      {
        title: "Business isolation",
        description:
          "Every protected request must be evaluated in the correct business context.",
      },
      {
        title: "Auditability",
        description:
          "Sensitive operational actions should be traceable where appropriate.",
      },
    ],
  },
  {
    eyebrow: "Platform protection",
    title: "Security is an ongoing operational discipline.",
    items: [
      {
        title: "Rate limiting",
        description:
          "Protect sensitive endpoints against abusive request patterns.",
      },
      {
        title: "Monitoring",
        description: "Observe meaningful operational and security events.",
      },
      {
        title: "Backups",
        description:
          "Protect important platform data through appropriate backup practices.",
      },
      {
        title: "Privacy controls",
        description:
          "Limit unnecessary exposure of business, location and personal information.",
      },
    ],
  },
] as const;

export default function SecurityPage() {
  return (
    <PublicInfoPage
      eyebrow="Security"
      title="Trust requires more than a security badge."
      description="Intellicore Systems treats authentication, authorization, isolation, privacy and operational monitoring as core platform concerns."
      primaryAction={{
        label: "Report a Security Concern",
        href: "mailto:support@intellicoresystem.com?subject=Security%20Concern",
      }}
      highlights={[
        "Role-aware authorization",
        "MFA for privileged access",
        "Business data isolation",
        "Session protection",
      ]}
      sections={sections}
    />
  );
}
