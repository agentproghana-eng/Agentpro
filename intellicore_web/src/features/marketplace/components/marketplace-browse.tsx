"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
  Store,
} from "lucide-react";

import type {
  MarketplaceAdvertisement,
  MarketplaceCategory,
  MarketplaceCategoryResponse,
  MarketplaceListResponse,
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

function ListingCard({ ad }: { ad: MarketplaceAdvertisement }) {
  const image = imageUrl(ad);
  const rating = Number(ad.avg_rating ?? 0);
  const ratingCount = Number(ad.rating_count ?? 0);
  const verified = Boolean(ad.seller_verified ?? ad.is_verified);

  return (
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
          {ad.description?.trim() || "Open this listing to view more details."}
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
  );
}

type MarketplaceBrowseProps = {
  basePath?: string;
};

export function MarketplaceBrowse({
  basePath = "/marketplace",
}: MarketplaceBrowseProps = {}) {
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

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

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

          <h1>
            Find what you need.
            <span> Connect with trusted sellers.</span>
          </h1>

          <p>
            Browse AgentPro listings publicly. Sign in only when you want to
            save a listing or contact a seller privately.
          </p>

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
                placeholder="Search products, services or businesses"
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
            <div className="ic-market-results-toolbar">
              <div>
                <p className="ic-eyebrow">Discover</p>
                <h2>Marketplace listings</h2>
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
                  <option value="highest_rated">Highest rated</option>
                  <option value="most_viewed">Most viewed</option>
                  <option value="price_low">Price: low to high</option>
                  <option value="price_high">Price: high to low</option>
                  <option value="oldest">Oldest</option>
                </select>
              </label>
            </div>

            {error && (
              <div
                className="ic-market-state ic-market-state-error"
                role="alert"
              >
                <strong>Listings could not be loaded.</strong>
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

            {!error && !loading && ads.length === 0 && (
              <div className="ic-market-state">
                <Store size={28} aria-hidden="true" />
                <strong>No listings match these filters.</strong>
                <p>Try a wider search, another location or fewer filters.</p>
                <button type="button" onClick={resetFilters}>
                  Clear filters
                </button>
              </div>
            )}

            {!error && !loading && ads.length > 0 && (
              <>
                <div className="ic-market-grid">
                  {ads.map((ad) => (
                    <ListingCard key={ad.id} ad={ad} />
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
    </main>
  );
}
