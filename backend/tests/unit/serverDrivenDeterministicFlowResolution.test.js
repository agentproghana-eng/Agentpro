"use strict";

jest.mock("../../src/config/database", () => ({
  query: jest.fn(),
}));

const {
  resolveActiveTransactionFlow,
} = require("../../src/utils/ussdFlowCapabilities");

describe("resolveActiveTransactionFlow", () => {
  test("Business query deterministically prefers authenticated company override", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [{ id: "company-flow", company_id: "company-1" }],
    });

    const flow = await resolveActiveTransactionFlow({
      accountMode: "business",
      provider: "telecel",
      transactionType: "airtime",
      businessSimRole: "merchant",
      companyId: "company-1",
      bundleCategory: null,
      recipientMode: "self",
      queryFn,
    });

    expect(flow).toEqual({
      id: "company-flow",
      company_id: "company-1",
    });

    const [sql, params] = queryFn.mock.calls[0];

    expect(sql).toContain("f.owner_user_id IS NULL");
    expect(sql).toContain("f.is_active = TRUE");
    expect(sql).toContain("f.company_id = $7");
    expect(sql).toMatch(
      /ORDER BY[\s\S]*f\.company_id = \$7[\s\S]*THEN 0[\s\S]*ELSE 1[\s\S]*LIMIT 1/,
    );

    expect(params).toEqual([
      "telecel",
      "airtime",
      "business",
      "merchant",
      null,
      "self",
      "company-1",
    ]);
  });

  test("Business without a company override can resolve the global exact variant", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [{ id: "global-flow", company_id: null }],
    });

    await expect(
      resolveActiveTransactionFlow({
        accountMode: "business",
        provider: "telecel",
        transactionType: "data_bundle",
        businessSimRole: "merchant",
        companyId: "company-1",
        recipientMode: "other",
        queryFn,
      }),
    ).resolves.toEqual({
      id: "global-flow",
      company_id: null,
    });
  });

  test("Personal scope cannot admit company or Business-role flows", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [],
    });

    await expect(
      resolveActiveTransactionFlow({
        accountMode: "personal",
        provider: "mtn",
        transactionType: "buy_airtime",
        companyId: "must-not-be-used",
        recipientMode: "self",
        queryFn,
      }),
    ).resolves.toBeNull();

    const [sql, params] = queryFn.mock.calls[0];

    expect(sql).toMatch(
      /\$3 = 'personal'[\s\S]*f\.company_id IS NULL[\s\S]*f\.business_sim_role IS NULL/,
    );
    expect(params[6]).toBeNull();
  });

  test("variant values are normalized before resolution", async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [{ id: "variant-flow" }],
    });

    await resolveActiveTransactionFlow({
      accountMode: "business",
      provider: "telecel",
      transactionType: "airtime",
      businessSimRole: " MERCHANT ",
      companyId: "company-1",
      bundleCategory: " ",
      recipientMode: " self ",
      queryFn,
    });

    expect(queryFn.mock.calls[0][1]).toEqual([
      "telecel",
      "airtime",
      "business",
      "merchant",
      null,
      "self",
      "company-1",
    ]);
  });

  test("invalid Business SIM role fails closed without querying", async () => {
    const queryFn = jest.fn();

    await expect(
      resolveActiveTransactionFlow({
        accountMode: "business",
        provider: "telecel",
        transactionType: "airtime",
        businessSimRole: "unknown",
        queryFn,
      }),
    ).resolves.toBeNull();

    expect(queryFn).not.toHaveBeenCalled();
  });
});
