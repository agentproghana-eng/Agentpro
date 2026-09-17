"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Loader2,
  LockKeyhole,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";

type Props = {
  returnPath: string;
};

type ApiResponse = {
  success?: boolean;
  code?: string;
  message?: string;
};

export function MarketplaceRegisterForm({ returnPath }: Props) {
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register-marketplace", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.replace(/[\s()-]/g, ""),
          email: email.trim(),
          password,
        }),
      });

      let body: ApiResponse;

      try {
        body = (await response.json()) as ApiResponse;
      } catch {
        body = {
          success: false,
          message: "Registration returned an invalid response.",
        };
      }

      if (!response.ok) {
        setError(body.message ?? "Unable to create your account.");
        return;
      }

      setPassword("");
      setConfirmPassword("");

      window.location.assign(returnPath);
    } catch {
      setError(
        "We could not reach AgentPro. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="ic-auth-form" onSubmit={submit}>
      <div className="ic-auth-form-heading">
        <p className="ic-eyebrow">AgentPro Marketplace</p>

        <h2>Create your business account.</h2>

        <p>
          Start selling, saving listings and connecting with buyers across
          AgentPro Marketplace.
        </p>
      </div>

      <div className="ic-register-note">
        <Building2 size={18} aria-hidden="true" />

        <div>
          <strong>Business Owner account</strong>
          <span>
            This does not create a MoMo Agent account. Agent access is added
            separately through an approved business.
          </span>
        </div>
      </div>

      <label className="ic-auth-field">
        <span>Business name</span>

        <div>
          <Building2 size={18} aria-hidden="true" />

          <input
            required
            type="text"
            maxLength={160}
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            autoComplete="organization"
            placeholder="Your business name"
          />
        </div>
      </label>

      <div className="ic-register-name-grid">
        <label className="ic-auth-field">
          <span>First name</span>

          <div>
            <UserRound size={18} aria-hidden="true" />

            <input
              required
              type="text"
              maxLength={80}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              placeholder="First name"
            />
          </div>
        </label>

        <label className="ic-auth-field">
          <span>Last name</span>

          <div>
            <UserRound size={18} aria-hidden="true" />

            <input
              required
              type="text"
              maxLength={80}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              placeholder="Last name"
            />
          </div>
        </label>
      </div>

      <label className="ic-auth-field">
        <span>Phone number</span>

        <div>
          <Phone size={18} aria-hidden="true" />

          <input
            required
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            placeholder="0240000000"
          />
        </div>
      </label>

      <label className="ic-auth-field">
        <span>Email address</span>

        <div>
          <Mail size={18} aria-hidden="true" />

          <input
            required
            type="email"
            inputMode="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
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
            minLength={8}
            maxLength={200}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </div>
      </label>

      <label className="ic-auth-field">
        <span>Confirm password</span>

        <div>
          <LockKeyhole size={18} aria-hidden="true" />

          <input
            required
            type="password"
            minLength={8}
            maxLength={200}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="Repeat your password"
          />
        </div>
      </label>

      <p className="ic-register-password-help">
        Password must contain at least 8 characters, one uppercase letter and
        one number.
      </p>

      {error && (
        <div className="ic-auth-alert ic-auth-alert-error" role="alert">
          {error}
        </div>
      )}

      <button className="ic-auth-submit" type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="ic-spin" size={18} />
            Creating account
          </>
        ) : (
          <>
            Create Business Account
            <ArrowRight size={17} />
          </>
        )}
      </button>

      <div className="ic-auth-support">
        <span>Already have an AgentPro account?</span>

        <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>
          Sign In
        </Link>
      </div>
    </form>
  );
}
