import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "About",
  description:
    "Intellicore Systems is building intelligent systems that make businesses more connected, efficient and resilient.",
  path: "/about",
});

const sections = [
  {
    eyebrow: "Mission",
    title:
      "Build intelligent systems that make businesses more connected, efficient and resilient.",
  },
  {
    eyebrow: "Vision",
    title:
      "Create digital infrastructure that can serve businesses across Africa and compete globally.",
  },
  {
    eyebrow: "Values",
    title: "Practical technology, responsible systems and long-term trust.",
    items: [
      {
        title: "Practical",
        description:
          "Solve real operating problems instead of adding unnecessary complexity.",
      },
      {
        title: "Reliable",
        description: "Design systems businesses can understand and depend on.",
      },
      {
        title: "Responsible",
        description:
          "Treat security, privacy and trust as product requirements.",
      },
      {
        title: "Ambitious",
        description:
          "Build locally with standards capable of supporting international scale.",
      },
    ],
  },
  {
    eyebrow: "Ghanaian roots",
    title: "African-built. Globally competitive.",
    description:
      "Intellicore Systems begins with the realities of Ghanaian businesses while designing architecture that can support additional markets over time.",
  },
] as const;

export default function AboutPage() {
  return (
    <PublicInfoPage
      eyebrow="About Intellicore"
      title="Building intelligent digital infrastructure."
      description="Intellicore Systems develops technology for businesses, professionals, institutions and connected commercial communities."
      primaryAction={{
        label: "Explore Solutions",
        href: "/solutions",
      }}
      secondaryAction={{
        label: "Contact Intellicore",
        href: "/contact",
      }}
      highlights={[
        "Ghanaian roots",
        "African ambition",
        "Enterprise thinking",
        "Responsible technology",
      ]}
      sections={sections}
    />
  );
}
