import Link from "next/link";

import { footerNavigation, siteConfig } from "@/config/site";
import { IntellicoreBrand } from "@/components/brand/intellicore-brand";

export function SiteFooter() {
  return (
    <footer className="ic-footer">
      <div className="ic-shell ic-footer-grid">
        <div className="ic-footer-brand">
          <IntellicoreBrand />

          <p>
            Building intelligent systems that make businesses more connected,
            efficient and resilient.
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
        <span>© {new Date().getFullYear()} Intellicore Systems.</span>

        <span>AgentPro is a product of Intellicore Systems.</span>

        <a href={`mailto:${siteConfig.supportEmail}`}>
          {siteConfig.supportEmail}
        </a>
      </div>
    </footer>
  );
}
