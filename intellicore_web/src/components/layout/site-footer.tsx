import Link from "next/link";

import {
  footerNavigation,
  siteConfig,
} from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="ic-footer">
      <div className="ic-shell ic-footer-grid">
        {Object.entries(footerNavigation).map(
          ([title, links]) => (
            <div
              className="ic-footer-column"
              key={title}
            >
              <strong>{title}</strong>

              {links.map((link) => (
                <Link
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ),
        )}
      </div>

      <div className="ic-shell ic-footer-bottom">
        <span>
          © {new Date().getFullYear()} AgentPro Ghana.
        </span>

        <span>
          AgentPro is a product of{" "}
          <a href={siteConfig.company.url}>
            COREINTEL SYSTEMS
          </a>
          .
        </span>
      </div>
    </footer>
  );
}
