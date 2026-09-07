'use strict';

const {
  query,
} = require('../config/database');

const {
  sendTransactionNotification,
  sendAdNotification,
} = require('./notificationService');

const {
  sendAdPaymentConfirmedSMS,
} = require('./smsService');

const {
  sendAdPaymentConfirmedEmail,
} = require('./emailService');

function dispatchError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireObject(value, field) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw dispatchError(
      'OUTBOX_INVALID_EVENT_PAYLOAD',
      `${field} must be an object`
    );
  }

  return value;
}

function requireString(value, field) {
  if (
    typeof value !== 'string' ||
    value.length === 0
  ) {
    throw dispatchError(
      'OUTBOX_INVALID_EVENT_PAYLOAD',
      `${field} must be a non-empty string`
    );
  }

  return value;
}

function requireMoney(value, field) {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    throw dispatchError(
      'OUTBOX_INVALID_EVENT_PAYLOAD',
      `${field} must be a non-negative amount`
    );
  }

  return parsed.toFixed(2);
}

function businessHubPayload(event) {
  const deliveryKey = requireString(
    event.dedupe_key,
    'dedupe_key'
  );

  const payload = requireObject(
    event.payload,
    'payload'
  );

  return {
    deliveryKey,
    userId: requireString(
      payload.user_id,
      'payload.user_id'
    ),
    adId: requireString(
      payload.ad_id,
      'payload.ad_id'
    ),
    adTitle: requireString(
      payload.ad_title,
      'payload.ad_title'
    ),
    amount: requireMoney(
      payload.amount,
      'payload.amount'
    ),
  };
}

async function dispatchTransactionCompletion(event) {
  const deliveryKey =
    requireString(
      event.dedupe_key,
      'dedupe_key'
    );

  const payload =
    requireObject(
      event.payload,
      'payload'
    );

  const agentId =
    requireString(
      payload.agent_id,
      'payload.agent_id'
    );

  const type =
    requireString(
      payload.type,
      'payload.type'
    );

  if (
    ![
      'transaction_success',
      'transaction_failed',
      'transaction_pending_confirmation',
    ].includes(type)
  ) {
    throw dispatchError(
      'OUTBOX_INVALID_EVENT_PAYLOAD',
      'Unsupported transaction notification type'
    );
  }

  const transaction =
    requireObject(
      payload.transaction,
      'payload.transaction'
    );

  requireString(
    transaction.id,
    'payload.transaction.id'
  );

  requireString(
    transaction.transaction_type,
    'payload.transaction.transaction_type'
  );

  return sendTransactionNotification(
    agentId,
    {
      type,
      transaction,
    },
    {
      throwOnError: true,
      deliveryKey,
    }
  );
}

async function dispatchBusinessHubAppNotification(
  event,
  type
) {
  const payload = businessHubPayload(event);

  return sendAdNotification(
    payload.userId,
    {
      type,
      adId: payload.adId,
      adTitle: payload.adTitle,
      amount: payload.amount,
    },
    {
      throwOnError: true,
      deliveryKey: payload.deliveryKey,
    }
  );
}

async function resolveBusinessHubRecipient(userId) {
  const result = await query(
    `SELECT
       first_name,
       email,
       phone
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (!result.rows.length) {
    throw dispatchError(
      'OUTBOX_RECIPIENT_NOT_FOUND',
      'Business Hub notification recipient not found'
    );
  }

  return result.rows[0];
}

async function dispatchBusinessHubConfirmedSms(
  event
) {
  const payload = businessHubPayload(event);

  const recipient =
    await resolveBusinessHubRecipient(
      payload.userId
    );

  const phone =
    String(recipient.phone || '').trim();

  if (!phone) {
    throw dispatchError(
      'OUTBOX_RECIPIENT_CHANNEL_MISSING',
      'Business Hub SMS recipient has no phone'
    );
  }

  return sendAdPaymentConfirmedSMS(
    phone,
    recipient.first_name || 'there',
    payload.adTitle,
    payload.amount
  );
}

async function dispatchBusinessHubConfirmedEmail(
  event
) {
  const payload = businessHubPayload(event);

  const recipient =
    await resolveBusinessHubRecipient(
      payload.userId
    );

  const email =
    String(recipient.email || '').trim();

  if (!email) {
    throw dispatchError(
      'OUTBOX_RECIPIENT_CHANNEL_MISSING',
      'Business Hub email recipient has no email'
    );
  }

  return sendAdPaymentConfirmedEmail(
    email,
    recipient.first_name || 'there',
    payload.adTitle,
    payload.amount
  );
}

async function dispatchOutboxEvent(event) {
  requireObject(
    event,
    'event'
  );

  const eventType =
    requireString(
      event.event_type,
      'event.event_type'
    );

  switch (eventType) {
    case 'notification.transaction.completed':
      return dispatchTransactionCompletion(
        event
      );

    case 'notification.business_hub.payment_required':
      return dispatchBusinessHubAppNotification(
        event,
        'ad_payment_required'
      );

    case 'notification.business_hub.payment_confirmed':
      return dispatchBusinessHubAppNotification(
        event,
        'ad_payment_confirmed'
      );

    case 'sms.business_hub.payment_confirmed':
      return dispatchBusinessHubConfirmedSms(
        event
      );

    case 'email.business_hub.payment_confirmed':
      return dispatchBusinessHubConfirmedEmail(
        event
      );

    default:
      throw dispatchError(
        'OUTBOX_UNSUPPORTED_EVENT_TYPE',
        `Unsupported outbox event type: ${eventType}`
      );
  }
}

module.exports = {
  dispatchOutboxEvent,
};
