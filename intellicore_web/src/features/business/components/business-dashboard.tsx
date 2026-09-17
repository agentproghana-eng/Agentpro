"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  CircleCheck,
  Clock3,
  Coins,
  History,
  Loader2,
  RefreshCw,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import type { AgentProUser } from "@/features/auth/types";
import type {
  BusinessDashboardData,
  BusinessDashboardResponse,
  BusinessRecentTransaction,
} from "@/features/business/types";

type Props = {
  user: Partial<AgentProUser>;
};

function numberValue(
  value: number | string | null | undefined,
) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function money(
  value: number | string | null | undefined,
) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function integer(
  value: number | string | null | undefined,
) {
  return new Intl.NumberFormat("en-GH", {
    maximumFractionDigits: 0,
  }).format(numberValue(value));
}

function percentage(
  value: number | string | null | undefined,
) {
  return `${numberValue(value).toFixed(1)}%`;
}

function titleCase(
  value: string | null | undefined,
) {
  if (!value) {
    return "Transaction";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function dateLabel(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function initials(user: Partial<AgentProUser>) {
  const parts = [
    user.first_name,
    user.last_name,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts
      .map((part) => part?.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return "AP";
}

function roleLabel(
  role: string | null | undefined,
) {
  if (!role) {
    return "AgentPro member";
  }

  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function statusLabel(
  status: string | null | undefined,
) {
  return titleCase(status || "unknown");
}

function RecentTransaction({
  transaction,
}: {
  transaction: BusinessRecentTransaction;
}) {
  const successful =
    transaction.status === "success";

  return (
    <article className="ic-business-transaction">
      <span
        className={`ic-business-transaction-status${
          successful ? " is-success" : ""
        }`}
        aria-hidden="true"
      >
        {successful ? (
          <CircleCheck size={18} />
        ) : (
          <Clock3 size={18} />
        )}
      </span>

      <div className="ic-business-transaction-main">
        <strong>
          {titleCase(
            transaction.transaction_type,
          )}
        </strong>

        <span>
          {titleCase(transaction.provider)}
          {" · "}
          {dateLabel(transaction.created_at)}
        </span>
      </div>

      <div className="ic-business-transaction-amount">
        <strong>{money(transaction.amount)}</strong>

        <span>
          {statusLabel(transaction.status)}
        </span>
      </div>
    </article>
  );
}

export function BusinessDashboard({
  user,
}: Props) {
  const [data, setData] =
    useState<BusinessDashboardData | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  async function requestDashboard(): Promise<
    | {
        kind: "success";
        data: BusinessDashboardData;
      }
    | {
        kind: "unauthorized";
      }
    | {
        kind: "error";
        message: string;
      }
  > {
    try {
      const response = await fetch(
        "/api/business/dashboard",
        {
          cache: "no-store",
        },
      );

      if (response.status === 401) {
        return {
          kind: "unauthorized",
        };
      }

      const body =
        (await response.json()) as BusinessDashboardResponse;

      if (!response.ok || !body.success) {
        return {
          kind: "error",
          message:
            body.message ??
            "Business information could not be loaded.",
        };
      }

      return {
        kind: "success",
        data: body.data ?? {},
      };
    } catch {
      return {
        kind: "error",
        message:
          "Unable to reach AgentPro. Check your connection and try again.",
      };
    }
  }

  useEffect(() => {
    let cancelled = false;

    void requestDashboard().then((result) => {
      if (cancelled) {
        return;
      }

      if (result.kind === "unauthorized") {
        window.location.replace(
          "/login?next=%2Fhub%2Fbusiness",
        );

        return;
      }

      if (result.kind === "error") {
        setError(result.message);
        setLoading(false);

        return;
      }

      setData(result.data);
      setError(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function retryDashboard() {
    setLoading(true);
    setError(null);

    const result = await requestDashboard();

    if (result.kind === "unauthorized") {
      window.location.replace(
        "/login?next=%2Fhub%2Fbusiness",
      );

      return;
    }

    if (result.kind === "error") {
      setError(result.message);
      setLoading(false);

      return;
    }

    setData(result.data);
    setError(null);
    setLoading(false);
  }

  if (loading && !data) {
    return (
      <section
        className="ic-business-loading"
        aria-live="polite"
      >
        <Loader2
          className="ic-spin"
          size={24}
        />
        <div>
          <strong>
            Preparing your business workspace
          </strong>
          <span>
            Loading current AgentPro activity.
          </span>
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section
        className="ic-business-error"
        role="alert"
      >
        <div>
          <strong>
            Business information is unavailable.
          </strong>
          <p>{error}</p>
        </div>

        <button
          type="button"
          onClick={() =>
            void retryDashboard()
          }
        >
          <RefreshCw size={16} />
          Try again
        </button>
      </section>
    );
  }

  const dashboard = data ?? {};

  const recent =
    dashboard.recent_transactions ?? [];

  const floats =
    dashboard.float_by_provider ?? [];

  const todayTransactions =
    dashboard.today?.transaction_count ??
    dashboard.today_transactions;

  const todayVolume =
    dashboard.today?.total_amount ??
    dashboard.today_volume;

  const grossEarnings =
    dashboard.today?.gross_earnings ??
    dashboard.today_gross_earnings;

  const successRate =
    dashboard.today?.success_rate ??
    dashboard.today_success_rate;

  return (
    <div className="ic-business-dashboard-page">
      <section className="ic-business-welcome">
        <div>
          <p className="ic-eyebrow">
            Business overview
          </p>

          <h1>
            Your business,
            <br />
            at a glance.
          </h1>

          <p>
            Live operational information from your
            AgentPro workspace.
          </p>
        </div>

        <div className="ic-business-identity-card">
          <span className="ic-business-identity-avatar">
            {initials(user)}
          </span>

          <div>
            <small>Current workspace</small>
            <strong>
              {user.company_name ||
                "AgentPro Business"}
            </strong>
            <span>
              {roleLabel(user.role)}
            </span>
          </div>
        </div>
      </section>

      <section
        className="ic-business-metrics"
        aria-label="Today's business summary"
      >
        <article className="ic-business-metric ic-business-metric-primary">
          <span>
            <TrendingUp size={19} />
            Today&apos;s volume
          </span>

          <strong>
            {money(todayVolume)}
          </strong>

          <small>
            {integer(todayTransactions)} customer{" "}
            {numberValue(todayTransactions) === 1
              ? "transaction"
              : "transactions"}
          </small>
        </article>

        <article className="ic-business-metric">
          <span>
            <Coins size={19} />
            Gross earnings
          </span>

          <strong>
            {money(grossEarnings)}
          </strong>

          <small>
            Commission plus applicable service fees
          </small>
        </article>

        <article className="ic-business-metric">
          <span>
            <CircleCheck size={19} />
            Success rate
          </span>

          <strong>
            {percentage(successRate)}
          </strong>

          <small>
            Today&apos;s completed customer activity
          </small>
        </article>

        <article className="ic-business-metric">
          <span>
            <BarChart3 size={19} />
            This month
          </span>

          <strong>
            {money(
              dashboard.this_month
                ?.total_amount,
            )}
          </strong>

          <small>
            {integer(
              dashboard.this_month
                ?.transaction_count,
            )}{" "}
            transactions
          </small>
        </article>
      </section>

      <div className="ic-business-dashboard-grid">
        <section className="ic-business-panel ic-business-recent-panel">
          <div className="ic-business-panel-heading">
            <div>
              <p className="ic-eyebrow">
                Activity
              </p>
              <h2>
                Recent transactions
              </h2>
            </div>

            <History size={20} />
          </div>

          {recent.length > 0 ? (
            <div className="ic-business-transaction-list">
              {recent.map(
                (transaction, index) => (
                  <RecentTransaction
                    key={
                      transaction.id ??
                      `${transaction.reference}-${index}`
                    }
                    transaction={
                      transaction
                    }
                  />
                ),
              )}
            </div>
          ) : (
            <div className="ic-business-empty">
              <History size={22} />
              <strong>
                No recent transactions
              </strong>
              <span>
                New business activity will
                appear here.
              </span>
            </div>
          )}
        </section>

        <div className="ic-business-side-stack">
          <section className="ic-business-panel">
            <div className="ic-business-panel-heading">
              <div>
                <p className="ic-eyebrow">
                  Earnings
                </p>
                <h2>
                  Today&apos;s income
                </h2>
              </div>

              <Banknote size={20} />
            </div>

            <div className="ic-business-earning-row">
              <span>
                Provider commission
              </span>
              <strong>
                {money(
                  dashboard.today
                    ?.provider_commission ??
                    dashboard.today_provider_commission,
                )}
              </strong>
            </div>

            <div className="ic-business-earning-row">
              <span>
                Service fees
              </span>
              <strong>
                {money(
                  dashboard.today
                    ?.agent_service_fees ??
                    dashboard.today_agent_service_fees,
                )}
              </strong>
            </div>

            <div className="ic-business-earning-total">
              <span>Total</span>
              <strong>
                {money(grossEarnings)}
              </strong>
            </div>
          </section>

          {floats.length > 0 && (
            <section className="ic-business-panel">
              <div className="ic-business-panel-heading">
                <div>
                  <p className="ic-eyebrow">
                    Float
                  </p>
                  <h2>
                    Provider balances
                  </h2>
                </div>

                <WalletCards size={20} />
              </div>

              <div className="ic-business-float-list">
                {floats.map(
                  (item, index) => (
                    <div
                      className="ic-business-float-row"
                      key={`${item.provider}-${index}`}
                    >
                      <span>
                        {titleCase(
                          item.provider,
                        )}
                      </span>

                      <strong>
                        {money(item.total)}
                      </strong>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <section className="ic-business-actions">
        <div>
          <p className="ic-eyebrow">
            Business tools
          </p>

          <h2>
            Keep moving without losing context.
          </h2>
        </div>

        <div className="ic-business-action-grid">
          <article>
            <History size={21} />
            <strong>
              Transaction history
            </strong>
            <p>
              Review business activity and
              trace transaction records.
            </p>
            <span>
              Detailed history coming to the
              web workspace
            </span>
          </article>

          <article>
            <BarChart3 size={21} />
            <strong>
              Reports & insights
            </strong>
            <p>
              Understand transaction activity,
              commissions and performance.
            </p>
            <span>
              Dashboard data is live
            </span>
          </article>

          <Link href="/hub/community">
            <span>
              <ArrowRight size={21} />
            </span>
            <strong>
              Community
            </strong>
            <p>
              Connect with other businesses,
              agents and professionals.
            </p>
            <small>
              Open Community
              <ArrowRight size={14} />
            </small>
          </Link>
        </div>
      </section>
    </div>
  );
}
