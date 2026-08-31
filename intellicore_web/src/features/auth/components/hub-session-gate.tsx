"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck } from "lucide-react";

import type { AgentProUser } from "@/features/auth/types";
import { CommunityPostDetail } from "@/features/community/components/community-post-detail";
import {
  BusinessHubView,
  CommunityHubView,
  PortalOverview,
} from "@/features/portal/components/portal-content";
import {
  PortalShell,
  type PortalSection,
} from "@/features/portal/components/portal-shell";

type PortalUser = Partial<AgentProUser>;

type MeResponse = {
  success?: boolean;
  message?: string;
  data?:
    | (PortalUser & {
        user?: PortalUser;
      })
    | null;
  user?: PortalUser;
};

function extractUser(body: MeResponse): PortalUser | null {
  if (body.data?.user) {
    return body.data.user;
  }

  if (body.user) {
    return body.user;
  }

  if (
    body.data &&
    (body.data.email || body.data.first_name || body.data.role)
  ) {
    return body.data;
  }

  return null;
}

async function requestSession(): Promise<
  | {
      kind: "authenticated";
      user: PortalUser;
    }
  | {
      kind: "unauthorized";
    }
  | {
      kind: "error";
      message: string;
    }
> {
  const controller = new AbortController();

  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  let response: Response;

  try {
    response = await fetch("/api/auth/me", {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }

  if (response.status === 401) {
    return {
      kind: "unauthorized",
    };
  }

  const body = (await response.json()) as MeResponse;

  if (!response.ok) {
    return {
      kind: "error",
      message: body.message ?? "Unable to load your AgentPro session.",
    };
  }

  const sessionUser = extractUser(body);

  if (!sessionUser) {
    return {
      kind: "error",
      message: "AgentPro returned an incomplete session profile.",
    };
  }

  return {
    kind: "authenticated",
    user: sessionUser,
  };
}

type Props = {
  section?: PortalSection;
  returnPath?: string;
  communityPost?: {
    kind: "agent" | "personal";
    postId: string;
  };
};

export function HubSessionGate({
  section = "overview",
  returnPath,
  communityPost,
}: Props) {
  const [user, setUser] = useState<PortalUser | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void requestSession()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (result.kind === "unauthorized") {
          window.location.replace(
            `/login?next=${encodeURIComponent(
              returnPath ??
                (section === "overview" ? "/hub" : `/hub/${section}`),
            )}`,
          );

          return;
        }

        if (result.kind === "error") {
          setError(result.message);

          return;
        }

        setUser(result.user);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Unable to reach AgentPro. Check your connection and try again.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [returnPath, section]);

  function retrySession() {
    setLoading(true);
    setError(null);

    void requestSession()
      .then((result) => {
        if (result.kind === "unauthorized") {
          window.location.replace(
            `/login?next=${encodeURIComponent(
              returnPath ??
                (section === "overview" ? "/hub" : `/hub/${section}`),
            )}`,
          );

          return;
        }

        if (result.kind === "error") {
          setError(result.message);

          return;
        }

        setUser(result.user);
      })
      .catch(() => {
        setError(
          "Unable to reach AgentPro. Check your connection and try again.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }

  async function logout() {
    setLoading(true);
    setError(null);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{}",
      });
    } finally {
      window.location.replace("/login");
    }
  }

  if (loading && !user) {
    return (
      <main className="ic-hub-gate">
        <div className="ic-hub-gate-card">
          <Loader2 className="ic-spin" size={25} />

          <strong>Opening AgentPro</strong>

          <span>Verifying your secure session.</span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="ic-hub-gate">
        <div className="ic-hub-gate-card">
          <ShieldCheck size={27} />

          <strong>AgentPro could not be opened.</strong>

          <span>{error}</span>

          <button
            type="button"
            className="ic-auth-submit"
            onClick={retrySession}
          >
            Try again
          </button>

          <Link href="/">Return to Intellicore</Link>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <PortalShell
      user={user}
      activeSection={section}
      loggingOut={loading}
      onLogout={logout}
    >
      {section === "community" &&
        (communityPost ? (
          <CommunityPostDetail
            user={user}
            kind={communityPost.kind}
            postId={communityPost.postId}
          />
        ) : (
          <CommunityHubView user={user} />
        ))}

      {section === "business" && <BusinessHubView user={user} />}

      {section === "overview" && <PortalOverview user={user} />}
    </PortalShell>
  );
}
