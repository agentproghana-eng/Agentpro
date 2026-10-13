import { useQuery } from '@tanstack/react-query';
import API from '../../lib/api.js';
import { canAccessAdminPath } from '../../lib/adminAccess.js';

// Reuses the dashboard's query keys so the sidebar, the dashboard
// and the pages share one cached request each.
function useCount(enabled, queryKey, fetcher, refetchInterval) {
  const { data } = useQuery({
    queryKey,
    enabled,
    retry: false,
    staleTime: 20_000,
    refetchInterval,
    queryFn: fetcher,
  });
  return data;
}

export function useAttentionCounts(user) {
  const canRegs = canAccessAdminPath(user, '/registrations');
  const canAds = canAccessAdminPath(user, '/marketplace');
  const canSupport = canAccessAdminPath(user, '/support');
  const canFlows = canAccessAdminPath(user, '/flows');

  const regs = useCount(
    canRegs,
    ['admin', 'pending-registrations'],
    async () => (await API.get('/admin/pending-registrations')).data.data || [],
    60_000,
  );
  const ads = useCount(
    canAds,
    ['admin', 'ads-pending'],
    async () => (await API.get('/admin/ads/pending')).data.data || [],
    60_000,
  );
  const support = useCount(
    canSupport,
    ['admin', 'support-open-count'],
    async () => {
      const response = await API.get('/admin/support/cases', {
        params: { status: 'open', limit: 50 },
      });
      return response.data.data?.cases || [];
    },
    60_000,
  );
  const flows = useCount(
    canFlows,
    ['admin', 'ussd-flow-health'],
    async () => (await API.get('/admin/ussd-flow-health', { params: { limit: 50 } })).data.data || [],
    15_000,
  );

  const escalated = useCount(
    canSupport,
    ['admin', 'fraud-signals-escalated'],
    async () => {
      const response = await API.get('/admin/fraud-signals', {
        params: { status: 'escalated', limit: 50 },
      });
      return response.data.data?.signals || [];
    },
    60_000,
  );

  const adsAwaitingReview = Array.isArray(ads)
    ? ads.filter((ad) => ad.status === 'pending_review').length
    : undefined;
  const adsAwaitingVerification = Array.isArray(ads)
    ? ads.filter((ad) => ad.status === 'pending_payment' && ad.payment_id).length
    : undefined;

  return {
    registrations: Array.isArray(regs) ? regs.length : undefined,
    ads: Array.isArray(ads) ? (adsAwaitingReview ?? 0) + (adsAwaitingVerification ?? 0) : undefined,
    adsAwaitingReview,
    adsAwaitingVerification,
    support: Array.isArray(support) ? support.length : undefined,
    flows: Array.isArray(flows) ? flows.length : undefined,
    escalated: Array.isArray(escalated) ? escalated.length : undefined,
  };
}
