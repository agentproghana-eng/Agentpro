import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "AgentPro Ghana. One App Every Business.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Branded share card used by WhatsApp, Facebook, X and search previews
 * for every page that does not set its own image.
 */
export default async function OpenGraphImage() {
  const shield = await readFile(
    path.join(process.cwd(), "public", "agentpro-shield.png"),
  );
  const shieldSrc = `data:image/png;base64,${shield.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          padding: 80,
          background: "#0c2d28",
          color: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shieldSrc} alt="" width={260} height={260} />

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: -2,
            }}
          >
            <span>Agent</span>
            <span style={{ color: "#2fd1a0" }}>Pro</span>
          </div>

          <div style={{ fontSize: 40, color: "#c4d9d4" }}>
            One App Every Business
          </div>

          <div style={{ fontSize: 28, color: "#e8b33c" }}>
            Marketplace · Community · Business tools · Ghana
          </div>
        </div>
      </div>
    ),
    size,
  );
}
