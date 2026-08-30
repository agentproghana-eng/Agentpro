"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

type Props = {
  returnPath: string;
};

type Enrollment = {
  secret: string;
  otpauth_uri: string;
};

type ApiData = {
  challenge_token?: string;
  mfa_required?: boolean;
  mfa_enrollment_required?: boolean;
  enrollment?: Enrollment;
  recovery_codes?: string[];
};

type ApiResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: ApiData;
};

type Phase = "credentials" | "mfa" | "recovery-codes";

export function LoginForm({ returnPath }: Props) {
  const [phase, setPhase] = useState<Phase>("credentials");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [challengeToken, setChallengeToken] = useState("");

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const [useRecovery, setUseRecovery] = useState(false);

  const [mfaCode, setMfaCode] = useState("");

  const [recoveryCode, setRecoveryCode] = useState("");

  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const [message, setMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const [copied, setCopied] = useState(false);

  async function readResponse(response: Response): Promise<ApiResponse> {
    try {
      return (await response.json()) as ApiResponse;
    } catch {
      return {
        success: false,
        message: "The authentication service returned an invalid response.",
      };
    }
  }

  function enterPortal() {
    window.location.assign(returnPath);
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const body = await readResponse(response);

      if (response.status === 202 && body.data?.challenge_token) {
        setChallengeToken(body.data.challenge_token);

        setEnrollment(body.data.enrollment ?? null);

        setPassword("");
        setUseRecovery(false);
        setMfaCode("");
        setRecoveryCode("");

        setMessage(body.message ?? "Additional verification is required.");

        setPhase("mfa");

        return;
      }

      if (!response.ok) {
        setError(body.message ?? "Unable to sign in.");

        return;
      }

      setPassword("");
      enterPortal();
    } catch {
      setError(
        "We could not reach the authentication service. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || !challengeToken) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const credential = useRecovery
        ? {
            recovery_code: recoveryCode.trim(),
          }
        : {
            code: mfaCode.trim(),
          };

      const response = await fetch("/api/auth/mfa/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          challenge_token: challengeToken,
          ...credential,
        }),
      });

      const body = await readResponse(response);

      if (!response.ok) {
        setError(body.message ?? "Verification failed.");

        return;
      }

      setChallengeToken("");
      setMfaCode("");
      setRecoveryCode("");

      const codes = body.data?.recovery_codes;

      if (Array.isArray(codes) && codes.length > 0) {
        setRecoveryCodes(codes);
        setPhase("recovery-codes");

        return;
      }

      enterPortal();
    } catch {
      setError(
        "Verification could not be completed. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));

      setCopied(true);

      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        "Your browser could not copy the recovery codes. Save them manually.",
      );
    }
  }

  if (phase === "recovery-codes") {
    return (
      <div className="ic-auth-form">
        <div className="ic-auth-form-heading">
          <span className="ic-auth-icon">
            <ShieldCheck size={22} />
          </span>

          <p className="ic-eyebrow">MFA enrolled</p>

          <h2>Save your recovery codes.</h2>

          <p>
            Store these somewhere secure. Each code should be treated as a
            sensitive account-recovery credential.
          </p>
        </div>

        <div className="ic-recovery-codes">
          {recoveryCodes.map((code) => (
            <code key={code}>{code}</code>
          ))}
        </div>

        {error && (
          <div className="ic-auth-alert ic-auth-alert-error" role="alert">
            {error}
          </div>
        )}

        <button
          className="ic-auth-secondary-button"
          type="button"
          onClick={copyRecoveryCodes}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}

          {copied ? "Copied" : "Copy recovery codes"}
        </button>

        <button className="ic-auth-submit" type="button" onClick={enterPortal}>
          Continue to AgentPro
          <ArrowRight size={17} />
        </button>
      </div>
    );
  }

  if (phase === "mfa") {
    const isEnrollment = Boolean(enrollment);

    return (
      <form className="ic-auth-form" onSubmit={submitMfa}>
        <div className="ic-auth-form-heading">
          <span className="ic-auth-icon">
            <KeyRound size={22} />
          </span>

          <p className="ic-eyebrow">
            {isEnrollment ? "Secure your account" : "Additional verification"}
          </p>

          <h2>
            {isEnrollment
              ? "Set up authenticator MFA."
              : "Enter your authenticator code."}
          </h2>

          <p>
            {isEnrollment
              ? "Privileged AgentPro access requires authenticator verification before a session is created."
              : "Complete the second verification step to continue."}
          </p>
        </div>

        {isEnrollment && enrollment && (
          <div className="ic-mfa-enrollment">
            <span>Manual setup key</span>

            <code>{enrollment.secret}</code>

            <a href={enrollment.otpauth_uri}>Open in authenticator</a>
          </div>
        )}

        {!isEnrollment && (
          <div className="ic-mfa-mode">
            <button
              type="button"
              className={!useRecovery ? "is-active" : undefined}
              onClick={() => {
                setUseRecovery(false);
                setError(null);
              }}
            >
              Authenticator
            </button>

            <button
              type="button"
              className={useRecovery ? "is-active" : undefined}
              onClick={() => {
                setUseRecovery(true);
                setError(null);
              }}
            >
              Recovery code
            </button>
          </div>
        )}

        {useRecovery && !isEnrollment ? (
          <label className="ic-auth-field">
            <span>Recovery code</span>

            <div>
              <LockKeyhole size={18} aria-hidden="true" />

              <input
                required
                type="text"
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                autoComplete="off"
                placeholder="Enter recovery code"
              />
            </div>
          </label>
        ) : (
          <label className="ic-auth-field">
            <span>Authenticator code</span>

            <div>
              <KeyRound size={18} aria-hidden="true" />

              <input
                required
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={mfaCode}
                onChange={(event) =>
                  setMfaCode(event.target.value.replace(/\D/g, ""))
                }
                autoComplete="one-time-code"
                placeholder="000000"
              />
            </div>
          </label>
        )}

        {message && !error && (
          <div className="ic-auth-alert" aria-live="polite">
            {message}
          </div>
        )}

        {error && (
          <div className="ic-auth-alert ic-auth-alert-error" role="alert">
            {error}
          </div>
        )}

        <button className="ic-auth-submit" type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="ic-spin" size={18} />
              Verifying
            </>
          ) : (
            <>
              Verify and continue
              <ArrowRight size={17} />
            </>
          )}
        </button>

        <button
          className="ic-auth-text-button"
          type="button"
          onClick={() => {
            setPhase("credentials");
            setChallengeToken("");
            setEnrollment(null);
            setMessage(null);
            setError(null);
            setMfaCode("");
            setRecoveryCode("");
          }}
        >
          Sign in again
        </button>
      </form>
    );
  }

  return (
    <form className="ic-auth-form" onSubmit={submitCredentials}>
      <div className="ic-auth-form-heading">
        <p className="ic-eyebrow">AgentPro web</p>

        <h2>Welcome back.</h2>

        <p>
          Sign in with the email address connected to your AgentPro account.
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
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
      </label>

      <label className="ic-auth-field">
        <span>Password</span>

        <div>
          <LockKeyhole size={18} aria-hidden="true" />

          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />
        </div>
      </label>

      <div className="ic-auth-between">
        <span>Secure AgentPro session</span>

        <Link href="/forgot-password">Forgot password?</Link>
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
            Signing in
          </>
        ) : (
          <>
            Sign In
            <ArrowRight size={17} />
          </>
        )}
      </button>

      <div className="ic-auth-support">
        <span>Need an AgentPro account?</span>

        <Link href="/agentpro#get-agentpro">Get AgentPro</Link>
      </div>
    </form>
  );
}
