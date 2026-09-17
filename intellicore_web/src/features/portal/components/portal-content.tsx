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
              Join Agent Community conversations or access your Personal
              Community based on your AgentPro account.
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

export function CommunityHubView({ user }: Props) {
  return <CommunityHub user={user} />;
}

export function BusinessHubView({ user }: Props) {
  const hasBusinessWorkspace = Boolean(
    user.company_id || user.company_name,
  );

  if (!hasBusinessWorkspace) {
    return (
      <>
        <section className="ic-portal-hero">
          <p className="ic-eyebrow">
            Business workspace
          </p>

          <h1>Business Hub</h1>

          <p>
            Link a business to your AgentPro account
            to view operational activity, reports and
            business information here.
          </p>
        </section>

        <section className="ic-portal-notice">
          <Building2 size={21} />

          <div>
            <strong>
              No business workspace is linked.
            </strong>

            <p>
              AgentPro will show business information
              only after your account has an active
              business membership.
            </p>
          </div>
        </section>
      </>
    );
  }

  return <BusinessDashboard user={user} />;
}
