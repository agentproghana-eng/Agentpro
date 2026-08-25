function validDate(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function activeBaseExpiry({ active, expiresAt }, now) {
  if (!active) {
    return null;
  }

  const expiry = validDate(expiresAt);

  if (!expiry || expiry <= now) {
    return null;
  }

  return expiry;
}

function sameTimestamp(left, right) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.getTime() === right.getTime();
}

function paymentBaseMatches(payment, currentBase, now = new Date()) {
  if (!payment.entitlement_base_captured) {
    // Legacy manual rows predate snapshot protection. Paystack must
    // always carry an explicit snapshot marker.
    return payment.payment_provider !== "paystack";
  }

  const captured = validDate(payment.entitlement_base_expires_at);

  if (sameTimestamp(captured, currentBase)) {
    return true;
  }

  // A payment may be started while the old entitlement is still
  // active and complete shortly after that entitlement naturally
  // expires. If there is still no newer active entitlement, this is
  // the same payment cycle and remains valid.
  if (captured && captured <= now && currentBase === null) {
    return true;
  }

  return false;
}

function addCalendarMonths(value, months) {
  const result = new Date(value.getTime());

  result.setMonth(result.getMonth() + months);

  return result;
}

async function activateBusinessSubscription({
  client,
  payment,
  verifiedBy = null,
  providerStatus = null,
  now = new Date(),
}) {
  if (payment.status === "verified" || payment.fulfilled_at) {
    return {
      outcome: "already_fulfilled",
      expiresAt: null,
    };
  }

  const subscriptionResult = await client.query(
    `SELECT *
       FROM subscriptions
       WHERE id = $1
       FOR UPDATE`,
    [payment.subscription_id],
  );

  if (subscriptionResult.rows.length === 0) {
    throw new Error("Subscription not found");
  }

  const subscription = subscriptionResult.rows[0];

  const currentBase = activeBaseExpiry(
    {
      active: subscription.status === "active",
      expiresAt: subscription.expires_at,
    },
    now,
  );

  if (!paymentBaseMatches(payment, currentBase)) {
    return {
      outcome: "superseded",
      expiresAt: currentBase,
    };
  }

  const startFrom = currentBase || new Date(now.getTime());

  const periodMonths =
    Number.isInteger(Number(payment.period_months)) &&
    Number(payment.period_months) > 0
      ? Number(payment.period_months)
      : 1;

  const expiresAt = addCalendarMonths(startFrom, periodMonths);

  const graceEnds = new Date(expiresAt.getTime());

  graceEnds.setDate(graceEnds.getDate() + 7);

  await client.query(
    `UPDATE subscriptions
     SET plan = 'business',
         status = 'active',
         started_at =
           COALESCE(started_at, $1),
         expires_at = $2,
         grace_period_ends_at = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [startFrom, expiresAt, graceEnds, payment.subscription_id],
  );

  await client.query(
    `UPDATE subscription_payments
     SET status = 'verified',
         verified_at = NOW(),
         verified_by = $1,
         fulfilled_at = NOW(),
         provider_status =
           COALESCE(
             $2,
             provider_status
           )
     WHERE id = $3`,
    [verifiedBy, providerStatus, payment.id],
  );

  await client.query(
    `UPDATE companies
     SET status = 'active',
         approved_at =
           COALESCE(
             approved_at,
             NOW()
           ),
         approved_by =
           COALESCE(
             approved_by,
             $1
           )
     WHERE id = $2
       AND status = 'pending'`,
    [verifiedBy, payment.company_id],
  );

  await client.query(
    `UPDATE users
     SET status = 'active'
     WHERE company_id = $1
       AND status = 'pending'`,
    [payment.company_id],
  );

  return {
    outcome: "activated",
    expiresAt,
    graceEnds,
  };
}

async function activatePersonalSubscription({
  client,
  payment,
  verifiedBy = null,
  providerStatus = null,
  now = new Date(),
}) {
  if (payment.status === "verified" || payment.fulfilled_at) {
    return {
      outcome: "already_fulfilled",
      expiresAt: null,
    };
  }

  const subscriptionResult = await client.query(
    `SELECT *
       FROM personal_subscriptions
       WHERE user_id = $1
       FOR UPDATE`,
    [payment.user_id],
  );

  if (subscriptionResult.rows.length === 0) {
    throw new Error("Personal subscription not found");
  }

  const subscription = subscriptionResult.rows[0];

  const currentBase = activeBaseExpiry(
    {
      active: subscription.plan === "paid",
      expiresAt: subscription.expires_at,
    },
    now,
  );

  if (!paymentBaseMatches(payment, currentBase)) {
    return {
      outcome: "superseded",
      expiresAt: currentBase,
    };
  }

  const startFrom = currentBase || new Date(now.getTime());

  const expiresAt = addCalendarMonths(startFrom, 1);

  await client.query(
    `UPDATE personal_subscriptions
     SET plan = 'paid',
         expires_at = $1,
         updated_at = NOW()
     WHERE user_id = $2`,
    [expiresAt, payment.user_id],
  );

  await client.query(
    `UPDATE personal_subscription_payments
     SET status = 'verified',
         verified_at = NOW(),
         verified_by = $1,
         fulfilled_at = NOW(),
         provider_status =
           COALESCE(
             $2,
             provider_status
           )
     WHERE id = $3`,
    [verifiedBy, providerStatus, payment.id],
  );

  return {
    outcome: "activated",
    expiresAt,
  };
}

module.exports = {
  activeBaseExpiry,
  paymentBaseMatches,
  activateBusinessSubscription,
  activatePersonalSubscription,
};
