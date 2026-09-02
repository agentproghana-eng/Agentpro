import Link from "next/link";

import { AgentProBrand } from "@/components/brand/agentpro-brand";
import { ButtonLink } from "@/components/ui/button-link";

const navigation = [
  { label: "Marketplace", href: "/" },
  { label: "Community", href: "/community" },
  { label: "Business Hub", href: "/business-hub" },
  { label: "AgentPro", href: "/agentpro" },
] as const;

export function SiteHeader() {
  return (
    <header className="ic-header">
      <div className="ic-shell ic-header-inner">
        <AgentProBrand compact />

        <nav className="ic-desktop-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ic-header-actions">
          <Link className="ic-sign-in" href="/login">
            Sign In
          </Link>

          <ButtonLink href="/login">Post Ad</ButtonLink>
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

            <Link href="/login">Sign In</Link>

            <Link className="ic-mobile-primary" href="/login">
              Post Ad
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
