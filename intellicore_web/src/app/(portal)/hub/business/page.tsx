import { redirect } from "next/navigation";

export default function LegacyBusinessHubPage() {
  redirect("/hub/agents");
}
