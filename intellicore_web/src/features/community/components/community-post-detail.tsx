"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { ArrowLeft, MessageCircle, Reply, Send, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AgentProUser } from "@/features/auth/types";
import type {
  CommunityComment,
  CommunityCommentsEnvelope,
  CommunityKind,
  CommunityPost,
  CommunityPostEnvelope,
  CommunityReaction,
} from "@/features/community/types";

type Props = {
  user: Partial<AgentProUser>;
  kind: CommunityKind;
  postId: string;
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

function memberName(value: Pick<CommunityPost, "first_name" | "last_name">) {
  return (
    [value.first_name, value.last_name].filter(Boolean).join(" ").trim() ||
    "AgentPro member"
  );
}

function reactionTotal(value: Pick<CommunityPost, "reaction_counts">) {
  return Object.values(value.reaction_counts ?? {}).reduce<number>(
    (sum, count) => {
      const parsed = Number.parseInt(String(count), 10);

      return sum + (Number.isFinite(parsed) ? parsed : 0);
    },
    0,
  );
}

function applyReaction<T extends CommunityPost | CommunityComment>(
  value: T,
  nextReaction: CommunityReaction | null,
): T {
  const previousReaction = value.my_reaction ?? null;

  const counts: Record<string, number> = {};

  for (const [key, count] of Object.entries(value.reaction_counts ?? {})) {
    const parsed = Number.parseInt(String(count), 10);

    if (Number.isFinite(parsed) && parsed > 0) {
      counts[key] = parsed;
    }
  }

  if (previousReaction) {
    const nextCount = (counts[previousReaction] ?? 0) - 1;

    if (nextCount > 0) {
      counts[previousReaction] = nextCount;
    } else {
      delete counts[previousReaction];
    }
  }

  if (nextReaction) {
    counts[nextReaction] = (counts[nextReaction] ?? 0) + 1;
  }

  return {
    ...value,
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

type CommentNode = CommunityComment & {
  children: CommentNode[];
};

function buildCommentTree(comments: CommunityComment[]) {
  const nodes = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const comment of comments) {
    nodes.set(comment.id, {
      ...comment,
      children: [],
    });
  }

  for (const comment of comments) {
    const node = nodes.get(comment.id);

    if (!node) {
      continue;
    }

    const parentId = comment.parent_comment_id ?? null;

    if (parentId && nodes.has(parentId)) {
      nodes.get(parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function ReactionBar({
  value,
  disabled,
  onReact,
}: {
  value: CommunityPost | CommunityComment;
  disabled: boolean;
  onReact: (reaction: CommunityReaction) => void;
}) {
  return (
    <div className="ic-community-reactions" aria-label="Reactions">
      {REACTIONS.map(({ type, emoji, label }) => {
        const selected = value.my_reaction === type;

        return (
          <button
            key={type}
            type="button"
            className={selected ? "is-active" : undefined}
            aria-label={label}
            aria-pressed={selected}
            title={label}
            disabled={disabled}
            onClick={() => onReact(type)}
          >
            <span aria-hidden="true">{emoji}</span>
            <small>{label}</small>
          </button>
        );
      })}
    </div>
  );
}

function CommentItem({
  node,
  depth,
  canComment,
  pendingReactionId,
  onReply,
  onReact,
}: {
  node: CommentNode;
  depth: number;
  canComment: boolean;
  pendingReactionId: string | null;
  onReply: (comment: CommunityComment) => void;
  onReact: (comment: CommunityComment, reaction: CommunityReaction) => void;
}) {
  return (
    <div
      className="ic-community-comment"
      style={{
        marginInlineStart: `${Math.min(depth, 4) * 18}px`,
      }}
    >
      <div className="ic-community-comment-header">
        <div className="ic-community-avatar is-small">
          {memberName(node).slice(0, 1).toUpperCase()}
        </div>

        <div>
          <strong>{memberName(node)}</strong>

          {node.role && <span>{node.role.replaceAll("_", " ")}</span>}
        </div>
      </div>

      {node.content && (
        <p className="ic-community-comment-content">{node.content}</p>
      )}

      {node.audio_url && (
        <audio
          controls
          preload="none"
          src={node.audio_url}
          className="ic-community-audio"
        />
      )}

      <div className="ic-community-comment-actions">
        <span>{reactionTotal(node)} reactions</span>

        {canComment && (
          <button type="button" onClick={() => onReply(node)}>
            <Reply size={14} />
            Reply
          </button>
        )}
      </div>

      <ReactionBar
        value={node}
        disabled={pendingReactionId !== null}
        onReact={(reaction) => onReact(node, reaction)}
      />

      {node.children.map((child) => (
        <CommentItem
          key={child.id}
          node={child}
          depth={depth + 1}
          canComment={canComment}
          pendingReactionId={pendingReactionId}
          onReply={onReply}
          onReact={onReact}
        />
      ))}
    </div>
  );
}

export function CommunityPostDetail({ user, kind, postId }: Props) {
  const [post, setPost] = useState<CommunityPost | null>(null);

  const [comments, setComments] = useState<CommunityComment[]>([]);

  const [loading, setLoading] = useState(true);

  const [notFound, setNotFound] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [reactionError, setReactionError] = useState<string | null>(null);

  const [pendingPostReaction, setPendingPostReaction] = useState(false);

  const [pendingCommentReactionId, setPendingCommentReactionId] = useState<
    string | null
  >(null);

  const [commentText, setCommentText] = useState("");

  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);

  const [submittingComment, setSubmittingComment] = useState(false);

  const [commentError, setCommentError] = useState<string | null>(null);

  const personalPaid = isPaidPersonal(user);

  const canComment = kind === "agent" || personalPaid;

  const loadDiscussion = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const [postResponse, commentsResponse] = await Promise.all([
        fetch(`/api/community/${kind}/${encodeURIComponent(postId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/community/${kind}/${encodeURIComponent(postId)}/comments`, {
          cache: "no-store",
        }),
      ]);

      const postBody = (await postResponse
        .json()
        .catch(() => null)) as CommunityPostEnvelope | null;

      if (postResponse.status === 404) {
        setPost(null);
        setComments([]);
        setNotFound(true);
        return;
      }

      if (!postResponse.ok) {
        setError(
          postBody?.message || "Community discussion could not be loaded.",
        );
        return;
      }

      const commentsBody = (await commentsResponse
        .json()
        .catch(() => null)) as CommunityCommentsEnvelope | null;

      if (!commentsResponse.ok) {
        setError(
          commentsBody?.message || "Community comments could not be loaded.",
        );
        return;
      }

      setPost(postBody?.data ?? null);

      setComments(Array.isArray(commentsBody?.data) ? commentsBody.data : []);
    } catch {
      setError(
        "Community discussion could not be loaded. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [kind, postId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDiscussion();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadDiscussion]);

  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  async function reactToPost(reaction: CommunityReaction) {
    if (!post || pendingPostReaction) {
      return;
    }

    const previous = post;

    const optimistic = post.my_reaction === reaction ? null : reaction;

    setReactionError(null);
    setPendingPostReaction(true);
    setPost(applyReaction(post, optimistic));

    try {
      const response = await fetch(
        `/api/community/${kind}/${encodeURIComponent(post.id)}/reaction`,
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
        setPost(previous);
        setReactionError(body?.message || "Reaction could not be updated.");
        return;
      }

      const confirmed =
        body?.data?.reaction === null ||
        REACTIONS.some(({ type }) => type === body?.data?.reaction)
          ? (body?.data?.reaction ?? null)
          : optimistic;

      setPost((current) =>
        current ? applyReaction(current, confirmed) : current,
      );
    } catch {
      setPost(previous);
      setReactionError("Reaction could not be updated.");
    } finally {
      setPendingPostReaction(false);
    }
  }

  async function reactToComment(
    comment: CommunityComment,
    reaction: CommunityReaction,
  ) {
    if (pendingCommentReactionId) {
      return;
    }

    const previous = comment;

    const optimistic = comment.my_reaction === reaction ? null : reaction;

    setReactionError(null);
    setPendingCommentReactionId(comment.id);

    setComments((current) =>
      current.map((item) =>
        item.id === comment.id ? applyReaction(item, optimistic) : item,
      ),
    );

    try {
      const response = await fetch(
        `/api/community/${kind}/comments/${encodeURIComponent(comment.id)}/reaction`,
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
        setComments((current) =>
          current.map((item) => (item.id === previous.id ? previous : item)),
        );

        setReactionError(body?.message || "Reaction could not be updated.");

        return;
      }

      const confirmed =
        body?.data?.reaction === null ||
        REACTIONS.some(({ type }) => type === body?.data?.reaction)
          ? (body?.data?.reaction ?? null)
          : optimistic;

      setComments((current) =>
        current.map((item) => {
          if (item.id !== comment.id) {
            return item;
          }

          if (item.my_reaction === confirmed) {
            return item;
          }

          return applyReaction(item, confirmed);
        }),
      );
    } catch {
      setComments((current) =>
        current.map((item) => (item.id === previous.id ? previous : item)),
      );

      setReactionError("Reaction could not be updated.");
    } finally {
      setPendingCommentReactionId(null);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();

    const content = commentText.trim();

    if (!content || submittingComment) {
      return;
    }

    setSubmittingComment(true);
    setCommentError(null);

    try {
      const response = await fetch(
        `/api/community/${kind}/${encodeURIComponent(postId)}/comments`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            content,
            ...(replyTo
              ? {
                  parent_comment_id: replyTo.id,
                }
              : {}),
          }),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setCommentError(body?.message || "Comment could not be posted.");
        return;
      }

      setCommentText("");
      setReplyTo(null);

      await loadDiscussion();
    } catch {
      setCommentError(
        "Comment could not be posted. Check your connection and try again.",
      );
    } finally {
      setSubmittingComment(false);
    }
  }

  if (loading) {
    return (
      <section className="ic-community-detail-state">
        Loading discussion…
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="ic-community-detail-state">
        <UserRound size={28} />

        <h1>Discussion not found.</h1>

        <p>This post is unavailable or is not visible to your account.</p>

        <Link href="/hub/community">
          <ArrowLeft size={16} />
          Return to Community Hub
        </Link>
      </section>
    );
  }

  if (error || !post) {
    return (
      <section className="ic-community-detail-state is-error">
        <h1>Community could not be opened.</h1>

        <p>{error || "Community discussion could not be loaded."}</p>

        <button
          type="button"
          className="ic-auth-submit"
          onClick={() => void loadDiscussion()}
        >
          Try again
        </button>

        <Link href="/hub/community">
          <ArrowLeft size={16} />
          Return to Community Hub
        </Link>
      </section>
    );
  }

  return (
    <div className="ic-community-detail">
      <Link href="/hub/community" className="ic-community-back-link">
        <ArrowLeft size={16} />
        Back to Community Hub
      </Link>

      <article className="ic-community-post-card">
        <div className="ic-community-post-header">
          <div className="ic-community-avatar">
            {memberName(post).slice(0, 1).toUpperCase()}
          </div>

          <div>
            <strong>{memberName(post)}</strong>

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
          <span>{reactionTotal(post)} reactions</span>

          <span>
            <MessageCircle size={15} />
            {comments.length} comments
          </span>
        </div>

        {reactionError && (
          <div className="ic-community-inline-error" role="status">
            {reactionError}
          </div>
        )}

        <ReactionBar
          value={post}
          disabled={pendingPostReaction}
          onReact={reactToPost}
        />
      </article>

      <section className="ic-community-comments-section">
        <div className="ic-community-feed-heading">
          <div>
            <p className="ic-eyebrow">Discussion</p>
            <h2>Comments</h2>
          </div>

          {kind === "personal" && !personalPaid && (
            <span className="ic-community-plan-badge">Free: view & react</span>
          )}
        </div>

        {canComment ? (
          <form className="ic-community-comment-form" onSubmit={submitComment}>
            {replyTo && (
              <div className="ic-community-reply-target">
                <span>
                  Replying to <strong>{memberName(replyTo)}</strong>
                </span>

                <button type="button" onClick={() => setReplyTo(null)}>
                  Cancel
                </button>
              </div>
            )}

            <textarea
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder={replyTo ? "Write a reply…" : "Join the discussion…"}
              rows={4}
              disabled={submittingComment}
            />

            {commentError && (
              <div className="ic-community-inline-error" role="status">
                {commentError}
              </div>
            )}

            <div className="ic-community-comment-form-actions">
              <button
                type="submit"
                className="ic-auth-submit"
                disabled={submittingComment || !commentText.trim()}
              >
                <Send size={16} />
                {submittingComment
                  ? "Posting…"
                  : replyTo
                    ? "Post reply"
                    : "Post comment"}
              </button>
            </div>
          </form>
        ) : (
          <div className="ic-community-state">
            Free Personal members can read and react. An active paid Personal
            membership is required to comment or reply.
          </div>
        )}

        {commentTree.length === 0 ? (
          <div className="ic-community-state">
            No comments yet. Start the discussion.
          </div>
        ) : (
          <div className="ic-community-comment-list">
            {commentTree.map((node) => (
              <CommentItem
                key={node.id}
                node={node}
                depth={0}
                canComment={canComment}
                pendingReactionId={pendingCommentReactionId}
                onReply={(comment) => {
                  setReplyTo(comment);
                  setCommentError(null);
                }}
                onReact={reactToComment}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
