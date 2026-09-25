const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const migration153 = fs.readFileSync(
  path.join(root, 'migrations/153_telecel_merchant_remaining_flows.sql'),
  'utf8',
);

const transactionController = fs.readFileSync(
  path.join(root, 'src/controllers/transactionController.js'),
  'utf8',
);

const readinessService = fs.readFileSync(
  path.join(root, 'src/services/telecelMerchantECashReadinessService.js'),
  'utf8',
);

describe('Telecel Merchant remaining flow contracts', () => {
  test('migration is explicitly Merchant-role scoped', () => {
    expect(migration153).toContain("business_sim_role = 'merchant'");
    expect(migration153).toContain("'merchant'");
  });

  test('defines the three distinct Merchant outgoing transaction types', () => {
    expect(migration153).toContain("'send_money_same_network'");
    expect(migration153).toContain("'send_money_cross_network'");
    expect(migration153).toContain("'send_money_to_bank'");
  });

  test('does not use generic confirmed as a terminal success marker', () => {
    expect(migration153).not.toContain("ARRAY['confirmed']");
    expect(migration153).toContain('ARRAY[]::TEXT[]');
  });

  test('same-network Merchant flow keeps PIN manual', () => {
    const section = sectionFor(
      migration153,
      'send_money_same_network',
      'send_money_cross_network',
    );

    expect(section).toContain("'send_digit'::ussd_flow_action, '1'");
    expect(section).toContain(
      "'send_customer_phone'::ussd_flow_action",
    );
    expect(section).toContain("'send_amount'::ussd_flow_action");
    expect(section).toContain("'send_reference'::ussd_flow_action");
    expect(section).toContain("'send_operator_id'::ussd_flow_action");
    expect(section).toContain("'pin_prompt'::ussd_flow_action");
    expect(section).not.toContain(
      "'send_organisation_shortcode'::ussd_flow_action",
    );
    expect(section).not.toContain(
      "'auto_confirm_once'::ussd_flow_action",
    );
  });

  test('cross-network Merchant flow uses role-specific credentials and post-PIN confirmation', () => {
    const section = sectionFor(
      migration153,
      'send_money_cross_network',
      'send_money_to_bank',
    );

    expect(section).toContain(
      "'send_selection'::ussd_flow_action",
    );
    expect(section).toContain(
      "'send_operator_id'::ussd_flow_action",
    );
    expect(section).toContain(
      "'send_organisation_shortcode'::ussd_flow_action",
    );
    expect(section).toContain(
      "'send_customer_phone'::ussd_flow_action",
    );
    expect(section).toContain("'send_reference'::ussd_flow_action");
    expect(section).toContain("'pin_prompt'::ussd_flow_action");
    expect(section).toContain(
      "'auto_confirm_once'::ussd_flow_action, '1'",
    );
  });

  test('bank transfer enters Merchant bank menu and consumes two selections', () => {
    const section = sectionFor(
      migration153,
      'send_money_to_bank',
      null,
    );

    expect(section).toMatch(
      /'send_digit'::ussd_flow_action,\s*'1'/,
    );
    expect(section).toMatch(
      /'send_digit'::ussd_flow_action,\s*'5'/,
    );

    const selections =
      section.match(/'send_selection'::ussd_flow_action/g) || [];

    expect(selections).toHaveLength(2);

    expect(section).toContain(
      "'send_operator_id'::ussd_flow_action",
    );
    expect(section).toContain(
      "'send_organisation_shortcode'::ussd_flow_action",
    );
    expect(section).toContain(
      "'send_account_number'::ussd_flow_action",
    );
    expect(section).toContain("'send_amount'::ussd_flow_action");
    expect(section).toContain("'send_reference'::ussd_flow_action");
    expect(section).toContain("'pin_prompt'::ussd_flow_action");
  });

  test('does not reopen unvalidated Merchant outgoing accounting', () => {
    expect(transactionController).not.toContain(
      'postTelecelMerchantOutgoing',
    );
    expect(transactionController).not.toContain(
      'isValidatedTelecelMerchantOutgoing',
    );
    expect(transactionController).not.toContain(
      'requireTelecelMerchantOutgoingReadiness',
    );

    expect(readinessService).not.toContain(
      'requireTelecelMerchantOutgoingReadiness',
    );
  });

  test('does not introduce an outgoing posting service contract', () => {
    expect(
      fs.existsSync(
        path.join(
          root,
          'src/services/telecelMerchantOutgoingPostingService.js',
        ),
      ),
    ).toBe(false);
  });
});

function sectionFor(source, startTransactionType, nextTransactionType) {
  const start = source.indexOf(
    `transaction_type = '${startTransactionType}'`,
  );

  expect(start).toBeGreaterThanOrEqual(0);

  if (!nextTransactionType) {
    return source.slice(start);
  }

  const end = source.indexOf(
    `transaction_type = '${nextTransactionType}'`,
    start + 1,
  );

  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}
