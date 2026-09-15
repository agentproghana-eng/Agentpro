class InvalidFeedCursorError extends Error {
  constructor() {
    super('Invalid cursor');
    this.name = 'InvalidFeedCursorError';
  }
}

function encodeFeedCursor(value) {
  return Buffer.from(
    JSON.stringify(value),
    'utf8'
  ).toString('base64url');
}

function decodeFeedCursor(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  if (typeof raw !== 'string' || raw.length > 2048) {
    throw new InvalidFeedCursorError();
  }

  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const value = JSON.parse(decoded);

    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new InvalidFeedCursorError();
    }

    return value;
  } catch (error) {
    if (error instanceof InvalidFeedCursorError) {
      throw error;
    }

    throw new InvalidFeedCursorError();
  }
}

module.exports = {
  InvalidFeedCursorError,
  encodeFeedCursor,
  decodeFeedCursor,
};
