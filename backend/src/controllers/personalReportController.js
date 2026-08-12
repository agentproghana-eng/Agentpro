const { once } = require('events');

const {
  query,
  streamQueryBatches,
} = require('../config/database');

const { logger } = require('../utils/logger');

const {
  generatePersonalTransactionReportPDFStream,
} = require('../services/reportService');


// ─── Personal Transaction Report (CSV + PDF) ─────────────────
//
// Paid-Personal-only per spec.
// Always scoped to the authenticated user.
//
// Personal reporting represents app-performed transaction activity,
// rather than Agent/business accounting classification.


function resolvePersonalReportPeriod({
  period,
  fromDate,
  toDate,
}) {
  let resolvedFrom = fromDate;
  let resolvedTo =
    toDate ||
    new Date().toISOString();

  if (
    period &&
    !fromDate
  ) {
    const now = new Date();

    if (period === 'today') {
      const start = new Date(now);
      start.setHours(
        0,
        0,
        0,
        0
      );
      resolvedFrom =
        start.toISOString();
    }

    if (period === 'week') {
      const start = new Date(now);
      start.setDate(
        start.getDate() - 7
      );
      resolvedFrom =
        start.toISOString();
    }

    if (period === 'month') {
      const start = new Date(now);
      start.setDate(1);
      start.setHours(
        0,
        0,
        0,
        0
      );
      resolvedFrom =
        start.toISOString();
    }

    if (period === 'year') {
      const start = new Date(now);
      start.setMonth(
        0,
        1
      );
      start.setHours(
        0,
        0,
        0,
        0
      );
      resolvedFrom =
        start.toISOString();
    }
  }

  return {
    resolvedFrom,
    resolvedTo,
  };
}


function buildPersonalReportQueryParts({
  userId,
  provider,
  transactionType,
  status,
  resolvedFrom,
  resolvedTo,
}) {
  const conditions = [
    'user_id = $1',
  ];

  const params = [
    userId,
  ];

  let idx = 2;

  if (provider) {
    conditions.push(
      `provider = $${idx++}`
    );
    params.push(provider);
  }

  if (transactionType) {
    conditions.push(
      `transaction_type = $${idx++}`
    );
    params.push(transactionType);
  }

  if (status) {
    conditions.push(
      `status = $${idx++}`
    );
    params.push(status);
  }

  if (resolvedFrom) {
    conditions.push(
      `created_at >= $${idx++}`
    );
    params.push(resolvedFrom);
  }

  if (resolvedTo) {
    conditions.push(
      `created_at <= $${idx++}`
    );
    params.push(resolvedTo);
  }

  return {
    whereClause:
      `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}


function personalTransactionRowSql(
  whereClause
) {
  return `SELECT
       id,
       created_at,
       reference,
       network_reference,
       transaction_type,
       provider,
       recipient_phone,
       amount,
       status,
       sim_iccid
     FROM personal_transactions
     ${whereClause}
     ORDER BY created_at DESC, id DESC`;
}


async function streamPersonalTransactionRows({
  whereClause,
  params,
  onRow,
}) {
  if (typeof onRow !== 'function') {
    throw new TypeError(
      'streamPersonalTransactionRows requires an onRow callback'
    );
  }

  await streamQueryBatches(
    personalTransactionRowSql(
      whereClause
    ),
    params,
    {
      batchSize: 500,
      onRows: async (rows) => {
        for (const row of rows) {
          await onRow(row);
        }
      },
    }
  );
}


async function fetchPersonalReportSummary({
  whereClause,
  params,
}) {
  const result = await query(
    `SELECT
       COUNT(*) AS count,
       COUNT(
         CASE
           WHEN status = 'success'
           THEN 1
         END
       ) AS success_count,
       COUNT(
         CASE
           WHEN status = 'failed'
           THEN 1
         END
       ) AS failed_count,
       COUNT(
         CASE
           WHEN status = 'pending_confirmation'
           THEN 1
         END
       ) AS pending_count,
       ROUND(
         100.0 *
         COUNT(
           CASE
             WHEN status = 'success'
             THEN 1
           END
         ) /
         NULLIF(
           COUNT(*),
           0
         ),
         1
       ) AS success_rate
     FROM personal_transactions
     ${whereClause}`,
    params
  );

  return result.rows[0] || {
    count: '0',
    success_count: '0',
    failed_count: '0',
    pending_count: '0',
    success_rate: null,
  };
}


function csvCell(value) {
  return `"${String(
    value ?? ''
  ).replace(
    /"/g,
    '""'
  )}"`;
}


async function writeResponseChunk(
  res,
  chunk
) {
  if (
    res.write(chunk) === false
  ) {
    await once(
      res,
      'drain'
    );
  }
}


function personalCsvRow(row) {
  return [
    new Date(
      row.created_at
    ).toLocaleString(
      'en-GH'
    ),
    row.reference,
    row.network_reference,
    row.transaction_type,
    row.provider,
    row.recipient_phone,
    row.amount,
    row.status,
    row.sim_iccid,
  ]
    .map(csvCell)
    .join(',');
}


async function streamPersonalCsv({
  whereClause,
  params,
  res,
}) {
  const header = [
    'Date',
    'Reference',
    'Network Ref',
    'Type',
    'Provider',
    'Recipient Phone',
    'Amount (GHS)',
    'Status',
    'SIM (ICCID)',
  ]
    .map(csvCell)
    .join(',');

  await writeResponseChunk(
    res,
    `${header}\n`
  );

  let pendingRows = [];

  const flushRows =
    async () => {
      if (
        pendingRows.length === 0
      ) {
        return;
      }

      const chunk =
        pendingRows.join('\n') +
        '\n';

      pendingRows = [];

      await writeResponseChunk(
        res,
        chunk
      );
    };

  await streamPersonalTransactionRows({
    whereClause,
    params,
    onRow: async (row) => {
      pendingRows.push(
        personalCsvRow(row)
      );

      if (
        pendingRows.length >= 500
      ) {
        await flushRows();
      }
    },
  });

  await flushRows();
}


exports.transactionReport =
  async (req, res) => {
    const {
      format = 'pdf',
      from_date,
      to_date,
      provider,
      transaction_type,
      status,
      period,
    } = req.query;

    const userId =
      req.user.id;

    try {
      const {
        resolvedFrom,
        resolvedTo,
      } =
        resolvePersonalReportPeriod({
          period,
          fromDate: from_date,
          toDate: to_date,
        });

      const {
        whereClause,
        params,
      } =
        buildPersonalReportQueryParts({
          userId,
          provider,
          transactionType:
            transaction_type,
          status,
          resolvedFrom,
          resolvedTo,
        });

      const periodLabel =
        period ||
        `${
          resolvedFrom
            ?.slice(
              0,
              10
            ) ||
          'all time'
        } to ${
          resolvedTo
            ?.slice(
              0,
              10
            ) ||
          'now'
        }`;

      const title =
        `My Transaction Report — ${periodLabel}`;

      if (format === 'csv') {
        res.setHeader(
          'Content-Type',
          'text/csv; charset=utf-8'
        );

        res.setHeader(
          'Content-Disposition',
          `attachment; filename="my_transactions_${Date.now()}.csv"`
        );

        await streamPersonalCsv({
          whereClause,
          params,
          res,
        });

        return res.end();
      }

      const summary =
        await fetchPersonalReportSummary({
          whereClause,
          params,
        });

      res.setHeader(
        'Content-Type',
        'application/pdf'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="my_transactions_${Date.now()}.pdf"`
      );

      await generatePersonalTransactionReportPDFStream({
        stream: res,
        summary,
        title,
        writeTransactions:
          async (writeRow) => {
            await streamPersonalTransactionRows({
              whereClause,
              params,
              onRow: writeRow,
            });
          },
      });

      return res.end();

    } catch (error) {
      logger.error(
        'Personal transaction report error:',
        error
      );

      if (res.headersSent) {
        if (
          !res.writableEnded &&
          typeof res.destroy ===
            'function'
        ) {
          res.destroy(error);
        }

        return;
      }

      return res
        .status(500)
        .json({
          success: false,
          message:
            'Failed to generate report',
        });
    }
  };


module.exports._test = {
  resolvePersonalReportPeriod,
  buildPersonalReportQueryParts,
  personalTransactionRowSql,
  streamPersonalTransactionRows,
  fetchPersonalReportSummary,
  personalCsvRow,
};
