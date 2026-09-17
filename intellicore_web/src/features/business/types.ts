export type BusinessRecentTransaction = {
  id?: string;
  reference?: string | null;
  transaction_type?: string | null;
  provider?: string | null;
  amount?: number | string | null;
  status?: string | null;
  created_at?: string | null;
  customer_phone?: string | null;
};

export type BusinessFloatBalance = {
  provider?: string | null;
  total?: number | string | null;
};

export type BusinessDashboardData = {
  today_volume?: number | string;
  today_commission?: number | string;
  today_provider_commission?: number | string;
  today_agent_service_fees?: number | string;
  today_gross_earnings?: number | string;
  today_success_rate?: number | string;
  today_transactions?: number | string;

  today?: {
    transaction_count?: number | string;
    total_amount?: number | string;
    net_commission?: number | string;
    provider_commission?: number | string;
    agent_service_fees?: number | string;
    gross_earnings?: number | string;
    success_rate?: number | string;
    success_count?: number | string;
  };

  this_month?: {
    transaction_count?: number | string;
    total_amount?: number | string;
    net_commission?: number | string;
  };

  float_by_provider?: BusinessFloatBalance[];
  recent_transactions?: BusinessRecentTransaction[];
};

export type BusinessDashboardResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: BusinessDashboardData;
};
