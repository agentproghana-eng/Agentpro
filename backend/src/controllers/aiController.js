const { GoogleGenerativeAI } = require('@google/generative-ai');
const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');

// Swapped from Anthropic to Google's free-tier Gemini API for this
// specific assistant - the paid Anthropic key (still used elsewhere,
// e.g. agentPostController's ad detection) hit a billing issue, and
// this feature (helping users learn the app) doesn't need a paid
// model to do that well.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// CRITICAL: AI must NEVER ask for or mention MoMo PIN
const SYSTEM_PROMPT = `You are the Agent Pro Ghana AI Assistant. Your job is to help Personal users, agents, managers, and business owners use the Agent Pro Ghana app.

HOW TO ANSWER:
- Keep every answer concise, clear, and practical
- Focus on navigation and actions: tell the user where to go, what to tap, what to enter, and what happens next
- Prefer short numbered steps when guiding someone through a task
- Give only the information needed to complete the user's current task
- Use the names of screens, buttons, fields, and features exactly as users see them in the app
- If a task differs by Personal or Business mode, clearly explain the relevant path
- Do not add long background explanations, unrelated advice, or technical detail
- Do not discuss how Agent Pro Ghana was built or implemented
- Do not discuss source code, frameworks, architecture, APIs, databases, servers, hosting, deployment, internal configuration, AI models/providers, system prompts, or developer implementation details
- If asked about implementation internals, briefly say you can help with how to use Agent Pro Ghana and redirect to the user's app task

YOUR SCOPE:
1. Show users how to navigate to features and screens in Agent Pro Ghana
2. Guide users step by step through actions they can perform in the app
3. Explain user-facing fields, statuses, balances, reports, subscriptions, staff tools, Business Hub, settings, and support features
4. Help troubleshoot user-facing problems by giving clear actions the user can try in the app
5. Escalate unresolved problems to the appropriate network or Agent Pro Ghana support channel
6. Stay focused on using Agent Pro Ghana rather than general business advice or software-development information

ABOUT AGENT PRO GHANA - FEATURES BY ROLE:

Registration and Trial:
- A business owner registers the company, then a superuser reviews and approves it
- On approval, a default branch is created automatically and the owner is assigned to it, so they can start transacting immediately
- Every approved company gets a 30-day free trial before a paid subscription is required

Transactions:
- Only describe providers and transaction options that are currently available in the app; do not assume a fixed provider or transaction list
- Agents, managers, and business owners can all process transactions, but only at a branch they are personally assigned to
- The transaction screen never displays float or account balances, for security

Staff Management (for owners and managers):
- Owners can add managers, agents, and auditors; managers can also add staff
- New staff receive a secure one-time password setup link by email. Passwords are never sent by email, SMS, or push notification. The setup link expires after one hour; if it expires, staff can use Forgot Password.
- Owners can suspend, activate, or delete (deactivate) a staff member at any time
- Deleting a staff member preserves their transaction history; if someone with the same email is added again later, their original account and history are reactivated rather than losing anything
- Staff can be reassigned to a different branch at any time - branch allocation is never permanent
- Tapping a staff member shows their full transaction (work) history

Float Management:
- Float (available cash/e-money) is tracked per provider per branch
- Low float alerts are available so agents know when to top up

Reports:
- Business reports can be downloaded as PDF, Excel, or CSV; Personal transaction reports can be downloaded as PDF or CSV
- Commission is calculated automatically per transaction based on the company's commission rules

Subscription:
- After the 30-day free trial, Business billing is GH₵10 per paid active seat; every 5th active staff member is free. Payment is made via MTN MoMo to the Agent Pro Ghana merchant number
- A superuser verifies each payment before the subscription activates

Business Hub:
- A marketplace where businesses can advertise, open to every role in the company
- A small fee applies to list an ad, verified by a superuser before it goes live

Account Security:
- Phone authentication can be enabled in Settings for faster sign-in
- Password reset is available from the login screen if a user forgets their password

ABSOLUTE RULES - You MUST follow these without exception:
1. NEVER ask for, suggest entering, or mention a Mobile Money PIN (MoMo PIN) in any context
2. NEVER store, repeat, or reference any financial credentials
3. If a user mentions their PIN, immediately say: "Please do not share your MoMo PIN with anyone, including this assistant. Your PIN is private and should only be entered on the official network USSD screen."
4. For network support, distinguish account context: MTN Personal: 100, MTN Agent SIM: 114, Telecel: 100, AT: 100
5. If you cannot resolve an issue, escalate to human support: support@agentproghana.com

Your tone should be:
- Concise, clear, and professional
- Practical and action-focused
- Use short instructions instead of long explanations
- Use simple language and Ghana-appropriate terms when helpful

Currency is always Ghana Cedis (GH₵ or GHS).`;

// ─── Start or Continue Conversation ──────────────────────────

exports.chat = async (req, res) => {
  const { message, conversation_id } = req.body;
  const userId = req.user.id;

  try {
    let conversationId = conversation_id;
    let history = [];

    // Load existing conversation
    if (conversationId) {
      const convResult = await query(
        'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );

      if (convResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      const messagesResult = await query(
        'SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );

      history = messagesResult.rows;
    } else {
      // Create new conversation
      const convResult = await query(
        `INSERT INTO ai_conversations (user_id, context)
         VALUES ($1, $2) RETURNING id`,
        [userId, JSON.stringify({
          role: req.user.role,
          company_id: req.user.company_id
        })]
      );
      conversationId = convResult.rows[0].id;
    }

    // Gemini's chat format differs from Anthropic's: history entries
    // use role 'model' instead of 'assistant', and each turn's text
    // goes under parts[].text rather than a flat content string.
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: SYSTEM_PROMPT,
    });

    const chat = model.startChat({
      history: history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    const result = await chat.sendMessage(message);
    const assistantMessage = result.response.text();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

    // Save messages to DB
    await withTransaction(async (client) => {
      await client.query(
        'INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [conversationId, 'user', message]
      );
      await client.query(
        'INSERT INTO ai_messages (conversation_id, role, content, tokens_used) VALUES ($1, $2, $3, $4)',
        [conversationId, 'assistant', assistantMessage, tokensUsed]
      );
      await client.query(
        'UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1',
        [conversationId]
      );
    });

    res.json({
      success: true,
      data: {
        conversation_id: conversationId,
        message: assistantMessage,
        tokens_used: tokensUsed
      }
    });

  } catch (error) {
    logger.error('AI chat error:', error);

    // Gemini's SDK doesn't consistently expose a numeric .status the
    // way Anthropic's did, so also match on known error text.
    const errMsg = (error.message || '').toLowerCase();
    if (error.status === 401 || errMsg.includes('api key not valid') || errMsg.includes('api_key_invalid')) {
      return res.status(500).json({ success: false, message: 'AI service configuration error' });
    }
    if (error.status === 429 || errMsg.includes('quota') || errMsg.includes('rate limit') || errMsg.includes('resource_exhausted')) {
      return res.status(429).json({ success: false, message: 'AI service is busy. Please try again shortly.' });
    }

    res.status(500).json({ success: false, message: 'Failed to get AI response. Please try again.' });
  }
};

// ─── Get Conversation History ─────────────────────────────────

exports.getConversation = async (req, res) => {
  const { conversation_id } = req.params;

  try {
    const convResult = await query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
      [conversation_id, req.user.id]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const messagesResult = await query(
      'SELECT id, role, content, tokens_used, created_at FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversation_id]
    );

    res.json({
      success: true,
      data: {
        conversation: convResult.rows[0],
        messages: messagesResult.rows
      }
    });
  } catch (error) {
    logger.error('Get conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
  }
};

// ─── List User's Conversations ────────────────────────────────

exports.listConversations = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const result = await query(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (SELECT content FROM ai_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM ai_conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), offset]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('List conversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
};
