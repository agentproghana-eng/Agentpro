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
            One App Every Business. Discover products, connect with people,
            manage business activity and grow with AgentPro.
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

        <span>AgentPro is a product of CoreIntel Systems.</span>

        <a href={`mailto:${siteConfig.supportEmail}`}>
          {siteConfig.supportEmail}
        </a>
      </div>
    </footer>
  );
}
