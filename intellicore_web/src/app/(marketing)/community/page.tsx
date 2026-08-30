import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Community Hub",
  description:
    "AgentPro Community Hub connects professionals and businesses around relevant discussions, local service requests, opportunities and industry communities.",
  path: "/community",
});

const sections = [
  {
    eyebrow: "Professional network",
    title: "A community designed around useful business activity.",
    description:
      "Community Hub is not built around follower counts or influencer culture.",
    items: [
      {
        title: "Professional discussions",
        description:
          "Ask questions, share experience and discuss issues relevant to real work.",
      },
      {
        title: "Business opportunities",
        description:
          "Surface relevant opportunities based on profession, business and location.",
      },
      {
        title: "Announcements",
        description:
          "Receive useful industry, community and local information.",
      },
      {
        title: "Recommendations",
        description:
          "Discover communities and businesses that may be relevant.",
      },
    ],
  },
  {
    eyebrow: "Service requests",
    title: "Connect real local demand with relevant providers.",
    items: [
      {
        title: "Request",
        description:
          "Publish what is needed without exposing unnecessary private location details.",
      },
      {
        title: "Providers found",
        description:
          "Match requests to relevant providers by category, coverage and location.",
      },
      {
        title: "Offers received",
        description:
          "Qualified providers can express interest and provide useful offer information.",
      },
      {
        title: "Complete & review",
        description:
          "Completed interactions can support trustworthy reviews and future matching.",
      },
    ],
  },
  {
    eyebrow: "Safety",
    title: "Moderation and trust are part of the architecture.",
    items: [
      {
        title: "Report",
        description:
          "Support reporting of posts, users, businesses and suspicious activity.",
      },
      {
        title: "Block",
        description: "Allow users to prevent unwanted direct interaction.",
      },
      {
        title: "Moderation",
        description:
          "Support moderation queues, restrictions and community administrators.",
      },
      {
        title: "Verification",
        description:
          "Represent verification clearly without claiming it guarantees service quality.",
      },
    ],
  },
] as const;

export default function CommunityPage() {
  return (
    <PublicInfoPage
      eyebrow="AgentPro Community Hub"
      title="What matters around your profession, business and location?"
      description="Community Hub helps AgentPro users find useful discussions, service requests, opportunities, announcements and relevant local activity."
      primaryAction={{
        label: "Sign In to Community Hub",
        href: "/login?next=/hub/community",
      }}
      secondaryAction={{
        label: "Explore Marketplace",
        href: "/marketplace",
      }}
      highlights={[
        "Professional communities",
        "Nearby service requests",
        "Business opportunities",
        "Moderation and reporting",
      ]}
      sections={sections}
    />
  );
}
