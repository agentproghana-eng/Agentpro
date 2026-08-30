import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Acceptable Use",
  description:
    "Rules intended to protect AgentPro users, businesses, communities and the wider Intellicore platform.",
  path: "/acceptable-use",
});

const sections = [
  {
    eyebrow: "Responsible platform use",
    title: "Responsible platform use",
    items: [
      {
        title: "No fraud",
        description:
          "Do not use Intellicore services to deceive, impersonate, defraud or facilitate financial abuse.",
      },
      {
        title: "No harassment",
        description:
          "Do not threaten, harass or abuse other users or businesses.",
      },
      {
        title: "No spam",
        description:
          "Do not distribute unwanted bulk messages or manipulate communities with spam.",
      },
      {
        title: "Respect privacy",
        description:
          "Do not expose another person's private information without lawful authority or permission.",
      },
    ],
  },
] as const;

export default function Page() {
  return (
    <PublicInfoPage
      eyebrow="Legal"
      title="Acceptable Use"
      description="Rules intended to protect AgentPro users, businesses, communities and the wider Intellicore platform."
      sections={sections}
    />
  );
}
