export const authCookies = {
  access: "intellicore_web_access",
  refresh: "intellicore_web_refresh",
} as const;

export const authCookieLifetime = {
  accessSeconds: 15 * 60,
  refreshSeconds: 30 * 24 * 60 * 60,
} as const;

export function safePortalReturnPath(value: string | null | undefined): string {
  if (!value || value.includes("\\")) {
    return "/hub";
  }

  try {
    const base = new URL("https://intellicore.invalid");
    const resolved = new URL(value, base);

    if (resolved.origin !== base.origin) {
      return "/hub";
    }

    if (
      resolved.pathname !== "/hub" &&
      !resolved.pathname.startsWith("/hub/")
    ) {
      return "/hub";
    }

    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return "/hub";
  }
}
