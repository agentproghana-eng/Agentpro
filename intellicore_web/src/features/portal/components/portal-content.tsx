import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import type { AgentProUser } from "@/features/auth/types";
import { CommunityHub } from "@/features/community/components/community-hub";
import { BusinessDashboard } from "@/features/business/components/business-dashboard";

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
  const agentCommunityAccess = [
    "business_owner",
    "manager",
    "agent",
  ].includes(user.role ?? "");

  const personalCommunityAccess =
    Boolean(user.personal_subscription_plan);

  const hasCommunityAccess =
    agentCommunityAccess ||
    personalCommunityAccess;

  const hasAgentsHubAccess = [
    "business_owner",
    "manager",
    "agent",
    "auditor",
  ].includes(user.role ?? "");

  return (
    <>
      <section className="ic-portal-hero">
        <p className="ic-eyebrow">
          AgentPro workspace
        </p>

        <h1>
          Welcome, {firstName(user)}.
        </h1>

        <p>
          Manage Marketplace activity and,
          where approved, your AgentPro Mobile
          Money operations from one account.
        </p>
      </section>

      <section
        className="ic-portal-grid"
        aria-label="AgentPro hubs"
      >
        <Link
          href="/marketplace"
          className="ic-portal-feature-card"
        >
          <span className="ic-portal-feature-icon">
            <BriefcaseBusiness size={22} />
          </span>

          <div>
            <p className="ic-eyebrow">
              Marketplace
            </p>

            <h2>Business Hub</h2>

            <p>
              Browse Marketplace, manage seller
              activity and grow your presence on
              AgentPro.
            </p>
          </div>

          <span className="ic-portal-card-action">
            Open Business Hub
            <ArrowRight size={16} />
          </span>
        </Link>

        {hasCommunityAccess ? (
          <Link
            href="/hub/community"
            className="ic-portal-feature-card"
          >
            <span className="ic-portal-feature-icon">
              <UsersRound size={22} />
            </span>

            <div>
              <p className="ic-eyebrow">
                Community
              </p>

              <h2>Community Hub</h2>

              <p>
                Open the community available to
                your approved AgentPro account
                capabilities.
              </p>
            </div>

            <span className="ic-portal-card-action">
              Open Community
              <ArrowRight size={16} />
            </span>
          </Link>
        ) : (
          <article className="ic-portal-feature-card is-muted">
            <span className="ic-portal-feature-icon">
              <UsersRound size={22} />
            </span>

            <div>
              <p className="ic-eyebrow">
                Community
              </p>

              <h2>Community</h2>

              <p>
                Community access is not enabled
                for this account.
              </p>
            </div>
          </article>
        )}

        {hasAgentsHubAccess && (
          <Link
            href="/hub/agents"
            className="ic-portal-feature-card"
          >
            <span className="ic-portal-feature-icon">
              <Building2 size={22} />
            </span>

            <div>
              <p className="ic-eyebrow">
                Mobile Money
              </p>

              <h2>Agents Hub</h2>

              <p>
                Open your approved Mobile Money
                workspace for operations,
                transactions and business insight.
              </p>
            </div>

            <span className="ic-portal-card-action">
              Open Agents Hub
              <ArrowRight size={16} />
            </span>
          </Link>
        )}
      </section>

      <section className="ic-portal-summary-grid">
        <article className="ic-portal-summary-card">
          <ShieldCheck size={20} />

          <div>
            <span>Session</span>

            <strong>Verified</strong>

            <p>
              Your web session is being validated
              through AgentPro.
            </p>
          </div>
        </article>

        <article className="ic-portal-summary-card">
          <BriefcaseBusiness size={20} />

          <div>
            <span>Current workspace</span>

            <strong>
              {user.company_name ||
                "Personal AgentPro"}
            </strong>

            <p>{roleLabel(user.role)}</p>
          </div>
        </article>
      </section>
    </>
  );
}

export function CommunityHubView({ user }: Props) {
  return <CommunityHub user={user} />;
}

export function BusinessHubView({ user }: Props) {
  const hasAgentsHubAccess = [
    "business_owner",
    "manager",
    "agent",
    "auditor",
  ].includes(user.role ?? "");

  if (!hasAgentsHubAccess) {
    return (
      <>
        <section className="ic-portal-hero">
          <p className="ic-eyebrow">
            Mobile Money workspace
          </p>

          <h1>Agents Hub</h1>

          <p>
            Agents Hub is available only to
            approved AgentPro Mobile Money
            business accounts.
          </p>
        </section>

        <section className="ic-portal-notice">
          <Building2 size={21} />

          <div>
            <strong>
              Agents Hub access is not enabled.
            </strong>

            <p>
              Marketplace seller access remains
              separate from Mobile Money
              operational permissions.
            </p>
          </div>
        </section>
      </>
    );
  }

  return <BusinessDashboard user={user} />;
}
