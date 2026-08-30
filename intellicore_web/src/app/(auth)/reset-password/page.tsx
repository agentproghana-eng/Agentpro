import type { Metadata } from "next";

import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your AgentPro account.",
};

type Props = {
  searchParams: Promise<{
    uid?: string | string[];
    token?: string | string[];
  }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;

  const userId = typeof params.uid === "string" ? params.uid : null;

  const token = typeof params.token === "string" ? params.token : null;

  return <ResetPasswordForm userId={userId} token={token} />;
}
