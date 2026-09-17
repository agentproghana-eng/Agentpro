import { cookies } from "next/headers";
import Link from "next/link";

import { AgentProBrand } from "@/components/brand/agentpro-brand";
import { ButtonLink } from "@/components/ui/button-link";
import { authCookies } from "@/features/auth/config";

export async function SiteHeader() {
  const store = await cookies();

  const hasSession =
    Boolean(store.get(authCookies.access)?.value) ||
    Boolean(store.get(authCookies.refresh)?.value);

  const navigation = [
    { label: "Marketplace", href: "/" },
    {
      label: "Community",
      href: hasSession ? "/hub/community" : "/community",
    },
    {
      label: "Business Hub",
      href: hasSession ? "/hub/business" : "/business-hub",
    },
    { label: "AgentPro", href: "/agentpro" },
  ] as const;

  const sessionHref = hasSession ? "/hub" : "/login";
  const sessionLabel = hasSession ? "My AgentPro" : "Sign In";
  const postAdHref = hasSession
    ? "/marketplace/post"
    : "/login?next=%2Fmarketplace%2Fpost";

  return (
    <header className="ic-header">
      <div className="ic-shell ic-header-inner">
        <AgentProBrand ecosystem />

        <nav className="ic-desktop-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ic-header-actions">
          {!hasSession && (
            <Link className="ic-create-account" href="/register">
              Create Account
            </Link>
          )}

          <Link className="ic-sign-in" href={sessionHref}>
            {sessionLabel}
          </Link>

          <ButtonLink href={postAdHref}>Post Ad</ButtonLink>
        </div>

        <details className="ic-mobile-nav">
          <summary aria-label="Open navigation">
            <span />
            <span />
            <span />
          </summary>

          <nav aria-label="Mobile navigation">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}

            {!hasSession && <Link href="/register">Create Account</Link>}

            <Link href={sessionHref}>{sessionLabel}</Link>

            <Link className="ic-mobile-primary" href={postAdHref}>
              Post Ad
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
