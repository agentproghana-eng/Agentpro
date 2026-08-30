"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole } from "lucide-react";

type Props = {
  userId: string | null;
  token: string | null;
};

type ApiResponse = {
  success?: boolean;
  message?: string;
};

export function ResetPasswordForm({ userId, token }: Props) {
  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (token || userId) {
      window.history.replaceState(null, "", "/reset-password");
    }
  }, [token, userId]);

  const validLink = Boolean(userId && token);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || !userId || !token) {
      return;
    }

    setError(null);

    if (password !== confirmPassword) {
      setError("The passwords do not match.");

      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          token,
          new_password: password,
        }),
      });

      let body: ApiResponse = {};

      try {
        body = (await response.json()) as ApiResponse;
      } catch {
        // Use generic fallback.
      }

      if (!response.ok) {
        setError(body.message ?? "Unable to reset the password.");

        return;
      }

      setPassword("");
      setConfirmPassword("");
      setComplete(true);
    } catch {
      setError(
        "Password reset is temporarily unavailable. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!validLink) {
    return (
      <div className="ic-auth-form">
        <div className="ic-auth-form-heading">
          <p className="ic-eyebrow">Reset link</p>

          <h2>This reset link is incomplete.</h2>

          <p>
            Request a new password reset link and open the complete link sent to
            your account.
          </p>
        </div>

        <Link className="ic-auth-submit" href="/forgot-password">
          Request a new link
          <ArrowRight size={17} />
        </Link>
      </div>
    );
  }

  if (complete) {
    return (
      <div className="ic-auth-form">
        <div className="ic-auth-form-heading">
          <span className="ic-auth-icon">
            <CheckCircle2 size={22} />
          </span>

          <p className="ic-eyebrow">Password updated</p>

          <h2>Your password has been reset.</h2>

          <p>
            Existing AgentPro sessions are no longer valid. Sign in again with
            your new password.
          </p>
        </div>

        <Link className="ic-auth-submit" href="/login">
          Sign In
          <ArrowRight size={17} />
        </Link>
      </div>
    );
  }

  return (
    <form className="ic-auth-form" onSubmit={submit}>
      <div className="ic-auth-form-heading">
        <p className="ic-eyebrow">Account recovery</p>

        <h2>Choose a new password.</h2>

        <p>
          Use at least eight characters with an uppercase letter and a number.
        </p>
      </div>

      <label className="ic-auth-field">
        <span>New password</span>

        <div>
          <LockKeyhole size={18} aria-hidden="true" />

          <input
            required
            minLength={8}
            maxLength={200}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
          />
        </div>
      </label>

      <label className="ic-auth-field">
        <span>Confirm password</span>

        <div>
          <LockKeyhole size={18} aria-hidden="true" />

          <input
            required
            minLength={8}
            maxLength={200}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat password"
          />
        </div>
      </label>

      <div className="ic-password-rules">
        <span>8+ characters</span>
        <span>Uppercase letter</span>
        <span>Number</span>
      </div>

      {error && (
        <div className="ic-auth-alert ic-auth-alert-error" role="alert">
          {error}
        </div>
      )}

      <button className="ic-auth-submit" type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="ic-spin" size={18} />
            Updating
          </>
        ) : (
          <>
            Reset password
            <ArrowRight size={17} />
          </>
        )}
      </button>
    </form>
  );
}
