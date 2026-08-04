export function LoadingState({
  label = 'Loading...',
}) {
  return (
    <div
      className="flex min-h-64 items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div
          className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full
                     border-4 border-gray-200 border-t-primary"
          aria-hidden="true"
        />
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'The requested information could not be loaded.',
  onRetry,
}) {
  return (
    <div
      className="rounded-xl border border-red-100 bg-white p-8 text-center shadow-sm"
      role="alert"
    >
      <div className="mb-3 text-4xl" aria-hidden="true">
        ⚠️
      </div>

      <h3 className="font-semibold text-gray-900">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
        {message}
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm
                     font-semibold text-white transition
                     hover:bg-primary-dark focus:outline-none
                     focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon = '📭',
  title = 'Nothing here yet',
  message,
  actionLabel,
  onAction,
}) {
  return (
    <div className="rounded-xl bg-white px-6 py-16 text-center shadow-sm">
      <div className="mb-4 text-5xl" aria-hidden="true">
        {icon}
      </div>

      <h3 className="font-semibold text-gray-900">
        {title}
      </h3>

      {message && (
        <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
          {message}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm
                     font-semibold text-white transition
                     hover:bg-primary-dark"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
