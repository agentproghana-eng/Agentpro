import type { Metadata } from "next";

import { MarketplaceBrowse } from "@/features/marketplace/components/marketplace-browse";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Marketplace",
  description:
    "Buy, sell and discover products, services and businesses across Ghana with AgentPro Marketplace.",
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <section
        aria-label="Download AgentPro for Android"
        style={{
          margin: "0 auto",
          maxWidth: "1200px",
          padding: "16px 16px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            border: "1px solid rgba(15, 23, 42, 0.12)",
            borderRadius: "16px",
            padding: "16px 18px",
            background: "#ffffff",
          }}
        >
          <div>
            <strong style={{ display: "block", marginBottom: "4px" }}>
              Get AgentPro on Android
            </strong>
            <span style={{ color: "#475569", fontSize: "14px" }}>
              Download the latest official AgentPro Ghana app.
            </span>
          </div>

          <a
            href="/download/agentpro-latest.apk"
            download
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "44px",
              padding: "0 18px",
              borderRadius: "12px",
              background: "#0f172a",
              color: "#ffffff",
              fontWeight: 700,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Download for Android
          </a>
        </div>
      </section>

      <MarketplaceBrowse basePath="/" />
    </>
  );
}
