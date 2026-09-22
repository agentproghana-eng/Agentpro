'use strict';

const MARKETPLACE_BUSINESS_CURSOR_KIND =
  'admin_marketplace_businesses';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeMarketplaceBusinessCursor(row) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      kind:
        MARKETPLACE_BUSINESS_CURSOR_KIND,
      featured:
        Boolean(
          row.marketplace_featured,
        ),
      priority:
        Number(
          row.marketplace_featured_priority ||
            0,
        ),
      verified:
        Boolean(
          row.marketplace_verified,
        ),
      name:
        String(
          row.company_name || '',
        ),
      id:
        String(
          row.company_id || '',
        ),
    }),
    'utf8',
  ).toString('base64url');
}

function decodeMarketplaceBusinessCursor(raw) {
  if (
    !raw ||
    typeof raw !== 'string'
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(
        raw,
        'base64url',
      ).toString('utf8'),
    );

    if (
      decoded?.v !== 1 ||
      decoded?.kind !==
        MARKETPLACE_BUSINESS_CURSOR_KIND ||
      typeof decoded?.featured !==
        'boolean' ||
      !Number.isInteger(
        decoded?.priority,
      ) ||
      decoded.priority < 0 ||
      typeof decoded?.verified !==
        'boolean' ||
      typeof decoded?.name !==
        'string' ||
      decoded.name.length < 1 ||
      decoded.name.length > 255 ||
      typeof decoded?.id !==
        'string' ||
      !UUID_RE.test(decoded.id)
    ) {
      return null;
    }

    return {
      featured:
        decoded.featured,
      priority:
        decoded.priority,
      verified:
        decoded.verified,
      name:
        decoded.name,
      id:
        decoded.id,
    };
  } catch (_) {
    return null;
  }
}

module.exports = {
  MARKETPLACE_BUSINESS_CURSOR_KIND,
  encodeMarketplaceBusinessCursor,
  decodeMarketplaceBusinessCursor,
};
