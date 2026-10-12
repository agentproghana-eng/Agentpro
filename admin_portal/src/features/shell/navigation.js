// Sidebar structure. Groups keep the 16 pages scannable; `badge`
// names a key from useAttentionCounts().
export const NAV_GROUPS = [
  {
    title: null,
    items: [{ path: '/', icon: '📊', label: 'Dashboard' }],
  },
  {
    title: 'Needs attention',
    items: [
      { path: '/registrations', icon: '🔔', label: 'Registrations', badge: 'registrations' },
      { path: '/marketplace', icon: '🛒', label: 'Ad Moderation', badge: 'ads' },
      { path: '/support', icon: '🛟', label: 'Support', badge: 'support' },
      { path: '/flows', icon: '🔀', label: 'USSD Flows', badge: 'flows' },
    ],
  },
  {
    title: 'People',
    items: [
      { path: '/companies', icon: '🏢', label: 'Companies' },
      { path: '/personal-users', icon: '👤', label: 'Personal Users' },
      { path: '/marketplace-businesses', icon: '✅', label: 'Marketplace Businesses' },
      { path: '/community', icon: '💬', label: 'Community' },
      { path: '/shifts', icon: '⏱️', label: 'Shifts' },
    ],
  },
  {
    title: 'Money',
    items: [
      { path: '/subscriptions', icon: '💳', label: 'Subscriptions' },
      { path: '/commissions', icon: '💰', label: 'Commissions' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { path: '/ussd', icon: '📱', label: 'USSD Templates' },
      { path: '/config', icon: '⚙️', label: 'System Config' },
      { path: '/audit', icon: '📋', label: 'Audit Logs' },
      { path: '/admin-team', icon: '🛡️', label: 'Admin Team' },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export function pageTitleFor(pathname) {
  if (pathname === '/') return 'Dashboard';
  const match = ALL_ITEMS.filter(
    (item) => item.path !== '/' && (pathname === item.path || pathname.startsWith(`${item.path}/`)),
  ).sort((a, b) => b.path.length - a.path.length)[0];
  return match?.label || 'Admin';
}

export function isActivePath(pathname, path) {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}
