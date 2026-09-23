import {
  useEffect,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
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

  const load = async () => {
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

  const pendingReviewCount =
    ads.filter(
      ad =>
        ad.status ===
        'pending_review',
    ).length;

  const awaitingUserPaymentCount =
    ads.filter(
      ad =>
        ad.status ===
          'pending_payment' &&
        !ad.momo_reference,
    ).length;

  const paymentSubmittedCount =
    ads.filter(
      ad =>
        ad.status ===
          'pending_payment' &&
        Boolean(
          ad.momo_reference,
        ),
    ).length;

  return (
    <div>
      <h2
        className="
          text-xl
          font-bold
          text-gray-900
          mb-2
        "
      >
        Business Hub Moderation
        {' '}
        ({ads.length})
      </h2>

      {paymentSubmittedCount >
        0 && (
        <div
          className="
            bg-green-50
            border
            border-green-200
            rounded-lg
            px-4 py-3
            mb-4
            text-sm
            text-green-800
          "
        >
          <strong>
            {
              paymentSubmittedCount
            }
          </strong>
          {' '}
          payment
          {paymentSubmittedCount ===
          1
            ? ''
            : 's'}
          {' '}
          submitted and ready
          for verification.
        </div>
      )}

      <p
        className="
          text-sm
          text-gray-500
          mb-6
        "
      >
        {pendingReviewCount}
        {' '}
        awaiting review ·
        {' '}
        {
          awaitingUserPaymentCount
        }
        {' '}
        waiting for user payment ·
        {' '}
        {paymentSubmittedCount}
        {' '}
        awaiting payment
        verification
      </p>

      {ads.length === 0 ? (
        <div
          className="
            text-center
            py-16
            text-gray-400
          "
        >
          <p className="text-4xl mb-4">
            ✅
          </p>
          <p>
            No pending Business Hub
            listings
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {ads.map(ad => (
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
