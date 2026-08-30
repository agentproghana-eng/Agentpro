import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button-link";

export type PublicPageItem = {
  title: string;
  description: string;
};

export type PublicPageSection = {
  eyebrow: string;
  title: string;
  description?: string;
  items?: readonly PublicPageItem[];
};

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
  highlights?: readonly string[];
  sections: readonly PublicPageSection[];
  cta?: {
    eyebrow?: string;
    title: string;
    description: string;
    label: string;
    href: string;
  };
};

export function PublicInfoPage({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  highlights,
  sections,
  cta,
}: Props) {
  return (
    <main id="main-content">
      <section className="ic-page-hero">
        <div className="ic-shell ic-page-hero-grid">
          <div>
            <p className="ic-eyebrow">{eyebrow}</p>

            <h1>{title}</h1>

            <p className="ic-page-hero-lead">{description}</p>

            {(primaryAction || secondaryAction) && (
              <div className="ic-page-actions">
                {primaryAction && (
                  <ButtonLink href={primaryAction.href}>
                    {primaryAction.label}
                    <ArrowRight size={17} />
                  </ButtonLink>
                )}

                {secondaryAction && (
                  <ButtonLink href={secondaryAction.href} variant="secondary">
                    {secondaryAction.label}
                  </ButtonLink>
                )}
              </div>
            )}
          </div>

          {highlights && highlights.length > 0 && (
            <aside className="ic-page-highlight-panel">
              <span>Intellicore platform</span>

              <div>
                {highlights.map((highlight) => (
                  <p key={highlight}>
                    <CheckCircle2 size={17} />
                    {highlight}
                  </p>
                ))}
              </div>
            </aside>
          )}
        </div>
      </section>

      {sections.map((section, index) => (
        <section
          className={
            index % 2 === 1
              ? "ic-page-section ic-page-section-alt"
              : "ic-page-section"
          }
          key={section.title}
        >
          <div className="ic-shell">
            <div className="ic-page-section-heading">
              <div>
                <p className="ic-eyebrow">{section.eyebrow}</p>

                <h2>{section.title}</h2>
              </div>

              {section.description && <p>{section.description}</p>}
            </div>

            {section.items && (
              <div className="ic-info-grid">
                {section.items.map((item) => (
                  <article className="ic-info-card" key={item.title}>
                    <span className="ic-info-marker" />

                    <h3>{item.title}</h3>

                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ))}

      {cta && (
        <section className="ic-page-cta-section">
          <div className="ic-shell ic-page-cta">
            <div>
              {cta.eyebrow && (
                <p className="ic-eyebrow ic-gold-eyebrow">{cta.eyebrow}</p>
              )}

              <h2>{cta.title}</h2>

              <p>{cta.description}</p>
            </div>

            <ButtonLink href={cta.href} variant="light">
              {cta.label}
            </ButtonLink>
          </div>
        </section>
      )}

      <div className="ic-page-back">
        <div className="ic-shell">
          <Link href="/">
            Intellicore Systems
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </main>
  );
}
