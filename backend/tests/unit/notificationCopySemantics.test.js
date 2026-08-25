const fs = require('fs');
const path = require('path');

describe('notification transaction copy semantics', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../src/services/notificationService.js'
    ),
    'utf8'
  );

  test('uses canonical provider-aware transaction wording', () => {
    expect(source).toContain(
      "provider === 'mtn' && transactionType === 'send_money'"
    );
    expect(source).toContain("return 'Cash In'");
    expect(source).toContain("return 'Deposit'");
    expect(source).toContain("return 'Withdrawal'");
    expect(source).toContain(
      "merchant_payment: 'Pay to Merchant'"
    );
    expect(source).toContain(
      "pay_to_agent: 'Pay to Agent'"
    );
    expect(source).toContain(
      "bill_payment: 'Bill Payment'"
    );
  });

  test('transaction notifications no longer expose raw type text', () => {
    expect(source).toContain(
      'transactionNotificationTypeLabel(transaction)'
    );

    expect(source).not.toContain(
      "const typeLabel = transactionType.replace('_', ' ');"
    );
  });
});
