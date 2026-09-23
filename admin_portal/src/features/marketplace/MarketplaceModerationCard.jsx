export function MarketplaceModerationCard({
  ad,
  draftFor,
  normalizedMoney,
  updateAssessedValue,
  updateDraft,
  approveForPayment,
  moderate,
  updatingId,
  setImageViewer,
}) {
  const draft =
    draftFor(ad);

  const hasPayment =
    Boolean(
      ad.momo_reference,
    );

  const images =
    Array.isArray(
      ad.image_urls,
    )
      ? ad.image_urls.filter(
          image =>
            typeof image ===
              'string' &&
            image.trim(),
        )
      : [];

  return (
    <div
      key={ad.id}
      className="
        bg-white
        rounded-xl
        shadow-sm
        p-6
      "
    >
      <div
        className="
          flex
          flex-wrap
          justify-between
          gap-3
        "
      >
        <div>
          <h3 className="font-bold">
            {ad.title}
          </h3>

          <p className="text-sm text-gray-500">
            {
              ad.posted_by_email
            }
          </p>

          <span
            className="
              text-xs
              bg-yellow-100
              text-yellow-700
              px-2
              py-0.5
              rounded-full
            "
          >
            {ad.status}
          </span>
        </div>

        <div className="text-right">
          <p className="text-xs text-gray-500">
            Declared price
          </p>

          <p className="font-bold text-green-600">
            GH₵
            {' '}
            {
              normalizedMoney(
                ad.price,
              ).toFixed(2)
            }
          </p>

          <p className="mt-1 text-xs text-gray-500">
            Original system fee:
            {' '}
            GH₵
            {' '}
            {
              normalizedMoney(
                ad.publishing_fee,
              ).toFixed(2)
            }
          </p>
        </div>
      </div>

      <p
        className="
          text-sm
          text-gray-600
          mt-3
          line-clamp-2
        "
      >
        {ad.description}
      </p>

      <section
        className="
          mt-5
          rounded-xl
          border
          border-gray-200
          bg-gray-50
          p-4
        "
      >
        <div
          className="
            flex
            flex-wrap
            items-center
            justify-between
            gap-2
          "
        >
          <div>
            <h4
              className="
                font-semibold
                text-gray-900
              "
            >
              Listing photos
              {' '}
              ({images.length})
            </h4>

            <p
              className="
                mt-1
                text-xs
                text-gray-500
              "
            >
              Review every image
              before approving the
              listing. Photo 1 is
              the cover image shown
              first to buyers.
            </p>
          </div>
        </div>

        {images.length === 0 ? (
          <div
            className="
              mt-4
              rounded-lg
              border
              border-amber-200
              bg-amber-50
              p-3
              text-sm
              text-amber-800
            "
          >
            No listing photos are
            attached. This may be a
            legacy listing created
            before photos became
            mandatory.
          </div>
        ) : (
          <div
            className="
              mt-4
              grid
              grid-cols-2
              gap-3
              sm:grid-cols-3
              lg:grid-cols-4
            "
          >
            {images.map(
              (
                image,
                imageIndex,
              ) => (
                <button
                  key={
                    `${ad.id}-${imageIndex}`
                  }
                  type="button"
                  onClick={() =>
                    setImageViewer({
                      images,
                      index:
                        imageIndex,
                      title:
                        ad.title,
                    })
                  }
                  className="
                    overflow-hidden
                    rounded-xl
                    border
                    border-gray-200
                    bg-white
                    text-left
                    shadow-sm
                    transition
                    hover:border-primary
                    hover:shadow-md
                    focus:outline-none
                    focus:ring-2
                    focus:ring-primary
                  "
                >
                  <div
                    className="
                      relative
                      aspect-[4/3]
                      overflow-hidden
                      bg-gray-100
                    "
                  >
                    <img
                      src={image}
                      alt={
                        `${ad.title} photo ${imageIndex + 1}`
                      }
                      loading="lazy"
                      className="
                        h-full
                        w-full
                        object-cover
                      "
                    />

                    {imageIndex ===
                      0 && (
                      <span
                        className="
                          absolute
                          left-2
                          top-2
                          rounded-full
                          bg-primary
                          px-2
                          py-1
                          text-[10px]
                          font-semibold
                          text-white
                          shadow
                        "
                      >
                        Cover
                      </span>
                    )}
                  </div>

                  <div
                    className="
                      px-3
                      py-2
                    "
                  >
                    <p
                      className="
                        text-xs
                        font-semibold
                        text-gray-800
                      "
                    >
                      {imageIndex ===
                      0
                        ? 'Cover image'
                        : `Photo ${imageIndex + 1}`}
                    </p>

                    <p
                      className="
                        mt-0.5
                        text-[11px]
                        text-gray-500
                      "
                    >
                      Click to inspect
                    </p>
                  </div>
                </button>
              ),
            )}
          </div>
        )}
      </section>

      {ad.status ===
        'pending_review' && (
        <div
          className="
            mt-5
            rounded-xl
            border
            border-blue-100
            bg-blue-50/50
            p-4
          "
        >
          <h4
            className="
              font-semibold
              text-gray-900
            "
          >
            Pricing review
          </h4>

          <p
            className="
              mt-1
              text-xs
              text-gray-600
            "
          >
            Verify the listing
            value before requesting
            payment. Changing the
            assessed value
            automatically suggests
            a fee using the stored
            posting rate; the final
            amount due remains
            editable.
          </p>

          <div
            className="
              mt-4
              grid
              gap-3
              md:grid-cols-2
            "
          >
            <label
              className="
                text-sm
                text-gray-700
              "
            >
              Admin assessed value
              (GH₵)

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  draft.assessedValue
                }
                onChange={event =>
                  updateAssessedValue(
                    ad,
                    event.target
                      .value,
                  )
                }
                className="
                  mt-1
                  w-full
                  rounded-lg
                  border
                  border-gray-200
                  px-3
                  py-2
                "
              />
            </label>

            <label
              className="
                text-sm
                text-gray-700
              "
            >
              Final amount to pay
              (GH₵)

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  draft.amountDue
                }
                onChange={event =>
                  updateDraft(
                    ad,
                    {
                      amountDue:
                        event
                          .target
                          .value,
                    },
                  )
                }
                className="
                  mt-1
                  w-full
                  rounded-lg
                  border
                  border-gray-200
                  px-3
                  py-2
                "
              />
            </label>
          </div>

          <label
            className="
              mt-3
              block
              text-sm
              text-gray-700
            "
          >
            Adjustment reason

            <textarea
              rows="2"
              maxLength="2000"
              value={
                draft.reason
              }
              onChange={event =>
                updateDraft(
                  ad,
                  {
                    reason:
                      event
                        .target
                        .value,
                  },
                )
              }
              placeholder="Required when assessed value or final amount differs from the submitted pricing."
              className="
                mt-1
                w-full
                rounded-lg
                border
                border-gray-200
                px-3
                py-2
              "
            />
          </label>
        </div>
      )}

      {ad.status ===
        'pending_payment' && (
        <div
          className="
            mt-4
            rounded-lg
            border
            border-amber-200
            bg-amber-50
            p-3
            text-sm
          "
        >
          <div>
            <span className="text-gray-600">
              Approved amount:
            </span>
            {' '}
            <strong>
              GH₵
              {' '}
              {
                normalizedMoney(
                  ad.amount_due,
                ).toFixed(2)
              }
            </strong>
          </div>

          {ad.admin_assessed_value !==
            null &&
            ad.admin_assessed_value !==
              undefined && (
            <div className="mt-1">
              <span className="text-gray-600">
                Assessed value:
              </span>
              {' '}
              GH₵
              {' '}
              {
                normalizedMoney(
                  ad.admin_assessed_value,
                ).toFixed(2)
              }
            </div>
          )}

          {ad.pricing_adjustment_reason && (
            <div className="mt-1">
              <span className="text-gray-600">
                Review note:
              </span>
              {' '}
              {
                ad.pricing_adjustment_reason
              }
            </div>
          )}
        </div>
      )}

      {hasPayment && (
        <div
          className="
            mt-3
            bg-blue-50
            p-3
            rounded-lg
            text-sm
          "
        >
          <div>
            <span className="text-gray-500">
              Transaction ID:
            </span>
            {' '}
            <span className="font-mono font-semibold">
              {
                ad.momo_reference
              }
            </span>
          </div>

          <div className="mt-1">
            <span className="text-gray-500">
              Submitted amount:
            </span>
            {' '}
            GH₵
            {' '}
            {
              normalizedMoney(
                ad.payment_amount,
              ).toFixed(2)
            }
          </div>

          {ad.payment_submitted_at && (
            <div className="mt-1 text-xs text-gray-500">
              Submitted:
              {' '}
              {
                new Date(
                  ad.payment_submitted_at,
                ).toLocaleString()
              }
            </div>
          )}
        </div>
      )}

      {ad.status ===
        'pending_payment' &&
        !hasPayment && (
        <div
          className="
            mt-3
            rounded-lg
            border
            border-amber-200
            bg-amber-50
            p-3
            text-sm
            text-amber-800
          "
        >
          Waiting for user payment.
          AgentPro has issued the
          approved amount and payment
          request.
        </div>
      )}

      <div
        className="
          flex
          flex-wrap
          gap-2
          mt-4
        "
      >
        {ad.status ===
          'pending_review' && (
          <>
            <button
              type="button"
              disabled={
                updatingId ===
                ad.id
              }
              onClick={() =>
                approveForPayment(
                  ad,
                )
              }
              className="
                flex-1
                bg-blue-600
                text-white
                py-2
                rounded-lg
                text-sm
                font-semibold
                hover:bg-blue-700
                disabled:opacity-50
              "
            >
              Approve & Request
              Payment
            </button>

            <button
              type="button"
              disabled={
                updatingId ===
                ad.id
              }
              onClick={() =>
                moderate(
                  ad,
                  'reject',
                  {
                    rejection_reason:
                      'Rejected by administrator',
                  },
                )
              }
              className="
                flex-1
                bg-red-50
                text-red-600
                py-2
                rounded-lg
                text-sm
                border
                border-red-200
                hover:bg-red-100
                disabled:opacity-50
              "
            >
              Reject
            </button>
          </>
        )}

        {ad.status ===
          'pending_payment' &&
          hasPayment && (
          <button
            type="button"
            disabled={
              updatingId ===
              ad.id
            }
            onClick={() =>
              moderate(
                ad,
                'publish',
              )
            }
            className="
              flex-1
              bg-green-600
              text-white
              py-2
              rounded-lg
              text-sm
              font-semibold
              hover:bg-green-700
              disabled:opacity-50
            "
          >
            ✅ Verify Payment
            & Publish
          </button>
        )}
      </div>
    </div>
  );
}
