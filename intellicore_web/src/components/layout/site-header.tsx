import Link from "next/link";

import { companyNavigation, primaryNavigation } from "@/config/site";
import { IntellicoreBrand } from "@/components/brand/intellicore-brand";
import { ButtonLink } from "@/components/ui/button-link";

export function SiteHeader() {
  return (
    <header className="ic-header">
      <div className="ic-shell ic-header-inner">
        <IntellicoreBrand />

        <nav className="ic-desktop-nav" aria-label="Primary navigation">
          {primaryNavigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}

          <details className="ic-nav-more">
            <summary>Company</summary>

            <div className="ic-nav-menu">
              {companyNavigation.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>

        <div className="ic-header-actions">
          <Link className="ic-sign-in" href="/login">
            Sign In
          </Link>

          <ButtonLink href="/agentpro#get-agentpro">Get AgentPro</ButtonLink>
        </div>

        <details className="ic-mobile-nav">
          <summary aria-label="Open navigation">
            <span />
            <span />
            <span />
          </summary>

          <nav aria-label="Mobile navigation">
            {[...primaryNavigation, ...companyNavigation].map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}

            <Link href="/login">Sign In</Link>

            <Link className="ic-mobile-primary" href="/agentpro#get-agentpro">
              Get AgentPro
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
