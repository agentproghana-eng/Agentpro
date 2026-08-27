#!/usr/bin/env node
'use strict';

/**
 * Agent Pro Ghana — Database Seed Script
 *
 * Creates:
 * 1. Superuser account
 * 2. Default USSD templates for MTN, Telecel, AT Money
 * 3. Default commission rule
 *
 * Run: node scripts/seed.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');

async function seed() {
  await connectDB();
  logger.info('🌱 Starting database seed...');

  await seedSuperuser();
  await seedUSSDTemplates();
  await seedDefaultCommissionRule();

  logger.info('✅ Seed complete!');
  process.exit(0);
}

// ── Superuser ─────────────────────────────────────────────────

async function seedSuperuser() {
  const email = process.env.SUPERUSER_EMAIL || 'admin@agentproghana.com';
  const password = process.env.SUPERUSER_PASSWORD || 'ChangeMe123!';
  const firstName = process.env.SUPERUSER_FIRST_NAME || 'Agent Pro';
  const lastName = process.env.SUPERUSER_LAST_NAME || 'Admin';

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    logger.info(`Superuser already exists: ${email}`);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (role, first_name, last_name, email, password_hash, status)
     VALUES ('superuser', $1, $2, $3, $4, 'active')`,
    [firstName, lastName, email, hash]
  );

  logger.info(`✅ Superuser created: ${email}`);
  logger.warn(`⚠️  Default password set. Change immediately: ${password}`);
}

// ── USSD Templates ────────────────────────────────────────────
//
// IMPORTANT — READ BEFORE DEPLOYING TO PRODUCTION:
//
// The exact digit sequences below (which menu option is "Cash Out",
// which is "Send Money", etc.) are BEST-EFFORT PLACEHOLDERS based on
// publicly documented top-level MoMo menu structure. They have NOT
// been verified against the live MTN/Telecel/AT USSD menus, and
// operator menus change periodically without notice. This is exactly
// the kind of thing that requires real-device testing against live
// SIMs before any of this touches real money — see docs/DEPLOYMENT.md.
//
// ussd_string_pattern uses {placeholder} tokens resolved by the
// Flutter engine before dialing. The ENTIRE pattern is submitted as
// ONE sendUssdRequest() call — see migration 002 for why: Android's
// public USSD API cannot reply to an already-open interactive
// session, so there is no way to "navigate" a menu step by step.
//
// PIN is deliberately never part of any pattern string. When the
// network's response matches pin_prompt_strings, the engine pauses
// and waits — the OS/network handle that one exchange independently
// of this app, and the PIN never passes through app code at any point.

async function seedUSSDTemplates() {
  const templates = [

    // ── MTN Mobile Money (*170#) ──────────────────────────────
    // Top-level menu (publicly documented): 1=Send Money, 2=Cash Out
    // (at some agents this is agent-initiated instead), 3=Buy Airtime,
    // 5=Pay Bill, 6=My Account/Balance. Sub-menu numbers for agent
    // cash in/out specifically are NOT publicly documented and are
    // placeholders pending live verification.
    {
      provider: 'mtn',
      transaction_type: 'cash_in',
      name: 'MTN Cash In (Agent)',
      ussd_string_pattern: '*170*1*3*{customer_phone}*{amount}#',
      placeholder_fields: ['customer_phone', 'amount'],
      pin_prompt_strings: ['pin', 'enter your pin', 'enter pin', 'momo pin'],
      success_strings: ['cash in successful', 'transaction successful', 'received'],
      failure_strings: ['failed', 'insufficient', 'invalid', 'error', 'not found'],
      timeout_seconds: 60,
      retry_count: 1,
    },
    {
      provider: 'mtn',
      transaction_type: 'cash_out',
      name: 'MTN Cash Out (Agent)',
      ussd_string_pattern: '*170*1*2*{customer_phone}*{amount}#',
      placeholder_fields: ['customer_phone', 'amount'],
      pin_prompt_strings: ['pin', 'enter your pin', 'enter pin', 'momo pin'],
      success_strings: ['cash out successful', 'transaction successful', 'paid out'],
      failure_strings: ['failed', 'insufficient', 'invalid', 'error'],
      timeout_seconds: 60,
      retry_count: 1,
    },
    {
      provider: 'mtn',
      transaction_type: 'send_money',
      name: 'MTN Send Money',
      ussd_string_pattern: '*170*1*1*{recipient_phone}*{amount}#',
      placeholder_fields: ['recipient_phone', 'amount'],
      pin_prompt_strings: ['pin', 'enter your pin', 'enter pin', 'momo pin'],
      success_strings: ['sent successfully', 'transfer successful', 'money sent'],
      failure_strings: ['failed', 'insufficient', 'invalid', 'error'],
      timeout_seconds: 60,
      retry_count: 1,
    },
    {
      provider: 'mtn',
      transaction_type: 'airtime',
      name: 'MTN Airtime (Buy for Others)',
      ussd_string_pattern: '*170*1*5*2*{customer_phone}*{amount}#',
      placeholder_fields: ['customer_phone', 'amount'],
      pin_prompt_strings: ['pin', 'enter your pin', 'enter pin', 'momo pin'],
      success_strings: ['airtime purchased', 'recharge successful', 'topped up'],
      failure_strings: ['failed', 'insufficient', 'invalid'],
      timeout_seconds: 45,
      retry_count: 1,
    },
    {
      provider: 'mtn',
      transaction_type: 'balance_enquiry',
      name: 'MTN Balance Enquiry',
      ussd_string_pattern: '*170*1*6*1#',
      placeholder_fields: [],
      pin_prompt_strings: ['pin', 'enter your pin', 'enter pin', 'momo pin'],
      success_strings: ['balance', 'your balance', 'available'],
      failure_strings: ['failed', 'error', 'invalid'],
      timeout_seconds: 30,
      retry_count: 2,
    },

    // ── Telecel Cash (*110#) ──────────────────────────────────
    {
      provider: 'telecel',
      transaction_type: 'cash_in',
      name: 'Telecel Cash In (Agent)',
      ussd_string_pattern: '*110*1*1*{customer_phone}*{amount}#',
      placeholder_fields: ['customer_phone', 'amount'],
      pin_prompt_strings: ['pin', 'enter your pin', 'enter pin'],
      success_strings: ['deposit successful', 'cash in done', 'successful'],
      failure_strings: ['failed', 'insufficient', 'invalid', 'error'],
      timeout_seconds: 60,
      retry_count: 1,
    },
    {
      provider: 'telecel',
      transaction_type: 'cash_out',
      name: 'Telecel Cash Out (Agent)',
      ussd_string_pattern: '*110*1*2*{customer_phone}*{amount}#',
      placeholder_fields: ['customer_phone', 'amount'],
      pin_prompt_strings: ['pin', 'enter your pin', 'enter pin'],
      success_strings: ['withdrawal successful', 'cash out done', 'successful'],
      failure_strings: ['failed', 'insufficient', 'invalid', 'error'],
      timeout_seconds: 60,
      retry_count: 1,
    },

    // ── AT Money ──────────────────────────────────────────────
    // Commercial safety:
    // AT Money Agent automation is intentionally not seeded here.
    //
    // Live Agent SIM validation uses *110#, but exact screen text,
    // success markers and failure markers must be verified before
    // any shared AT Money automation is enabled.
    //
    // See migration 053 and the commercial-validation migrations.
  ];

  let created = 0;
  let updated = 0;
  for (const t of templates) {
    const existing = await query(
      'SELECT id FROM ussd_templates WHERE provider = $1 AND transaction_type = $2',
      [t.provider, t.transaction_type]
    );

    if (existing.rows.length > 0) {
      // Re-seeding an existing deployment after migration 002: fill in
      // the new pattern-based columns and reactivate. Does not touch
      // is_active if an operator has since customized this template
      // via the admin portal (version > 1 signals a manual edit).
      const current = await query(
        'SELECT version FROM ussd_templates WHERE id = $1', [existing.rows[0].id]
      );
      if (current.rows[0].version > 1) {
        logger.info(`Skipping ${t.provider}/${t.transaction_type} — customized via admin portal (v${current.rows[0].version}), not overwriting`);
        continue;
      }

      await query(
        `UPDATE ussd_templates SET
           ussd_string_pattern = $1, placeholder_fields = $2, pin_prompt_strings = $3,
           success_strings = $4, failure_strings = $5, timeout_seconds = $6,
           retry_count = $7, is_active = TRUE, updated_at = NOW()
         WHERE id = $8`,
        [
          t.ussd_string_pattern, t.placeholder_fields, t.pin_prompt_strings,
          t.success_strings, t.failure_strings, t.timeout_seconds, t.retry_count,
          existing.rows[0].id,
        ]
      );
      updated++;
      continue;
    }

    await query(
      `INSERT INTO ussd_templates (
        provider, transaction_type, name, ussd_string_pattern,
        placeholder_fields, pin_prompt_strings, success_strings, failure_strings,
        timeout_seconds, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        t.provider, t.transaction_type, t.name,
        t.ussd_string_pattern, t.placeholder_fields, t.pin_prompt_strings,
        t.success_strings, t.failure_strings, t.timeout_seconds, t.retry_count,
      ]
    );
    created++;
  }

  logger.info(`✅ USSD templates: ${created} created, ${updated} updated, ${templates.length - created - updated} skipped (customized)`);
  logger.warn('⚠️  USSD string patterns are UNVERIFIED PLACEHOLDERS. Test against live MTN/Telecel/AT menus before production use.');
}

// ── Default Commission Rule ───────────────────────────────────

async function seedDefaultCommissionRule() {
  const exists = await query(
    'SELECT id FROM commission_rules WHERE company_id IS NULL AND provider IS NULL AND transaction_type IS NULL'
  );
  if (exists.rows.length > 0) {
    logger.info('Default commission rule already exists');
    return;
  }

  // Global bootstrap rate: 2%, capped at GH₵20 above GH₵1000. Full configured commission belongs to the agent.
  await query(
    `INSERT INTO commission_rules
       (rate_percent, threshold_amount, cap_amount, provider_share_percent, effective_from, is_active)
     VALUES (0.0200, 1000.00, 20.00, 0.00, CURRENT_DATE, TRUE)`
  );

  logger.info('✅ Default commission rule created (2% rate, GH₵20 cap above GH₵1000)');
}

seed().catch(err => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
