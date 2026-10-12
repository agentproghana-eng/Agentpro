import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Shared building blocks for the Community and Business Hub landing pages.
 * Set NEXT_PUBLIC_PLAY_STORE_URL once the app is public on Google Play;
 * until then "Get the app" links to the signed APK.
 */
const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || "";
const APK_URL = "/download/agentpro-latest.apk";

export function appLink() {
  return PLAY_STORE_URL || APK_URL;
}

export function HubHero({
  eyebrow,
  title,
  lead,
  primary,
  secondary,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  children?: ReactNode;
}) {
  return (
    <section className="ic-hub-hero">
      <div className="ic-shell ic-hub-hero-grid">
        <div className="ic-hub-hero-copy">
          <p className="ic-hub-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="ic-hub-lead">{lead}</p>

          <div className="ic-hub-actions">
            <Link href={primary.href} className="ic-hub-button-light">
              {primary.label}
            </Link>
            <Link href={secondary.href} className="ic-hub-button-outline">
              {secondary.label}
            </Link>
          </div>
        </div>

        <div className="ic-hub-hero-visual">{children}</div>
      </div>
    </section>
  );
}

export function HubSection({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className="ic-hub-section">
      <div className="ic-shell">
        <h2>{title}</h2>
        {lead && <p className="ic-hub-section-lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}

export function HubFinalCta({
  title,
  text,
  primary,
}: {
  title: string;
  text: string;
  primary: { label: string; href: string };
}) {
  return (
    <section className="ic-hub-section ic-hub-section-last">
      <div className="ic-shell">
        <div className="ic-hub-cta">
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>

          <div className="ic-hub-actions">
            <Link href={primary.href} className="ic-hub-button-light">
              {primary.label}
            </Link>
            <a href={appLink()} className="ic-hub-button-dark">
              Get the app
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
