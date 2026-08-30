import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileBarChart,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
} from "lucide-react";

import type { AgentProUser } from "@/features/auth/types";

type Props = {
  user: Partial<AgentProUser>;
};

function firstName(user: Partial<AgentProUser>) {
  return user.first_name || user.email?.split("@")[0] || "there";
}

function roleLabel(role: string | null | undefined) {
  if (!role) {
    return "AgentPro member";
  }

  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PortalOverview({ user }: Props) {
  const hasBusinessWorkspace = Boolean(user.company_id || user.company_name);

  return (
    <>
      <section className="ic-portal-hero">
        <p className="ic-eyebrow">AgentPro workspace</p>

        <h1>Welcome, {firstName(user)}.</h1>

        <p>
          Move between your community connections and business workspace from
          one authenticated AgentPro experience.
        </p>
      </section>

      <section className="ic-portal-grid" aria-label="AgentPro hubs">
        <Link href="/hub/community" className="ic-portal-feature-card">
          <span className="ic-portal-feature-icon">
            <UsersRound size={22} />
          </span>

          <div>
            <p className="ic-eyebrow">Community</p>

            <h2>Community Hub</h2>

            <p>
              Discover services, connect with nearby professionals and manage
              community service requests.
            </p>
          </div>

          <span className="ic-portal-card-action">
            Open Community Hub
            <ArrowRight size={16} />
          </span>
        </Link>

        {hasBusinessWorkspace ? (
          <Link href="/hub/business" className="ic-portal-feature-card">
            <span className="ic-portal-feature-icon">
              <Building2 size={22} />
            </span>

            <div>
              <p className="ic-eyebrow">Business</p>

              <h2>Business Hub</h2>

              <p>
                Enter your private business workspace for operations, people and
                business insights.
              </p>
            </div>

            <span className="ic-portal-card-action">
              Open Business Hub
              <ArrowRight size={16} />
            </span>
          </Link>
        ) : (
          <article className="ic-portal-feature-card is-muted">
            <span className="ic-portal-feature-icon">
              <Building2 size={22} />
            </span>

            <div>
              <p className="ic-eyebrow">Business</p>

              <h2>Business Hub</h2>

              <p>
                A business workspace will appear here when one is linked to your
                AgentPro account.
              </p>
            </div>
          </article>
        )}
      </section>

      <section className="ic-portal-summary-grid">
        <article className="ic-portal-summary-card">
          <ShieldCheck size={20} />

          <div>
            <span>Session</span>

            <strong>Verified</strong>

            <p>Your web session is being validated through AgentPro.</p>
          </div>
        </article>

        <article className="ic-portal-summary-card">
          <BriefcaseBusiness size={20} />

          <div>
            <span>Current workspace</span>

            <strong>{user.company_name || "Personal AgentPro"}</strong>

            <p>{roleLabel(user.role)}</p>
          </div>
        </article>
      </section>
    </>
  );
}

const serviceJourney = [
  "Requested",
  "Providers Found",
  "Offers Received",
  "Provider Selected",
  "In Progress",
  "Completed",
  "Reviewed",
];

export function CommunityHubView({ user }: Props) {
  return (
    <>
      <section className="ic-portal-hero">
        <p className="ic-eyebrow">AgentPro Community</p>

        <h1>Community Hub</h1>

        <p>
          A trusted workspace for finding local services, responding to requests
          and building useful professional connections.
        </p>
      </section>

      <section className="ic-portal-highlight">
        <div>
          <span className="ic-portal-feature-icon">
            <MapPin size={22} />
          </span>

          <div>
            <p className="ic-eyebrow">Service discovery</p>

            <h2>Connect by service and location.</h2>

            <p>
              Community service discovery will prioritize relevant providers
              while protecting sensitive location details.
            </p>
          </div>
        </div>

        <span className="ic-portal-status">Foundation</span>
      </section>

      <section className="ic-portal-section">
        <div className="ic-portal-section-heading">
          <div>
            <p className="ic-eyebrow">Request journey</p>

            <h2>One clear service lifecycle.</h2>
          </div>

          <p>
            Every request follows a consistent status model from discovery
            through review.
          </p>
        </div>

        <ol className="ic-service-journey">
          {serviceJourney.map((status, index) => (
            <li key={status}>
              <span>{index + 1}</span>

              <strong>{status}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="ic-portal-grid ic-portal-grid-three">
        <article className="ic-portal-mini-card">
          <MessageSquareText size={20} />

          <h3>Service requests</h3>

          <p>Request help and track responses from suitable providers.</p>

          <span>Coming next</span>
        </article>

        <article className="ic-portal-mini-card">
          <UsersRound size={20} />

          <h3>Professional communities</h3>

          <p>Join communities around trades, professions and services.</p>

          <span>Coming next</span>
        </article>

        <article className="ic-portal-mini-card">
          <CheckCircle2 size={20} />

          <h3>Trusted completion</h3>

          <p>Complete and review work inside a consistent request journey.</p>

          <span>Coming next</span>
        </article>
      </section>

      <p className="ic-portal-context-note">
        Signed in as{" "}
        <strong>{user.first_name || user.email || "AgentPro member"}</strong>.
      </p>
    </>
  );
}

export function BusinessHubView({ user }: Props) {
  const hasBusinessWorkspace = Boolean(user.company_id || user.company_name);

  return (
    <>
      <section className="ic-portal-hero">
        <p className="ic-eyebrow">Private workspace</p>

        <h1>Business Hub</h1>

        <p>
          Your authenticated home for business operations, people, records and
          future AgentPro web tools.
        </p>
      </section>

      {!hasBusinessWorkspace && (
        <section className="ic-portal-notice">
          <Building2 size={21} />

          <div>
            <strong>No business workspace is linked yet.</strong>

            <p>
              Business data will only be shown after AgentPro confirms the
              account&apos;s business membership.
            </p>
          </div>
        </section>
      )}

      <section className="ic-portal-business-context">
        <div>
          <span>Current business</span>

          <strong>{user.company_name || "Not linked"}</strong>
        </div>

        <div>
          <span>Account role</span>

          <strong>{roleLabel(user.role)}</strong>
        </div>
      </section>

      <section className="ic-portal-grid ic-portal-grid-three">
        <article className="ic-portal-mini-card">
          <ClipboardList size={20} />

          <h3>Operations</h3>

          <p>
            A focused place for business activity and operational workflows.
          </p>

          <span>Foundation ready</span>
        </article>

        <article className="ic-portal-mini-card">
          <UserRoundCog size={20} />

          <h3>People & roles</h3>

          <p>
            Role-aware access for owners, managers, agents and other team
            members.
          </p>

          <span>Foundation ready</span>
        </article>

        <article className="ic-portal-mini-card">
          <FileBarChart size={20} />

          <h3>Reports & insights</h3>

          <p>
            Business reporting and insights will enter through this private
            workspace.
          </p>

          <span>Coming next</span>
        </article>
      </section>

      <section className="ic-portal-highlight">
        <div>
          <span className="ic-portal-feature-icon">
            <ShieldCheck size={22} />
          </span>

          <div>
            <p className="ic-eyebrow">Access model</p>

            <h2>Backend-authoritative permissions.</h2>

            <p>
              The portal can adapt its interface to account context, but
              AgentPro remains authoritative for business membership and
              authorization.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
