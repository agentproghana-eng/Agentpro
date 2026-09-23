export function MarketplacePhotoViewer({
  imageViewer,
  setImageViewer,
}) {
  if (!imageViewer) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Listing photo viewer"
      onClick={() =>
        setImageViewer(null)
      }
      className="
        fixed
        inset-0
        z-[100]
        flex
        items-center
        justify-center
        bg-black/80
        p-4
      "
    >
      <div
        onClick={event =>
          event.stopPropagation()
        }
        className="
          flex
          max-h-[94vh]
          w-full
          max-w-5xl
          flex-col
          overflow-hidden
          rounded-2xl
          bg-white
          shadow-2xl
        "
      >
        <div
          className="
            flex
            flex-wrap
            items-center
            justify-between
            gap-3
            border-b
            border-gray-200
            px-4
            py-3
          "
        >
          <div>
            <p
              className="
                font-semibold
                text-gray-900
              "
            >
              {imageViewer.title}
            </p>

            <p
              className="
                text-xs
                text-gray-500
              "
            >
              Photo
              {' '}
              {imageViewer.index + 1}
              {' '}
              of
              {' '}
              {imageViewer.images.length}
              {imageViewer.index ===
                0
                ? ' · Cover image'
                : ''}
            </p>
          </div>

          <div
            className="
              flex
              items-center
              gap-2
            "
          >
            <a
              href={
                imageViewer.images[
                  imageViewer.index
                ]
              }
              target="_blank"
              rel="noreferrer"
              className="
                rounded-lg
                border
                border-gray-200
                px-3
                py-2
                text-xs
                font-semibold
                text-gray-700
                hover:bg-gray-50
              "
            >
              Open original
            </a>

            <button
              type="button"
              onClick={() =>
                setImageViewer(null)
              }
              className="
                rounded-lg
                bg-gray-100
                px-3
                py-2
                text-xs
                font-semibold
                text-gray-700
                hover:bg-gray-200
              "
            >
              Close
            </button>
          </div>
        </div>

        <div
          className="
            flex
            min-h-0
            flex-1
            items-center
            justify-center
            bg-gray-950
            p-3
          "
        >
          <img
            src={
              imageViewer.images[
                imageViewer.index
              ]
            }
            alt={
              `${imageViewer.title} full-size listing photo ${imageViewer.index + 1}`
            }
            className="
              max-h-[72vh]
              max-w-full
              object-contain
            "
          />
        </div>

        <div
          className="
            flex
            items-center
            justify-between
            gap-3
            border-t
            border-gray-200
            px-4
            py-3
          "
        >
          <button
            type="button"
            disabled={
              imageViewer.index ===
              0
            }
            onClick={() =>
              setImageViewer(
                current => ({
                  ...current,
                  index:
                    current.index -
                    1,
                }),
              )
            }
            className="
              rounded-lg
              border
              border-gray-200
              px-4
              py-2
              text-sm
              font-semibold
              text-gray-700
              hover:bg-gray-50
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
          >
            Previous
          </button>

          <span
            className="
              text-xs
              text-gray-500
            "
          >
            Review all photos before
            approving the listing.
          </span>

          <button
            type="button"
            disabled={
              imageViewer.index ===
              imageViewer.images
                .length -
                1
            }
            onClick={() =>
              setImageViewer(
                current => ({
                  ...current,
                  index:
                    current.index +
                    1,
                }),
              )
            }
            className="
              rounded-lg
              border
              border-gray-200
              px-4
              py-2
              text-sm
              font-semibold
              text-gray-700
              hover:bg-gray-50
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
