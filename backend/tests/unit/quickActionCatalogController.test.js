"use strict";

const mockQuery = jest.fn();
const mockAuditLog = jest.fn();
const mockGetRegisteredProviders = jest.fn();

jest.mock("../../src/config/database", () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: jest.fn(),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../src/services/auditService", () => ({
  auditLog: (...args) => mockAuditLog(...args),
}));

jest.mock("../../src/services/emailService", () => ({
  sendEmail: jest.fn(),
  sendNewEmployeeEmail: jest.fn(),
}));

jest.mock("../../src/services/smsService", () => ({
  sendNewEmployeeSMS: jest.fn(),
}));

jest.mock("../../src/services/notificationService", () => ({
  sendEphemeral: jest.fn(),
}));

jest.mock("../../src/utils/ussdFlowCapabilities", () => ({
  getRegisteredProviders: (...args) => mockGetRegisteredProviders(...args),
}));

const userController = require("../../src/controllers/userController");

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function makeUser(overrides = {}) {
  return {
    id: "user-1",
    role: "agent",
    company_id: "company-1",
    ...overrides,
  };
}

describe("Quick Action catalog controller behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
  });

  test("Business catalog groups Global flow variants under one dynamic action", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          provider: "future_money",
          transaction_type: "cash_in",
          display_label: "Cash In",
          bundle_category: null,
          recipient_mode: null,
        },
        {
          provider: "future_money",
          transaction_type: "buy_data",
          display_label: "Buy Data",
          bundle_category: "daily",
          recipient_mode: "self",
        },
        {
          provider: "future_money",
          transaction_type: "buy_data",
          display_label: "Buy Data",
          bundle_category: "daily",
          recipient_mode: "self",
        },
        {
          provider: "future_money",
          transaction_type: "buy_data",
          display_label: "Buy Data",
          bundle_category: "weekly",
          recipient_mode: "other",
        },
      ],
    });

    const req = {
      user: makeUser(),
      query: {
        mode: "business",
      },
    };

    const res = makeResponse();

    await userController.getMyQuickActionCatalog(req, res);

    expect(res.status).not.toHaveBeenCalled();

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain("FROM ussd_flows f");
    expect(sql).toContain("f.company_id IS NULL");
    expect(sql).toContain("f.owner_user_id IS NULL");
    expect(sql).toContain("f.is_active = TRUE");
    expect(sql).toContain("c.can_initiate = TRUE");
    expect(params).toEqual(["business"]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        mode: "business",
        providers: [
          {
            provider: "future_money",
            actions: [
              {
                provider: "future_money",
                transaction_type: "cash_in",
                display_label: "Cash In",
                quick_action_group: "Cash & Float",
                variants: [],
              },
              {
                provider: "future_money",
                transaction_type: "buy_data",
                display_label: "Buy Data",
                quick_action_group: "Airtime & Data",
                variants: [
                  {
                    bundle_category: "daily",
                    recipient_mode: "self",
                  },
                  {
                    bundle_category: "weekly",
                    recipient_mode: "other",
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  test("Personal catalog passes personal account mode to the capability query", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          provider: "mtn",
          transaction_type: "buy_airtime",
          display_label: "Buy Airtime",
          bundle_category: null,
          recipient_mode: null,
        },
      ],
    });

    const req = {
      user: makeUser({
        company_id: null,
      }),
      query: {
        mode: "personal",
      },
    };

    const res = makeResponse();

    await userController.getMyQuickActionCatalog(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1]).toEqual(["personal"]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        mode: "personal",
        providers: [
          {
            provider: "mtn",
            actions: [
              {
                provider: "mtn",
                transaction_type: "buy_airtime",
                display_label: "Buy Airtime",
                quick_action_group: "Airtime & Data",
                variants: [],
              },
            ],
          },
        ],
      },
    });
  });

  test("agent mode is normalized to the Business capability catalog", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = {
      user: makeUser(),
      query: {
        mode: "agent",
      },
    };

    const res = makeResponse();

    await userController.getMyQuickActionCatalog(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1]).toEqual(["business"]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        mode: "business",
        providers: [],
      },
    });
  });

  test("invalid catalog mode is rejected before database work", async () => {
    const req = {
      user: makeUser(),
      query: {
        mode: "unknown",
      },
    };

    const res = makeResponse();

    await userController.getMyQuickActionCatalog(req, res);

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "mode must be business, agent, or personal",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("Quick Action preferences accept a newly registered provider", async () => {
    mockGetRegisteredProviders.mockResolvedValue([
      "mtn",
      "telecel",
      "at_money",
      "future_money",
    ]);

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          agent_quick_actions: {
            future_money: [
              {
                action_key: "cash_in",
                position: 0,
                is_visible: true,
              },
            ],
          },
          personal_quick_actions: {},
        },
      ],
    });

    const req = {
      user: makeUser(),
      body: {
        agent_quick_actions: {
          future_money: [
            {
              action_key: "cash_in",
              position: 0,
              is_visible: true,
            },
          ],
        },
      },
      ip: "127.0.0.1",
      requestId: "quick-action-test",
    };

    const res = makeResponse();

    await userController.updateMyQuickActions(req, res);

    expect(mockGetRegisteredProviders).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);

    expect(res.status).not.toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        agent: {
          future_money: [
            {
              action_key: "cash_in",
              position: 0,
              is_visible: true,
            },
          ],
        },
        personal: {},
        subscriber: {},
        evd: {},
        merchant: {},
      },
    });
  });

  test("Quick Action preferences reject an unregistered provider before update", async () => {
    mockGetRegisteredProviders.mockResolvedValue([
      "mtn",
      "telecel",
      "at_money",
    ]);

    const req = {
      user: makeUser(),
      body: {
        agent_quick_actions: {
          invented_money: [
            {
              action_key: "cash_in",
              position: 0,
              is_visible: true,
            },
          ],
        },
      },
      ip: "127.0.0.1",
      requestId: "quick-action-test-invalid",
    };

    const res = makeResponse();

    await userController.updateMyQuickActions(req, res);

    expect(mockGetRegisteredProviders).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid provider in agent_quick_actions: invented_money",
    });

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  test("Business catalog uses MTN Cash In and Pay to Agent terminology", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          provider: "mtn",
          transaction_type: "send_money",
          display_label: "Send Money",
          bundle_category: null,
          recipient_mode: null,
        },
        {
          provider: "mtn",
          transaction_type: "bill_payment",
          display_label: "Bill Payment",
          bundle_category: null,
          recipient_mode: null,
        },
      ],
    });

    const req = {
      user: makeUser(),
      query: {
        mode: "business",
      },
    };

    const res = makeResponse();

    await userController.getMyQuickActionCatalog(req, res);

    expect(res.status).not.toHaveBeenCalled();

    const payload = res.json.mock.calls[0][0];
    const actions = payload.data.providers[0].actions;

    expect(
      actions.map((action) => ({
        type: action.transaction_type,
        label: action.display_label,
      })),
    ).toEqual([
      {
        type: "send_money",
        label: "Cash In",
      },
      {
        type: "bill_payment",
        label: "Pay to Agent",
      },
    ]);
  });

  test("MTN catalog moves send_money into the legacy cash_in position and removes duplicate cash_in", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          provider: "mtn",
          transaction_type: "cash_in",
          display_label: "Cash In",
          bundle_category: null,
          recipient_mode: null,
        },
        {
          provider: "mtn",
          transaction_type: "airtime",
          display_label: "Airtime",
          bundle_category: null,
          recipient_mode: null,
        },
        {
          provider: "mtn",
          transaction_type: "send_money",
          display_label: "Send Money",
          bundle_category: null,
          recipient_mode: null,
        },
      ],
    });

    const req = {
      user: makeUser(),
      query: {
        mode: "business",
      },
    };

    const res = makeResponse();

    await userController.getMyQuickActionCatalog(req, res);

    const actions = res.json.mock.calls[0][0].data.providers[0].actions;

    expect(actions.map((action) => action.transaction_type)).toEqual([
      "send_money",
      "airtime",
    ]);

    expect(actions[0].display_label).toBe("Cash In");

    expect(
      actions.some((action) => action.transaction_type === "cash_in"),
    ).toBe(false);
  });
});
