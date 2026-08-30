import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Cookie Policy",
  description:
    "Information about cookies and similar browser technologies used by Intellicore web experiences.",
  path: "/cookies",
});

const sections = [
  {
    eyebrow: "Cookie principles",
    title: "Cookie principles",
    items: [
      {
        title: "Essential cookies",
        description:
          "Required technologies may be used for secure sessions and core platform functionality.",
      },
      {
        title: "Preferences",
        description:
          "Preference storage may be used to remember legitimate user choices.",
      },
      {
        title: "Analytics",
        description:
          "Privacy-conscious analytics may be used to understand aggregate platform performance.",
      },
      {
        title: "Control",
        description:
          "Non-essential tracking should respect appropriate consent and preference requirements.",
      },
    ],
  },
] as const;

export default function Page() {
  return (
    <PublicInfoPage
      eyebrow="Legal"
      title="Cookie Policy"
      description="Information about cookies and similar browser technologies used by Intellicore web experiences."
      sections={sections}
    />
  );
}
