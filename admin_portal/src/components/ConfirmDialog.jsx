import { useEffect, useState } from 'react';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Enter a reason...',
  loading = false,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const disabled =
    loading || (requireReason && reason.trim().length === 0);

  const confirmClasses =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
      : 'bg-primary hover:bg-primary-dark focus:ring-primary';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h3
          id="confirm-dialog-title"
          className="text-lg font-bold text-gray-900"
        >
          {title}
        </h3>

        <p className="mt-2 text-sm leading-6 text-gray-600">
          {message}
        </p>

        {requireReason && (
          <div className="mt-5">
            <label
              htmlFor="confirmation-reason"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {reasonLabel}
            </label>

            <textarea
              id="confirmation-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              autoFocus
              disabled={loading}
              placeholder={reasonPlaceholder}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={disabled}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${confirmClasses}`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
