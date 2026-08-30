import type { MetadataRoute } from "next";

import { publicSitemapRoutes, siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemapRoutes.map((route, index) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : route === "/agentpro" ? 0.95 : 0.8,
  }));
}
