import type { Metadata } from "next";
import Link from "next/link";

import { IntellicoreBrand } from "@/components/brand/intellicore-brand";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
  referrer: "no-referrer",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="ic-auth-shell">
      <section className="ic-auth-brand-panel">
        <div className="ic-auth-brand-inner">
          <IntellicoreBrand />

          <div className="ic-auth-brand-copy">
            <p className="ic-eyebrow ic-gold-eyebrow">AgentPro</p>

            <h1>
              Your business.
              <br />
              Connected.
            </h1>

            <p>
              Secure access to the AgentPro web experience from Intellicore
              Systems.
            </p>
          </div>

          <div className="ic-auth-trust">
            <span>Secure session handling</span>
            <span>Role-aware access</span>
            <span>MFA for privileged accounts</span>
          </div>
        </div>
      </section>

      <section className="ic-auth-content">
        <div className="ic-auth-content-top">
          <Link href="/">Back to Intellicore</Link>
        </div>

        <div className="ic-auth-card">{children}</div>

        <p className="ic-auth-footer-note">
          AgentPro is a product of Intellicore Systems.
        </p>
      </section>
    </main>
  );
}
