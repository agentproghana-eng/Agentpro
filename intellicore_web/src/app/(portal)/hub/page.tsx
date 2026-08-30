import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HubSessionGate } from "@/features/auth/components/hub-session-gate";
import { authCookies } from "@/features/auth/config";

export const metadata: Metadata = {
  title: "AgentPro Hub",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function HubPage() {
  const store = await cookies();

  const accessToken = store.get(authCookies.access)?.value;

  const refreshToken = store.get(authCookies.refresh)?.value;

  /*
   * This is intentionally only a coarse session-presence gate.
   * It is not authorization. The AgentPro backend remains
   * authoritative for the actual authenticated session.
   */
  if (!accessToken && !refreshToken) {
    redirect("/login?next=/hub");
  }

  return <HubSessionGate />;
}
