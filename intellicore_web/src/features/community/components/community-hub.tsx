"use client";

import Link from "next/link";
import { MessageCircle, UserRound, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

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

function displayName(post: CommunityPost) {
  return (
    [post.first_name, post.last_name].filter(Boolean).join(" ").trim() ||
    "AgentPro member"
  );
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

function FeedCard({
  post,
  kind,
  reacting,
  onReact,
}: {
  post: CommunityPost;
  kind: CommunityKind;
  reacting: boolean;
  onReact: (post: CommunityPost, reaction: CommunityReaction) => void;
}) {
  const reactions = reactionTotal(post);

  return (
    <article className="ic-community-post-card">
      <div className="ic-community-post-header">
        <div className="ic-community-avatar">
          {displayName(post).slice(0, 1).toUpperCase()}
        </div>

        <div>
          <strong>{displayName(post)}</strong>

          <span>
            {kind === "agent"
              ? post.post_type?.replaceAll("_", " ") || "Agent Community"
              : "Personal Community"}
          </span>
        </div>
      </div>

      {post.status === "pending_review" && (
        <div className="ic-community-review-note">
          Under review — only you can see this post.
        </div>
      )}

      {post.content && (
        <p className="ic-community-post-content">{post.content}</p>
      )}

      {post.audio_url && (
        <audio
          controls
          preload="none"
          src={post.audio_url}
          className="ic-community-audio"
        />
      )}

      <div className="ic-community-post-meta">
        {reactions > 0 && (
          <span>
            {reactions} {reactions === 1 ? "reaction" : "reactions"}
          </span>
        )}

        <Link
          href={`/hub/community/${kind}/${encodeURIComponent(post.id)}`}
          className="ic-community-discussion-link"
        >
          <MessageCircle size={15} />
          {Number(post.comment_count ?? 0)} comments
        </Link>
      </div>

      <div className="ic-community-reactions" aria-label="React to post">
        {REACTIONS.map(({ type, emoji, label }) => {
          const selected = post.my_reaction === type;

          return (
            <button
              key={type}
              type="button"
              className={selected ? "is-active" : undefined}
              aria-label={label}
              aria-pressed={selected}
              title={label}
              disabled={reacting}
              onClick={() => onReact(post, type)}
            >
              <span aria-hidden="true">{emoji}</span>

              <small>{label}</small>
            </button>
          );
        })}
      </div>
    </article>
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

  const personalPaid = isPaidPersonal(user);

  return (
    <div className={hubStyles.page}>
      <section className="ic-portal-hero">
        <h1>Community</h1>

        <p>
          Share, connect and join the conversation.
        </p>
      </section>

      {hasCommunity && (
        <section className="ic-community-switcher">
          {agentEligible && (
            <button
              type="button"
              className={active === "agent" ? "is-active" : undefined}
              aria-label="Open Agent Community"
              onClick={() => setActive("agent")}
            >
              <UsersRound size={17} />

              <strong>Agent</strong>
            </button>
          )}

          {personalEligible && (
            <button
              type="button"
              className={active === "personal" ? "is-active" : undefined}
              aria-label="Open Personal Community"
              onClick={() => setActive("personal")}
            >
              <UserRound size={17} />

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
              ...current.filter(
                (item) => item.id !== post.id,
              ),
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
        <section className="ic-community-feed">
          <div className="ic-community-feed-heading">
            <h2>Latest</h2>

            {active === "personal" && !personalPaid && (
              <span className="ic-community-plan-badge">
                Free plan
              </span>
            )}
          </div>

          {reactionError && (
            <div className="ic-community-state is-error" role="status">
              {reactionError}
            </div>
          )}

          {loading && (
            <div className="ic-community-state">Loading…</div>
          )}

          {!loading && error && (
            <div className="ic-community-state is-error">{error}</div>
          )}

          {!loading && !error && posts.length === 0 && (
            <div className="ic-community-state">No posts yet.</div>
          )}

          {!loading &&
            !error &&
            posts.map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                kind={active}
                reacting={reactingPostId !== null}
                onReact={react}
              />
            ))}
        </section>
      )}
    </div>
  );
}
