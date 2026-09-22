import {
  useEffect,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import {
  PageHeader,
  Table,
} from '../../components/AdminUi.jsx';

export function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const latestFlaggedRef = useRef(false);

  const load = async ({
    cursor = null,
    append = false,
    flagged =
      latestFlaggedRef.current,
  } = {}) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const response =
        await API.get(
          '/shifts/cursor',
          {
            params: {
              flagged_only: flagged,
              limit: 50,
              ...(cursor
                ? { cursor }
                : {}),
            },
          },
        );

      if (
        flagged !==
        latestFlaggedRef.current
      ) {
        return;
      }

      const rows =
        response.data.data || [];

      setShifts(current => {
        if (!append) {
          return rows;
        }

        const seen = new Set(
          current.map(shift => shift.id),
        );

        return [
          ...current,
          ...rows.filter(
            shift =>
              !seen.has(shift.id),
          ),
        ];
      });

      setNextCursor(
        response.data.pagination
          ?.next_cursor || null,
      );

      setHasMore(
        Boolean(
          response.data.pagination
            ?.has_more,
        ),
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Failed to load shifts',
      );
    } finally {
      if (
        flagged ===
        latestFlaggedRef.current
      ) {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    }
  };

  useEffect(() => {
    latestFlaggedRef.current =
      flaggedOnly;

    setShifts([]);
    setNextCursor(null);
    setHasMore(false);

    load({
      flagged: flaggedOnly,
    });
  }, [flaggedOnly]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    load({
      cursor: nextCursor,
      append: true,
      flagged:
        latestFlaggedRef.current,
    });
  };

  return (
    <div>
      <PageHeader
        title="Shifts"
        subtitle="Shift open/close history and cash variance"
        action={
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={event =>
                setFlaggedOnly(
                  event.target.checked,
                )
              }
            />
            Flagged only
          </label>
        }
      />

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table
          loading={loading}
          data={shifts}
          emptyMsg="No closed shifts yet"
          columns={[
            {
              key: 'agent',
              label: 'Agent',
              render: row =>
                `${row.first_name} ${row.last_name}`,
            },
            {
              key: 'branch_name',
              label: 'Branch',
              render: row =>
                row.branch_name || '—',
            },
            {
              key: 'opened_at',
              label: 'Opened',
              render: row =>
                row.opened_at
                  ? new Date(
                      row.opened_at,
                    ).toLocaleString()
                  : '—',
            },
            {
              key: 'closed_at',
              label: 'Closed',
              render: row =>
                row.closed_at
                  ? new Date(
                      row.closed_at,
                    ).toLocaleString()
                  : '—',
            },
            {
              key: 'transaction_count',
              label: 'Transactions',
              render: row =>
                row.transaction_count ??
                '—',
            },
            {
              key: 'closing_cash_expected',
              label: 'Expected',
              render: row =>
                `GH₵ ${parseFloat(
                  row.closing_cash_expected ||
                    0,
                ).toFixed(2)}`,
            },
            {
              key: 'closing_cash_actual',
              label: 'Actual',
              render: row =>
                `GH₵ ${parseFloat(
                  row.closing_cash_actual ||
                    0,
                ).toFixed(2)}`,
            },
            {
              key: 'variance',
              label: 'Variance',
              render: row => {
                const value =
                  parseFloat(
                    row.variance || 0,
                  );

                return (
                  <span
                    className={
                      row.flagged
                        ? 'text-red-600 font-bold'
                        : 'text-gray-700'
                    }
                  >
                    {value > 0
                      ? '+'
                      : ''}
                    {value.toFixed(2)}
                    {row.flagged
                      ? ' ⚠️'
                      : ''}
                  </span>
                );
              },
            },
          ]}
        />

        {hasMore && !loading && (
          <div className="border-t border-gray-100 p-4 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={
                loadingMore ||
                !nextCursor
              }
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore
                ? 'Loading...'
                : 'Load more shifts'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ── Audit Logs Page ───────────────────────────────────────────
