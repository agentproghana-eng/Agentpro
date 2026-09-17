"use client";

import {
  LoaderCircle,
  MessageSquarePlus,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useState,
} from "react";

import type { AgentProUser } from "@/features/auth/types";
import type {
  CommunityKind,
  CommunityPost,
  CommunityPostEnvelope,
} from "@/features/community/types";

import styles from "./community-composer.module.css";

const MAX_CONTENT_LENGTH = 10_000;

const AGENT_POST_TYPES = [
  ["general", "General"],
  ["question", "Question"],
  ["network_issue", "Network issue"],
  ["fraud_alert", "Fraud alert"],
  ["business_tip", "Business tip"],
  ["announcement", "Announcement"],
] as const;

type Props = {
  user: Partial<AgentProUser>;
  kind: CommunityKind;
  onCreated: (post: CommunityPost) => void;
};

function hasPaidPersonalPlan(
  user: Partial<AgentProUser>,
) {
  if (user.personal_subscription_plan !== "paid") {
    return false;
  }

  const expiry = user.personal_subscription_expires_at;

  if (!expiry) {
    return true;
  }

  const parsed = new Date(expiry);

  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.getTime() > Date.now()
  );
}

function canUseAgentCommunity(
  user: Partial<AgentProUser>,
) {
  return [
    "business_owner",
    "manager",
    "agent",
  ].includes(user.role ?? "");
}

export function CommunityComposer({
  user,
  kind,
  onCreated,
}: Props) {
  const router = useRouter();

  const [content, setContent] = useState("");
  const [postType, setPostType] = useState("general");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canPost =
    kind === "agent"
      ? canUseAgentCommunity(user)
      : hasPaidPersonalPlan(user);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canPost || submitting) {
      return;
    }

    const normalized = content.trim();

    if (!normalized) {
      setError("Write something before posting.");
      return;
    }

    if (normalized.length > MAX_CONTENT_LENGTH) {
      setError(
        `Keep your post within ${MAX_CONTENT_LENGTH.toLocaleString()} characters.`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/community/${kind}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            content: normalized,
            ...(kind === "agent"
              ? {
                  post_type: postType,
                }
              : {}),
          }),
        },
      );

      const body = (await response
        .json()
        .catch(() => null)) as CommunityPostEnvelope | null;

      if (response.status === 401) {
        router.replace(
          `/login?next=${encodeURIComponent(
            "/hub/community",
          )}`,
        );
        return;
      }

      if (
        !response.ok ||
        body?.success !== true ||
        !body.data?.id
      ) {
        setError(
          body?.message ??
            "Your Community post could not be created.",
        );
        return;
      }

      const created: CommunityPost = {
        ...body.data,
        first_name:
          body.data.first_name ?? user.first_name ?? null,
        last_name:
          body.data.last_name ?? user.last_name ?? null,
        role:
          body.data.role ?? user.role ?? null,
        reaction_counts:
          body.data.reaction_counts ?? {},
        comment_count:
          body.data.comment_count ?? 0,
        my_reaction:
          body.data.my_reaction ?? null,
      };

      onCreated(created);
      setContent("");
      setSuccess(
        body.message ??
          (created.status === "pending_review"
            ? "Your post is under review."
            : "Your post is live."),
      );
    } catch {
      setError(
        "Your Community post could not be created. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const personalLocked =
    kind === "personal" && !canPost;

  return (
    <section
      className={styles.composer}
      aria-labelledby="community-composer-title"
    >
      <div className={styles.heading}>
        <span className={styles.icon}>
          <MessageSquarePlus
            size={20}
            aria-hidden="true"
          />
        </span>

        <div>
          <p className={styles.eyebrow}>
            {kind === "agent"
              ? "Agent Community"
              : "Personal Community"}
          </p>

          <h2 id="community-composer-title">
            Create a post
          </h2>

          <p>
            Share a useful update, question or discussion
            with your AgentPro community.
          </p>
        </div>
      </div>

      {personalLocked ? (
        <div
          className={styles.locked}
          role="status"
        >
          <strong>
            Paid Personal membership is required to post.
          </strong>

          <span>
            Free Personal members can continue to view and
            react to Community posts.
          </span>
        </div>
      ) : (
        <form
          className={styles.form}
          onSubmit={submit}
        >
          <label className={styles.contentField}>
            <span className={styles.srOnly}>
              Community post
            </span>

            <textarea
              value={content}
              maxLength={MAX_CONTENT_LENGTH}
              rows={5}
              disabled={submitting}
              onChange={(event) => {
                setContent(event.target.value);
                setError(null);
                setSuccess(null);
              }}
              placeholder={
                kind === "agent"
                  ? "Share an update, ask a question or help another agent…"
                  : "Share something with the Personal Community…"
              }
            />
          </label>

          <div className={styles.footer}>
            <div className={styles.controls}>
              {kind === "agent" && (
                <label className={styles.typeField}>
                  <span>Post type</span>

                  <select
                    value={postType}
                    disabled={submitting}
                    onChange={(event) =>
                      setPostType(event.target.value)
                    }
                  >
                    {AGENT_POST_TYPES.map(
                      ([value, label]) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              )}

              <span className={styles.counter}>
                {content.length.toLocaleString()}
                /{MAX_CONTENT_LENGTH.toLocaleString()}
              </span>
            </div>

            <button
              type="submit"
              className={styles.submit}
              disabled={
                submitting || !content.trim()
              }
            >
              {submitting ? (
                <LoaderCircle
                  className={styles.spinner}
                  size={18}
                  aria-hidden="true"
                />
              ) : (
                <Send
                  size={17}
                  aria-hidden="true"
                />
              )}

              {submitting
                ? "Posting…"
                : "Post to Community"}
            </button>
          </div>

          {kind === "agent" && (
            <p className={styles.accessNote}>
              Posting remains subject to AgentPro&apos;s
              active business-subscription rules.
            </p>
          )}

          {error && (
            <p
              className={styles.error}
              role="alert"
            >
              {error}
            </p>
          )}

          {success && (
            <p
              className={styles.success}
              role="status"
            >
              {success}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
