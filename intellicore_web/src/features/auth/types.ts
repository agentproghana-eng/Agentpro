export type AgentProUser = {
  id: string;
  role: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  personal_subscription_plan?: string | null;
  personal_subscription_expires_at?: string | null;
  profile_image_url?: string | null;
  must_change_password?: boolean;
  mfa_enabled?: boolean;
};

export type BackendEnvelope = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: unknown;
  [key: string]: unknown;
};

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export type RefreshResult =
  | {
      ok: true;
      accessToken: string;
    }
  | {
      ok: false;
      status: number;
      code?: string;
      message: string;
    };
