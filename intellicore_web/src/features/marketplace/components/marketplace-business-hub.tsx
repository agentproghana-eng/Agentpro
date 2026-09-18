"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Star,
  Store,
} from "lucide-react";

import type { AgentProUser } from "@/features/auth/types";

import styles from "./marketplace-business-hub.module.css";

type Props = {
  user: Partial<AgentProUser>;
};

type DashboardAd = {
  id: string;
  title?: string | null;
  image_urls?: string[] | null;
  status?: string | null;
  views?: number | string | null;
  saves?: number | string | null;
  enquiries?: number | string | null;
  average_rating?: number | string | null;
  reason?: string | null;
};

type MarketplaceActivity = {
  activity_type?: string | null;
  advertisement_id?: string | null;
  advertisement_title?: string | null;
  customer_name?: string | null;
  occurred_at?: string | null;
};

type MarketplaceDashboardData = {
  total_ads?: number | string | null;
  active_ads?: number | string | null;
  pending_ads?: number | string | null;
  expired_ads?: number | string | null;
  total_views?: number | string | null;
  views_this_week?: number | string | null;
  views_previous_week?: number | string | null;
  saved_ads?: number | string | null;
  enquiries?: number | string | null;
  unread_messages?: number | string | null;
  average_rating?: number | string | null;
  review_count?: number | string | null;
  view_growth_percent?: number | string | null;
  top_ads?: DashboardAd[];
  attention_ads?: DashboardAd[];
  recent_activity?: MarketplaceActivity[];
};

type DashboardResponse = {
  success?: boolean;
  message?: string;
  data?: MarketplaceDashboardData;
};

type MineAd = {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  image_urls?: string[] | null;
  views_count?: number | string | null;
  category_name?: string | null;
  price?: number | string | null;
  currency?: string | null;
  location?: string | null;
  created_at?: string | null;
};

type MineResponse = {
  success?: boolean;
  message?: string;
  data?: MineAd[];
  pagination?: {
    has_more?: boolean;
    next_cursor?: string | null;
  };
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-GH", {
    maximumFractionDigits: 0,
  }).format(numeric(value));
}

function money(
  value: number | string | null | undefined,
  currency = "GHS",
) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(numeric(value));
}

function dateLabel(value: string | null | undefined) {
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
    year: "numeric",
  }).format(date);
}

function statusLabel(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activityLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    view: "Listing viewed",
    save: "Listing saved",
    enquiry: "New enquiry",
    review: "New review",
  };

  return labels[value ?? ""] ?? "Marketplace activity";
}

export function MarketplaceBusinessHub({ user }: Props) {
  const [dashboard, setDashboard] =
    useState<MarketplaceDashboardData | null>(null);

  const [dashboardLoading, setDashboardLoading] =
    useState(true);

  const [dashboardError, setDashboardError] =
    useState<string | null>(null);

  const [ads, setAds] = useState<MineAd[]>([]);

  const [adsLoading, setAdsLoading] = useState(true);

  const [adsError, setAdsError] =
    useState<string | null>(null);

  const [nextCursor, setNextCursor] =
    useState<string | null>(null);

  const [hasMore, setHasMore] = useState(false);

  const [loadingMore, setLoadingMore] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const response = await fetch(
          "/api/marketplace/dashboard",
          {
            cache: "no-store",
          },
        );

        if (response.status === 401) {
          window.location.replace(
            "/login?next=%2Fhub%2Fbusiness",
          );
          return;
        }

        const body =
          (await response.json()) as DashboardResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok || body.success !== true) {
          setDashboardError(
            body.message ??
              "Marketplace performance could not be loaded.",
          );
          return;
        }

        setDashboard(body.data ?? {});
        setDashboardError(null);
      } catch {
        if (!cancelled) {
          setDashboardError(
            "Marketplace performance could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) {
          setDashboardLoading(false);
        }
      }
    }

    async function loadAds() {
      try {
        const response = await fetch(
          "/api/marketplace/mine/cursor?limit=12",
          {
            cache: "no-store",
          },
        );

        if (response.status === 401) {
          window.location.replace(
            "/login?next=%2Fhub%2Fbusiness",
          );
          return;
        }

        const body =
          (await response.json()) as MineResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok || body.success !== true) {
          setAdsError(
            body.message ??
              "Your Marketplace listings could not be loaded.",
          );
          return;
        }

        setAds(Array.isArray(body.data) ? body.data : []);
        setNextCursor(
          body.pagination?.next_cursor ?? null,
        );
        setHasMore(
          Boolean(body.pagination?.has_more),
        );
        setAdsError(null);
      } catch {
        if (!cancelled) {
          setAdsError(
            "Your Marketplace listings could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) {
          setAdsLoading(false);
        }
      }
    }

    void loadDashboard();
    void loadAds();

    return () => {
      cancelled = true;
    };
  }, []);

  async function retryDashboard() {
    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const response = await fetch(
        "/api/marketplace/dashboard",
        {
          cache: "no-store",
        },
      );

      if (response.status === 401) {
        window.location.replace(
          "/login?next=%2Fhub%2Fbusiness",
        );
        return;
      }

      const body =
        (await response.json()) as DashboardResponse;

      if (!response.ok || body.success !== true) {
        setDashboardError(
          body.message ??
            "Marketplace performance could not be loaded.",
        );
        return;
      }

      setDashboard(body.data ?? {});
    } catch {
      setDashboardError(
        "Marketplace performance could not be loaded.",
      );
    } finally {
      setDashboardLoading(false);
    }
  }

  async function retryAds() {
    setAdsLoading(true);
    setAdsError(null);

    try {
      const response = await fetch(
        "/api/marketplace/mine/cursor?limit=12",
        {
          cache: "no-store",
        },
      );

      if (response.status === 401) {
        window.location.replace(
          "/login?next=%2Fhub%2Fbusiness",
        );
        return;
      }

      const body =
        (await response.json()) as MineResponse;

      if (!response.ok || body.success !== true) {
        setAdsError(
          body.message ??
            "Your Marketplace listings could not be loaded.",
        );
        return;
      }

      setAds(Array.isArray(body.data) ? body.data : []);
      setNextCursor(
        body.pagination?.next_cursor ?? null,
      );
      setHasMore(Boolean(body.pagination?.has_more));
    } catch {
      setAdsError(
        "Your Marketplace listings could not be loaded.",
      );
    } finally {
      setAdsLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        limit: "12",
        cursor: nextCursor,
      });

      const response = await fetch(
        `/api/marketplace/mine/cursor?${params.toString()}`,
        {
          cache: "no-store",
        },
      );

      if (response.status === 401) {
        window.location.replace(
          "/login?next=%2Fhub%2Fbusiness",
        );
        return;
      }

      const body =
        (await response.json()) as MineResponse;

      if (!response.ok || body.success !== true) {
        setAdsError(
          body.message ??
            "More listings could not be loaded.",
        );
        return;
      }

      setAds((current) => [
        ...current,
        ...(Array.isArray(body.data)
          ? body.data
          : []),
      ]);

      setNextCursor(
        body.pagination?.next_cursor ?? null,
      );

      setHasMore(Boolean(body.pagination?.has_more));
      setAdsError(null);
    } catch {
      setAdsError(
        "More listings could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const metrics = dashboard ?? {};

  const attention =
    dashboard?.attention_ads ?? [];

  const topAds = dashboard?.top_ads ?? [];

  const recentActivity =
    dashboard?.recent_activity ?? [];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className="ic-eyebrow">
            Marketplace Business Hub
          </p>

          <h1>
            Grow your
            <br />
            storefront.
          </h1>

          <p>
            Track listings, buyer interest and
            Marketplace performance from one
            workspace.
          </p>
        </div>

        <div className={styles.heroActions}>
          <Link
            href="/marketplace/post"
            className={styles.primaryAction}
          >
            <Plus size={18} />
            Post an ad
          </Link>

          <Link
            href="/"
            className={styles.secondaryAction}
          >
            <Store size={18} />
            Browse Marketplace
          </Link>
        </div>
      </section>

      <section
        className={styles.identity}
        aria-label="Current Marketplace workspace"
      >
        <div>
          <span>Current workspace</span>

          <strong>
            {user.company_name ||
              "Your Marketplace storefront"}
          </strong>
        </div>

        <small>
          Marketplace seller tools are separate
          from Mobile Money Agents Hub access.
        </small>
      </section>

      {dashboardLoading && !dashboard ? (
        <section className={styles.loading}>
          <Loader2
            className={styles.spinner}
            size={22}
          />
          <span>
            Loading Marketplace performance…
          </span>
        </section>
      ) : dashboardError && !dashboard ? (
        <section
          className={styles.error}
          role="alert"
        >
          <div>
            <strong>
              Performance data is unavailable.
            </strong>
            <span>{dashboardError}</span>
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
      ) : (
        <>
          <section
            className={styles.metrics}
            aria-label="Marketplace performance"
          >
            <article>
              <Store size={19} />
              <span>Active ads</span>
              <strong>
                {integer(metrics.active_ads)}
              </strong>
              <small>
                {integer(metrics.total_ads)} total
                listings
              </small>
            </article>

            <article>
              <Eye size={19} />
              <span>Total views</span>
              <strong>
                {integer(metrics.total_views)}
              </strong>
              <small>
                {integer(metrics.views_this_week)}
                {" this week"}
              </small>
            </article>

            <article>
              <MessageCircle size={19} />
              <span>Enquiries</span>
              <strong>
                {integer(metrics.enquiries)}
              </strong>
              <small>
                {integer(
                  metrics.unread_messages,
                )}{" "}
                unread messages
              </small>
            </article>

            <article>
              <Heart size={19} />
              <span>Saves</span>
              <strong>
                {integer(metrics.saved_ads)}
              </strong>
              <small>
                Buyer interest across your ads
              </small>
            </article>
          </section>

          <section className={styles.pulseGrid}>
            <article>
              <Bell size={19} />

              <div>
                <span>Awaiting action</span>

                <strong>
                  {integer(metrics.pending_ads)}
                </strong>

                <small>
                  Review or payment pending
                </small>
              </div>
            </article>

            <article>
              <Star size={19} />

              <div>
                <span>Seller rating</span>

                <strong>
                  {numeric(
                    metrics.average_rating,
                  ).toFixed(1)}
                </strong>

                <small>
                  {integer(metrics.review_count)}{" "}
                  reviews
                </small>
              </div>
            </article>

            <article>
              <BarChart3 size={19} />

              <div>
                <span>Views growth</span>

                <strong>
                  {numeric(
                    metrics.view_growth_percent,
                  ).toFixed(1)}
                  %
                </strong>

                <small>
                  Compared with previous week
                </small>
              </div>
            </article>
          </section>
        </>
      )}

      <div className={styles.contentGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <p className="ic-eyebrow">
                Your listings
              </p>
              <h2>My Ads</h2>
            </div>

            <Link href="/marketplace/post">
              <Plus size={16} />
              New ad
            </Link>
          </div>

          {adsLoading && ads.length === 0 ? (
            <div className={styles.loadingInline}>
              <Loader2
                className={styles.spinner}
                size={20}
              />
              Loading your listings…
            </div>
          ) : adsError && ads.length === 0 ? (
            <div
              className={styles.inlineError}
              role="alert"
            >
              <span>{adsError}</span>

              <button
                type="button"
                onClick={() => void retryAds()}
              >
                Try again
              </button>
            </div>
          ) : ads.length === 0 ? (
            <div className={styles.empty}>
              <Store size={26} />
              <strong>
                No Marketplace listings yet
              </strong>
              <span>
                Create your first ad to start
                building your storefront.
              </span>
              <Link href="/marketplace/post">
                Post your first ad
              </Link>
            </div>
          ) : (
            <>
              <div className={styles.listings}>
                {ads.map((ad) => {
                  const image =
                    ad.image_urls?.find(Boolean);

                  return (
                    <Link
                      href={`/marketplace/${encodeURIComponent(
                        ad.id,
                      )}`}
                      className={styles.listing}
                      key={ad.id}
                    >
                      <div
                        className={styles.listingImage}
                        style={
                          image
                            ? {
                                backgroundImage: `url("${image}")`,
                              }
                            : undefined
                        }
                        aria-hidden="true"
                      />

                      <div
                        className={styles.listingMain}
                      >
                        <div>
                          <strong>
                            {ad.title ||
                              "Untitled listing"}
                          </strong>

                          <span>
                            {ad.category_name ||
                              "Marketplace"}
                            {" · "}
                            {ad.location ||
                              "Ghana"}
                          </span>
                        </div>

                        <small>
                          Posted{" "}
                          {dateLabel(ad.created_at)}
                        </small>
                      </div>

                      <div
                        className={styles.listingMeta}
                      >
                        <span
                          className={styles.status}
                          data-status={
                            ad.status ?? "unknown"
                          }
                        >
                          {statusLabel(ad.status)}
                        </span>

                        <strong>
                          {money(
                            ad.price,
                            ad.currency || "GHS",
                          )}
                        </strong>

                        <small>
                          {integer(
                            ad.views_count,
                          )}{" "}
                          views
                        </small>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {adsError && (
                <p
                  className={styles.listError}
                  role="alert"
                >
                  {adsError}
                </p>
              )}

              {hasMore && nextCursor && (
                <button
                  type="button"
                  className={styles.loadMore}
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore && (
                    <Loader2
                      className={styles.spinner}
                      size={17}
                    />
                  )}

                  {loadingMore
                    ? "Loading…"
                    : "Load more listings"}
                </button>
              )}
            </>
          )}
        </section>

        <div className={styles.sideStack}>
          {attention.length > 0 && (
            <section className={styles.panel}>
              <div
                className={styles.panelHeading}
              >
                <div>
                  <p className="ic-eyebrow">
                    Needs attention
                  </p>
                  <h2>Improve these ads</h2>
                </div>

                <Bell size={19} />
              </div>

              <div
                className={styles.compactList}
              >
                {attention.map((ad) => (
                  <Link
                    href={`/marketplace/${encodeURIComponent(
                      ad.id,
                    )}`}
                    key={ad.id}
                  >
                    <div>
                      <strong>
                        {ad.title ||
                          "Marketplace listing"}
                      </strong>

                      <span>
                        {ad.reason ||
                          "Needs attention"}
                      </span>
                    </div>

                    <small>
                      {integer(ad.views)} views
                    </small>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {topAds.length > 0 && (
            <section className={styles.panel}>
              <div
                className={styles.panelHeading}
              >
                <div>
                  <p className="ic-eyebrow">
                    Performance
                  </p>
                  <h2>Top ads</h2>
                </div>

                <BarChart3 size={19} />
              </div>

              <div
                className={styles.compactList}
              >
                {topAds.map((ad) => (
                  <Link
                    href={`/marketplace/${encodeURIComponent(
                      ad.id,
                    )}`}
                    key={ad.id}
                  >
                    <div>
                      <strong>
                        {ad.title ||
                          "Marketplace listing"}
                      </strong>

                      <span>
                        {integer(ad.saves)} saves
                        {" · "}
                        {integer(
                          ad.enquiries,
                        )}{" "}
                        enquiries
                      </span>
                    </div>

                    <small>
                      {integer(ad.views)} views
                    </small>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {recentActivity.length > 0 && (
            <section className={styles.panel}>
              <div
                className={styles.panelHeading}
              >
                <div>
                  <p className="ic-eyebrow">
                    Activity
                  </p>
                  <h2>Recent interest</h2>
                </div>

                <Eye size={19} />
              </div>

              <div
                className={styles.activityList}
              >
                {recentActivity
                  .slice(0, 6)
                  .map((activity, index) => (
                    <article
                      key={`${activity.advertisement_id}-${activity.occurred_at}-${index}`}
                    >
                      <div>
                        <strong>
                          {activityLabel(
                            activity.activity_type,
                          )}
                        </strong>

                        <span>
                          {activity.advertisement_title ||
                            "Marketplace listing"}
                        </span>
                      </div>

                      <small>
                        {dateLabel(
                          activity.occurred_at,
                        )}
                      </small>
                    </article>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
