import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  MessageSquare,
  ShoppingBag,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  HubFinalCta,
  HubHero,
  HubSection,
  appLink,
} from "@/components/marketing/hub-landing";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "The AgentPro app",
  description:
    "Buy, sell and hire across Ghana from one app. Post free ads, join the community, grow your business and manage mobile money as an agent.",
  path: "/agentpro",
});

const jobs: Array<{
  title: string;
  text: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    title: "Buy and sell",
    text: "Post a free ad with photos and a price, or find what you need near you.",
    icon: ShoppingBag,
    tone: "teal",
  },
  {
    title: "Hire trusted services",
    text: "Find repairs, fashion, food and local professionals, with ratings.",
    icon: Wrench,
    tone: "blue",
  },
  {
    title: "Join the Community",
    text: "Share, ask and connect with people and businesses around you.",
    icon: MessageSquare,
    tone: "gold",
  },
  {
    title: "Grow with Business Hub",
    text: "Track views, saves and enquiries on your ads.",
    icon: BarChart3,
    tone: "red",
  },
];

export default function AgentProPage() {
  return (
    <main id="main-content" className="ic-hub-page">
      <HubHero
        eyebrow="The AgentPro app"
        title="Buy, sell and hire across Ghana, from one app."
        lead="Post a free ad, find what you need near you, chat with sellers and grow your business. Mobile money agents get their own tools too."
        primary={{ label: "Get the app", href: appLink() }}
        secondary={{ label: "Browse the Marketplace", href: "/" }}
      >
        <div className="ic-ap-phone" aria-hidden="true">
          <div className="ic-ap-screen">
            <strong>Marketplace</strong>
            <span className="ic-ap-search">Search phones, fashion, services</span>
            <div className="ic-ap-tiles">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="ic-ap-ad">
              <div data-tone="teal">
                <b>GH₵ 2,400</b>
              </div>
              <p>
                Smartphone, 128GB
                <small>East Legon, Accra</small>
              </p>
            </div>
            <div className="ic-ap-ad">
              <div data-tone="gold">
                <b>GH₵ 180</b>
              </div>
              <p>Ankara dress</p>
            </div>
            <span className="ic-ap-post">Post a free ad</span>
          </div>
        </div>
        <p className="ic-hub-sample-note">Sample screen for illustration</p>
      </HubHero>

      <HubSection title="What you can do with AgentPro">
        <div className="ic-hub-card-grid ic-hub-card-grid-wide">
          {jobs.map((item) => {
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

        <div className="ic-ap-links">
          <Link href="/">Marketplace</Link>
          <Link href="/community">Community</Link>
          <Link href="/business-hub">Business Hub</Link>
        </div>
      </HubSection>

      <HubSection title="Already a mobile money agent?">
        <div className="ic-ap-agents">
          <div>
            <p>
              Use the same account for the agent tools: cash in and out,
              float, commission and daily reports across MTN MoMo, Telecel
              Cash and AirtelTigo Money.
            </p>
            <div className="ic-ap-networks">
              <span data-tone="gold">MTN MoMo</span>
              <span data-tone="red">Telecel Cash</span>
              <span data-tone="blue">AirtelTigo Money</span>
            </div>
          </div>

          <Link href="/login?next=/hub" className="ic-hub-button-dark">
            See agent tools
          </Link>
        </div>
      </HubSection>

      <HubFinalCta
        title="Your local market, in your pocket."
        text="Get the app and post your first ad in minutes."
        primary={{ label: "Join free", href: "/register" }}
      />
    </main>
  );
}
