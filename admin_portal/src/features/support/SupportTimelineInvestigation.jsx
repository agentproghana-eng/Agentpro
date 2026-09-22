import {
  useState,
} from 'react';
import {
  useQuery,
} from '@tanstack/react-query';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';

export function SupportTimelineInvestigation() {
  const [
    searchType,
    setSearchType,
  ] = useState(
    'transaction_id',
  );

  const [
    searchValue,
    setSearchValue,
  ] = useState('');

  const [
    submittedSearch,
    setSubmittedSearch,
  ] = useState(null);

  const [
    timelineFilter,
    setTimelineFilter,
  ] = useState('all');

  const searchQuery =
    useQuery({
      queryKey: [
        'admin',
        'support',
        submittedSearch,
      ],

      enabled:
        Boolean(
          submittedSearch,
        ),

      retry: false,

      queryFn: async () => {
        const response =
          await API.get(
            '/admin/support/timeline',
            {
              params:
                submittedSearch,
            },
          );

        return response.data.data;
      },
    });

  const submit =
    event => {
      event.preventDefault();

      const value =
        searchValue.trim();

      if (!value) {
        toast.error(
          'Enter a search value.',
        );

        return;
      }

      setSubmittedSearch({
        type: searchType,
        value,
      });
    };

  const data =
    searchQuery.data;

  const events =
    data?.events || [];

  const caseSummary =
    data?.case_summary || null;

  const filteredEvents =
    events.filter(event => {
      if (
        timelineFilter ===
        'failed'
      ) {
        return (
          event.event_name ===
          'transaction.failed'
        );
      }

      if (
        timelineFilter ===
        'pending_confirmation'
      ) {
        return (
          event.event_name ===
          'transaction.pending_confirmation'
        );
      }

      return true;
    });

  const copySupportId =
    async (
      label,
      value,
    ) => {
      if (!value) {
        return;
      }

      try {
        await navigator.clipboard
          .writeText(
            String(value),
          );

        toast.success(
          `${label} copied`,
        );
      } catch (_) {
        toast.error(
          `Could not copy ${label.toLowerCase()}.`,
        );
      }
    };

  const outcomeLabel =
    value => {
      const labels = {
        completed: 'Completed',
        failed: 'Failed',
        pending_confirmation:
          'Pending confirmation',
        in_progress:
          'In progress',
        unknown: 'Unknown',
      };

      return (
        labels[value] ||
        value ||
        'Unknown'
      );
    };

  return (
    <>
      <div className="mb-6">
        <h2
          className="
            text-xl
            font-bold
            text-gray-900
          "
        >
          Support Console
        </h2>

        <p
          className="
            mt-1
            text-sm
            text-gray-500
          "
        >
          Search privacy-safe
          operational timelines.
          Raw PINs, OTPs, tokens,
          USSD logs and provider
          responses are not
          available here.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="
          mb-6
          rounded-xl
          bg-white
          p-5
          shadow-sm
        "
      >
        <div
          className="
            grid gap-3
            md:grid-cols-[220px_1fr_auto]
          "
        >
          <select
            value={searchType}
            onChange={event =>
              setSearchType(
                event.target.value,
              )
            }
            className="
              rounded-lg
              border
              border-gray-300
              bg-white
              px-3 py-2
              text-sm
            "
          >
            <option
              value="transaction_id"
            >
              Transaction ID
            </option>

            <option
              value="correlation_id"
            >
              Correlation ID
            </option>

            <option
              value="event_id"
            >
              Event ID
            </option>

            <option
              value="user_id"
            >
              User ID
            </option>

            <option
              value="company_id"
            >
              Company ID
            </option>

            <option value="email">
              Exact email
            </option>

            <option value="phone">
              Exact phone
            </option>
          </select>

          <input
            value={searchValue}
            onChange={event =>
              setSearchValue(
                event.target.value,
              )
            }
            autoComplete="off"
            placeholder="Enter exact ID, email or phone"
            className="
              rounded-lg
              border
              border-gray-300
              px-3 py-2
              text-sm
              focus:outline-none
              focus:ring-2
              focus:ring-primary
            "
          />

          <button
            type="submit"
            disabled={
              searchQuery.isFetching
            }
            className="
              rounded-lg
              bg-primary
              px-5 py-2
              text-sm
              font-semibold
              text-white
              hover:bg-primary-dark
              disabled:opacity-50
            "
          >
            {searchQuery.isFetching
              ? 'Searching...'
              : 'Search'}
          </button>
        </div>

        <p
          className="
            mt-3
            text-xs
            text-gray-500
          "
        >
          Searches are exact and
          access is audited. The
          search value itself is
          not written into the
          audit event.
        </p>
      </form>

      {searchQuery.isError && (
        <div
          className="
            mb-6
            rounded-xl
            border
            border-red-200
            bg-red-50
            p-4
          "
        >
          <p
            className="
              font-semibold
              text-red-800
            "
          >
            Search failed
          </p>

          <p
            className="
              mt-1
              text-sm
              text-red-700
            "
          >
            {
              searchQuery.error
                ?.response
                ?.data
                ?.message ||
              'The support timeline could not be loaded.'
            }
          </p>
        </div>
      )}

      {data && (
        <>
          <div
            className="
              mb-6
              grid gap-4
              md:grid-cols-3
            "
          >
            <div
              className="
                rounded-xl
                bg-white
                p-4
                shadow-sm
              "
            >
              <p
                className="
                  text-xs
                  uppercase
                  tracking-wide
                  text-gray-400
                "
              >
                Events
              </p>

              <p
                className="
                  mt-1
                  text-2xl
                  font-bold
                  text-gray-900
                "
              >
                {events.length}
              </p>
            </div>

            <div
              className="
                rounded-xl
                bg-white
                p-4
                shadow-sm
              "
            >
              <p
                className="
                  text-xs
                  uppercase
                  tracking-wide
                  text-gray-400
                "
              >
                Matched users
              </p>

              <p
                className="
                  mt-1
                  text-2xl
                  font-bold
                  text-gray-900
                "
              >
                {
                  data
                    .identities
                    ?.length || 0
                }
              </p>
            </div>

            <div
              className="
                rounded-xl
                bg-white
                p-4
                shadow-sm
              "
            >
              <p
                className="
                  text-xs
                  uppercase
                  tracking-wide
                  text-gray-400
                "
              >
                Result
              </p>

              <p
                className="
                  mt-1
                  text-sm
                  font-semibold
                  text-gray-900
                "
              >
                {data.truncated
                  ? 'Latest 200 events'
                  : 'Complete bounded result'}
              </p>
            </div>
          </div>

          {data.identities?.length >
            0 && (
            <div
              className="
                mb-6
                rounded-xl
                bg-white
                p-5
                shadow-sm
              "
            >
              <h3
                className="
                  font-bold
                  text-gray-900
                "
              >
                Matched users
              </h3>

              <div
                className="
                  mt-3
                  space-y-2
                "
              >
                {data.identities.map(
                  identity => (
                    <div
                      key={
                        identity.id
                      }
                      className="
                        rounded-lg
                        border
                        border-gray-100
                        p-3
                      "
                    >
                      <p
                        className="
                          text-sm
                          font-semibold
                          text-gray-900
                        "
                      >
                        {[
                          identity.first_name,
                          identity.last_name,
                        ]
                          .filter(Boolean)
                          .join(' ') ||
                          'Unnamed user'}
                      </p>

                      <p
                        className="
                          mt-1
                          break-all
                          font-mono
                          text-xs
                          text-gray-500
                        "
                      >
                        {identity.id}
                      </p>

                      <p
                        className="
                          mt-1
                          text-xs
                          text-gray-500
                        "
                      >
                        Role:{' '}
                        {
                          identity.role ||
                          '—'
                        }
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {data.company && (
            <div
              className="
                mb-6
                rounded-xl
                bg-white
                p-5
                shadow-sm
              "
            >
              <h3
                className="
                  font-bold
                  text-gray-900
                "
              >
                Company
              </h3>

              <p
                className="
                  mt-2
                  font-semibold
                "
              >
                {
                  data.company.name ||
                  'Unnamed company'
                }
              </p>

              <p
                className="
                  mt-1
                  break-all
                  font-mono
                  text-xs
                  text-gray-500
                "
              >
                {data.company.id}
              </p>
            </div>
          )}

          {caseSummary && (
            <div
              className="
                mb-6
                rounded-xl
                bg-white
                p-5
                shadow-sm
              "
            >
              <div
                className="
                  flex
                  flex-wrap
                  items-start
                  justify-between
                  gap-3
                "
              >
                <div>
                  <h3
                    className="
                      font-bold
                      text-gray-900
                    "
                  >
                    Case Summary
                  </h3>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-gray-500
                    "
                  >
                    Derived from the
                    privacy-safe operational
                    timeline.
                  </p>
                </div>

                <span
                  className="
                    rounded-full
                    bg-gray-100
                    px-3 py-1
                    text-xs
                    font-semibold
                    text-gray-700
                  "
                >
                  {outcomeLabel(
                    caseSummary.outcome,
                  )}
                </span>
              </div>

              <div
                className="
                  mt-5
                  grid gap-4
                  sm:grid-cols-2
                  lg:grid-cols-4
                "
              >
                <div>
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Provider
                  </p>

                  <p
                    className="
                      mt-1
                      font-semibold
                      text-gray-900
                    "
                  >
                    {
                      caseSummary.provider ||
                      '—'
                    }
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Transaction type
                  </p>

                  <p
                    className="
                      mt-1
                      font-semibold
                      text-gray-900
                    "
                  >
                    {
                      caseSummary.transaction_type ||
                      '—'
                    }
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Failed events
                  </p>

                  <p
                    className="
                      mt-1
                      font-semibold
                      text-gray-900
                    "
                  >
                    {
                      caseSummary.failed_count
                    }
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Pending confirmation
                  </p>

                  <p
                    className="
                      mt-1
                      font-semibold
                      text-gray-900
                    "
                  >
                    {
                      caseSummary
                        .pending_confirmation_count
                    }
                  </p>
                </div>
              </div>

              <div
                className="
                  mt-5
                  grid gap-4
                  md:grid-cols-2
                "
              >
                <div>
                  <p
                    className="
                      text-xs
                      text-gray-400
                    "
                  >
                    First event
                  </p>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-gray-700
                    "
                  >
                    {caseSummary.first_event_at
                      ? new Date(
                          caseSummary.first_event_at,
                        ).toLocaleString()
                      : '—'}
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      text-gray-400
                    "
                  >
                    Last event
                  </p>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-gray-700
                    "
                  >
                    {caseSummary.last_event_at
                      ? new Date(
                          caseSummary.last_event_at,
                        ).toLocaleString()
                      : '—'}
                  </p>
                </div>
              </div>

              {caseSummary
                .transaction_ids
                ?.length > 0 && (
                <div className="mt-5">
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Transaction IDs
                  </p>

                  <div
                    className="
                      mt-2
                      space-y-2
                    "
                  >
                    {caseSummary
                      .transaction_ids
                      .map(id => (
                        <div
                          key={id}
                          className="
                            flex
                            items-center
                            justify-between
                            gap-3
                            rounded-lg
                            bg-gray-50
                            px-3 py-2
                          "
                        >
                          <span
                            className="
                              min-w-0
                              break-all
                              font-mono
                              text-xs
                              text-gray-600
                            "
                          >
                            {id}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              copySupportId(
                                'Transaction ID',
                                id,
                              )
                            }
                            className="
                              shrink-0
                              text-xs
                              font-semibold
                              text-primary
                              hover:underline
                            "
                          >
                            Copy
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {caseSummary
                .correlation_ids
                ?.length > 0 && (
                <div className="mt-5">
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Correlation IDs
                  </p>

                  <div
                    className="
                      mt-2
                      space-y-2
                    "
                  >
                    {caseSummary
                      .correlation_ids
                      .map(id => (
                        <div
                          key={id}
                          className="
                            flex
                            items-center
                            justify-between
                            gap-3
                            rounded-lg
                            bg-gray-50
                            px-3 py-2
                          "
                        >
                          <span
                            className="
                              min-w-0
                              break-all
                              font-mono
                              text-xs
                              text-gray-600
                            "
                          >
                            {id}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              copySupportId(
                                'Correlation ID',
                                id,
                              )
                            }
                            className="
                              shrink-0
                              text-xs
                              font-semibold
                              text-primary
                              hover:underline
                            "
                          >
                            Copy
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div
                className="
                  mt-5
                  grid gap-3
                  md:grid-cols-2
                "
              >
                <div>
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Related user IDs
                  </p>

                  <p
                    className="
                      mt-2
                      break-all
                      font-mono
                      text-xs
                      text-gray-600
                    "
                  >
                    {caseSummary
                      .user_ids
                      ?.join(', ') ||
                      '—'}
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Related company IDs
                  </p>

                  <p
                    className="
                      mt-2
                      break-all
                      font-mono
                      text-xs
                      text-gray-600
                    "
                  >
                    {caseSummary
                      .company_ids
                      ?.join(', ') ||
                      '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div
            className="
              rounded-xl
              bg-white
              p-5
              shadow-sm
            "
          >
            <div
              className="
                mb-4
                flex
                items-center
                justify-between
                gap-3
              "
            >
              <h3
                className="
                  font-bold
                  text-gray-900
                "
              >
                Operational Timeline
              </h3>

              <div
                className="
                  flex
                  flex-wrap
                  items-center
                  gap-2
                "
              >
                <select
                  value={timelineFilter}
                  onChange={event =>
                    setTimelineFilter(
                      event.target.value,
                    )
                  }
                  className="
                    rounded-lg
                    border
                    border-gray-200
                    bg-white
                    px-2 py-1
                    text-xs
                    text-gray-700
                  "
                >
                  <option value="all">
                    All events
                  </option>

                  <option value="failed">
                    Failed
                  </option>

                  <option
                    value="pending_confirmation"
                  >
                    Pending confirmation
                  </option>
                </select>

                <span
                  className="
                    text-xs
                    text-gray-400
                  "
                >
                  Oldest → newest
                </span>
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div
                className="
                  py-10
                  text-center
                  text-sm
                  text-gray-400
                "
              >
                No operational
                events matched this
                exact search.
              </div>
            ) : (
              <div
                className="
                  space-y-3
                "
              >
                {filteredEvents.map(
                  event => (
                    <div
                      key={event.id}
                      className="
                        rounded-lg
                        border
                        border-gray-100
                        p-4
                      "
                    >
                      <div
                        className="
                          flex
                          flex-wrap
                          items-start
                          justify-between
                          gap-2
                        "
                      >
                        <div>
                          <p
                            className="
                              text-sm
                              font-semibold
                              text-gray-900
                            "
                          >
                            {
                              event.event_name
                            }
                          </p>

                          <p
                            className="
                              mt-1
                              text-xs
                              text-gray-500
                            "
                          >
                            {
                              event.subject_type
                            }
                            {' · '}
                            {
                              event.source
                            }
                          </p>
                        </div>

                        <time
                          className="
                            text-xs
                            text-gray-400
                          "
                        >
                          {new Date(
                            event.occurred_at,
                          ).toLocaleString()}
                        </time>
                      </div>

                      <div
                        className="
                          mt-3
                          grid gap-2
                          text-xs
                          md:grid-cols-2
                        "
                      >
                        <div>
                          <span
                            className="
                              text-gray-400
                            "
                          >
                            Subject
                          </span>

                          <p
                            className="
                              break-all
                              font-mono
                              text-gray-600
                            "
                          >
                            {
                              event.subject_id
                            }
                          </p>
                        </div>

                        <div>
                          <span
                            className="
                              text-gray-400
                            "
                          >
                            Correlation
                          </span>

                          <p
                            className="
                              break-all
                              font-mono
                              text-gray-600
                            "
                          >
                            {
                              event.correlation_id
                            }
                          </p>
                        </div>
                      </div>

                      {event.attributes &&
                        Object.keys(
                          event.attributes,
                        ).length >
                          0 && (
                        <pre
                          className="
                            mt-3
                            overflow-x-auto
                            rounded-lg
                            bg-gray-50
                            p-3
                            text-xs
                            text-gray-600
                          "
                        >
                          {JSON.stringify(
                            event.attributes,
                            null,
                            2,
                          )}
                        </pre>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
