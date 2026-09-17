"use client";

import Link from "next/link";
import {
  ChevronDown,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Share2,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AgentProUser } from "@/features/auth/types";
import { CommunityComposer } from "@/features/community/components/community-composer";
import type {
  CommunityFeedEnvelope,
  CommunityKind,
  CommunityPost,
  CommunityReaction,
} from "@/features/community/types";

import hubStyles from "./community-hub.module.css";

type Props = {
  user: Partial<AgentProUser>;
};

type SortOrder = "newest" | "oldest";

const REACTIONS: Array<{
  type: CommunityReaction;
  emoji: string;
  label: string;
}> = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "laugh", emoji: "😂", label: "Laugh" },
  { type: "wow", emoji: "😮", label: "Wow" },
  { type: "sad", emoji: "😢", label: "Sad" },
  { type: "pray", emoji: "🙏", label: "Pray" },
  { type: "dislike", emoji: "👎", label: "Dislike" },
];

const REPORT_REASONS = [
  ["spam", "Spam"],
  ["fraud", "Scam or fraud"],
  ["harassment", "Harassment"],
  ["misinformation", "False or misleading information"],
  ["inappropriate", "Inappropriate content"],
  ["privacy", "Privacy concern"],
  ["other", "Other"],
] as const;

function displayName(post: CommunityPost) {
  return (
    [post.first_name, post.last_name].filter(Boolean).join(" ").trim() ||
    "AgentPro member"
  );
}

function roleLabel(role?: string | null) {
  return role
    ? role
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "AgentPro member";
}

function reactionTotal(post: CommunityPost) {
  if (!post.reaction_counts) {
    return 0;
  }

  return Object.values(post.reaction_counts).reduce<number>((sum, value) => {
    const parsed = Number.parseInt(String(value), 10);

    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

function relativeTime(value?: string | null) {
  if (!value) {
    return "";
  }

  const created = new Date(value);

  if (!Number.isFinite(created.getTime())) {
    return "";
  }

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - created.getTime()) / 1000),
  );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d`;
  }

  return created.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function applyReaction(
  post: CommunityPost,
  nextReaction: CommunityReaction | null,
) {
  const previousReaction = post.my_reaction ?? null;
  const counts: Record<string, number> = {};

  for (const [key, value] of Object.entries(post.reaction_counts ?? {})) {
    const parsed = Number.parseInt(String(value), 10);

    if (Number.isFinite(parsed) && parsed > 0) {
      counts[key] = parsed;
    }
  }

  if (previousReaction) {
    const count = (counts[previousReaction] ?? 0) - 1;

    if (count > 0) {
      counts[previousReaction] = count;
    } else {
      delete counts[previousReaction];
    }
  }

  if (nextReaction) {
    counts[nextReaction] = (counts[nextReaction] ?? 0) + 1;
  }

  return {
    ...post,
    my_reaction: nextReaction,
    reaction_counts: counts,
  };
}

function isPaidPersonal(user: Partial<AgentProUser>) {
  if (user.personal_subscription_plan !== "paid") {
    return false;
  }

  const expiry = user.personal_subscription_expires_at;

  if (!expiry) {
    return true;
  }

  const parsed = new Date(expiry);

  return Number.isFinite(parsed.getTime()) && parsed.getTime() > Date.now();
}

function CompactAudio({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const syncDuration = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const syncCurrent = () => {
      setCurrent(audio.currentTime);
    };

    const stop = () => {
      setPlaying(false);
    };

    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("timeupdate", syncCurrent);
    audio.addEventListener("ended", stop);
    audio.addEventListener("pause", stop);

    return () => {
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("timeupdate", syncCurrent);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("pause", stop);
    };
  }, []);

  function format(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0:00";
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");

    return `${mins}:${secs}`;
  }

  async function toggle() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }

      return;
    }

    audio.pause();
  }

  const progress =
    duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;

  return (
    <div className={hubStyles.audioPlayer}>
      <audio ref={audioRef} preload="metadata" src={src} />

      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? "Pause audio" : "Play audio"}
      >
        {playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
      </button>

      <div className={hubStyles.audioTrack} aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <span className={hubStyles.audioTime}>
        {format(current || duration)}
      </span>
    </div>
  );
}

function ReportDialog({
  post,
  onClose,
}: {
  post: CommunityPost;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/community/agent/${encodeURIComponent(post.id)}/report`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            reason,
            details: details.trim() || null,
          }),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setMessage(body?.message || "Report could not be submitted.");
        return;
      }

      setSuccess(true);
      setMessage(body?.message || "Report submitted. We’ll review this post.");
    } catch {
      setMessage("Report could not be submitted. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={hubStyles.modalBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <section
        className={hubStyles.reportDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`report-${post.id}`}
      >
        <div className={hubStyles.reportHeader}>
          <div>
            <span>Community safety</span>
            <h3 id={`report-${post.id}`}>Report post</h3>
          </div>

          <button
            type="button"
            className={hubStyles.closeButton}
            onClick={onClose}
            aria-label="Close report dialog"
          >
            ×
          </button>
        </div>

        {success ? (
          <div className={hubStyles.reportSuccess}>
            <strong>Thank you.</strong>
            <p>{message}</p>

            <button type="button" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <label className={hubStyles.reportField}>
              <span>Why are you reporting this post?</span>

              <select
                value={reason}
                disabled={submitting}
                onChange={(event) => setReason(event.target.value)}
              >
                {REPORT_REASONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className={hubStyles.reportField}>
              <span>Additional details <small>Optional</small></span>

              <textarea
                rows={4}
                maxLength={2000}
                value={details}
                disabled={submitting}
                placeholder="Tell us what happened…"
                onChange={(event) => setDetails(event.target.value)}
              />
            </label>

            {message && (
              <p className={hubStyles.reportError} role="alert">
                {message}
              </p>
            )}

            <div className={hubStyles.reportActions}>
              <button type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </button>

              <button
                type="button"
                className={hubStyles.reportSubmit}
                disabled={submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function FeedCard({
  post,
  kind,
  currentUserId,
  reacting,
  onReact,
}: {
  post: CommunityPost;
  kind: CommunityKind;
  currentUserId?: string | null;
  reacting: boolean;
  onReact: (post: CommunityPost, reaction: CommunityReaction) => void;
}) {
  const reactions = reactionTotal(post);
  const comments = Number(post.comment_count ?? 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const canReport =
    kind === "agent" &&
    Boolean(post.author_id) &&
    post.author_id !== currentUserId;

  const selectedReaction = REACTIONS.find(
    ({ type }) => type === post.my_reaction,
  );

  async function share() {
    const url = `${window.location.origin}/hub/community/${kind}/${encodeURIComponent(post.id)}`;

    setShareStatus(null);

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${displayName(post)} on AgentPro Community`,
          text: post.content ?? undefined,
          url,
        });

        return;
      }

      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied");
    } catch {
      setShareStatus(null);
    }
  }

  return (
    <>
      <article className={hubStyles.postCard}>
        <div className={hubStyles.postHeader}>
          <div className={hubStyles.avatar}>
            {displayName(post).slice(0, 1).toUpperCase()}
          </div>

          <div className={hubStyles.authorMeta}>
            <strong>{displayName(post)}</strong>

            <span>
              {roleLabel(post.role)}
              {relativeTime(post.created_at) && (
                <>
                  <b aria-hidden="true">•</b>
                  {relativeTime(post.created_at)}
                </>
              )}
            </span>
          </div>

          <div className={hubStyles.postMenu}>
            <button
              type="button"
              aria-label="Post options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={20} />
            </button>

            {menuOpen && (
              <div className={hubStyles.postMenuPopover}>
                {canReport ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setReportOpen(true);
                    }}
                  >
                    <Flag size={15} />
                    Report post
                  </button>
                ) : (
                  <span>No additional actions</span>
                )}
              </div>
            )}
          </div>
        </div>

        {post.status === "pending_review" && (
          <div className={hubStyles.reviewNote}>
            Under review — only you can see this post.
          </div>
        )}

        {post.content && (
          <p className={hubStyles.postContent}>{post.content}</p>
        )}

        {post.audio_url && <CompactAudio src={post.audio_url} />}

        <div className={hubStyles.engagementSummary}>
          <span>
            {reactions > 0
              ? `${reactions} ${reactions === 1 ? "reaction" : "reactions"}`
              : "Be the first to react"}
          </span>

          <Link
            href={`/hub/community/${kind}/${encodeURIComponent(post.id)}`}
          >
            {comments > 0
              ? `${comments} ${comments === 1 ? "comment" : "comments"}`
              : "Comment"}
          </Link>
        </div>

        <div className={hubStyles.postActions}>
          <details className={hubStyles.reactControl}>
            <summary>
              <span aria-hidden="true">{selectedReaction?.emoji ?? "♡"}</span>
              {selectedReaction?.label ?? "React"}
              <ChevronDown size={14} />
            </summary>

            <div className={hubStyles.reactionPicker}>
              {REACTIONS.map(({ type, emoji, label }) => (
                <button
                  key={type}
                  type="button"
                  disabled={reacting}
                  aria-label={label}
                  title={label}
                  className={post.my_reaction === type ? hubStyles.activeReaction : undefined}
                  onClick={(event) => {
                    onReact(post, type);

                    const details = event.currentTarget.closest("details");

                    if (details) {
                      details.removeAttribute("open");
                    }
                  }}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </div>
          </details>

          <Link
            className={hubStyles.commentAction}
            href={`/hub/community/${kind}/${encodeURIComponent(post.id)}`}
          >
            <MessageCircle size={17} />
            Comment
          </Link>

          <button
            type="button"
            className={hubStyles.shareAction}
            onClick={() => void share()}
          >
            <Share2 size={17} />
            {shareStatus ?? "Share"}
          </button>
        </div>
      </article>

      {reportOpen && (
        <ReportDialog post={post} onClose={() => setReportOpen(false)} />
      )}
    </>
  );
}

export function CommunityHub({ user }: Props) {
  const agentEligible = ["business_owner", "manager", "agent"].includes(
    user.role ?? "",
  );

  const personalEligible = Boolean(user.personal_subscription_plan);
  const hasCommunity = agentEligible || personalEligible;
  const initialKind: CommunityKind = agentEligible ? "agent" : "personal";

  const [active, setActive] = useState<CommunityKind>(initialKind);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(hasCommunity);
  const [error, setError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [reactingPostId, setReactingPostId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  useEffect(() => {
    if (!hasCommunity) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setReactionError(null);

      try {
        const response = await fetch(`/api/community/${active}`, {
          cache: "no-store",
        });

        if (cancelled) {
          return;
        }

        const body = (await response
          .json()
          .catch(() => null)) as CommunityFeedEnvelope | null;

        if (!response.ok) {
          setPosts([]);
          setError(body?.message || "Community posts could not be loaded.");
          setLoading(false);
          return;
        }

        setPosts(Array.isArray(body?.data) ? body.data : []);
      } catch {
        if (cancelled) {
          return;
        }

        setPosts([]);
        setError("Community posts could not be loaded.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [active, hasCommunity]);

  async function react(post: CommunityPost, reaction: CommunityReaction) {
    if (reactingPostId) {
      return;
    }

    const previous = post;
    const optimisticReaction = post.my_reaction === reaction ? null : reaction;

    setReactionError(null);
    setReactingPostId(post.id);

    setPosts((current) =>
      current.map((item) =>
        item.id === post.id ? applyReaction(item, optimisticReaction) : item,
      ),
    );

    try {
      const response = await fetch(
        `/api/community/${active}/${encodeURIComponent(post.id)}/reaction`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            reaction_type: reaction,
          }),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        message?: string;
        data?: {
          reaction?: CommunityReaction | null;
        };
      } | null;

      if (!response.ok) {
        setPosts((current) =>
          current.map((item) => (item.id === previous.id ? previous : item)),
        );

        setReactionError(body?.message || "Reaction could not be updated.");
        return;
      }

      const confirmed =
        body?.data?.reaction === null ||
        REACTIONS.some(({ type }) => type === body?.data?.reaction)
          ? (body?.data?.reaction ?? null)
          : optimisticReaction;

      setPosts((current) =>
        current.map((item) => {
          if (item.id !== post.id) {
            return item;
          }

          if (item.my_reaction === confirmed) {
            return item;
          }

          return applyReaction(item, confirmed);
        }),
      );
    } catch {
      setPosts((current) =>
        current.map((item) => (item.id === previous.id ? previous : item)),
      );

      setReactionError("Reaction could not be updated.");
    } finally {
      setReactingPostId(null);
    }
  }

  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

      return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
    });
  }, [posts, sortOrder]);

  const personalPaid = isPaidPersonal(user);

  return (
    <div className={hubStyles.page}>
      <section className={hubStyles.hero}>
        <div>
          <h1>Community</h1>
          <p>Connect. Share. Learn. Grow together.</p>
        </div>

        <span>People • Business • Opportunity</span>
      </section>

      {hasCommunity && (
        <section className={hubStyles.switcher}>
          {agentEligible && (
            <button
              type="button"
              className={active === "agent" ? hubStyles.activeTab : undefined}
              aria-label="Open Agent Community"
              onClick={() => setActive("agent")}
            >
              <UsersRound size={18} />
              <strong>Agent</strong>
            </button>
          )}

          {personalEligible && (
            <button
              type="button"
              className={active === "personal" ? hubStyles.activeTab : undefined}
              aria-label="Open Personal Community"
              onClick={() => setActive("personal")}
            >
              <UserRound size={18} />
              <strong>Personal</strong>
            </button>
          )}
        </section>
      )}

      {hasCommunity && (
        <CommunityComposer
          key={active}
          user={user}
          kind={active}
          onCreated={(post) => {
            setPosts((current) => [
              post,
              ...current.filter((item) => item.id !== post.id),
            ]);
          }}
        />
      )}

      {!hasCommunity && (
        <section className="ic-portal-notice">
          <UsersRound size={21} />

          <div>
            <strong>No Community workspace is enabled.</strong>

            <p>
              Community access appears after AgentPro confirms either Agent
              Community eligibility or Personal capability for this account.
            </p>
          </div>
        </section>
      )}

      {hasCommunity && (
        <section className={hubStyles.feed}>
          <div className={hubStyles.feedHeading}>
            <div>
              <h2>Latest</h2>

              {active === "personal" && !personalPaid && (
                <span className="ic-community-plan-badge">
                  Free plan
                </span>
              )}
            </div>

            <label className={hubStyles.sortControl}>
              <span className={hubStyles.srOnly}>Sort Community posts</span>

              <select
                value={sortOrder}
                onChange={(event) =>
                  setSortOrder(event.target.value as SortOrder)
                }
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>

          {reactionError && (
            <div className="ic-community-state is-error" role="status">
              {reactionError}
            </div>
          )}

          {loading && <div className="ic-community-state">Loading…</div>}

          {!loading && error && (
            <div className="ic-community-state is-error">{error}</div>
          )}

          {!loading && !error && sortedPosts.length === 0 && (
            <div className="ic-community-state">No posts yet.</div>
          )}

          {!loading &&
            !error &&
            sortedPosts.map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                kind={active}
                currentUserId={user.id}
                reacting={reactingPostId !== null}
                onReact={react}
              />
            ))}
        </section>
      )}
    </div>
  );
}
