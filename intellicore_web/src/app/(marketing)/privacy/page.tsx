import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy",
  description:
    "How Intellicore Systems approaches privacy and responsible handling of personal and business information.",
  path: "/privacy",
});

const sections = [
  {
    eyebrow: "Privacy principles",
    title: "Privacy principles",
    items: [
      {
        title: "Purpose limitation",
        description:
          "Collect and use information for defined product, security, operational and legal purposes.",
      },
      {
        title: "Access control",
        description:
          "Restrict protected information according to authenticated identity, business context and authorization.",
      },
      {
        title: "Location privacy",
        description:
          "Avoid unnecessary public exposure of exact private location information.",
      },
      {
        title: "User controls",
        description:
          "Provide appropriate controls over public business information and account data.",
      },
    ],
  },
] as const;

export default function Page() {
  return (
    <PublicInfoPage
      eyebrow="Legal"
      title="Privacy"
      description="How Intellicore Systems approaches privacy and responsible handling of personal and business information."
      sections={sections}
    />
  );
}
