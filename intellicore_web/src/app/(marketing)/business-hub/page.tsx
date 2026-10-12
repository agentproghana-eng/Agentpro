import type { Metadata } from "next";
import {
  List,
  MessageSquare,
  Star,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import {
  HubFinalCta,
  HubHero,
  HubSection,
} from "@/components/marketing/hub-landing";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Business Hub",
  description:
    "Post ads, track views, saves and enquiries, and see which Marketplace listings need attention with AgentPro Business Hub.",
  path: "/business-hub",
});

const stats = [
  { label: "Views", value: "1,240", delta: "+18% this week" },
  { label: "Saves", value: "86", delta: "+9 this week" },
  { label: "Enquiries", value: "23", delta: "5 new" },
];

const sampleAds = [
  { title: "Smartphone, 128GB", views: 412, status: "Live", tone: "teal" },
  { title: "Ankara dress, made to order", views: 188, status: "In review", tone: "gold" },
  { title: "Phone repairs", views: 31, status: "Expiring", tone: "red" },
];

const flow = [
  { step: "Step 1", title: "Post", text: "Add clear photos, a price and where you are." },
  { step: "Step 2", title: "Review", text: "We check each ad before buyers see it." },
  { step: "Step 3", title: "Go live", text: "Buyers find you, save your ad and send enquiries." },
];

const tools: Array<{
  title: string;
  text: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    title: "My Ads",
    text: "Active, pending and expired listings in one list.",
    icon: List,
    tone: "teal",
  },
  {
    title: "Buyer activity",
    text: "See new enquiries and reply while they are interested.",
    icon: MessageSquare,
    tone: "blue",
  },
  {
    title: "Ratings and reviews",
    text: "Build the reputation that makes buyers choose you.",
    icon: Star,
    tone: "gold",
  },
  {
    title: "Attention signals",
    text: "Spot ads that are about to expire or get little interest.",
    icon: TriangleAlert,
    tone: "red",
  },
];

export default function BusinessHubPage() {
  return (
    <main id="main-content" className="ic-hub-page">
      <HubHero
        eyebrow="AgentPro Business Hub"
        title="See who is looking at your listings."
        lead="Post ads, track views, saves and enquiries, and know which listings need attention. Free to start."
        primary={{ label: "Post your first ad", href: "/login?next=/marketplace/post" }}
        secondary={{ label: "Sign in", href: "/login?next=/hub/business" }}
      >
        <div className="ic-hub-dashboard">
          <div className="ic-hub-dashboard-head">
            <strong>Your storefront</strong>
            <span>Sample numbers for illustration</span>
          </div>

          <div className="ic-hub-stats">
            {stats.map((stat) => (
              <div key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <small>{stat.delta}</small>
              </div>
            ))}
          </div>

          <div className="ic-hub-ads">
            <strong>Your ads</strong>

            {sampleAds.map((ad) => (
              <div key={ad.title}>
                <span>{ad.title}</span>
                <small>{ad.views} views</small>
                <em className="ic-hub-chip" data-tone={ad.tone}>
                  {ad.status}
                </em>
              </div>
            ))}
          </div>
        </div>
      </HubHero>

      <HubSection title="From first ad to first sale">
        <div className="ic-hub-card-grid">
          {flow.map((item) => (
            <article className="ic-hub-card" key={item.title}>
              <span className="ic-hub-step-label">{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </HubSection>

      <HubSection title="Everything in one workspace">
        <div className="ic-hub-card-grid ic-hub-card-grid-wide">
          {tools.map((item) => {
            const Icon = item.icon;

            return (
              <article className="ic-hub-card ic-hub-card-row" key={item.title}>
                <span className="ic-hub-icon" data-tone={item.tone}>
                  <Icon size={24} aria-hidden="true" />
                </span>

                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            );
          })}
        </div>

        <p className="ic-hub-footnote">
          Mobile money operations are in the separate Agents Hub for
          approved agents.
        </p>
      </HubSection>

      <HubFinalCta
        title="Start selling for free."
        text="Post your first ad in minutes, or get the app to manage listings from your phone."
        primary={{ label: "Post your first ad", href: "/login?next=/marketplace/post" }}
      />
    </main>
  );
}
