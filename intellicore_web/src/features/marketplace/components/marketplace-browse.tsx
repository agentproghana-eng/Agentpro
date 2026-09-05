"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
  Store,
  X,
} from "lucide-react";

import type {
  MarketplaceAdvertisement,
  MarketplaceCategory,
  MarketplaceCategoryResponse,
  MarketplaceListResponse,
  MarketplaceSavedStatusResponse,
} from "@/features/marketplace/types";

type Filters = {
  search: string;
  categoryId: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  minRating: string;
  sort: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  categoryId: "",
  location: "",
  minPrice: "",
  maxPrice: "",
  minRating: "",
  sort: "newest",
};

function parseInitialFilters(): Filters {
  if (typeof window === "undefined") {
    return EMPTY_FILTERS;
  }

  const params = new URLSearchParams(window.location.search);

  return {
    search: params.get("search") ?? "",
    categoryId: params.get("category_id") ?? "",
    location: params.get("location") ?? "",
    minPrice: params.get("min_price") ?? "",
    maxPrice: params.get("max_price") ?? "",
    minRating: params.get("min_rating") ?? "",
    sort: params.get("sort") ?? "newest",
  };
}

function parseInitialPage() {
  if (typeof window === "undefined") {
    return 1;
  }

  const value = Number(new URLSearchParams(window.location.search).get("page"));

  return Number.isInteger(value) && value > 0 ? value : 1;
}

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

  const person = [ad.seller_first_name, ad.seller_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return person || "AgentPro seller";
}

function imageUrl(ad: MarketplaceAdvertisement) {
  const first = Array.isArray(ad.image_urls) ? ad.image_urls[0] : null;

  return typeof first === "string" && first.trim() ? first : null;
}

const SORT_LABELS: Record<string, string> = {
  newest: "Newest",
  oldest: "Oldest",
  most_viewed: "Most Viewed",
  highest_rated: "Highest Rated",
  price_low: "Price: Low to High",
  price_high: "Price: High to Low",
};

function buildQuery(filters: Filters, page: number) {
  const params = new URLSearchParams();

  if (filters.search.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.categoryId) {
    params.set("category_id", filters.categoryId);
  }

  if (filters.location.trim()) {
    params.set("location", filters.location.trim());
  }

  if (filters.minPrice) {
    params.set("min_price", filters.minPrice);
  }

  if (filters.maxPrice) {
    params.set("max_price", filters.maxPrice);
  }

  if (filters.minRating) {
    params.set("min_rating", filters.minRating);
  }

  if (filters.sort && filters.sort !== "newest") {
    params.set("sort", filters.sort);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  params.set("limit", "20");

  return params;
}

type MarketplaceSavedIdsResponse = {
  success?: boolean;
  data?: string[];
};

type ListingCardProps = {
  ad: MarketplaceAdvertisement;
  saved: boolean;
  saving: boolean;
  onToggleSaved: (adId: string) => void;
};

function ListingCard({ ad, saved, saving, onToggleSaved }: ListingCardProps) {
  const image = imageUrl(ad);
  const rating = Number(ad.avg_rating ?? 0);
  const ratingCount = Number(ad.rating_count ?? 0);
  const verified = Boolean(ad.seller_verified ?? ad.is_verified);
  const isOwner = Boolean(ad.is_owner);

  return (
    <article className="ic-market-card-shell">
      <Link href={`/marketplace/${ad.id}`} className="ic-market-card">
        <div
          className={`ic-market-card-image${image ? " has-image" : ""}`}
          style={image ? { backgroundImage: `url("${image}")` } : undefined}
          role={image ? "img" : undefined}
          aria-label={image ? ad.title : undefined}
        >
          {!image && <Store size={30} aria-hidden="true" />}

          {ad.category_name && (
            <span className="ic-market-category-chip">{ad.category_name}</span>
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
              {sellerName(ad)}

              {verified && (
                <BadgeCheck
                  size={16}
                  aria-label="Verified AgentPro seller"
                  className="ic-market-verified"
                />
              )}
            </span>

            <span className="ic-market-rating">
              <Star size={15} aria-hidden="true" />
              {rating > 0 ? rating.toFixed(1) : "New"}
              {ratingCount > 0 && <small>({ratingCount})</small>}
            </span>
          </div>
        </div>
      </Link>

      {!isOwner && (
        <button
          type="button"
          className={`ic-market-save${saved ? " is-saved" : ""}`}
          onClick={() => onToggleSaved(ad.id)}
          disabled={saving}
          aria-pressed={saved}
          aria-label={saved ? `Unsave ${ad.title}` : `Save ${ad.title}`}
        >
          <Bookmark
            size={18}
            fill={saved ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      )}
    </article>
  );
}

type MarketplaceHomeSectionProps = {
  title: string;
  subtitle: string;
  ads: MarketplaceAdvertisement[];
  savedIds: Set<string>;
  savingIds: Set<string>;
  onToggleSaved: (adId: string) => void;
  loading?: boolean;
  onViewAll?: () => void;
};

function MarketplaceHomeSection({
  title,
  subtitle,
  ads,
  savedIds,
  savingIds,
  onToggleSaved,
  loading = false,
  onViewAll,
}: MarketplaceHomeSectionProps) {
  if (!loading && ads.length === 0) {
    return null;
  }

  return (
    <section className="ic-market-home-section">
      <div className="ic-market-home-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        {onViewAll && ads.length > 0 && (
          <button type="button" onClick={onViewAll}>
            View All
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="ic-market-home-grid" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="ic-market-card ic-market-card-skeleton"
              key={index}
              aria-hidden="true"
            >
              <div className="ic-market-card-image" />
              <div className="ic-market-card-body">
                <span />
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="ic-market-home-grid">
          {ads.map((ad) => (
            <ListingCard
              key={ad.id}
              ad={ad}
              saved={savedIds.has(ad.id)}
              saving={savingIds.has(ad.id)}
              onToggleSaved={onToggleSaved}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type MarketplaceCollectionSheetProps = {
  title: string;
  subtitle: string;
  ads: MarketplaceAdvertisement[];
  savedIds: Set<string>;
  savingIds: Set<string>;
  onToggleSaved: (adId: string) => void;
  onClose: () => void;
};

function MarketplaceCollectionSheet({
  title,
  subtitle,
  ads,
  savedIds,
  savingIds,
  onToggleSaved,
  onClose,
}: MarketplaceCollectionSheetProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="ic-market-collection-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="ic-market-collection-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ic-market-collection-title"
      >
        <div className="ic-market-collection-handle" aria-hidden="true" />

        <header className="ic-market-collection-header">
          <div>
            <h2 id="ic-market-collection-title">{title}</h2>
            <p>{subtitle}</p>
          </div>

          <button
            type="button"
            className="ic-market-collection-close"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="ic-market-collection-grid">
          {ads.map((ad) => (
            <ListingCard
              key={ad.id}
              ad={ad}
              saved={savedIds.has(ad.id)}
              saving={savingIds.has(ad.id)}
              onToggleSaved={onToggleSaved}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

type MarketplaceBrowseProps = {
  basePath?: string;
};

export function MarketplaceBrowse({
  basePath = "/marketplace",
}: MarketplaceBrowseProps = {}) {
  const router = useRouter();

  const [filters, setFilters] = useState<Filters>(() => parseInitialFilters());
  const [applied, setApplied] = useState<Filters>(() => parseInitialFilters());
  const [page, setPage] = useState(() => parseInitialPage());
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [ads, setAds] = useState<MarketplaceAdvertisement[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topRated, setTopRated] = useState<MarketplaceAdvertisement[]>([]);
  const [trending, setTrending] = useState<MarketplaceAdvertisement[]>([]);
  const [recommended, setRecommended] = useState<MarketplaceAdvertisement[]>(
    [],
  );
  const [recentlyViewed, setRecentlyViewed] = useState<
    MarketplaceAdvertisement[]
  >([]);
  const [homeSectionsLoading, setHomeSectionsLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [collectionSheet, setCollectionSheet] = useState<{
    title: string;
    subtitle: string;
    ads: MarketplaceAdvertisement[];
  } | null>(null);

  const hasDiscoveryFilters =
    Boolean(applied.search.trim()) ||
    Boolean(applied.categoryId) ||
    Boolean(applied.location.trim()) ||
    Boolean(applied.minPrice) ||
    Boolean(applied.maxPrice) ||
    Boolean(applied.minRating) ||
    applied.sort !== "newest";

  const showMarketplaceHome = !hasDiscoveryFilters && page === 1;

  useEffect(() => {
    let active = true;

    async function loadSavedIds() {
      try {
        const response = await fetch("/api/marketplace/saved/ids", {
          cache: "no-store",
        });

        if (!active) {
          return;
        }

        if (response.status === 401) {
          setAuthenticated(false);
          setSavedIds(new Set());
          return;
        }

        const body = (await response.json()) as MarketplaceSavedIdsResponse;

        if (!active) {
          return;
        }

        if (response.ok && Array.isArray(body.data)) {
          setAuthenticated(true);
          setSavedIds(
            new Set(
              body.data.filter(
                (value): value is string =>
                  typeof value === "string" && value.length > 0,
              ),
            ),
          );
        }
      } catch {
        // Public marketplace browsing remains available if hydration fails.
      }
    }

    void loadSavedIds();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      try {
        const response = await fetch("/api/marketplace/categories", {
          cache: "no-store",
        });

        const body = (await response.json()) as MarketplaceCategoryResponse;

        if (!active) {
          return;
        }

        if (response.ok && Array.isArray(body.data)) {
          setCategories(body.data);
        }
      } catch {
        // Category failure should not prevent marketplace browsing.
      } finally {
        if (active) {
          setCategoriesLoading(false);
        }
      }
    }

    void loadCategories();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadListings() {
      const params = buildQuery(applied, page);

      try {
        const response = await fetch(`/api/marketplace?${params.toString()}`, {
          cache: "no-store",
        });

        let body: MarketplaceListResponse;

        try {
          body = (await response.json()) as MarketplaceListResponse;
        } catch {
          body = {
            success: false,
            message: "Marketplace returned an invalid response.",
          };
        }

        if (!active) {
          return;
        }

        if (!response.ok) {
          setAds([]);
          setTotal(0);
          setError(body.message ?? "Marketplace listings could not be loaded.");
          setLoading(false);
          return;
        }

        setAds(Array.isArray(body.data) ? body.data : []);
        setTotal(Number(body.meta?.total ?? 0));
        setLimit(Number(body.meta?.limit ?? 20) || 20);
        setError(null);
        setLoading(false);
      } catch {
        if (!active) {
          return;
        }

        setAds([]);
        setTotal(0);
        setError(
          "Marketplace is temporarily unavailable. Check your connection and try again.",
        );
        setLoading(false);
      }
    }

    void loadListings();

    return () => {
      active = false;
    };
  }, [applied, page]);

  useEffect(() => {
    if (!showMarketplaceHome) {
      return;
    }

    let active = true;

    async function readListings(
      url: string,
      authenticated = false,
    ): Promise<MarketplaceAdvertisement[]> {
      try {
        const response = await fetch(url, {
          cache: "no-store",
        });

        if (authenticated && response.status === 401) {
          return [];
        }

        if (!response.ok) {
          return [];
        }

        const body = (await response.json()) as MarketplaceListResponse;

        return Array.isArray(body.data) ? body.data : [];
      } catch {
        return [];
      }
    }

    async function loadHomeSections() {
      setHomeSectionsLoading(true);

      const [topRatedResult, trendingResult, recommendedResult, recentResult] =
        await Promise.all([
          readListings("/api/marketplace?sort=highest_rated&limit=8"),
          readListings("/api/marketplace?sort=most_viewed&limit=8"),
          readListings("/api/marketplace/recommendations?limit=8", true),
          readListings("/api/marketplace/recently-viewed?limit=8", true),
        ]);

      if (!active) {
        return;
      }

      setTopRated(
        topRatedResult.filter((ad) => Number(ad.rating_count ?? 0) > 0),
      );
      setTrending(trendingResult);
      setRecommended(recommendedResult);
      setRecentlyViewed(recentResult);
      setHomeSectionsLoading(false);
    }

    void loadHomeSections();

    return () => {
      active = false;
    };
  }, [showMarketplaceHome]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = buildQuery(applied, page);

    params.delete("limit");

    const query = params.toString();

    window.history.replaceState(
      null,
      "",
      query ? `${basePath}?${query}` : basePath,
    );
  }, [applied, basePath, page]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setApplied(filters);
  }

  function loginForMarketplace() {
    const next = `${window.location.pathname}${window.location.search}`;

    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  async function toggleSaved(adId: string) {
    if (authenticated === false) {
      loginForMarketplace();
      return;
    }

    if (savingIds.has(adId)) {
      return;
    }

    const wasSaved = savedIds.has(adId);

    setSavingIds((current) => {
      const next = new Set(current);
      next.add(adId);
      return next;
    });

    setSavedIds((current) => {
      const next = new Set(current);

      if (wasSaved) {
        next.delete(adId);
      } else {
        next.add(adId);
      }

      return next;
    });

    try {
      const response = await fetch(`/api/marketplace/${adId}/save`, {
        method: wasSaved ? "DELETE" : "POST",
      });

      if (response.status === 401) {
        setAuthenticated(false);

        setSavedIds((current) => {
          const next = new Set(current);

          if (wasSaved) {
            next.add(adId);
          } else {
            next.delete(adId);
          }

          return next;
        });

        loginForMarketplace();
        return;
      }

      let body: MarketplaceSavedStatusResponse;

      try {
        body = (await response.json()) as MarketplaceSavedStatusResponse;
      } catch {
        body = {
          success: false,
        };
      }

      if (!response.ok) {
        setSavedIds((current) => {
          const next = new Set(current);

          if (wasSaved) {
            next.add(adId);
          } else {
            next.delete(adId);
          }

          return next;
        });

        return;
      }

      setSavedIds((current) => {
        const next = new Set(current);

        if (body.data?.is_saved === true) {
          next.add(adId);
        } else {
          next.delete(adId);
        }

        return next;
      });
    } catch {
      setSavedIds((current) => {
        const next = new Set(current);

        if (wasSaved) {
          next.add(adId);
        } else {
          next.delete(adId);
        }

        return next;
      });
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(adId);
        return next;
      });
    }
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  function applySort(sort: string) {
    const next = {
      ...EMPTY_FILTERS,
      sort,
    };

    setFilters(next);
    setApplied(next);
    setPage(1);
  }

  const specialListingIds = new Set(
    [...topRated, ...trending, ...recommended, ...recentlyViewed].map(
      (ad) => ad.id,
    ),
  );

  const latestAds = showMarketplaceHome
    ? ads.filter((ad) => !specialListingIds.has(ad.id))
    : ads;

  const activeFilterCount =
    Number(Boolean(applied.search.trim())) +
    Number(Boolean(applied.categoryId)) +
    Number(Boolean(applied.location.trim())) +
    Number(Boolean(applied.minPrice)) +
    Number(Boolean(applied.maxPrice)) +
    Number(Boolean(applied.minRating));

  const sortLabel = SORT_LABELS[applied.sort] ?? "Newest";

  const pageCount = Math.max(Math.ceil(total / Math.max(limit, 1)), 1);

  const resultLabel = loading
    ? "Finding listings…"
    : total === 1
      ? "1 listing"
      : `${total.toLocaleString()} listings`;

  return (
    <main id="main-content" className="ic-marketplace">
      <section className="ic-market-hero">
        <div className="ic-shell">
          <p className="ic-eyebrow">AgentPro Marketplace</p>

          <h1>Find what you need.</h1>

          <p>Products, services and businesses across Ghana.</p>

          <form className="ic-market-search" onSubmit={submit}>
            <label className="ic-market-search-main">
              <Search size={20} aria-hidden="true" />

              <input
                type="search"
                value={filters.search}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                placeholder="Search products, services or location"
                aria-label="Search Marketplace"
              />
            </label>

            <label>
              <MapPin size={18} aria-hidden="true" />

              <input
                type="search"
                value={filters.location}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    location: event.target.value,
                  }))
                }
                placeholder="Location"
                aria-label="Marketplace location"
              />
            </label>

            <button type="submit">
              <Search size={18} aria-hidden="true" />
              Search
            </button>
          </form>
        </div>
      </section>

      {!categoriesLoading && categories.length > 0 && (
        <section
          className="ic-market-categories"
          aria-label="Marketplace categories"
        >
          <div className="ic-shell">
            <div className="ic-market-category-list">
              <button
                type="button"
                className={!filters.categoryId ? "is-active" : undefined}
                onClick={() => {
                  const next = { ...filters, categoryId: "" };
                  setFilters(next);
                  setApplied(next);
                  setPage(1);
                }}
              >
                All
              </button>

              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={
                    filters.categoryId === String(category.id)
                      ? "is-active"
                      : undefined
                  }
                  onClick={() => {
                    const next = {
                      ...filters,
                      categoryId: String(category.id),
                    };
                    setFilters(next);
                    setApplied(next);
                    setPage(1);
                  }}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="ic-market-body">
        <div className="ic-shell ic-market-layout">
          <aside className="ic-market-filters">
            <div className="ic-market-filter-heading">
              <div>
                <SlidersHorizontal size={18} aria-hidden="true" />
                <strong>Filters</strong>
              </div>

              <button type="button" onClick={resetFilters}>
                Clear
              </button>
            </div>

            <form onSubmit={submit}>
              <label>
                <span>Category</span>

                <select
                  value={filters.categoryId}
                  disabled={categoriesLoading}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                >
                  <option value="">All categories</option>

                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="ic-market-price-grid">
                <label>
                  <span>Min price</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={filters.minPrice}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        minPrice: event.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                </label>

                <label>
                  <span>Max price</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={filters.maxPrice}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        maxPrice: event.target.value,
                      }))
                    }
                    placeholder="Any"
                  />
                </label>
              </div>

              <label>
                <span>Minimum rating</span>

                <select
                  value={filters.minRating}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      minRating: event.target.value,
                    }))
                  }
                >
                  <option value="">Any rating</option>
                  <option value="4">4 stars & up</option>
                  <option value="3">3 stars & up</option>
                  <option value="2">2 stars & up</option>
                  <option value="1">1 star & up</option>
                </select>
              </label>

              <button className="ic-market-apply" type="submit">
                Apply filters
              </button>
            </form>
          </aside>

          <div className="ic-market-results">
            {!showMarketplaceHome && (
              <div className="ic-market-active-filters">
                <span>
                  {activeFilterCount}{" "}
                  {activeFilterCount === 1 ? "filter" : "filters"} applied ·{" "}
                  {sortLabel}
                </span>

                {(activeFilterCount > 0 || applied.sort !== "newest") && (
                  <button type="button" onClick={resetFilters}>
                    Clear all
                  </button>
                )}
              </div>
            )}

            {showMarketplaceHome && !error && (
              <div className="ic-market-home-sections">
                <MarketplaceHomeSection
                  title="Top Rated"
                  subtitle="Popular items with strong buyer reviews"
                  ads={topRated.slice(0, 4)}
                  savedIds={savedIds}
                  savingIds={savingIds}
                  onToggleSaved={toggleSaved}
                  loading={homeSectionsLoading}
                  onViewAll={() => applySort("highest_rated")}
                />

                <MarketplaceHomeSection
                  title="Trending Now"
                  subtitle="Items getting the most attention"
                  ads={trending.slice(0, 4)}
                  savedIds={savedIds}
                  savingIds={savingIds}
                  onToggleSaved={toggleSaved}
                  loading={homeSectionsLoading}
                  onViewAll={() => applySort("most_viewed")}
                />

                {recommended.length > 0 && (
                  <MarketplaceHomeSection
                    title="Recommended for You"
                    subtitle="Suggestions based on your browsing"
                    ads={recommended.slice(0, 4)}
                    savedIds={savedIds}
                    savingIds={savingIds}
                    onToggleSaved={toggleSaved}
                    onViewAll={() =>
                      setCollectionSheet({
                        title: "Recommended for You",
                        subtitle:
                          "Suggestions based on your marketplace activity",
                        ads: recommended,
                      })
                    }
                  />
                )}

                {recentlyViewed.length > 0 && (
                  <MarketplaceHomeSection
                    title="Recently Viewed"
                    subtitle="Continue exploring items you opened"
                    ads={recentlyViewed.slice(0, 4)}
                    savedIds={savedIds}
                    savingIds={savingIds}
                    onToggleSaved={toggleSaved}
                    onViewAll={() =>
                      setCollectionSheet({
                        title: "Recently Viewed",
                        subtitle: "Advertisements you opened recently",
                        ads: recentlyViewed,
                      })
                    }
                  />
                )}
              </div>
            )}

            <div className="ic-market-results-toolbar">
              <div>
                <p className="ic-eyebrow">
                  {showMarketplaceHome ? "Discover" : "Results"}
                </p>
                <h2>
                  {showMarketplaceHome ? "Latest Ads" : "Marketplace listings"}
                </h2>
                <span>{resultLabel}</span>
              </div>

              <label>
                <span>Sort</span>

                <select
                  value={filters.sort}
                  onChange={(event) => {
                    const sort = event.target.value;

                    setFilters((current) => ({
                      ...current,
                      sort,
                    }));

                    setApplied((current) => ({
                      ...current,
                      sort,
                    }));

                    setPage(1);
                  }}
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="most_viewed">Most Viewed</option>
                  <option value="highest_rated">Highest Rated</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                </select>
              </label>
            </div>

            {error && (
              <div
                className="ic-market-state ic-market-state-error"
                role="alert"
              >
                <strong>Could not load advertisements</strong>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setError(null);
                    setApplied((current) => ({ ...current }));
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            {!error && loading && (
              <div className="ic-market-grid" aria-busy="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <div
                    className="ic-market-card ic-market-card-skeleton"
                    key={index}
                    aria-hidden="true"
                  >
                    <div className="ic-market-card-image" />
                    <div className="ic-market-card-body">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!error &&
              !loading &&
              latestAds.length === 0 &&
              (!showMarketplaceHome || ads.length === 0) && (
                <div className="ic-market-state">
                  <Store size={28} aria-hidden="true" />
                  <strong>No advertisements found</strong>
                  <p>
                    {showMarketplaceHome
                      ? "New advertisements will appear here."
                      : "Try changing or clearing your search and filters."}
                  </p>

                  {!showMarketplaceHome && (
                    <button type="button" onClick={resetFilters}>
                      Clear filters
                    </button>
                  )}
                </div>
              )}

            {!error && !loading && latestAds.length > 0 && (
              <>
                <div className="ic-market-grid">
                  {latestAds.map((ad) => (
                    <ListingCard
                      key={ad.id}
                      ad={ad}
                      saved={savedIds.has(ad.id)}
                      saving={savingIds.has(ad.id)}
                      onToggleSaved={toggleSaved}
                    />
                  ))}
                </div>

                {pageCount > 1 && (
                  <nav
                    className="ic-market-pagination"
                    aria-label="Marketplace pages"
                  >
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() =>
                        setPage((current) => Math.max(1, current - 1))
                      }
                    >
                      <ChevronLeft size={17} />
                      Previous
                    </button>

                    <span>
                      Page <strong>{page}</strong> of {pageCount}
                    </span>

                    <button
                      type="button"
                      disabled={page >= pageCount}
                      onClick={() =>
                        setPage((current) => Math.min(pageCount, current + 1))
                      }
                    >
                      Next
                      <ChevronRight size={17} />
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {collectionSheet && (
        <MarketplaceCollectionSheet
          title={collectionSheet.title}
          subtitle={collectionSheet.subtitle}
          ads={collectionSheet.ads}
          savedIds={savedIds}
          savingIds={savingIds}
          onToggleSaved={toggleSaved}
          onClose={() => setCollectionSheet(null)}
        />
      )}
    </main>
  );
}
