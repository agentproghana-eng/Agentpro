import type { Metadata } from "next";

import { MarketplaceRegisterForm } from "@/features/auth/components/marketplace-register-form";
import { safePortalReturnPath } from "@/features/auth/config";

export const metadata: Metadata = {
  title: "Create Business Account",
  description:
    "Create a Business Owner account for AgentPro Marketplace.",
};

type Props = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams;

  const rawNext =
    typeof params.next === "string" ? params.next : "/marketplace";

  const returnPath = safePortalReturnPath(rawNext);

  return <MarketplaceRegisterForm returnPath={returnPath} />;
}
