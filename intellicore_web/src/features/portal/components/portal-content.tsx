import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  FileBarChart,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
} from "lucide-react";

import type { AgentProUser } from "@/features/auth/types";
import { CommunityHub } from "@/features/community/components/community-hub";

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
