"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
} from "lucide-react";

type ApiResponse = {
  success?: boolean;
  message?: string;
};

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [complete, setComplete] = useState(false);

  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
        }),
      });

      let body: ApiResponse = {};

      try {
        body = (await response.json()) as ApiResponse;
      } catch {
        // Use generic fallback.
      }

      if (!response.ok) {
        setError(body.message ?? "Unable to process the request.");

        return;
      }

      setMessage(
        body.message ??
          "If that email is registered, reset instructions will be sent.",
      );

      setComplete(true);
    } catch {
      setError(
        "Password recovery is temporarily unavailable. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (complete) {
    return (
      <div className="ic-auth-form">
        <div className="ic-auth-form-heading">
          <span className="ic-auth-icon">
            <CheckCircle2 size={22} />
          </span>

          <p className="ic-eyebrow">Check your inbox</p>

          <h2>Reset instructions requested.</h2>

          <p>{message}</p>
        </div>

        <Link className="ic-auth-submit" href="/login">
          Return to Sign In
          <ArrowRight size={17} />
        </Link>
      </div>
    );
  }

  return (
    <form className="ic-auth-form" onSubmit={submit}>
      <div className="ic-auth-form-heading">
        <p className="ic-eyebrow">Account recovery</p>

        <h2>Forgot your password?</h2>

        <p>
          Enter your AgentPro account email. If it is registered, reset
          instructions will be sent.
        </p>
      </div>

      <label className="ic-auth-field">
        <span>Email address</span>

        <div>
          <Mail size={18} aria-hidden="true" />

          <input
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
      </label>

      {error && (
        <div className="ic-auth-alert ic-auth-alert-error" role="alert">
          {error}
        </div>
      )}

      <button className="ic-auth-submit" type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="ic-spin" size={18} />
            Sending
          </>
        ) : (
          <>
            Send reset instructions
            <ArrowRight size={17} />
          </>
        )}
      </button>

      <Link className="ic-auth-back-link" href="/login">
        <ArrowLeft size={15} />
        Back to Sign In
      </Link>
    </form>
  );
}
