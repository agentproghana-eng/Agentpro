"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bookmark,
  CheckCircle2,
  Eye,
  Loader2,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Star,
  Store,
} from "lucide-react";

import type {
  MarketplaceAdvertisement,
  MarketplaceAdvertisementResponse,
  MarketplaceEnquiryResponse,
  MarketplaceSavedStatusResponse,
} from "@/features/marketplace/types";

type Props = {
  adId: string;
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

function sellerName(ad: MarketplaceAdvertisement) {
  if (ad.company_name) {
    return ad.company_name;
  }

  return (
    [ad.seller_first_name, ad.seller_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "AgentPro seller"
  );
}

function loginReturn(adId: string) {
  return `/login?next=${encodeURIComponent(`/marketplace/${adId}`)}`;
}

export function MarketplaceDetail({ adId }: Props) {
  const [ad, setAd] = useState<MarketplaceAdvertisement | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionKnown, setSessionKnown] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showEnquiry, setShowEnquiry] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [enquirySent, setEnquirySent] = useState(false);
  const [enquiryError, setEnquiryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAd() {
      try {
        const response = await fetch(`/api/marketplace/${adId}`, {
          cache: "no-store",
        });

        let body: MarketplaceAdvertisementResponse;

        try {
          body = (await response.json()) as MarketplaceAdvertisementResponse;
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
          setNotFound(true);
          setAd(null);
          setLoading(false);
          return;
        }

        if (!response.ok || !body.data) {
          setError(body.message ?? "This listing could not be loaded.");
          setLoading(false);
          return;
        }

        setAd(body.data);
        setError(null);
        setNotFound(false);
        setLoading(false);
      } catch {
        if (!active) {
          return;
        }

        setError(
          "Marketplace is temporarily unavailable. Check your connection and try again.",
        );
        setLoading(false);
      }
    }

    void loadAd();

    return () => {
      active = false;
    };
  }, [adId]);

  useEffect(() => {
    let active = true;

    async function loadSavedStatus() {
      try {
        const response = await fetch(`/api/marketplace/${adId}/saved-status`, {
          cache: "no-store",
        });

        if (!active) {
          return;
        }

        if (response.status === 401) {
          setAuthenticated(false);
          setSessionKnown(true);
          return;
        }

        const body = (await response.json()) as MarketplaceSavedStatusResponse;

        if (!active) {
          return;
        }

        if (response.ok) {
          setAuthenticated(true);
          setSaved(body.data?.is_saved === true);
        }
      } catch {
        // Detail browsing remains usable even if saved-state hydration fails.
      } finally {
        if (active) {
          setSessionKnown(true);
        }
      }
    }

    void loadSavedStatus();

    return () => {
      active = false;
    };
  }, [adId]);

  const images = Array.isArray(ad?.image_urls)
    ? ad.image_urls.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];

  function requireSession() {
    window.location.assign(loginReturn(adId));
  }

  async function toggleSaved() {
    if (!authenticated) {
      requireSession();
      return;
    }

    if (saving) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/marketplace/${adId}/save`, {
        method: saved ? "DELETE" : "POST",
      });

      if (response.status === 401) {
        requireSession();
        return;
      }

      const body = (await response.json()) as MarketplaceSavedStatusResponse;

      if (response.ok) {
        setSaved(body.data?.is_saved === true);
      }
    } finally {
      setSaving(false);
    }
  }

  function openEnquiry() {
    if (!authenticated) {
      requireSession();
      return;
    }

    setShowEnquiry(true);
    setEnquiryError(null);
  }

  async function sendEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = message.trim();

    if (!body || body.length > 2000 || sending) {
      return;
    }

    setSending(true);
    setEnquiryError(null);

    try {
      const response = await fetch(`/api/marketplace/${adId}/enquiries`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: body,
        }),
      });

      if (response.status === 401) {
        requireSession();
        return;
      }

      let result: MarketplaceEnquiryResponse;

      try {
        result = (await response.json()) as MarketplaceEnquiryResponse;
      } catch {
        result = {
          success: false,
          message: "Marketplace returned an invalid response.",
        };
      }

      if (!response.ok) {
        setEnquiryError(result.message ?? "Your message could not be sent.");
        return;
      }

      setMessage("");
      setEnquirySent(true);
      setShowEnquiry(false);
    } catch {
      setEnquiryError(
        "Your message could not be sent. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main id="main-content" className="ic-market-detail-page">
        <div className="ic-shell">
          <div className="ic-market-detail-loading">
            <Loader2 className="ic-spin" size={24} />
            Loading listing…
          </div>
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main id="main-content" className="ic-market-detail-page">
        <div className="ic-shell">
          <div className="ic-market-detail-state">
            <Store size={31} />
            <h1>Listing not found.</h1>
            <p>This listing may no longer be available or may not be public.</p>
            <Link href="/marketplace">Return to Marketplace</Link>
          </div>
        </div>
      </main>
    );
  }

  if (error || !ad) {
    return (
      <main id="main-content" className="ic-market-detail-page">
        <div className="ic-shell">
          <div className="ic-market-detail-state">
            <h1>Listing unavailable.</h1>
            <p>{error ?? "This listing could not be loaded."}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                window.location.reload();
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  const verified = Boolean(ad.seller_verified ?? ad.is_verified);
  const itemRating = Number(ad.avg_rating ?? 0);
  const itemRatingCount = Number(ad.rating_count ?? 0);
  const sellerRating = Number(ad.seller_average_rating ?? 0);
  const sellerReviewCount = Number(ad.seller_review_count ?? 0);

  return (
    <main id="main-content" className="ic-market-detail-page">
      <div className="ic-shell">
        <Link href="/marketplace" className="ic-market-back">
          <ArrowLeft size={17} />
          Back to Marketplace
        </Link>

        <div className="ic-market-detail-layout">
          <section className="ic-market-detail-main">
            <div className="ic-market-gallery">
              {images.length > 0 ? (
                <>
                  <div
                    className="ic-market-gallery-primary"
                    style={{ backgroundImage: `url("${images[0]}")` }}
                    role="img"
                    aria-label={ad.title}
                  />

                  {images.length > 1 && (
                    <div className="ic-market-gallery-thumbs">
                      {images.slice(1, 3).map((image) => (
                        <div
                          key={image}
                          style={{ backgroundImage: `url("${image}")` }}
                          role="img"
                          aria-label={ad.title}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="ic-market-gallery-empty">
                  <Store size={42} />
                  <span>No listing image</span>
                </div>
              )}
            </div>

            <article className="ic-market-detail-content">
              <div className="ic-market-detail-title-row">
                <div>
                  {ad.category_name && (
                    <p className="ic-eyebrow">{ad.category_name}</p>
                  )}

                  <h1>{ad.title}</h1>

                  <strong className="ic-market-detail-price">
                    {money(ad.price, ad.currency)}
                  </strong>
                </div>

                {!ad.is_owner && sessionKnown && (
                  <button
                    type="button"
                    className={`ic-market-save${saved ? " is-saved" : ""}`}
                    disabled={saving}
                    onClick={() => void toggleSaved()}
                    aria-pressed={saved}
                  >
                    {saving ? (
                      <Loader2 className="ic-spin" size={18} />
                    ) : (
                      <Bookmark
                        size={18}
                        fill={saved ? "currentColor" : "none"}
                      />
                    )}

                    {saved ? "Saved" : "Save"}
                  </button>
                )}
              </div>

              <div className="ic-market-detail-meta">
                {ad.location && (
                  <span>
                    <MapPin size={16} />
                    {ad.location}
                  </span>
                )}

                <span>
                  <Star size={16} />
                  {itemRating > 0 ? itemRating.toFixed(1) : "Not rated"}
                  {itemRatingCount > 0 && ` (${itemRatingCount})`}
                </span>

                {typeof ad.views_count === "number" && (
                  <span>
                    <Eye size={16} />
                    {ad.views_count.toLocaleString()} views
                  </span>
                )}
              </div>

              <div className="ic-market-description-full">
                <h2>About this listing</h2>

                <p>
                  {ad.description?.trim() ||
                    "The seller has not provided a longer description."}
                </p>
              </div>
            </article>
          </section>

          <aside className="ic-market-seller-panel">
            <div className="ic-market-seller-heading">
              <div className="ic-market-seller-avatar">
                {ad.company_logo_url || ad.seller_profile_image_url ? (
                  <div
                    style={{
                      backgroundImage: `url("${
                        ad.company_logo_url || ad.seller_profile_image_url
                      }")`,
                    }}
                    role="img"
                    aria-label={sellerName(ad)}
                  />
                ) : (
                  <Store size={23} />
                )}
              </div>

              <div>
                <span>Seller</span>

                <strong>
                  {sellerName(ad)}

                  {verified && (
                    <BadgeCheck
                      size={17}
                      className="ic-market-verified"
                      aria-label="Verified seller"
                    />
                  )}
                </strong>
              </div>
            </div>

            <div className="ic-market-seller-stats">
              <div>
                <Star size={17} />
                <strong>
                  {sellerRating > 0 ? sellerRating.toFixed(1) : "New"}
                </strong>
                <span>
                  {sellerReviewCount === 1
                    ? "1 seller review"
                    : `${sellerReviewCount} seller reviews`}
                </span>
              </div>

              <div>
                <ShieldCheck size={17} />
                <strong>{verified ? "Verified" : "AgentPro seller"}</strong>
                <span>
                  {verified
                    ? "Marketplace verification active"
                    : "Contact remains private"}
                </span>
              </div>
            </div>

            {ad.seller_id && (
              <Link
                href={`/marketplace/sellers/${ad.seller_id}`}
                className="ic-market-storefront-link"
              >
                <Store size={17} />
                View seller storefront
                <ArrowRight size={16} />
              </Link>
            )}

            {ad.is_owner ? (
              <div className="ic-market-owner-note">
                <CheckCircle2 size={19} />
                <div>
                  <strong>This is your listing.</strong>
                  <p>
                    Buyer contact actions are hidden from the listing owner.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {enquirySent && (
                  <div className="ic-market-enquiry-success" role="status">
                    <CheckCircle2 size={18} />
                    Your message was sent to the seller.
                  </div>
                )}

                <button
                  type="button"
                  className="ic-market-contact"
                  onClick={openEnquiry}
                >
                  <MessageSquareText size={18} />
                  Contact seller
                </button>

                {!authenticated && sessionKnown && (
                  <p className="ic-market-auth-note">
                    Sign in to contact the seller privately. Seller phone
                    numbers and email addresses are not shown publicly.
                  </p>
                )}

                {showEnquiry && (
                  <form
                    className="ic-market-enquiry-form"
                    onSubmit={sendEnquiry}
                  >
                    <label>
                      <span>Message to seller</span>

                      <textarea
                        autoFocus
                        required
                        maxLength={2000}
                        rows={6}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Tell the seller what you need or ask a question about this listing."
                      />
                    </label>

                    <small>{message.length}/2000</small>

                    {enquiryError && (
                      <div className="ic-market-enquiry-error" role="alert">
                        {enquiryError}
                      </div>
                    )}

                    <div className="ic-market-enquiry-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setShowEnquiry(false);
                          setEnquiryError(null);
                        }}
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        disabled={sending || !message.trim()}
                      >
                        {sending ? (
                          <>
                            <Loader2 className="ic-spin" size={17} />
                            Sending
                          </>
                        ) : (
                          "Send message"
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
