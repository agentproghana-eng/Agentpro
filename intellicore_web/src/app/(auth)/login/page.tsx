import type { Metadata } from "next";

import { LoginForm } from "@/features/auth/components/login-form";
import { safePortalReturnPath } from "@/features/auth/config";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Secure sign in to the AgentPro web platform.",
};

type Props = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  const rawNext = typeof params.next === "string" ? params.next : null;

  const returnPath = safePortalReturnPath(rawNext);

  return <LoginForm returnPath={returnPath} />;
}
