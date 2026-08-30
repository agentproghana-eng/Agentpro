import {
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  MapPin,
  MessageSquareText,
  Search,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  WalletCards,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button-link";

const platformCapabilities = [
  {
    icon: BriefcaseBusiness,
    title: "Business operations",
    description:
      "Organise daily work, operational records and business activity.",
  },
  {
    icon: WalletCards,
    title: "Financial operations",
    description:
      "Bring transactions, balances and reconciliation into clearer view.",
  },
  {
    icon: BarChart3,
    title: "Reporting & analytics",
    description: "Turn everyday activity into useful business information.",
  },
  {
    icon: Users,
    title: "Staff management",
    description: "Support clearer responsibilities, access and accountability.",
  },
  {
    icon: Store,
    title: "Business discovery",
    description: "Build a professional presence customers can actually find.",
  },
  {
    icon: MessageSquareText,
    title: "Professional communities",
    description:
      "Connect around industries, services, opportunities and local needs.",
  },
];

const categories = [
  "Home Services",
  "Professional Services",
  "Fashion",
  "Beauty",
  "Education",
  "Technology",
  "Automotive",
  "Food",
  "Retail",
  "Construction",
  "Events",
  "Financial Services",
  "Agriculture",
];

export default function HomePage() {
  return (
    <main id="main-content">
      <section className="ic-hero">
        <div className="ic-shell ic-hero-grid">
          <div className="ic-hero-copy">
            <p className="ic-eyebrow">Intellicore Systems</p>

            <h1>
              Technology Built for the Way
              <span> Business Works</span>
            </h1>

            <p className="ic-hero-lead">
              Intellicore Systems builds intelligent digital platforms that help
              businesses operate, transact, connect, grow and serve their
              communities.
            </p>

            <div className="ic-hero-actions">
              <ButtonLink href="/agentpro">
                Explore AgentPro
                <ArrowRight size={17} />
              </ButtonLink>

              <ButtonLink href="/agentpro#get-agentpro" variant="secondary">
                Get AgentPro
              </ButtonLink>

              <Link className="ic-text-action" href="/login">
                Sign In
              </Link>
            </div>

            <div className="ic-trust-row">
              <span>African-built</span>
              <span>Ghana-first</span>
              <span>Enterprise-ready architecture</span>
            </div>
          </div>

          <div
            className="ic-product-stage"
            aria-label="AgentPro product interface preview"
          >
            <div className="ic-product-brand">
              <div className="ic-agentpro-shield-frame">
                <Image
                  src="/agentpro-shield.png"
                  alt=""
                  width={432}
                  height={432}
                  className="ic-agentpro-shield"
                  priority
                />
              </div>

              <div>
                <strong>
                  <span>Agent</span>
                  <em>Pro</em>
                </strong>

                <small>One App. Every Business.</small>
              </div>
            </div>

            <div className="ic-product-window">
              <div className="ic-product-toolbar">
                <div>
                  <span className="ic-dot" />
                  <span className="ic-dot" />
                  <span className="ic-dot" />
                </div>

                <span>Business overview</span>
              </div>

              <div className="ic-product-content">
                <div className="ic-product-topline">
                  <div>
                    <small>Good morning</small>
                    <strong>Your business at a glance</strong>
                  </div>

                  <Bell size={18} />
                </div>

                <div className="ic-metric-strip">
                  <div>
                    <small>Today</small>
                    <strong>GHS 8,420</strong>
                    <span>Business activity</span>
                  </div>

                  <div>
                    <small>Transactions</small>
                    <strong>184</strong>
                    <span>Recorded today</span>
                  </div>

                  <div>
                    <small>Requests</small>
                    <strong>12</strong>
                    <span>Need attention</span>
                  </div>
                </div>

                <div className="ic-product-panels">
                  <div className="ic-chart-card">
                    <div className="ic-card-heading">
                      <span>Performance</span>
                      <small>Last 7 days</small>
                    </div>

                    <div className="ic-chart-lines" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>

                  <div className="ic-activity-card">
                    <div className="ic-card-heading">
                      <span>Activity</span>
                      <small>Live</small>
                    </div>

                    <p>
                      <WalletCards size={16} />
                      Transaction recorded
                    </p>

                    <p>
                      <Users size={16} />
                      Staff activity updated
                    </p>

                    <p>
                      <MessageSquareText size={16} />
                      New service response
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="ic-mobile-device">
              <div className="ic-mobile-notch" />

              <strong>AgentPro</strong>

              <div className="ic-mobile-balance">
                <small>Business overview</small>
                <b>GHS 8,420</b>
              </div>

              <div className="ic-mobile-actions">
                <span>Send</span>
                <span>Report</span>
                <span>More</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ic-platform-strip">
        <div className="ic-shell">
          <p>One connected platform for the work behind everyday business.</p>

          <div className="ic-platform-tags">
            <span>Operations</span>
            <span>Transactions</span>
            <span>Accounting</span>
            <span>Staff</span>
            <span>Analytics</span>
            <span>Marketplace</span>
            <span>Community</span>
          </div>
        </div>
      </section>

      <section className="ic-section">
        <div className="ic-shell ic-section-heading">
          <div>
            <p className="ic-eyebrow">AgentPro</p>

            <h2>
              One operating platform.
              <br />
              Built around real business.
            </h2>
          </div>

          <div>
            <p>
              AgentPro connects operational tools, financial activity, people
              and opportunity without forcing businesses to stitch together
              disconnected systems.
            </p>

            <Link className="ic-section-link" href="/agentpro">
              See how AgentPro works
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <div className="ic-shell ic-capability-grid">
          {platformCapabilities.map((item) => {
            const Icon = item.icon;

            return (
              <article className="ic-capability-card" key={item.title}>
                <span className="ic-icon-box">
                  <Icon size={21} />
                </span>

                <h3>{item.title}</h3>

                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="ic-section ic-dark-section">
        <div className="ic-shell ic-showcase-grid">
          <div>
            <p className="ic-eyebrow ic-gold-eyebrow">Business Hub</p>

            <h2>
              Know how your business is performing and what needs attention.
            </h2>

            <p>
              A private, role-aware workspace for business operations,
              transactions, staff, balances, reports, alerts and performance.
            </p>

            <ButtonLink href="/business-hub" variant="light">
              Explore Business Hub
            </ButtonLink>
          </div>

          <div className="ic-business-dashboard">
            <div className="ic-dashboard-head">
              <div>
                <small>Business Hub</small>
                <strong>Today&apos;s performance</strong>
              </div>

              <span>Accra Central</span>
            </div>

            <div className="ic-dashboard-metrics">
              <div>
                <small>Revenue</small>
                <strong>GHS 8,420</strong>
                <span>Today</span>
              </div>

              <div>
                <small>Transactions</small>
                <strong>184</strong>
                <span>Recorded</span>
              </div>

              <div>
                <small>Staff online</small>
                <strong>7</strong>
                <span>Active</span>
              </div>
            </div>

            <div className="ic-dashboard-attention">
              <span>
                <Bell size={17} />
                Needs attention
              </span>

              <p>2 pending actions</p>
              <p>1 balance review</p>
              <p>3 new service enquiries</p>
            </div>
          </div>
        </div>
      </section>

      <section className="ic-section">
        <div className="ic-shell ic-community-grid">
          <div className="ic-community-preview">
            <div className="ic-preview-search">
              <Search size={18} />
              <span>Search communities, services or businesses</span>
            </div>

            <div className="ic-request-card">
              <span className="ic-request-icon">
                <MapPin size={18} />
              </span>

              <div>
                <small>Nearby request · East Legon</small>
                <strong>Electrician needed for a shop installation</strong>
                <p>
                  Verified businesses within the service radius can respond.
                </p>
              </div>
            </div>

            <div className="ic-request-card">
              <span className="ic-request-icon">
                <Building2 size={18} />
              </span>

              <div>
                <small>Business opportunity · Tema</small>
                <strong>Catering partner needed for a corporate event</strong>
                <p>
                  Relevant businesses can send an offer without exposing private
                  contact data.
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="ic-eyebrow">Community Hub</p>

            <h2>
              Useful professional networks, not another endless social feed.
            </h2>

            <p>
              Community Hub is designed around what matters to a person&apos;s
              profession, business and location: service requests,
              opportunities, discussions, announcements and trusted local
              connections.
            </p>

            <ButtonLink href="/community" variant="secondary">
              Enter Community
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="ic-section ic-marketplace-section">
        <div className="ic-shell ic-marketplace-grid">
          <div>
            <p className="ic-eyebrow">Marketplace</p>

            <h2>Find the right business for the job.</h2>

            <p>
              Discover relevant providers by service, location, availability,
              responsiveness, verification and customer experience.
            </p>

            <div className="ic-marketplace-actions">
              <ButtonLink href="/marketplace">Explore Marketplace</ButtonLink>

              <Link
                className="ic-text-action"
                href="/community#service-requests"
              >
                Request a service
              </Link>
            </div>
          </div>

          <div className="ic-marketplace-search">
            <div className="ic-search-box">
              <Search size={20} />

              <div>
                <small>What do you need?</small>
                <strong>plumber near me</strong>
              </div>
            </div>

            <div className="ic-result-card">
              <span className="ic-result-avatar">AK</span>

              <div>
                <strong>AK Professional Plumbing</strong>
                <span>
                  <ShieldCheck size={14} />
                  Verified business · 2.4 km
                </span>
              </div>

              <small>Available</small>
            </div>

            <div className="ic-result-card">
              <span className="ic-result-avatar">PP</span>

              <div>
                <strong>Prime Pipe Services</strong>
                <span>Madina · 4.1 km</span>
              </div>

              <small>Responds fast</small>
            </div>
          </div>
        </div>
      </section>

      <section className="ic-section">
        <div className="ic-shell ic-trust-grid">
          <div>
            <p className="ic-eyebrow">Trust by design</p>

            <h2>
              Business infrastructure should be useful, secure and accountable.
            </h2>
          </div>

          <div className="ic-trust-cards">
            <article>
              <ShieldCheck size={22} />
              <strong>Role-aware access</strong>
              <p>
                Business information stays within authorised business context.
              </p>
            </article>

            <article>
              <Smartphone size={22} />
              <strong>Mobile-first</strong>
              <p>
                Designed for the devices and connectivity patterns businesses
                actually use.
              </p>
            </article>

            <article>
              <Building2 size={22} />
              <strong>Business isolation</strong>
              <p>
                Private operational data is kept separate from public
                Marketplace information.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="ic-section ic-category-section">
        <div className="ic-shell">
          <div className="ic-section-heading ic-section-heading-single">
            <div>
              <p className="ic-eyebrow">Built for diverse businesses</p>

              <h2>
                One platform.
                <br />
                Many kinds of work.
              </h2>
            </div>
          </div>

          <div className="ic-category-cloud">
            {categories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="ic-section ic-partner-section">
        <div className="ic-shell ic-partner-card">
          <div>
            <p className="ic-eyebrow">Partner ecosystem</p>

            <h2>
              Infrastructure grows stronger when the right institutions build
              together.
            </h2>
          </div>

          <div>
            <p>
              Intellicore Systems is building for collaboration with telecoms,
              financial institutions, government, business associations, NGOs,
              enterprises and technology partners.
            </p>

            <Link className="ic-section-link" href="/partners">
              Partner with Intellicore
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="ic-section ic-final-cta-section" id="get-agentpro">
        <div className="ic-shell ic-final-cta">
          <div>
            <p className="ic-eyebrow ic-gold-eyebrow">AgentPro</p>

            <h2>
              One App.
              <br />
              Every Business.
            </h2>

            <p>
              Built to help businesses operate clearly, understand performance
              and connect to opportunity.
            </p>
          </div>

          <div className="ic-final-cta-actions">
            <ButtonLink href="/agentpro" variant="light">
              Explore AgentPro
            </ButtonLink>

            <ButtonLink href="/login" variant="secondary">
              Sign In
            </ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}
