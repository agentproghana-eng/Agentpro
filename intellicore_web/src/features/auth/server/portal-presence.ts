import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authCookies, safePortalReturnPath } from "@/features/auth/config";

/*
 * Coarse server-side session-presence protection only.
 *
 * This deliberately does not perform authorization. The AgentPro
 * backend and /api/auth/me remain authoritative for identity,
 * roles, tenant membership and permissions.
 */
export async function requirePortalSessionPresence(returnPath: string) {
  const store = await cookies();

  const accessToken = store.get(authCookies.access)?.value;

  const refreshToken = store.get(authCookies.refresh)?.value;

  if (!accessToken && !refreshToken) {
    const safeReturnPath = safePortalReturnPath(returnPath);

    redirect(`/login?next=${safeReturnPath}`);
  }
}
