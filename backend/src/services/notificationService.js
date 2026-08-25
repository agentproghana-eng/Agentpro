const { getMessaging } = require('../config/firebase');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

/**
 * Send a push notification to a single user
 */
async function sendToUser(
  userId,
  { title, body, data = {}, type },
  {
    throwOnError = false,
    deliveryKey = null,
  } = {}
) {
  try {
    if (deliveryKey) {
      const existingDelivery = await query(
        `SELECT fcm_message_id
         FROM notifications
         WHERE delivery_key = $1
           AND user_id = $2
         LIMIT 1`,
        [deliveryKey, userId]
      );

      if (existingDelivery.rows.length > 0) {
        return existingDelivery.rows[0].fcm_message_id || deliveryKey;
      }
    }

    const result = await query(
      'SELECT fcm_token FROM users WHERE id = $1 AND fcm_token IS NOT NULL',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].fcm_token) return;

    const fcmToken = result.rows[0].fcm_token;
    const messageData = {
      ...data,
      type: type || 'general',
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      ...(deliveryKey
        ? { delivery_key: deliveryKey }
        : {}),
    };

    const message = {
      token: fcmToken,
      notification: { title, body },
      data: messageData,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          ...(deliveryKey
            ? { tag: deliveryKey }
            : {}),
        },
      },
    };

    const response = await getMessaging().send(message);

    // Persist the logical delivery identity after FCM accepts the send.
    // A retry that happens after this point can be suppressed before
    // another FCM send.
    await query(
      `INSERT INTO notifications (
         user_id,
         type,
         title,
         body,
         data,
         sent_at,
         fcm_message_id,
         delivery_key
       )
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
       ON CONFLICT (delivery_key)
         WHERE delivery_key IS NOT NULL
       DO NOTHING`,
      [
        userId,
        type || 'system_update',
        title,
        body,
        JSON.stringify(data),
        response,
        deliveryKey,
      ]
    );

    return response;
  } catch (error) {
    if (error.code === 'messaging/registration-token-not-registered') {
      // Clear invalid token
      await query('UPDATE users SET fcm_token = NULL WHERE id = $1', [userId]);
    }
    logger.error('FCM send error', { error });

    if (throwOnError) {
      throw error;
    }

    return undefined;
  }
}

/**
 * Send to multiple users
 */
async function sendToMultiple(userIds, notification) {
  return Promise.allSettled(userIds.map(id => sendToUser(id, notification)));
}

/**
 * Send to all users in a company
 */
async function sendToCompany(companyId, notification) {
  const result = await query(
    'SELECT id FROM users WHERE company_id = $1 AND status = $2',
    [companyId, 'active']
  );
  const ids = result.rows.map(r => r.id);
  return sendToMultiple(ids, notification);
}

// ── Specific Notification Types ──────────────────────────────

function transactionNotificationTypeLabel(transaction) {
  const transactionType = String(
    transaction?.transaction_type || ''
  ).trim();

  const provider = String(
    transaction?.provider || ''
  ).trim().toLowerCase();

  if (provider === 'mtn' && transactionType === 'send_money') {
    return 'Cash In';
  }

  if (
    (provider === 'telecel' || provider === 'at_money') &&
    transactionType === 'cash_in'
  ) {
    return 'Deposit';
  }

  if (provider === 'telecel' && transactionType === 'cash_out') {
    return 'Withdrawal';
  }

  const labels = {
    cash_in: 'Cash In',
    cash_out: 'Cash Out',
    send_money: 'Send Money',
    merchant_payment: 'Pay to Merchant',
    pay_to_agent: 'Pay to Agent',
    bill_payment: 'Bill Payment',
    airtime: 'Airtime',
    data_bundle: 'Data Bundle',
    balance_enquiry: 'Check Balance',
    commission_balance: 'Commission Balance',
    cash_in_commission: 'Cash In Commission',
    cash_out_commission: 'Cash Out Commission',
    commission_transfer: 'Commission to Float',
    working_to_float: 'Working Account to Float',
    float_to_working: 'Float to Working Account',
  };

  if (labels[transactionType]) {
    return labels[transactionType];
  }

  return transactionType
    .split('_')
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1).toLowerCase()
    )
    .join(' ');
}

async function sendTransactionNotification(
  agentId,
  { type, transaction },
  options = {}
) {
  const transactionType = transaction.transaction_type || '';
  const isBalanceEnquiry = transactionType === 'balance_enquiry';
  const typeLabel =
    transactionNotificationTypeLabel(transaction);
  const amountStr = isBalanceEnquiry
    ? null
    : `GH₵${parseFloat(transaction.amount).toFixed(2)}`;
  const transactionLabel = isBalanceEnquiry
    ? 'Balance enquiry'
    : `${amountStr} ${typeLabel}`;
  const pendingConfirmationAdvice = isBalanceEnquiry
    ? 'Check your transaction history.'
    : 'Check your transaction history or ask the customer before retrying.';

  const content = {
    transaction_success: {
      title: 'Transaction Successful ✅',
      body: `${transactionLabel} completed. Ref: ${transaction.reference}`,
    },
    transaction_failed: {
      title: 'Transaction Failed ❌',
      body: `${transactionLabel} failed. ${transaction.failure_reason || ''}`.trim(),
    },
    // Deliberately distinct from "failed": the network never confirmed
    // an outcome (typically after a PIN prompt with no further
    // response). We genuinely don't know if this succeeded — telling
    // the agent it "failed" could lead them to retry a transaction
    // that already went through, double-charging or double-paying.
    transaction_pending_confirmation: {
      title: '⚠️ Please Verify This Transaction',
      body: `${transactionLabel} — outcome unconfirmed. ` +
        `${pendingConfirmationAdvice} ` +
        `Ref: ${transaction.reference}`,
    },
  }[type];

  if (!content) return; // unknown type — fail safe, don't send a misleading notification

  return sendToUser(agentId, {
    type,
    title: content.title,
    body: content.body,
    data: {
      transaction_id: transaction.id,
      reference: transaction.reference,
      amount: String(transaction.amount),
    },
  }, options);
}

async function sendLowFloatAlert(branchId, provider, currentBalance) {
  try {
    // Business owners receive company alerts. Managers receive alerts
    // only for branches they are explicitly assigned to manage.
    const result = await query(
      `SELECT DISTINCT u.id
       FROM users u
       WHERE u.company_id = (
         SELECT company_id
         FROM branches
         WHERE id = $1
       )
         AND u.status = 'active'
         AND (
           u.role = 'business_owner'
           OR (
             u.role = 'manager'
             AND EXISTS (
               SELECT 1
               FROM branch_managers bm
               WHERE bm.branch_id = $1
                 AND bm.manager_id = u.id
             )
           )
         )`,
      [branchId]
    );

    const branch = await query('SELECT name FROM branches WHERE id = $1', [branchId]);
    const branchName = branch.rows[0]?.name || 'Branch';
    const providerName = { mtn: 'MTN MoMo', telecel: 'Telecel Cash', at_money: 'AT Money' }[provider] || provider;

    const userIds = result.rows.map(r => r.id);
    return sendToMultiple(userIds, {
      type: 'low_float',
      title: '⚠️ Low Float Alert',
      body: `${branchName} ${providerName} float is low: GH₵${parseFloat(currentBalance).toFixed(2)}`,
      data: { branch_id: branchId, provider, balance: String(currentBalance) },
    });
  } catch (error) {
    logger.error('Low float alert error:', error);
  }
}

async function sendSubscriptionReminder(companyId, daysLeft) {
  const result = await query(
    'SELECT id FROM users WHERE company_id = $1 AND role = $2 AND status = $3',
    [companyId, 'business_owner', 'active']
  );
  const userIds = result.rows.map(r => r.id);

  return sendToMultiple(userIds, {
    type: 'subscription_reminder',
    title: `⏰ Subscription Expires in ${daysLeft} Day${daysLeft > 1 ? 's' : ''}`,
    body: 'Renew your Agent Pro Ghana Business Plan to keep processing transactions.',
    data: { days_left: String(daysLeft) },
  });
}

async function sendSubscriptionSuspended(companyId) {
  return sendToCompany(companyId, {
    type: 'subscription_suspended',
    title: '🔴 Subscription Suspended',
    body: 'Your Agent Pro Ghana subscription has been suspended. Please renew to resume operations.',
    data: {},
  });
}

async function sendAdNotification(userId, { type, adTitle }) {
  const messages = {
    ad_approved: { title: '✅ Ad Approved', body: `Your ad "${adTitle}" has been approved and is now live.` },
    ad_rejected: { title: '❌ Ad Rejected', body: `Your ad "${adTitle}" was not approved. Check the app for details.` },
    ad_expiring: { title: '⏰ Ad Expiring Soon', body: `Your ad "${adTitle}" expires in 7 days. Renew to keep it active.` },
    ad_expired: { title: '📢 Ad Expired', body: `Your ad "${adTitle}" has expired. Renew to repost.` },
  };

  const msg = messages[type];
  if (!msg) return;

  return sendToUser(userId, { type, ...msg, data: { ad_title: adTitle } });
}


// Sends a transient push notification without writing it to the
// notifications table. Callers must never place passwords, PINs,
// authentication tokens, setup links, or other credentials here.
async function sendEphemeral(userId, { title, body, data = {} }) {
  try {
    const result = await query(
      "SELECT fcm_token FROM users WHERE id = $1 AND fcm_token IS NOT NULL",
      [userId]
    );
    if (result.rows.length === 0 || !result.rows[0].fcm_token) return;

    const message = {
      token: result.rows[0].fcm_token,
      notification: { title, body },
      data: { ...data, click_action: "FLUTTER_NOTIFICATION_CLICK" },
      android: {
        priority: "high",
        notification: { sound: "default", click_action: "FLUTTER_NOTIFICATION_CLICK" },
      },
    };
    await getMessaging().send(message);
  } catch (error) {
    logger.error('FCM ephemeral send error', { error });
  }
}
module.exports = {
  sendToUser,
  sendToMultiple,
  sendToCompany,
  sendTransactionNotification,
  sendLowFloatAlert,
  sendSubscriptionReminder,
  sendSubscriptionSuspended,
  sendAdNotification,
  sendEphemeral,
};
