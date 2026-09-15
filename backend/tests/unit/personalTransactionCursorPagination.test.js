'use strict';

const fs = require('fs');
const path = require('path');

const controllerPath = path.join(
  __dirname,
  '../../src/controllers/personalTransactionController.js'
);

const routePath = path.join(
  __dirname,
  '../../src/routes/personalTransaction.routes.js'
);

const migrationPath = path.join(
  __dirname,
  '../../migrations/135_personal_transaction_cursor_indexes.sql'
);

const controller =
  fs.readFileSync(controllerPath, 'utf8');

const routes =
  fs.readFileSync(routePath, 'utf8');

const migration =
  fs.readFileSync(migrationPath, 'utf8');

describe(
  'personal transaction cursor pagination contract',
  () => {
    test(
      'registers additive Paid-only cursor route before transaction id route',
      () => {
        const normalized =
          routes.replace(/\s+/g, ' ');

        expect(normalized).toContain(
          "router.get( '/history', requirePaidPersonalPlan, personalTransactionController.listTransactions );"
        );

        expect(normalized).toContain(
          "router.get( '/history/cursor', requirePaidPersonalPlan, personalTransactionController.listTransactionsCursor );"
        );

        expect(
          normalized.indexOf(
            "'/history/cursor'"
          )
        ).toBeLessThan(
          normalized.indexOf(
            "'/:transaction_id'"
          )
        );
      },
    );

    test(
      'cursor handler is bounded and does not use OFFSET or COUNT',
      () => {
        const start =
          controller.indexOf(
            'exports.listTransactionsCursor'
          );

        const end =
          controller.indexOf(
            'exports.listTransactions = async',
            start
          );

        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);

        const source =
          controller.slice(start, end);

        expect(source).toContain(
          'parsedLimit + 1'
        );

        expect(source).toContain(
          'has_more: hasMore'
        );

        expect(source).toContain(
          'next_cursor: nextCursor'
        );

        expect(source).not.toContain(
          'OFFSET'
        );

        expect(source).not.toContain(
          'COUNT(*)'
        );
      },
    );

    test(
      'cursor handler preserves all four sort modes with stable id tie break',
      () => {
        const start =
          controller.indexOf(
            'exports.listTransactionsCursor'
          );

        const end =
          controller.indexOf(
            'exports.listTransactions = async',
            start
          );

        const source =
          controller.slice(start, end);

        expect(source).toContain(
          "'created_at DESC, id DESC'"
        );

        expect(source).toContain(
          "'created_at ASC, id DESC'"
        );

        expect(source).toContain(
          "'amount DESC NULLS FIRST, id DESC'"
        );

        expect(source).toContain(
          "'amount ASC NULLS LAST, id DESC'"
        );

        expect(source).toContain(
          'created_at <'
        );

        expect(source).toContain(
          'created_at >'
        );

        expect(source).toContain(
          'amount <'
        );

        expect(source).toContain(
          'amount >'
        );
      },
    );

    test(
      'cursor is bound to sort mode and malformed cursor returns 422 contract',
      () => {
        expect(controller).toContain(
          "decoded.sort_by !== sortBy"
        );

        expect(controller).toContain(
          "decoded.sort_order !== sortOrder"
        );

        expect(controller).toContain(
          "code: 'INVALID_CURSOR'"
        );

        expect(controller).toContain(
          'return res.status(422).json'
        );
      },
    );

    test(
      'migration 135 covers every supported Personal history ordering',
      () => {
        expect(migration).toContain(
          'idx_personal_transactions_user_created_desc_cursor'
        );

        expect(migration).toContain(
          'created_at DESC'
        );

        expect(migration).toContain(
          'idx_personal_transactions_user_created_asc_cursor'
        );

        expect(migration).toContain(
          'created_at ASC'
        );

        expect(migration).toContain(
          'idx_personal_transactions_user_amount_desc_cursor'
        );

        expect(migration).toContain(
          'amount DESC NULLS FIRST'
        );

        expect(migration).toContain(
          'idx_personal_transactions_user_amount_asc_cursor'
        );

        expect(migration).toContain(
          'amount ASC NULLS LAST'
        );
      },
    );
  },
);
