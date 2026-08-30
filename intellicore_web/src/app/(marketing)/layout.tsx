import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <a className="ic-skip-link" href="#main-content">
        Skip to main content
      </a>

      <SiteHeader />

      {children}

      <SiteFooter />
    </>
  );
}
