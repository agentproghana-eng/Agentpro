import type { Metadata } from "next";
import {
  Briefcase,
  CircleHelp,
  Lightbulb,
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
  title: "Community Hub",
  description:
    "AgentPro Community connects agents, sellers and service providers across Ghana. Ask questions, share tips, warn others and find work.",
  path: "/community",
});

const samplePosts = [
  {
    initial: "K",
    time: "2h",
    role: "Mobile money agent",
    type: "Question",
    tone: "blue",
    text: "Which network is giving the best commission on cash-out this month?",
    likes: 14,
    comments: 6,
  },
  {
    initial: "A",
    time: "5h",
    role: "Business owner",
    type: "Fraud alert",
    tone: "red",
    text: "Be careful: someone is sending fake confirmation messages after a transfer. Always check your own balance first.",
    likes: 31,
    comments: 9,
  },
  {
    initial: "E",
    time: "1d",
    role: "Seller",
    type: "Business tip",
    tone: "gold",
    text: "Clear photos in daylight doubled the enquiries on my listings.",
    likes: 22,
    comments: 4,
  },
] as const;

const uses: Array<{
  title: string;
  text: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    title: "Ask a question",
    text: "Get answers from people who do the same work every day.",
    icon: CircleHelp,
    tone: "blue",
  },
  {
    title: "Warn others",
    text: "Share fraud alerts and network issues so others are not caught out.",
    icon: TriangleAlert,
    tone: "red",
  },
  {
    title: "Share what works",
    text: "Business tips and local know-how, from people you can trust.",
    icon: Lightbulb,
    tone: "gold",
  },
  {
    title: "Find work",
    text: "See nearby requests and opportunities that fit your trade.",
    icon: Briefcase,
    tone: "teal",
  },
];

const steps = [
  { title: "Post a request", text: "Describe the job and the area, not your address." },
  { title: "Providers see it", text: "Matched by category, coverage and location." },
  { title: "Offers come in", text: "Compare offers from interested providers." },
  { title: "Complete and review", text: "Leave a review to help the next person." },
];

const safety = [
  "Report posts and users",
  "Block anyone",
  "Moderator review",
  "Clear Verified badge",
];

export default function CommunityPage() {
  return (
    <main id="main-content" className="ic-hub-page">
      <HubHero
        eyebrow="AgentPro Community"
        title="Ask, share and find work with people in your trade."
        lead="Real questions, tips and requests from agents, sellers and service providers across Ghana. No followers, no noise."
        primary={{ label: "Join free", href: "/register" }}
        secondary={{ label: "Sign in", href: "/login?next=/hub/community" }}
      >
        <p className="ic-hub-sample-note">Sample posts shown as examples</p>

        {samplePosts.map((post) => (
          <article
            key={post.text}
            className="ic-hub-post"
            data-tone={post.tone}
          >
            <header>
              <span className="ic-hub-avatar" aria-hidden="true">
                {post.initial}
              </span>

              <div>
                <strong>
                  Sample member <small>· {post.time}</small>
                </strong>
                <span>{post.role}</span>
              </div>

              <em className="ic-hub-chip">{post.type}</em>
            </header>

            <p>{post.text}</p>

            <footer>
              <span>Like · {post.likes}</span>
              <span>Comment · {post.comments}</span>
              <span>Share</span>
            </footer>
          </article>
        ))}
      </HubHero>

      <HubSection title="What people use it for">
        <div className="ic-hub-card-grid">
          {uses.map((item) => {
            const Icon = item.icon;

            return (
              <article className="ic-hub-card" key={item.title}>
                <span className="ic-hub-icon" data-tone={item.tone}>
                  <Icon size={24} aria-hidden="true" />
                </span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            );
          })}
        </div>
      </HubSection>

      <HubSection
        title="Need a service? Post a request."
        lead="Say what you need. Your exact address stays private."
      >
        <ol className="ic-hub-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span>Step {index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </HubSection>

      <HubSection title="Kept clean by design">
        <div className="ic-hub-safety">
          <p>
            Report any post or user, block anyone you do not want to hear
            from, and moderators review what is flagged. A Verified badge
            means we checked a profile. It does not guarantee the quality
            of a service.
          </p>

          <ul>
            {safety.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </HubSection>

      <HubFinalCta
        title="Join the conversation. It is free."
        text="Create an account in a minute, or get the app to post from your phone."
        primary={{ label: "Join free", href: "/register" }}
      />
    </main>
  );
}
