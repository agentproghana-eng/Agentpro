export const siteConfig = {
  name: "AgentPro Ghana",
  shortName: "AgentPro",
  description:
    "AgentPro Ghana is a marketplace and connected business platform for products, services, communities, transactions and business tools.",
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://agentproghana.com",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@agentproghana.com",
  company: {
    name: "Coreintel Systems",
    url: "https://coreintelsystem.com",
  },
  agentPro: {
    name: "AgentPro",
    tagline: "One App. Every Business.",
  },
} as const;

export const primaryNavigation = [
  { label: "Marketplace", href: "/" },
  { label: "Community", href: "/community" },
  { label: "Business Hub", href: "/business-hub" },
  { label: "AgentPro", href: "/agentpro" },
] as const;

export const companyNavigation = [
  { label: "Security", href: "/security" },
  { label: "Help", href: "/resources#help" },
  { label: "Contact", href: "/contact" },
] as const;

export const footerNavigation = {
  Marketplace: [
    { label: "Browse Marketplace", href: "/" },
    { label: "All Listings", href: "/marketplace" },
    { label: "Sign In to Post", href: "/login" },
  ],
  AgentPro: [
    { label: "AgentPro", href: "/agentpro" },
    { label: "Business Hub", href: "/business-hub" },
    { label: "My AgentPro", href: "/hub" },
  ],
  Community: [
    { label: "Community", href: "/community" },
    { label: "Security", href: "/security" },
    { label: "Help Center", href: "/resources#help" },
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
  "/marketplace",
  "/agentpro",
  "/community",
  "/business-hub",
  "/security",
  "/privacy",
  "/terms",
  "/cookies",
  "/acceptable-use",
] as const;
