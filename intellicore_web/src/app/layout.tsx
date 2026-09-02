import type { Metadata } from "next";

import { siteConfig } from "@/config/site";

import "./globals.css";

const defaultTitle =
  "AgentPro Ghana | Marketplace, Business & Community";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: defaultTitle,
    template: "%s | AgentPro Ghana",
  },
  description: siteConfig.description,
  applicationName: "AgentPro",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "AgentPro Ghana",
    title: defaultTitle,
    description: siteConfig.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const platformSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "AgentPro Ghana",
      url: siteConfig.url,
      description: siteConfig.description,
      publisher: {
        "@type": "Organization",
        name: siteConfig.company.name,
        url: siteConfig.company.url,
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "AgentPro",
      applicationCategory: "BusinessApplication",
      description:
        "A connected marketplace and business operating platform for Ghana.",
      provider: {
        "@type": "Organization",
        name: siteConfig.company.name,
        url: siteConfig.company.url,
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(platformSchema),
          }}
        />
      </body>
    </html>
  );
}
