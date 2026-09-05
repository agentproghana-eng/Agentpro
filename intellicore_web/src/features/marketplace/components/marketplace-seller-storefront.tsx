"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Loader2,
  MapPin,
  Star,
  Store,
} from "lucide-react";

import type {
  MarketplaceAdvertisement,
  MarketplaceSeller,
  MarketplaceSellerStorefrontResponse,
} from "@/features/marketplace/types";

type Props = {
  sellerId: string;
};

function money(
  value: number | string | null | undefined,
  currency?: string | null,
) {
  if (value === null || value === undefined || value === "") {
    return "Price on request";
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return `${currency || "GHS"} ${value}`;
  }

  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: currency || "GHS",
    maximumFractionDigits: 2,
  }).format(numeric);
}

function sellerName(seller: MarketplaceSeller) {
  if (seller.company_name?.trim()) {
    return seller.company_name.trim();
  }

  return (
    [seller.first_name, seller.last_name].filter(Boolean).join(" ").trim() ||
    "AgentPro seller"
  );
}

function personName(seller: MarketplaceSeller) {
  return [seller.first_name, seller.last_name].filter(Boolean).join(" ").trim();
}

function imageUrl(ad: MarketplaceAdvertisement) {
  if (!Array.isArray(ad.image_urls)) {
    return null;
  }

  return (
    ad.image_urls.find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    ) ?? null
  );
}

export function MarketplaceSellerStorefront({ sellerId }: Props) {
  const [seller, setSeller] = useState<MarketplaceSeller | null>(null);
  const [ads, setAds] = useState<MarketplaceAdvertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStorefront() {
      setLoading(true);

      try {
        const response = await fetch(
          `/api/marketplace/sellers/${encodeURIComponent(sellerId)}`,
          {
            cache: "no-store",
          },
        );

        let body: MarketplaceSellerStorefrontResponse;

        try {
          body = (await response.json()) as MarketplaceSellerStorefrontResponse;
        } catch {
          body = {
            success: false,
            message: "Marketplace returned an invalid response.",
          };
        }

        if (!active) {
          return;
        }

        if (response.status === 404) {
          setSeller(null);
          setAds([]);
          setNotFound(true);
          setError(null);
          setLoading(false);
          return;
        }

        if (!response.ok || !body.data?.seller) {
          setSeller(null);
          setAds([]);
          setError(
            body.message ?? "This seller storefront could not be loaded.",
          );
          setNotFound(false);
          setLoading(false);
          return;
        }

        setSeller(body.data.seller);
        setAds(
          Array.isArray(body.data.advertisements)
            ? body.data.advertisements
            : [],
        );
        setNotFound(false);
        setError(null);
        setLoading(false);
      } catch {
        if (!active) {
          return;
        }

        setSeller(null);
        setAds([]);
        setError(
          "Marketplace is temporarily unavailable. Check your connection and try again.",
        );
        setNotFound(false);
        setLoading(false);
      }
    }

    void loadStorefront();

    return () => {
      active = false;
    };
  }, [sellerId]);

  if (loading) {
    return (
      <main id="main-content" className="ic-market-storefront-page">
        <div className="ic-shell">
          <div className="ic-market-detail-loading">
            <Loader2 className="ic-spin" size={24} />
            Loading seller storefront…
          </div>
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main id="main-content" className="ic-market-storefront-page">
        <div className="ic-shell">
          <div className="ic-market-detail-state">
            <Store size={31} />
            <h1>Seller not found.</h1>
            <p>This seller may no longer have a public Marketplace profile.</p>
            <Link href="/marketplace">Return to Marketplace</Link>
          </div>
        </div>
      </main>
    );
  }

  if (error || !seller) {
    return (
      <main id="main-content" className="ic-market-storefront-page">
        <div className="ic-shell">
          <div className="ic-market-detail-state">
            <h1>Storefront unavailable.</h1>
            <p>{error ?? "This storefront could not be loaded."}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  const displayName = sellerName(seller);
  const individualName = personName(seller);
  const logo = seller.company_logo_url || seller.profile_image_url;
  const verified = seller.is_verified === true;
  const rating = Number(seller.average_rating ?? 0);
  const reviewCount = Number(seller.review_count ?? 0);
  const activeAdCount = Number(seller.active_ad_count ?? ads.length);

  return (
    <main id="main-content" className="ic-market-storefront-page">
      <div className="ic-shell">
        <Link href="/marketplace" className="ic-market-back">
          <ArrowLeft size={17} />
          Marketplace
        </Link>

        <section className="ic-market-storefront-header">
          <div className="ic-market-storefront-identity">
            <div className="ic-market-storefront-avatar">
              {logo ? (
                <div
                  role="img"
                  aria-label={displayName}
                  style={{
                    backgroundImage: `url("${logo}")`,
                  }}
                />
              ) : (
                <Store size={30} aria-hidden="true" />
              )}
            </div>

            <div className="ic-market-storefront-name">
              <span>Seller Storefront</span>

              <h1>
                {displayName}

                {verified && (
                  <BadgeCheck
                    size={22}
                    className="ic-market-verified"
                    aria-label="Verified seller"
                  />
                )}
              </h1>

              {individualName &&
                seller.company_name?.trim() &&
                individualName !== seller.company_name.trim() && (
                  <p>{individualName}</p>
                )}
            </div>
          </div>

          <div className="ic-market-storefront-stats">
            <div>
              <Star size={18} />
              <strong>{rating > 0 ? rating.toFixed(1) : "New"}</strong>
              <span>
                {reviewCount === 1
                  ? "1 review"
                  : `${reviewCount.toLocaleString()} reviews`}
              </span>
            </div>

            <div>
              <Store size={18} />
              <strong>{activeAdCount.toLocaleString()}</strong>
              <span>
                {activeAdCount === 1
                  ? "active advertisement"
                  : "active advertisements"}
              </span>
            </div>

            {verified && (
              <div>
                <BadgeCheck size={18} />
                <strong>Verified</strong>
                <span>AgentPro Marketplace seller</span>
              </div>
            )}
          </div>
        </section>

        <section className="ic-market-storefront-listings">
          <div className="ic-market-storefront-section-heading">
            <div>
              <span className="ic-eyebrow">Advertisements</span>
              <h2>Active listings</h2>
            </div>

            <span>
              {ads.length === 1
                ? "1 active"
                : `${ads.length.toLocaleString()} active`}
            </span>
          </div>

          {ads.length === 0 ? (
            <div className="ic-market-storefront-empty">
              <Store size={28} />
              <strong>No active advertisements</strong>
              <p>This seller has no active advertisements.</p>
            </div>
          ) : (
            <div className="ic-market-storefront-grid">
              {ads.map((ad) => {
                const image = imageUrl(ad);
                const itemRating = Number(ad.avg_rating ?? 0);
                const ratingCount = Number(ad.rating_count ?? 0);

                return (
                  <article key={ad.id} className="ic-market-card-shell">
                    <Link
                      href={`/marketplace/${ad.id}`}
                      className="ic-market-card"
                    >
                      <div
                        className={`ic-market-card-image${
                          image ? " has-image" : ""
                        }`}
                        style={
                          image
                            ? {
                                backgroundImage: `url("${image}")`,
                              }
                            : undefined
                        }
                        role={image ? "img" : undefined}
                        aria-label={image ? ad.title : undefined}
                      >
                        {!image && <Store size={30} aria-hidden="true" />}

                        {ad.category_name && (
                          <span className="ic-market-category-chip">
                            {ad.category_name}
                          </span>
                        )}
                      </div>

                      <div className="ic-market-card-body">
                        <div className="ic-market-card-heading">
                          <div>
                            <h2>{ad.title}</h2>
                            <strong>{money(ad.price, ad.currency)}</strong>
                          </div>

                          <ArrowRight size={18} aria-hidden="true" />
                        </div>

                        {ad.location && (
                          <p className="ic-market-location">
                            <MapPin size={15} aria-hidden="true" />
                            {ad.location}
                          </p>
                        )}

                        <p className="ic-market-description">
                          {ad.description?.trim() ||
                            "Open this listing to view more details."}
                        </p>

                        <div className="ic-market-card-footer">
                          <span className="ic-market-seller">
                            {displayName}

                            {verified && (
                              <BadgeCheck
                                size={16}
                                className="ic-market-verified"
                                aria-label="Verified AgentPro seller"
                              />
                            )}
                          </span>

                          <span className="ic-market-rating">
                            <Star size={15} aria-hidden="true" />
                            {itemRating > 0 ? itemRating.toFixed(1) : "New"}
                            {ratingCount > 0 && <small>({ratingCount})</small>}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
