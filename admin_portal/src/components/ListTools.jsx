import { useMemo, useState } from 'react';

// Client-side search plus "show more" for queues that are already
// fully loaded. Searches every text and number field on each row.
function haystack(item) {
  return Object.values(item || {})
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ')
    .toLowerCase();
}

export function useListView(items, pageSize = 20) {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(pageSize);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => haystack(item).includes(term));
  }, [items, search]);

  return {
    search,
    setSearch: (value) => {
      setSearch(value);
      setLimit(pageSize);
    },
    visible: filtered.slice(0, limit),
    total: filtered.length,
    hasMore: filtered.length > limit,
    showMore: () => setLimit((current) => current + pageSize),
    searching: search.trim().length > 0,
  };
}

export function ListSearch({ view, label, placeholder = 'Search…' }) {
  return (
    <input
      type="search"
      value={view.search}
      onChange={(event) => view.setSearch(event.target.value)}
      aria-label={label}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-72"
    />
  );
}

export function ShowMore({ view }) {
  if (!view.hasMore) return null;
  return (
    <div className="mt-4 text-center">
      <button
        type="button"
        onClick={view.showMore}
        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        Show more ({view.total - view.visible.length} left)
      </button>
    </div>
  );
}

export function NoMatches() {
  return (
    <p className="py-10 text-center text-sm text-gray-500">
      Nothing matches your search.
    </p>
  );
}
