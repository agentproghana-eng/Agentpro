import {
  useEffect,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import {
  Badge,
  PageHeader,
  Table,
} from '../../components/AdminUi.jsx';

export function CommunityModerationPage() {
  const [reports, setReports] = useState({
    post_reports: [],
    comment_reports: [],
  });
  const [pendingPosts, setPendingPosts] = useState([]);
  const [allPosts, setAllPosts] = useState([]);
  const [moderationHistory, setModerationHistory] = useState([]);
  const [postsNextCursor, setPostsNextCursor] = useState(null);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [historyNextCursor, setHistoryNextCursor] = useState(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [activeTab, setActiveTab] = useState('reports');
  const [postStatusFilter, setPostStatusFilter] = useState('all');
  const [postTypeFilter, setPostTypeFilter] = useState('all');
  const [postSearch, setPostSearch] = useState('');
  const [communityFilter, setCommunityFilter] = useState('all');
  const moderationFiltersInitialized = useRef(false);

  const moderationPostParams = (cursor = null) => ({
    limit: 50,
    ...(postStatusFilter !== 'all'
      ? { status: postStatusFilter }
      : {}),
    ...(postTypeFilter !== 'all'
      ? { post_type: postTypeFilter }
      : {}),
    ...(postSearch.trim()
      ? { search: postSearch.trim() }
      : {}),
    ...(cursor ? { cursor } : {}),
  });

  const load = async () => {
    setLoading(true);

    try {
      const [
        reportResponse,
        pendingResponse,
        personalPendingResponse,
        postsResponse,
        historyResponse,
      ] = await Promise.all([
        API.get('/agent-posts/moderation/reports', {
          params: { status: 'pending' },
        }),
        API.get('/agent-posts/moderation/pending'),
        API.get('/personal-community/moderation/pending'),
        API.get('/agent-posts/moderation/posts/cursor', {
          params: moderationPostParams(),
        }),
        API.get('/agent-posts/moderation/history/cursor', {
          params: { limit: 50 },
        }),
      ]);

      setReports(
        reportResponse.data.data || {
          post_reports: [],
          comment_reports: [],
        },
      );
      const agentPending =
        (pendingResponse.data.data || []).map((post) => ({
          ...post,
          community: 'agent',
        }));

      const personalPending =
        (personalPendingResponse.data.data || []).map(
          (post) => ({
            ...post,
            community: 'personal',
          }),
        );

      setPendingPosts(
        [...agentPending, ...personalPending].sort(
          (left, right) =>
            new Date(left.created_at).getTime() -
            new Date(right.created_at).getTime(),
        ),
      );
      setAllPosts(postsResponse.data.data || []);
      setPostsNextCursor(
        postsResponse.data.pagination?.next_cursor || null,
      );
      setPostsHasMore(
        postsResponse.data.pagination?.has_more === true,
      );

      setModerationHistory(historyResponse.data.data || []);
      setHistoryNextCursor(
        historyResponse.data.pagination?.next_cursor || null,
      );
      setHistoryHasMore(
        historyResponse.data.pagination?.has_more === true,
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Community moderation data could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!moderationFiltersInitialized.current) {
      moderationFiltersInitialized.current = true;
      return;
    }

    let cancelled = false;

    setLoading(true);
    setPostsNextCursor(null);
    setPostsHasMore(false);

    const timeoutId = setTimeout(async () => {
      try {
        const response = await API.get(
          '/agent-posts/moderation/posts/cursor',
          {
            params: moderationPostParams(),
          },
        );

        if (cancelled) {
          return;
        }

        setAllPosts(response.data.data || []);
        setPostsNextCursor(
          response.data.pagination?.next_cursor || null,
        );
        setPostsHasMore(
          response.data.pagination?.has_more === true,
        );
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error.response?.data?.message ||
              'Community posts could not be filtered.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, postSearch.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    postStatusFilter,
    postTypeFilter,
    postSearch,
  ]);

  const loadMorePosts = async () => {
    if (
      loadingMorePosts ||
      !postsHasMore ||
      !postsNextCursor
    ) {
      return;
    }

    setLoadingMorePosts(true);

    try {
      const response = await API.get(
        '/agent-posts/moderation/posts/cursor',
        {
          params: moderationPostParams(postsNextCursor),
        },
      );

      setAllPosts((current) => [
        ...current,
        ...(response.data.data || []),
      ]);

      setPostsNextCursor(
        response.data.pagination?.next_cursor || null,
      );
      setPostsHasMore(
        response.data.pagination?.has_more === true,
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'More Community posts could not be loaded.',
      );
    } finally {
      setLoadingMorePosts(false);
    }
  };

  const loadMoreHistory = async () => {
    if (
      loadingMoreHistory ||
      !historyHasMore ||
      !historyNextCursor
    ) {
      return;
    }

    setLoadingMoreHistory(true);

    try {
      const response = await API.get(
        '/agent-posts/moderation/history/cursor',
        {
          params: {
            limit: 50,
            cursor: historyNextCursor,
          },
        },
      );

      setModerationHistory((current) => [
        ...current,
        ...(response.data.data || []),
      ]);

      setHistoryNextCursor(
        response.data.pagination?.next_cursor || null,
      );
      setHistoryHasMore(
        response.data.pagination?.has_more === true,
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'More moderation history could not be loaded.',
      );
    } finally {
      setLoadingMoreHistory(false);
    }
  };

  const resolveReport = async (
    report,
    reportType,
    status,
  ) => {
    setUpdatingId(report.id);

    try {
      await API.patch(
        `/agent-posts/moderation/reports/${report.id}`,
        {
          report_type: reportType,
          status,
          resolution_note:
            status === 'dismissed'
              ? 'Dismissed by administrator'
              : 'Reviewed by administrator',
        },
      );

      toast.success('Report updated');
      await load();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Report could not be updated.',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const moderatePost = async (postId, updates) => {
    setUpdatingId(postId);

    try {
      await API.patch(
        `/agent-posts/${postId}/community-moderation`,
        updates,
      );

      toast.success('Post moderation updated');
      await load();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Post moderation could not be updated.',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const moderatePendingPost = async (
    post,
    action,
  ) => {
    setUpdatingId(post.id);

    try {
      if (post.community === 'personal') {
        await API.patch(
          `/personal-community/posts/${post.id}/moderate`,
          {
            action,
            removed_reason:
              action === 'reject'
                ? 'Rejected by administrator'
                : null,
          },
        );
      } else {
        await API.patch(
          `/agent-posts/${post.id}/community-moderation`,
          {
            status:
              action === 'approve'
                ? 'active'
                : 'removed',
            reason:
              action === 'approve'
                ? 'Approved by administrator'
                : 'Rejected by administrator',
          },
        );
      }

      toast.success(
        action === 'approve'
          ? 'Post approved'
          : 'Post rejected',
      );

      await load();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Pending post could not be reviewed.',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const postReports = reports.post_reports || [];
  const commentReports = reports.comment_reports || [];
  const totalReports =
    postReports.length + commentReports.length;

  const filteredPendingPosts = pendingPosts.filter(
    (post) =>
      communityFilter === 'all' ||
      post.community === communityFilter,
  );

  const filteredPosts = allPosts;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Community Moderation"
        subtitle="Review Agent Community reports and moderate flagged Agent and Personal posts"
        action={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ['Reported Posts', postReports.length],
          ['Reported Comments', commentReports.length],
          ['Pending Review', pendingPosts.length],
          [
            'Open Moderation Items',
            totalReports + pendingPosts.length,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={[
            'border-b-2 px-4 py-3 text-sm font-medium',
            activeTab === 'reports'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500',
          ].join(' ')}
        >
          Reports ({totalReports})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={[
            'border-b-2 px-4 py-3 text-sm font-medium',
            activeTab === 'pending'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500',
          ].join(' ')}
        >
          Pending Review ({pendingPosts.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={[
            'border-b-2 px-4 py-3 text-sm font-medium',
            activeTab === 'posts'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500',
          ].join(' ')}
        >
          All Posts ({allPosts.length}{postsHasMore ? '+' : ''})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={[
            'border-b-2 px-4 py-3 text-sm font-medium',
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500',
          ].join(' ')}
        >
          Moderation History ({moderationHistory.length}{historyHasMore ? '+' : ''})
        </button>
      </div>

      {activeTab === 'reports' && (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold text-gray-900">
                Reported Posts
              </h2>
            </div>

            <Table
              loading={loading}
              data={postReports}
              emptyMsg="No pending post reports"
              columns={[
                {
                  key: 'reported_content',
                  label: 'Content',
                  render: (row) => (
                    <div className="max-w-md">
                      <p className="line-clamp-3 text-sm text-gray-800">
                        {row.reported_content ||
                          'Voice-note post'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Author: {row.author_first_name}{' '}
                        {row.author_last_name}
                      </p>
                    </div>
                  ),
                },
                {
                  key: 'reason',
                  label: 'Reason',
                  render: (row) => (
                    <Badge status={row.reason} />
                  ),
                },
                {
                  key: 'reporter',
                  label: 'Reporter',
                  render: (row) => (
                    <span>
                      {row.reporter_first_name}{' '}
                      {row.reporter_last_name}
                    </span>
                  ),
                },
                {
                  key: 'created_at',
                  label: 'Reported',
                  render: (row) =>
                    new Date(row.created_at).toLocaleString(),
                },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          resolveReport(
                            row,
                            'post',
                            'dismissed',
                          )
                        }
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
                      >
                        Dismiss
                      </button>

                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={async () => {
                          await moderatePost(row.post_id, {
                            status: 'removed',
                            reason: `Reported: ${row.reason}`,
                          });

                          await resolveReport(
                            row,
                            'post',
                            'actioned',
                          );
                        }}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700"
                      >
                        Remove post
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </section>

          <section className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold text-gray-900">
                Reported Comments
              </h2>
            </div>

            <Table
              loading={loading}
              data={commentReports}
              emptyMsg="No pending comment reports"
              columns={[
                {
                  key: 'reported_content',
                  label: 'Comment',
                },
                {
                  key: 'reason',
                  label: 'Reason',
                  render: (row) => (
                    <Badge status={row.reason} />
                  ),
                },
                {
                  key: 'author',
                  label: 'Author',
                  render: (row) => (
                    <span>
                      {row.author_first_name}{' '}
                      {row.author_last_name}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          resolveReport(
                            row,
                            'comment',
                            'dismissed',
                          )
                        }
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
                      >
                        Dismiss
                      </button>

                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          resolveReport(
                            row,
                            'comment',
                            'actioned',
                          )
                        }
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
                      >
                        Mark actioned
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </div>
      )}

      {activeTab === 'pending' && (
        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-gray-900">
                Pending Community Posts
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Review AI-flagged Agent and Personal Community posts.
              </p>
            </div>

            <select
              value={communityFilter}
              onChange={(event) =>
                setCommunityFilter(event.target.value)
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              aria-label="Community filter"
            >
              <option value="all">All communities</option>
              <option value="agent">Agent Community</option>
              <option value="personal">
                Personal Community
              </option>
            </select>
          </div>

          <Table
            loading={loading}
            data={filteredPendingPosts}
            emptyMsg="No posts awaiting review for this community"
            columns={[
              {
                key: 'community',
                label: 'Community',
                render: (row) => (
                  <span
                    className={[
                      'rounded-full px-2 py-1 text-xs font-medium',
                      row.community === 'personal'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700',
                    ].join(' ')}
                  >
                    {row.community === 'personal'
                      ? 'Personal'
                      : 'Agent'}
                  </span>
                ),
              },
              {
                key: 'content',
                label: 'Post',
                render: (row) => (
                  <div className="max-w-lg">
                    <p className="line-clamp-3">
                      {row.content || 'Voice-note post'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {row.first_name} {row.last_name}
                    </p>
                  </div>
                ),
              },
              {
                key: 'flagged_reason',
                label: 'Reason',
              },
              {
                key: 'created_at',
                label: 'Submitted',
                render: (row) =>
                  new Date(row.created_at).toLocaleString(),
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={updatingId === row.id}
                      onClick={() =>
                        moderatePendingPost(
                          row,
                          'approve',
                        )
                      }
                      className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700"
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      disabled={updatingId === row.id}
                      onClick={() =>
                        moderatePendingPost(
                          row,
                          'reject',
                        )
                      }
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700"
                    >
                      Reject
                    </button>

                    {row.community === 'agent' && (
                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          moderatePost(row.id, {
                            status: 'active',
                            is_official: true,
                            is_pinned: true,
                            reason:
                              'Approved and highlighted by administrator',
                          })
                        }
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700"
                      >
                        Approve + pin
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </section>
      )}

      {activeTab === 'posts' && (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-xl bg-white p-4 shadow-sm">
            <input
              value={postSearch}
              onChange={(event) =>
                setPostSearch(event.target.value)
              }
              placeholder="Search posts or authors..."
              className="min-w-64 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />

            <select
              value={postStatusFilter}
              onChange={(event) =>
                setPostStatusFilter(event.target.value)
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending_review">
                Pending review
              </option>
              <option value="removed">Removed</option>
            </select>

            <select
              value={postTypeFilter}
              onChange={(event) =>
                setPostTypeFilter(event.target.value)
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="all">All types</option>
              <option value="general">General</option>
              <option value="question">Question</option>
              <option value="business_tip">
                Business tip
              </option>
              <option value="fraud_alert">Fraud alert</option>
              <option value="announcement">
                Announcement
              </option>
            </select>
          </div>

          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <Table
              loading={loading}
              data={filteredPosts}
              emptyMsg="No Community posts match these filters"
              columns={[
                {
                  key: 'content',
                  label: 'Post',
                  render: (row) => (
                    <div className="max-w-md">
                      <p className="line-clamp-3 text-sm text-gray-800">
                        {row.content || 'Voice-note post'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {row.first_name} {row.last_name}
                        {' · '}
                        {row.email}
                      </p>
                    </div>
                  ),
                },
                {
                  key: 'post_type',
                  label: 'Type',
                  render: (row) => (
                    <select
                      value={row.post_type || 'general'}
                      disabled={updatingId === row.id}
                      onChange={(event) =>
                        moderatePost(row.id, {
                          post_type: event.target.value,
                          reason:
                            'Post type changed by administrator',
                        })
                      }
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                    >
                      <option value="general">General</option>
                      <option value="question">Question</option>
                      <option value="business_tip">
                        Business tip
                      </option>
                      <option value="fraud_alert">
                        Fraud alert
                      </option>
                      <option value="announcement">
                        Announcement
                      </option>
                    </select>
                  ),
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (row) => (
                    <Badge status={row.status} />
                  ),
                },
                {
                  key: 'engagement',
                  label: 'Engagement',
                  render: (row) => (
                    <div className="text-xs text-gray-600">
                      <div>{row.comment_count || 0} comments</div>
                      <div>
                        {row.pending_report_count || 0} open reports
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'labels',
                  label: 'Labels',
                  render: (row) => (
                    <div className="flex max-w-48 flex-wrap gap-1">
                      {row.is_pinned && (
                        <span className="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-700">
                          Pinned
                        </span>
                      )}
                      {row.is_official && (
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                          Official
                        </span>
                      )}
                      {row.is_urgent && (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">
                          Urgent
                        </span>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'moderation_actions',
                  label: 'Actions',
                  render: (row) => (
                    <div className="flex min-w-72 flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          moderatePost(row.id, {
                            is_pinned: !row.is_pinned,
                            reason: row.is_pinned
                              ? 'Post unpinned by administrator'
                              : 'Post pinned by administrator',
                          })
                        }
                        className="rounded-lg border border-purple-200 px-2 py-1 text-xs text-purple-700"
                      >
                        {row.is_pinned ? 'Unpin' : 'Pin'}
                      </button>

                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          moderatePost(row.id, {
                            is_official: !row.is_official,
                            reason: row.is_official
                              ? 'Official label removed'
                              : 'Marked as official',
                          })
                        }
                        className="rounded-lg border border-blue-200 px-2 py-1 text-xs text-blue-700"
                      >
                        {row.is_official
                          ? 'Remove official'
                          : 'Official'}
                      </button>

                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          moderatePost(row.id, {
                            is_urgent: !row.is_urgent,
                            reason: row.is_urgent
                              ? 'Urgent label removed'
                              : 'Marked as urgent',
                          })
                        }
                        className="rounded-lg border border-amber-200 px-2 py-1 text-xs text-amber-800"
                      >
                        {row.is_urgent
                          ? 'Remove urgent'
                          : 'Urgent'}
                      </button>

                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          moderatePost(row.id, {
                            status:
                              row.status === 'removed'
                                ? 'active'
                                : 'removed',
                            reason:
                              row.status === 'removed'
                                ? 'Post restored by administrator'
                                : 'Post removed by administrator',
                          })
                        }
                        className={[
                          'rounded-lg border px-2 py-1 text-xs',
                          row.status === 'removed'
                            ? 'border-green-200 text-green-700'
                            : 'border-red-200 text-red-700',
                        ].join(' ')}
                      >
                        {row.status === 'removed'
                          ? 'Restore'
                          : 'Remove'}
                      </button>
                    </div>
                  ),
                },
              ]}
            />

            {postsHasMore && (
              <div className="border-t border-gray-100 p-4 text-center">
                <button
                  type="button"
                  onClick={loadMorePosts}
                  disabled={loadingMorePosts}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
                >
                  {loadingMorePosts ? 'Loading...' : 'Load more posts'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <Table
            loading={loading}
            data={moderationHistory}
            emptyMsg="No moderation actions recorded"
            columns={[
              {
                key: 'post_content',
                label: 'Post',
                render: (row) => (
                  <div className="max-w-md">
                    <p className="line-clamp-2 text-sm">
                      {row.post_content || 'Voice-note post'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Author: {row.author_first_name}{' '}
                      {row.author_last_name}
                    </p>
                  </div>
                ),
              },
              {
                key: 'action',
                label: 'Action',
                render: (row) => (
                  <Badge status={row.action} />
                ),
              },
              {
                key: 'moderator',
                label: 'Moderator',
                render: (row) => (
                  <div>
                    <p className="text-sm">
                      {row.moderator_first_name}{' '}
                      {row.moderator_last_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.moderator_email}
                    </p>
                  </div>
                ),
              },
              {
                key: 'reason',
                label: 'Reason',
                render: (row) => row.reason || '—',
              },
              {
                key: 'created_at',
                label: 'Date',
                render: (row) =>
                  new Date(row.created_at).toLocaleString(),
              },
            ]}
          />

          {historyHasMore && (
            <div className="border-t border-gray-100 p-4 text-center">
              <button
                type="button"
                onClick={loadMoreHistory}
                disabled={loadingMoreHistory}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
              >
                {loadingMoreHistory
                  ? 'Loading...'
                  : 'Load more history'}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
