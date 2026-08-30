export const siteConfig = {
  name: "Intellicore Systems",
  shortName: "Intellicore",
  description:
    "Intellicore Systems builds intelligent digital platforms that help businesses operate, transact, connect, grow and serve their communities.",
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://intellicoresystem.com",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@intellicoresystem.com",
  agentPro: {
    name: "AgentPro",
    tagline: "One App. Every Business.",
  },
} as const;

export const primaryNavigation = [
  { label: "Home", href: "/" },
  { label: "AgentPro", href: "/agentpro" },
  { label: "Solutions", href: "/solutions" },
  { label: "Community", href: "/community" },
  { label: "Business Hub", href: "/business-hub" },
  { label: "Marketplace", href: "/marketplace" },
] as const;

export const companyNavigation = [
  { label: "About", href: "/about" },
  { label: "Partners", href: "/partners" },
  { label: "Resources", href: "/resources" },
  { label: "Security", href: "/security" },
  { label: "Contact", href: "/contact" },
] as const;

export const footerNavigation = {
  Product: [
    { label: "AgentPro", href: "/agentpro" },
    { label: "Community Hub", href: "/community" },
    { label: "Business Hub", href: "/business-hub" },
    { label: "Marketplace", href: "/marketplace" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Partners", href: "/partners" },
    { label: "Careers", href: "/about#careers" },
    { label: "Contact", href: "/contact" },
  ],
  Resources: [
    { label: "Help Center", href: "/resources#help" },
    { label: "Blog", href: "/resources#blog" },
    { label: "Security", href: "/security" },
    { label: "Privacy", href: "/privacy" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "Acceptable Use", href: "/acceptable-use" },
  ],
} as const;

export const publicSitemapRoutes = [
  "",
  "/agentpro",
  "/solutions",
  "/community",
  "/business-hub",
  "/marketplace",
  "/about",
  "/partners",
  "/resources",
  "/security",
  "/contact",
  "/privacy",
  "/terms",
  "/cookies",
  "/acceptable-use",
] as const;
