export type CommunityKind = "agent" | "personal";

export type CommunityReaction =
  "like" | "love" | "laugh" | "wow" | "sad" | "pray" | "dislike";

export type CommunityPost = {
  id: string;
  author_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  content?: string | null;
  audio_url?: string | null;
  created_at?: string | null;
  status?: string | null;
  post_type?: string | null;
  is_pinned?: boolean;
  is_urgent?: boolean;
  is_saved?: boolean;
  my_reaction?: CommunityReaction | null;
  reaction_counts?: Record<string, number | string> | null;
  comment_count?: number | string | null;
  flagged_reason?: string | null;
};

export type CommunityFeedEnvelope = {
  success?: boolean;
  message?: string;
  code?: string;
  data?: CommunityPost[];
  pagination?: {
    page?: number;
    limit?: number;
    has_more?: boolean;
  };
};

export type CommunityComment = {
  id: string;
  post_id?: string | null;
  author_id?: string | null;
  parent_comment_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  content?: string | null;
  audio_url?: string | null;
  created_at?: string | null;
  my_reaction?: CommunityReaction | null;
  reaction_counts?: Record<string, number | string> | null;
};

export type CommunityPostEnvelope = {
  success?: boolean;
  message?: string;
  code?: string;
  data?: CommunityPost | null;
};

export type CommunityCommentsEnvelope = {
  success?: boolean;
  message?: string;
  code?: string;
  data?: CommunityComment[];
};
