import type { ReactNode } from "react";
import Link from "next/link";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Store,
  UsersRound,
} from "lucide-react";

import type { AgentProUser } from "@/features/auth/types";

export type PortalSection = "overview" | "community" | "business";

type Props = {
  user: Partial<AgentProUser>;
  activeSection: PortalSection;
  loggingOut: boolean;
  onLogout: () => void | Promise<void>;
  children: ReactNode;
};

function roleLabel(role: string | null | undefined) {
  if (!role) {
    return "AgentPro member";
  }

  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayName(user: Partial<AgentProUser>) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.email ||
    "AgentPro user"
  );
}

export function PortalShell({
  user,
  activeSection,
  loggingOut,
  onLogout,
  children,
}: Props) {
  const hasBusinessWorkspace =
    Boolean(user.company_id || user.company_name) ||
    ["superuser", "administrator"].includes(user.role ?? "");

  const navigation = [
    {
      id: "overview" as const,
      href: "/hub",
      label: "Overview",
      Icon: LayoutDashboard,
    },
    {
      id: "community" as const,
      href: "/hub/community",
      label: "Community Hub",
      Icon: UsersRound,
    },
    ...(hasBusinessWorkspace
      ? [
          {
            id: "business" as const,
            href: "/hub/business",
            label: "Business Hub",
            Icon: Building2,
          },
        ]
      : []),
  ];

  return (
    <div className="ic-portal-shell">
      <header className="ic-portal-topbar">
        <div className="ic-portal-brand">
          <Link href="/">Intellicore</Link>

          <span>AgentPro</span>
        </div>

        <div className="ic-portal-topbar-actions">
          <div className="ic-portal-identity">
            <strong>{displayName(user)}</strong>

            <span>{roleLabel(user.role)}</span>
          </div>

          <button
            type="button"
            className="ic-portal-signout"
            onClick={onLogout}
            disabled={loggingOut}
            aria-label={loggingOut ? "Signing out" : "Sign out"}
            title={loggingOut ? "Signing out" : "Sign out"}
          >
            <LogOut size={17} />

            <span>{loggingOut ? "Signing out" : "Sign out"}</span>
          </button>
        </div>
      </header>

      <div className="ic-portal-layout">
        <aside className="ic-portal-sidebar">
          <nav className="ic-portal-nav" aria-label="AgentPro workspace">
            {navigation.map(({ id, href, label, Icon }) => (
              <Link
                key={id}
                href={href}
                aria-current={activeSection === id ? "page" : undefined}
                className={activeSection === id ? "is-active" : undefined}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="ic-portal-sidebar-divider" />

          <nav
            className="ic-portal-nav ic-portal-nav-secondary"
            aria-label="AgentPro public links"
          >
            <Link href="/marketplace">
              <Store size={18} />
              <span>Marketplace</span>
            </Link>
          </nav>

          <div className="ic-portal-account-card">
            <span>Workspace</span>

            <strong>{user.company_name || "Personal AgentPro"}</strong>

            <small>{roleLabel(user.role)}</small>
          </div>
        </aside>

        <main className="ic-portal-main">{children}</main>
      </div>
    </div>
  );
}
