'use strict';

const express = require('express');
const { Resend } = require('resend');

const {
  logger,
} = require('../utils/logger');

const router = express.Router();

const SUPPORT_ADDRESS =
  String(
    process.env.SUPPORT_INBOUND_ADDRESS ||
      'support@agentproghana.com'
  )
    .trim()
    .toLowerCase();

const SUPPORT_FORWARD_TO =
  String(
    process.env.SUPPORT_INBOUND_FORWARD_TO ||
      'agentproghana@gmail.com'
  ).trim();

const FROM =
  process.env.EMAIL_FROM ||
  'AgentPro <onboarding@resend.dev>';

const MAX_FORWARDED_TEXT_LENGTH = 100_000;

function normalizeAddress(value) {
  const text = String(value || '').trim();

  const bracketMatch =
    text.match(/<([^<>]+)>/);

  return String(
    bracketMatch
      ? bracketMatch[1]
      : text
  )
    .trim()
    .toLowerCase();
}

function isSupportRecipient(recipients) {
  return (
    Array.isArray(recipients) &&
    recipients.some(
      (recipient) =>
        normalizeAddress(recipient) ===
        SUPPORT_ADDRESS
    )
  );
}

function htmlToPlainText(value) {
  return String(value || '')
    .replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      ' '
    )
    .replace(
      /<style\b[^>]*>[\s\S]*?<\/style>/gi,
      ' '
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function boundedText(value) {
  const text = String(value || '');

  if (
    text.length <=
    MAX_FORWARDED_TEXT_LENGTH
  ) {
    return text;
  }

  return (
    text.slice(
      0,
      MAX_FORWARDED_TEXT_LENGTH
    ) +
    '\n\n[Message truncated by AgentPro support forwarding.]'
  );
}

function listItems(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (
    data &&
    Array.isArray(data.data)
  ) {
    return data.data;
  }

  return [];
}

async function resolveAttachments(
  resend,
  emailId,
  expectedAttachments
) {
  if (
    !Array.isArray(expectedAttachments) ||
    expectedAttachments.length === 0
  ) {
    return [];
  }

  try {
    const {
      data,
      error,
    } =
      await resend.emails.receiving
        .attachments.list({
          emailId,
        });

    if (error) {
      throw new Error(
        error.message ||
          'ATTACHMENT_LIST_FAILED'
      );
    }

    return listItems(data)
      .filter(
        (attachment) =>
          attachment &&
          attachment.download_url &&
          attachment.filename
      )
      .map(
        (attachment) => ({
          path:
            attachment.download_url,
          filename:
            attachment.filename,
        })
      );
  } catch (error) {
    logger.warn(
      'Support inbound attachments were not forwarded',
      {
        emailId,
        errorCode: error?.code,
      }
    );

    return [];
  }
}

router.post('/', async (req, res) => {
  const resendApiKey =
    process.env.RESEND_API_KEY;

  const webhookSecret =
    process.env
      .RESEND_INBOUND_WEBHOOK_SECRET;

  if (
    !resendApiKey ||
    !webhookSecret
  ) {
    logger.error(
      'Support inbound webhook is not configured'
    );

    return res.status(503).json({
      success: false,
      code:
        'SUPPORT_INBOUND_NOT_CONFIGURED',
    });
  }

  if (!Buffer.isBuffer(req.rawBody)) {
    return res.status(400).json({
      success: false,
      code:
        'SUPPORT_INBOUND_RAW_BODY_REQUIRED',
    });
  }

  const resend =
    new Resend(resendApiKey);

  let event;

  try {
    event =
      resend.webhooks.verify({
        payload:
          req.rawBody.toString('utf8'),
        headers: {
          'svix-id':
            req.get('svix-id'),
          'svix-timestamp':
            req.get('svix-timestamp'),
          'svix-signature':
            req.get('svix-signature'),
        },
        secret:
          webhookSecret,
      });
  } catch (error) {
    logger.warn(
      'Rejected invalid Resend inbound webhook',
      {
        errorCode: error?.code,
      }
    );

    return res.status(400).json({
      success: false,
      code:
        'SUPPORT_INBOUND_SIGNATURE_INVALID',
    });
  }

  if (
    event?.type !==
    'email.received'
  ) {
    return res.status(200).json({
      success: true,
      ignored: true,
    });
  }

  const emailId =
    String(
      event?.data?.email_id || ''
    ).trim();

  if (!emailId) {
    return res.status(400).json({
      success: false,
      code:
        'SUPPORT_INBOUND_EMAIL_ID_MISSING',
    });
  }

  if (
    !isSupportRecipient(
      event?.data?.to
    )
  ) {
    return res.status(200).json({
      success: true,
      ignored: true,
    });
  }

  try {
    const {
      data: email,
      error: receiveError,
    } =
      await resend.emails.receiving.get(
        emailId
      );

    if (receiveError || !email) {
      throw new Error(
        receiveError?.message ||
          'SUPPORT_INBOUND_FETCH_FAILED'
      );
    }

    const originalFrom =
      String(
        event?.data?.from ||
          email.from ||
          ''
      ).trim();

    const originalSubject =
      String(
        event?.data?.subject ||
          email.subject ||
          '(no subject)'
      ).trim();

    const sourceText =
      String(
        email.text ||
          htmlToPlainText(
            email.html
          ) ||
          '[No plain-text message body was available.]'
      );

    const attachments =
      await resolveAttachments(
        resend,
        emailId,
        event?.data?.attachments
      );

    const attachmentNote =
      Array.isArray(
        event?.data?.attachments
      ) &&
      event.data.attachments.length >
        attachments.length
        ? '\n\nNote: One or more inbound attachments remain available in the Resend inbox but could not be copied into this forwarding email.'
        : '';

    const forwardText =
      boundedText(
        [
          'AgentPro Support — inbound email',
          '',
          `From: ${originalFrom}`,
          `To: ${SUPPORT_ADDRESS}`,
          `Subject: ${originalSubject}`,
          `Resend email ID: ${emailId}`,
          '',
          '--- Original message ---',
          '',
          sourceText,
          attachmentNote,
        ].join('\n')
      );

    const sendRequest = {
      from: FROM,
      to: [
        SUPPORT_FORWARD_TO,
      ],
      subject:
        `[AgentPro Support] ${originalSubject}`,
      text:
        forwardText,
      replyTo:
        originalFrom || undefined,
      attachments:
        attachments,
    };

    if (
      sendRequest.attachments.length ===
      0
    ) {
      delete sendRequest.attachments;
    }

    const {
      data: forwarded,
      error: sendError,
    } =
      await resend.emails.send(
        sendRequest,
        {
          idempotencyKey:
            `support-inbound-forward-${emailId}`,
        }
      );

    if (sendError) {
      throw new Error(
        sendError.message ||
          'SUPPORT_FORWARD_FAILED'
      );
    }

    logger.info(
      'Support inbound email forwarded',
      {
        emailId,
        forwardedEmailId:
          forwarded?.id,
        attachmentCount:
          attachments.length,
      }
    );

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    logger.error(
      'Support inbound forwarding failed',
      {
        emailId,
        errorCode: error?.code,
      }
    );

    // Return a retryable status. Resend will retry webhook
    // delivery, while the idempotency key prevents duplicate
    // forwarding if the send itself already succeeded.
    return res.status(500).json({
      success: false,
      code:
        'SUPPORT_INBOUND_FORWARD_FAILED',
    });
  }
});

module.exports = router;

module.exports._test = {
  boundedText,
  htmlToPlainText,
  isSupportRecipient,
  listItems,
  normalizeAddress,
};
