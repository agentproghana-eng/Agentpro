import { NextResponse } from "next/server";

const LATEST_SIGNED_APK =
  "https://github.com/agentproghana-eng/Agentpro/releases/download/android-latest/agentpro-latest.apk";

export function GET() {
  const response = NextResponse.redirect(
    new URL(LATEST_SIGNED_APK),
    307,
  );

  response.headers.set(
    "Cache-Control",
    "no-store, max-age=0",
  );

  return response;
}
