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


const PERSONAL_REPORT_PERIODS =
  new Set([
    'today',
    'week',
    'month',
    'year',
    'custom',
  ]);


const PERSONAL_REPORT_FORMATS =
  new Set([
    'pdf',
    'csv',
  ]);


const ISO_DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;


class PersonalReportValidationError
  extends Error {
  constructor(message) {
    super(message);
    this.name =
      'PersonalReportValidationError';
    this.statusCode = 400;
  }
}


function parsePersonalReportIsoDate(
  value,
  fieldName
) {
  if (
    typeof value !== 'string' ||
    !ISO_DATE_TIME_RE.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new PersonalReportValidationError(
      `${fieldName} must be a valid ISO 8601 date-time with timezone`
    );
  }

  return new Date(value);
}


function validatePersonalReportRequest({
  format,
  period,
  fromDate,
  toDate,
}) {
  if (
    !PERSONAL_REPORT_FORMATS.has(
      format
    )
  ) {
    throw new PersonalReportValidationError(
      'format must be either pdf or csv'
    );
  }

  if (
    period &&
    !PERSONAL_REPORT_PERIODS.has(
      period
    )
  ) {
    throw new PersonalReportValidationError(
      'period must be one of today, week, month, year, or custom'
    );
  }

  const hasFrom =
    fromDate !== undefined &&
    fromDate !== null &&
    fromDate !== '';

  const hasTo =
    toDate !== undefined &&
    toDate !== null &&
    toDate !== '';

  if (
    period === 'custom' &&
    (!hasFrom || !hasTo)
  ) {
    throw new PersonalReportValidationError(
      'custom period requires both from_date and to_date'
    );
  }

  if (
    hasFrom !== hasTo
  ) {
    throw new PersonalReportValidationError(
      'from_date and to_date must be provided together'
    );
  }

  if (
    period &&
    period !== 'custom' &&
    (hasFrom || hasTo)
  ) {
    throw new PersonalReportValidationError(
      'from_date and to_date cannot be combined with a predefined period'
    );
  }

  let parsedFrom;
  let parsedTo;

  if (hasFrom) {
    parsedFrom =
      parsePersonalReportIsoDate(
        fromDate,
        'from_date'
      );

    parsedTo =
      parsePersonalReportIsoDate(
        toDate,
        'to_date'
      );

    if (
      parsedFrom.getTime() >
      parsedTo.getTime()
    ) {
      throw new PersonalReportValidationError(
        'from_date must be before or equal to to_date'
      );
    }
  }

  return {
    format,
    period,
    fromDate:
      hasFrom
        ? parsedFrom.toISOString()
        : undefined,
    toDate:
      hasTo
        ? parsedTo.toISOString()
        : undefined,
  };
}


function resolvePersonalReportPeriod({
  period,
  fromDate,
  toDate,
  now = new Date(),
}) {
  let resolvedFrom = fromDate;
  let resolvedTo =
    toDate ||
    now.toISOString();

  if (
    period &&
    period !== 'custom' &&
    !fromDate
  ) {
    let start;

    if (period === 'today') {
      start = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate()
        )
      );
    }

    if (period === 'week') {
      const day =
        now.getUTCDay();

      const daysSinceMonday =
        (day + 6) % 7;

      start = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate()
        )
      );

      start.setUTCDate(
        start.getUTCDate() -
        daysSinceMonday
      );
    }

    if (period === 'month') {
      start = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          1
        )
      );
    }

    if (period === 'year') {
      start = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          0,
          1
        )
      );
    }

    resolvedFrom =
      start?.toISOString();
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
      const validated =
        validatePersonalReportRequest({
          format,
          period,
          fromDate: from_date,
          toDate: to_date,
        });

      const {
        resolvedFrom,
        resolvedTo,
      } =
        resolvePersonalReportPeriod({
          period:
            validated.period,
          fromDate:
            validated.fromDate,
          toDate:
            validated.toDate,
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

      if (validated.format === 'csv') {
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
      if (
        error instanceof
          PersonalReportValidationError
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              error.message,
          });
      }

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
  validatePersonalReportRequest,
  parsePersonalReportIsoDate,
  resolvePersonalReportPeriod,
  buildPersonalReportQueryParts,
  personalTransactionRowSql,
  streamPersonalTransactionRows,
  fetchPersonalReportSummary,
  personalCsvRow,
};
