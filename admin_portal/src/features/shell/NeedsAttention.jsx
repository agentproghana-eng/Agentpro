import { Link } from 'react-router-dom';
import { canAccessAdminPath } from '../../lib/adminAccess.js';

function items(counts) {
  return [
    {
      key: 'flows',
      path: '/flows',
      count: counts.flows,
      title: (n) => `${n} USSD flow ${n === 1 ? 'change' : 'changes'} to review`,
      hint: 'Something changed in a mobile money flow. Check it still works.',
      action: 'Review flows',
    },
    {
      key: 'registrations',
      path: '/registrations',
      count: counts.registrations,
      title: (n) => `${n} ${n === 1 ? 'business is' : 'businesses are'} waiting for approval`,
      hint: 'New sign-ups cannot start their trial until you approve them.',
      action: 'Open registrations',
    },
    {
      key: 'verify',
      path: '/marketplace',
      count: counts.adsAwaitingVerification,
      title: (n) => `${n} ad ${n === 1 ? 'payment' : 'payments'} to verify`,
      hint: 'Sellers have paid and are waiting for their ad to go live.',
      action: 'Verify payments',
    },
    {
      key: 'review',
      path: '/marketplace',
      count: counts.adsAwaitingReview,
      title: (n) => `${n} ${n === 1 ? 'ad' : 'ads'} to review`,
      hint: 'Approve or reject new listings.',
      action: 'Review ads',
    },
    {
      key: 'support',
      path: '/support',
      count: counts.support,
      title: (n) => `${n} open support ${n === 1 ? 'case' : 'cases'}`,
      hint: 'Customers are waiting for a reply.',
      action: 'Open support',
    },
  ];
}

export default function NeedsAttention({ user, counts }) {
  const visible = items(counts).filter((item) => canAccessAdminPath(user, item.path));
  const loaded = visible.filter((item) => item.count !== undefined);
  const pending = loaded.filter((item) => item.count > 0);

  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="needs-attention-heading" className="mb-8">
      <h3 id="needs-attention-heading" className="mb-3 text-base font-semibold text-gray-900">
        Needs your attention
      </h3>
      {loaded.length === 0 ? (
        <div className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm" role="status">
          Checking what needs you…
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800" role="status">
          You are all caught up. Nothing is waiting for you right now.
        </div>
      ) : (
        <ul className="space-y-2">
          {pending.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{item.title(item.count)}</p>
                <p className="text-sm text-gray-500">{item.hint}</p>
              </div>
              <Link
                to={item.path}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                {item.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
