import type { Metadata } from "next";

import { PublicInfoPage } from "@/components/marketing/public-info-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "AgentPro — One App. Every Business.",
  description:
    "AgentPro is Intellicore Systems' integrated operating platform for business operations, transactions, reporting, people, discovery and opportunity.",
  path: "/agentpro",
});

const sections = [
  {
    eyebrow: "Run your business",
    title: "Bring everyday operations into one connected workspace.",
    description:
      "AgentPro is designed around the activities businesses perform every day.",
    items: [
      {
        title: "Transactions",
        description:
          "Record, review and understand important financial and operational activity.",
      },
      {
        title: "Employees & roles",
        description:
          "Support owners, managers, agents, accountants and employees through clear responsibilities.",
      },
      {
        title: "Balances & operations",
        description:
          "Keep operational balances and business activity easier to understand.",
      },
      {
        title: "Customers & activity",
        description:
          "Maintain useful context around the people and activity connected to the business.",
      },
    ],
  },
  {
    eyebrow: "Understand your business",
    title: "Turn daily activity into clearer business information.",
    items: [
      {
        title: "Dashboards",
        description:
          "See performance, alerts and important activity without searching through scattered records.",
      },
      {
        title: "Reports",
        description:
          "Create useful summaries from business and transaction activity.",
      },
      {
        title: "Transaction history",
        description:
          "Maintain a structured record of what happened, when and within the correct business context.",
      },
      {
        title: "Business analytics",
        description:
          "Use trends and operational information to support better decisions.",
      },
    ],
  },
  {
    eyebrow: "Connect your business",
    title:
      "Connect businesses, professionals, customers and service providers.",
    items: [
      {
        title: "Business profiles",
        description:
          "Publish controlled public information without exposing private operational data.",
      },
      {
        title: "Community Hub",
        description:
          "Connect around industries, professions, opportunities and local needs.",
      },
      {
        title: "Marketplace",
        description:
          "Help customers discover relevant businesses and services.",
      },
      {
        title: "Messaging",
        description:
          "Support business enquiries and service conversations without automatically exposing private phone numbers.",
      },
    ],
  },
  {
    eyebrow: "Grow your business",
    title: "Turn visibility and connection into practical opportunity.",
    items: [
      {
        title: "Service requests",
        description:
          "Respond to nearby demand based on category, geography and service coverage.",
      },
      {
        title: "Professional communities",
        description:
          "Participate in useful networks built around real professions and industries.",
      },
      {
        title: "Business discovery",
        description: "Become easier for relevant customers to find.",
      },
      {
        title: "Customer trust",
        description:
          "Build reputation through verified interactions, reviews and professional business information.",
      },
    ],
  },
  {
    eyebrow: "Work anywhere",
    title: "Mobile-first by design, with a web platform where it adds value.",
    items: [
      {
        title: "Mobile-first workflows",
        description:
          "Designed for the devices many businesses already depend on.",
      },
      {
        title: "Cloud-connected",
        description:
          "Keep authorised data available across supported AgentPro experiences.",
      },
      {
        title: "Low-bandwidth awareness",
        description:
          "Avoid unnecessary payloads and heavy interactions where possible.",
      },
      {
        title: "Secure web access",
        description:
          "Use authenticated web experiences for Community Hub and Business Hub.",
      },
    ],
  },
] as const;

export default function AgentProPage() {
  return (
    <PublicInfoPage
      eyebrow="AgentPro"
      title="One App. Every Business."
      description="AgentPro is an integrated business operating platform designed to help businesses run their work, understand performance, connect with people and discover opportunity."
      primaryAction={{
        label: "Get AgentPro",
        href: "/contact?topic=agentpro",
      }}
      secondaryAction={{
        label: "Sign In",
        href: "/login",
      }}
      highlights={[
        "Business operations",
        "Transactions and reporting",
        "Community Hub",
        "Business Hub",
        "Marketplace and service discovery",
      ]}
      sections={sections}
      cta={{
        eyebrow: "AgentPro",
        title: "Build a clearer, more connected business.",
        description:
          "Talk to Intellicore Systems about AgentPro, partnerships, deployment or support.",
        label: "Contact Intellicore",
        href: "/contact?topic=agentpro",
      }}
    />
  );
}
