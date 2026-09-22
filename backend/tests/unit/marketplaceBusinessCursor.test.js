'use strict';

const {
  encodeMarketplaceBusinessCursor,
  decodeMarketplaceBusinessCursor,
} = require(
  '../../src/utils/marketplaceBusinessCursor'
);

const COMPANY_ID =
  '11111111-1111-4111-8111-111111111111';

describe(
  'Admin Marketplace business cursor',
  () => {
    test(
      'round trips deterministic sort identity',
      () => {
        const encoded =
          encodeMarketplaceBusinessCursor({
            company_id:
              COMPANY_ID,
            company_name:
              'Acme Ventures',
            marketplace_featured:
              true,
            marketplace_featured_priority:
              25,
            marketplace_verified:
              true,
          });

        expect(
          decodeMarketplaceBusinessCursor(
            encoded,
          ),
        ).toEqual({
          featured: true,
          priority: 25,
          verified: true,
          name: 'Acme Ventures',
          id: COMPANY_ID,
        });
      },
    );

    test.each([
      ['malformed', 'not-a-cursor'],
      [
        'wrong kind',
        Buffer.from(
          JSON.stringify({
            v: 1,
            kind: 'users',
            featured: true,
            priority: 1,
            verified: false,
            name: 'A',
            id: COMPANY_ID,
          }),
        ).toString('base64url'),
      ],
      [
        'invalid priority',
        Buffer.from(
          JSON.stringify({
            v: 1,
            kind:
              'admin_marketplace_businesses',
            featured: true,
            priority: -1,
            verified: false,
            name: 'A',
            id: COMPANY_ID,
          }),
        ).toString('base64url'),
      ],
      [
        'invalid uuid',
        Buffer.from(
          JSON.stringify({
            v: 1,
            kind:
              'admin_marketplace_businesses',
            featured: false,
            priority: 0,
            verified: false,
            name: 'A',
            id: 'bad-id',
          }),
        ).toString('base64url'),
      ],
    ])(
      'rejects %s',
      (_label, raw) => {
        expect(
          decodeMarketplaceBusinessCursor(
            raw,
          ),
        ).toBeNull();
      },
    );
  },
);
