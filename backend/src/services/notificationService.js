const { getMessaging } = require('../config/firebase');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

/**
 * Send a push notification to a single user
 */
async function sendToUser(userId, { title, body, data = {}, type }) {
  try {
    const result = await query(
      'SELECT fcm_token FROM users WHERE id = $1 AND fcm_token IS NOT NULL',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].fcm_token) return;

    const fcmToken = result.rows[0].fcm_token;
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: { ...data, type: type || 'general', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
    };

    const response = await getMessaging().send(message);

    // Save to notifications table
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data, sent_at, fcm_message_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [userId, type || 'system_update', title, body, JSON.stringify(data), response]
    );

    return response;
  } catch (error) {
    if (error.code === 'messaging/registration-token-not-registered') {
      // Clear invalid token
      await query('UPDATE users SET fcm_token = NULL WHERE id = $1', [userId]);
    }
    logger.error(`FCM send error for user ${userId}:`, error);
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

async function sendTransactionNotification(agentId, { type, transaction }) {
  const amountStr = `GH₵${parseFloat(transaction.amount).toFixed(2)}`;
  const typeLabel = (transaction.transaction_type || '').replace('_', ' ');

  const content = {
    transaction_success: {
      title: 'Transaction Successful ✅',
      body: `${amountStr} ${typeLabel} completed. Ref: ${transaction.reference}`,
    },
    transaction_failed: {
      title: 'Transaction Failed ❌',
      body: `${amountStr} ${typeLabel} failed. ${transaction.failure_reason || ''}`.trim(),
    },
    // Deliberately distinct from "failed": the network never confirmed
    // an outcome (typically after a PIN prompt with no further
    // response). We genuinely don't know if this succeeded — telling
    // the agent it "failed" could lead them to retry a transaction
    // that already went through, double-charging or double-paying.
    transaction_pending_confirmation: {
      title: '⚠️ Please Verify This Transaction',
      body: `${amountStr} ${typeLabel} — outcome unconfirmed. ` +
        `Check your transaction history or ask the customer before retrying. ` +
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
  });
}

async function sendLowFloatAlert(branchId, provider, currentBalance) {
  try {
    // Find business owner and managers for this branch
    const result = await query(
      `SELECT DISTINCT u.id
       FROM users u
       WHERE u.company_id = (SELECT company_id FROM branches WHERE id = $1)
         AND u.role IN ('business_owner', 'manager')
         AND u.status = 'active'`,
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


// Sends a push notification without ever writing it to the notifications
// table. Used specifically for one-time sensitive content, like a new
// staff member's temporary password shown to the owner as a backup
// while email/SMS delivery is unconfirmed - this should never persist
// in the database, only appear transiently on the recipient's device.
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
    logger.error(`FCM ephemeral send error for user ${userId}:`, error);
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
