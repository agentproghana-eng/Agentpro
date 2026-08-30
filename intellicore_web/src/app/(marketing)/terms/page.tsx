import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Terms",
  description:
    "General terms governing use of Intellicore Systems and AgentPro services.",
  path: "/terms",
});

const sections = [
  {
    eyebrow: "Platform terms",
    title: "Platform terms",
    items: [
      {
        title: "Account responsibility",
        description:
          "Users are responsible for legitimate and authorised use of their accounts.",
      },
      {
        title: "Platform availability",
        description:
          "Services may evolve, change or occasionally be unavailable for maintenance or operational reasons.",
      },
      {
        title: "Business information",
        description:
          "Users should provide accurate information when publishing business or professional details.",
      },
      {
        title: "Lawful use",
        description:
          "Intellicore services must not be used for unlawful, fraudulent or abusive activity.",
      },
    ],
  },
] as const;

export default function Page() {
  return (
    <PublicInfoPage
      eyebrow="Legal"
      title="Terms"
      description="General terms governing use of Intellicore Systems and AgentPro services."
      sections={sections}
    />
  );
}
