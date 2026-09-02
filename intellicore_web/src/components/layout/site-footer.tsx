import Link from "next/link";

import { AgentProBrand } from "@/components/brand/agentpro-brand";
import { footerNavigation, siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="ic-footer">
      <div className="ic-shell ic-footer-grid">
        <div className="ic-footer-brand">
          <AgentProBrand />

          <p>
            Marketplace, business tools and communities for everyday commerce
            across Ghana.
          </p>
        </div>

        {Object.entries(footerNavigation).map(([title, links]) => (
          <div className="ic-footer-column" key={title}>
            <strong>{title}</strong>

            {links.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="ic-shell ic-footer-bottom">
        <span>© {new Date().getFullYear()} AgentPro Ghana.</span>

        <span>AgentPro is a product of Coreintel Systems.</span>

        <a href={`mailto:${siteConfig.supportEmail}`}>
          {siteConfig.supportEmail}
        </a>
      </div>
    </footer>
  );
}
