import type { Metadata } from "next";

import { siteConfig } from "@/config/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default:
      "Intellicore Systems | Technology Built for the Way Business Works",
    template: "%s | Intellicore Systems",
  },
  description: siteConfig.description,
  applicationName: "Intellicore Systems",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Intellicore Systems",
    title: "Intellicore Systems | Technology Built for the Way Business Works",
    description: siteConfig.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Intellicore Systems | Technology Built for the Way Business Works",
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Intellicore Systems",
  url: siteConfig.url,
  description: siteConfig.description,
  brand: {
    "@type": "Brand",
    name: "Intellicore Systems",
  },
  owns: {
    "@type": "SoftwareApplication",
    name: "AgentPro",
    applicationCategory: "BusinessApplication",
    description:
      "An integrated business operating platform from Intellicore Systems.",
  },
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
            __html: JSON.stringify(organizationSchema),
          }}
        />
      </body>
    </html>
  );
}
