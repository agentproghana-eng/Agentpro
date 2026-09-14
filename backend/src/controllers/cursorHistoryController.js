const { query } = require("../config/database");
const { logger } = require("../utils/logger");

const DEFAULT_TRANSACTION_LIMIT = 20;
const DEFAULT_NOTIFICATION_LIMIT = 30;
const MAX_LIMIT = 100;

function parseLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function encodeCursor(row) {
  if (!row?.created_at || !row?.id) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      created_at: row.created_at,
      id: row.id,
    }),
    "utf8",
  ).toString("base64url");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function decodeCursor(value) {
  if (!value) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(String(value), "base64url").toString("utf8"),
    );

    if (
      !decoded ||
      !decoded.created_at ||
      Number.isNaN(Date.parse(decoded.created_at)) ||
      !isUuid(decoded.id)
    ) {
      return null;
    }

    return {
      createdAt: decoded.created_at,
      id: decoded.id,
    };
  } catch (_) {
    return null;
  }
}

function sendInvalidCursor(res) {
  return res.status(422).json({
    success: false,
    code: "INVALID_CURSOR",
    message: "The pagination cursor is invalid or expired.",
  });
}

exports.listTransactions = async (req, res) => {
  const {
    cursor,
    limit,
    provider,
    transaction_type,
    status,
    branch_id,
    agent_id,
    from_date,
    to_date,
    customer_phone,
    search,
    sim_iccid,
  } = req.query;

  const parsedLimit = parseLimit(limit, DEFAULT_TRANSACTION_LIMIT);
  const decodedCursor = cursor ? decodeCursor(cursor) : null;

  if (cursor && !decodedCursor) {
    return sendInvalidCursor(res);
  }

  try {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (req.user.role === "agent") {
      conditions.push(`t.agent_id = $${paramIdx++}`);
      params.push(req.user.id);
    } else if (req.user.role === "manager") {
      conditions.push(
        `t.branch_id IN (
          SELECT branch_id
          FROM branch_managers
          WHERE manager_id = $${paramIdx++}
        )`,
      );
      params.push(req.user.id);
    } else if (
      req.user.role === "business_owner" ||
      req.user.role === "auditor"
    ) {
      conditions.push(`t.company_id = $${paramIdx++}`);
      params.push(req.user.company_id);
    }

    if (provider) {
      conditions.push(`t.provider = $${paramIdx++}`);
      params.push(provider);
    }

    if (transaction_type) {
      conditions.push(`t.transaction_type = $${paramIdx++}`);
      params.push(transaction_type);
    }

    if (status) {
      conditions.push(`t.status = $${paramIdx++}`);
      params.push(status);
    }

    if (branch_id) {
      conditions.push(`t.branch_id = $${paramIdx++}`);
      params.push(branch_id);
    }

    if (agent_id && req.user.role !== "agent") {
      conditions.push(`t.agent_id = $${paramIdx++}`);
      params.push(agent_id);
    }

    if (customer_phone) {
      conditions.push(`t.customer_phone = $${paramIdx++}`);
      params.push(customer_phone);
    }

    if (sim_iccid) {
      conditions.push(`t.sim_iccid = $${paramIdx++}`);
      params.push(sim_iccid);
    }

    if (from_date) {
      conditions.push(`t.created_at >= $${paramIdx++}`);
      params.push(from_date);
    }

    if (to_date) {
      conditions.push(`t.created_at <= $${paramIdx++}`);
      params.push(to_date);
    }

    if (search) {
      conditions.push(
        `(t.reference ILIKE $${paramIdx}
          OR t.customer_phone ILIKE $${paramIdx}
          OR t.customer_name ILIKE $${paramIdx})`,
      );
      params.push(`%${search}%`);
      paramIdx += 1;
    }

    if (decodedCursor) {
      conditions.push(
        `(t.created_at, t.id) <
          ($${paramIdx++}::timestamptz, $${paramIdx++}::uuid)`,
      );
      params.push(decodedCursor.createdAt, decodedCursor.id);
    }

    const where =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const fetchLimit = parsedLimit + 1;
    const limitParam = paramIdx;
    params.push(fetchLimit);

    const result = await query(
      `SELECT
         t.id,
         t.reference,
         t.provider,
         t.transaction_type,
         t.status,
         t.amount,
         t.fee,
         t.customer_phone,
         t.customer_name,
         t.sim_iccid,
         t.network_reference,
         t.receipt_url,
         t.created_at,
         t.completed_at,
         u.first_name || ' ' || u.last_name AS agent_name,
         b.name AS branch_name,
         cm.net_commission
       FROM transactions t
       LEFT JOIN users u
         ON u.id = t.agent_id
       LEFT JOIN branches b
         ON b.id = t.branch_id
       LEFT JOIN commissions cm
         ON cm.transaction_id = t.id
       ${where}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $${limitParam}`,
      params,
    );

    const hasMore = result.rows.length > parsedLimit;
    const rows = hasMore
      ? result.rows.slice(0, parsedLimit)
      : result.rows;

    const nextCursor =
      hasMore && rows.length > 0
        ? encodeCursor(rows[rows.length - 1])
        : null;

    return res.json({
      success: true,
      data: rows,
      meta: {
        limit: parsedLimit,
        has_more: hasMore,
        next_cursor: nextCursor,
      },
    });
  } catch (error) {
    logger.error("Cursor transaction history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
    });
  }
};

exports.listNotifications = async (req, res) => {
  const {
    cursor,
    limit,
    unread_only,
  } = req.query;

  const parsedLimit = parseLimit(limit, DEFAULT_NOTIFICATION_LIMIT);
  const decodedCursor = cursor ? decodeCursor(cursor) : null;

  if (cursor && !decodedCursor) {
    return sendInvalidCursor(res);
  }

  try {
    const conditions = ["user_id = $1"];
    const params = [req.user.id];
    let paramIdx = 2;

    if (unread_only === "true") {
      conditions.push("is_read = FALSE");
    }

    if (decodedCursor) {
      conditions.push(
        `(created_at, id) <
          ($${paramIdx++}::timestamptz, $${paramIdx++}::uuid)`,
      );
      params.push(decodedCursor.createdAt, decodedCursor.id);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const fetchLimit = parsedLimit + 1;
    const limitParam = paramIdx;

    const [result, unreadCount] = await Promise.all([
      query(
        `SELECT *
         FROM notifications
         ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT $${limitParam}`,
        [...params, fetchLimit],
      ),
      query(
        `SELECT COUNT(*)
         FROM notifications
         WHERE user_id = $1
           AND is_read = FALSE`,
        [req.user.id],
      ),
    ]);

    const hasMore = result.rows.length > parsedLimit;
    const rows = hasMore
      ? result.rows.slice(0, parsedLimit)
      : result.rows;

    const nextCursor =
      hasMore && rows.length > 0
        ? encodeCursor(rows[rows.length - 1])
        : null;

    return res.json({
      success: true,
      data: rows,
      meta: {
        limit: parsedLimit,
        has_more: hasMore,
        next_cursor: nextCursor,
        unread: Number.parseInt(
          unreadCount.rows[0]?.count || "0",
          10,
        ),
      },
    });
  } catch (error) {
    logger.error("Cursor notification history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

exports._cursorInternals = {
  encodeCursor,
  decodeCursor,
  parseLimit,
};
