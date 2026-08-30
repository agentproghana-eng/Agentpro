"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";

type User = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  company_name?: string | null;
  role?: string | null;
};

type MeResponse = {
  success?: boolean;
  message?: string;
  data?: {
    user?: User;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    company_name?: string | null;
    role?: string | null;
  } | null;
  user?: User;
};

function extractUser(body: MeResponse): User | null {
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
      user: User;
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

export function HubSessionGate() {
  const [user, setUser] = useState<User | null>(null);

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
          window.location.replace("/login?next=/hub");

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
  }, []);

  function retrySession() {
    setLoading(true);
    setError(null);

    void requestSession()
      .then((result) => {
        if (result.kind === "unauthorized") {
          window.location.replace("/login?next=/hub");

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

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "AgentPro user";

  return (
    <main className="ic-hub-entry">
      <header className="ic-hub-entry-header">
        <Link href="/">Intellicore</Link>

        <button type="button" onClick={logout} disabled={loading}>
          <LogOut size={16} />
          Sign out
        </button>
      </header>

      <section className="ic-hub-entry-main">
        <div>
          <p className="ic-eyebrow">AgentPro web</p>

          <h1>Welcome, {displayName}.</h1>

          <p>
            Your secure AgentPro web session is active. Community Hub and
            Business Hub will use this authenticated workspace.
          </p>
        </div>

        <aside className="ic-hub-entry-panel">
          <span>
            <ShieldCheck size={18} />
            Session verified
          </span>

          {user?.company_name && (
            <div>
              <small>Current business</small>

              <strong>
                <Building2 size={17} />
                {user.company_name}
              </strong>
            </div>
          )}

          {user?.role && (
            <div>
              <small>Account role</small>

              <strong>{user.role.replaceAll("_", " ")}</strong>
            </div>
          )}

          <p>The complete AgentPro portal shell is the next build stage.</p>

          <Link href="/agentpro">
            AgentPro overview
            <ArrowRight size={15} />
          </Link>
        </aside>
      </section>
    </main>
  );
}
