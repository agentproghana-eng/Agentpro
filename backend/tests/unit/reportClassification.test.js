const {
  CUSTOMER_VOLUME_TRANSACTION_TYPES,
} = require("../../src/config/reportClassification");

describe("reportClassification", () => {
  test("customer volume contains only settled customer-service transaction types", () => {
    expect(CUSTOMER_VOLUME_TRANSACTION_TYPES).toEqual([
      "cash_in",
      "cash_out",
      "send_money",
      "airtime",
      "data_bundle",
      "pay_to_agent",
    ]);
  });

  test("customer volume excludes funding, internal transfers, expenses, enquiries, reversals, and unresolved flows", () => {
    const excludedTypes = [
      "merchant_payment",
      "float_received",
      "commission_transfer",
      "working_to_float",
      "float_to_working",
      "commission_balance",
      "cash_in_commission",
      "cash_out_commission",
      "balance_enquiry",
      "mini_statement",
      "reversal",
      "business_deposit",
      "business_withdrawal",
    ];

    for (const type of excludedTypes) {
      expect(CUSTOMER_VOLUME_TRANSACTION_TYPES).not.toContain(type);
    }
  });
});
