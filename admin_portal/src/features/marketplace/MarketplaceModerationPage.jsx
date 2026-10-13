import {
  useEffect,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import {
  ErrorState,
  LoadingState,
} from '../../components/PageState.jsx';
import {
  MarketplaceModerationCard,
} from './MarketplaceModerationCard.jsx';
import {
  MarketplacePhotoViewer,
} from './MarketplacePhotoViewer.jsx';

export function MarketplacePage() {
  const [ads, setAds] =
    useState([]);

  const [
    reviewDrafts,
    setReviewDrafts,
  ] = useState({});

  const [
    updatingId,
    setUpdatingId,
  ] = useState(null);

  const [
    imageViewer,
    setImageViewer,
  ] = useState(null);

  const [loading, setLoading] =
    useState(true);

  const [tab, setTab] =
    useState(null);

  const [search, setSearch] =
    useState('');

  const [loadError, setLoadError] =
    useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      await loadAds();
    } catch (error) {
      // Never show "no pending listings" when the list simply failed to load.
      setLoadError(
        error?.response?.data
          ?.message ||
          error?.message ||
          'The listings could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  };

  const loadAds = async () => {
    const response =
      await API.get(
        '/admin/ads/pending',
      );

    const rank = ad => {
      if (
        ad.status ===
          'pending_payment' &&
        ad.momo_reference
      ) {
        return 0;
      }

      if (
        ad.status ===
        'pending_review'
      ) {
        return 1;
      }

      return 2;
    };

    const sorted = [
      ...(response.data.data || []),
    ].sort((left, right) => {
      const rankDifference =
        rank(left) - rank(right);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return (
        new Date(
          left.created_at,
        ).getTime() -
        new Date(
          right.created_at,
        ).getTime()
      );
    });

    setAds(sorted);
  };

  useEffect(() => {
    load();
  }, []);

  const normalizedMoney = value => {
    const parsed = Number(value);

    return (
      Number.isFinite(parsed) &&
      parsed >= 0
    )
      ? parsed
      : 0;
  };

  const initialDraft = ad => ({
    assessedValue:
      normalizedMoney(
        ad.admin_assessed_value ??
          ad.price,
      ).toFixed(2),

    amountDue:
      normalizedMoney(
        ad.amount_due ??
          ad.publishing_fee,
      ).toFixed(2),

    reason:
      ad.pricing_adjustment_reason ||
      '',
  });

  const draftFor = ad =>
    reviewDrafts[ad.id] ||
    initialDraft(ad);

  const updateDraft = (
    ad,
    changes,
  ) => {
    setReviewDrafts(previous => ({
      ...previous,
      [ad.id]: {
        ...(
          previous[ad.id] ||
          initialDraft(ad)
        ),
        ...changes,
      },
    }));
  };

  const updateAssessedValue = (
    ad,
    value,
  ) => {
    const parsed =
      Number(value);

    const feePercent =
      Number(
        ad.fee_percent ??
        0.01,
      );

    const changes = {
      assessedValue: value,
    };

    if (
      value.trim() !== '' &&
      Number.isFinite(parsed) &&
      parsed >= 0 &&
      Number.isFinite(
        feePercent,
      ) &&
      feePercent >= 0
    ) {
      changes.amountDue =
        (
          Math.round(
            parsed *
            feePercent *
            100,
          ) / 100
        ).toFixed(2);
    }

    updateDraft(
      ad,
      changes,
    );
  };

  const moderate = async (
    ad,
    action,
    extra = {},
  ) => {
    setUpdatingId(ad.id);

    try {
      await API.patch(
        `/admin/ads/${ad.id}/moderate`,
        {
          action,
          ...extra,
        },
      );

      toast.success(
        action === 'publish'
          ? 'Payment verified and listing published ✅'
          : action === 'approve_review'
            ? 'Approved — payment request sent'
            : 'Listing rejected',
      );

      setReviewDrafts(
        previous => {
          const next = {
            ...previous,
          };

          delete next[ad.id];

          return next;
        },
      );

      await load();
    } catch (error) {
      toast.error(
        error.response?.data
          ?.message ||
          'Action failed',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const approveForPayment =
    async ad => {
      const draft =
        draftFor(ad);

      const assessedValue =
        Number(
          draft.assessedValue,
        );

      const amountDue =
        Number(
          draft.amountDue,
        );

      if (
        !Number.isFinite(
          assessedValue,
        ) ||
        assessedValue < 0 ||
        !Number.isFinite(
          amountDue,
        ) ||
        amountDue < 0
      ) {
        toast.error(
          'Enter valid assessed value and amount due.',
        );

        return;
      }

      const declared =
        normalizedMoney(
          ad.price,
        );

      const originalFee =
        normalizedMoney(
          ad.publishing_fee,
        );

      const pricingChanged =
        Math.round(
          assessedValue * 100,
        ) !==
          Math.round(
            declared * 100,
          ) ||
        Math.round(
          amountDue * 100,
        ) !==
          Math.round(
            originalFee * 100,
          );

      const reason =
        draft.reason.trim();

      if (
        pricingChanged &&
        !reason
      ) {
        toast.error(
          'Add a reason when the assessed value or amount due differs from the submitted pricing.',
        );

        return;
      }

      await moderate(
        ad,
        'approve_review',
        {
          admin_assessed_value:
            assessedValue.toFixed(
              2,
            ),
          amount_due:
            amountDue.toFixed(2),
          pricing_adjustment_reason:
            reason || null,
        },
      );
    };

  if (loading && ads.length === 0) {
    return (
      <LoadingState label="Loading listings..." />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Listings could not be loaded"
        message={loadError}
        onRetry={load}
      />
    );
  }

  const verifyAds = ads.filter(
    ad =>
      ad.status === 'pending_payment' &&
      Boolean(ad.momo_reference),
  );
  const reviewAds = ads.filter(
    ad => ad.status === 'pending_review',
  );
  const waitingAds = ads.filter(
    ad =>
      ad.status === 'pending_payment' &&
      !ad.momo_reference,
  );

  const tabs = [
    {
      key: 'review',
      label: 'To review',
      items: reviewAds,
      urgent: true,
      note:
        'New ads. Set a price if needed, then approve or reject.',
    },
    {
      key: 'verify',
      label: 'Verify payment',
      items: verifyAds,
      urgent: true,
      note:
        'Sellers have sent their MoMo reference. Check it and verify the payment.',
    },
    {
      key: 'waiting',
      label: 'Waiting for seller',
      items: waitingAds,
      urgent: false,
      note:
        'Approved and priced. Waiting for the seller to pay. Nothing for you to do yet.',
    },
  ];

  const defaultTab =
    (
      tabs.find(
        item =>
          item.urgent &&
          item.items.length > 0,
      ) ||
      tabs.find(
        item => item.items.length > 0,
      ) ||
      tabs[0]
    ).key;

  const activeKey = tab || defaultTab;
  const active =
    tabs.find(
      item => item.key === activeKey,
    ) || tabs[0];

  const term = search
    .trim()
    .toLowerCase();

  const visibleAds = term
    ? active.items.filter(ad =>
        [
          ad.title,
          ad.posted_by_email,
          ad.momo_reference,
        ].some(value =>
          String(value || '')
            .toLowerCase()
            .includes(term),
        ),
      )
    : active.items;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">
        Ads to moderate
      </h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Each tab is one job. Ads waiting for the
        seller to pay need nothing from you.
      </p>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200">
        <div
          role="tablist"
          aria-label="Moderation queues"
          className="flex flex-wrap gap-x-6"
        >
          {tabs.map(item => {
            const selected =
              item.key === activeKey;

            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.key)}
                className={`-mb-px border-b-2 px-1 py-2.5 text-sm transition ${
                  selected
                    ? 'border-primary font-semibold text-primary'
                    : 'border-transparent font-medium text-gray-500 hover:text-gray-800'
                }`}
              >
                {item.label}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    item.urgent &&
                    item.items.length > 0
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {item.items.length}
                </span>
              </button>
            );
          })}
        </div>

        <input
          type="search"
          value={search}
          onChange={event =>
            setSearch(event.target.value)
          }
          aria-label="Search ads"
          placeholder="Search title, seller email…"
          className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-64"
        />
      </div>

      <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
        {active.note}
      </p>

      {visibleAds.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <p className="mb-4 text-4xl">
            ✅
          </p>
          <p>
            {term
              ? 'No ads match your search in this tab.'
              : 'Nothing here right now.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleAds.map(ad => (
            <MarketplaceModerationCard
              key={ad.id}
              ad={ad}
              draftFor={draftFor}
              normalizedMoney={normalizedMoney}
              updateAssessedValue={updateAssessedValue}
              updateDraft={updateDraft}
              approveForPayment={approveForPayment}
              moderate={moderate}
              updatingId={updatingId}
              setImageViewer={setImageViewer}
            />
          ))}
        </div>
      )}

      <MarketplacePhotoViewer
        imageViewer={imageViewer}
        setImageViewer={setImageViewer}
      />
    </div>
  );
}
