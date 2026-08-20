'use strict';

const {
  sendTransactionNotification,
} = require('./notificationService');

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

async function dispatchTransactionCompletion(event) {
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
    }
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
