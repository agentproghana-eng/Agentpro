jest.mock("../../src/config/database", () => ({
  query: jest.fn()
}));

const mockSend = jest.fn();

jest.mock("../../src/config/firebase", () => ({
  getMessaging: jest.fn(() => ({
    send: mockSend
  }))
}));

const {
  query
} = require("../../src/config/database");

const {
  sendLowFloatAlert
} = require("../../src/services/notificationService");

describe("low float notification recipient scope", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockSend.mockImplementation(async (message) => {
      return `fcm-${message.token}`;
    });

    query.mockImplementation(async (sql, params) => {
      const text = String(sql);

      if (
        text.includes("SELECT DISTINCT u.id") &&
        text.includes("FROM users u")
      ) {
        return {
          rows: [
            { id: "owner-1" },
            { id: "manager-1" }
          ]
        };
      }

      if (
        text.includes("SELECT name FROM branches")
      ) {
        return {
          rows: [
            { name: "Accra Central" }
          ]
        };
      }

      if (
        text.includes("SELECT fcm_token") &&
        text.includes("FROM users")
      ) {
        if (params[0] === "owner-1") {
          return {
            rows: [
              { fcm_token: "owner-token" }
            ]
          };
        }

        if (params[0] === "manager-1") {
          return {
            rows: [
              { fcm_token: "manager-token" }
            ]
          };
        }

        throw new Error(
          `Unexpected notification recipient: ${params[0]}`
        );
      }

      if (
        text.includes("INSERT INTO notifications")
      ) {
        return {
          rows: [
            {
              id:
                `notification-${params[0]}`
            }
          ]
        };
      }

      if (
        text.includes("UPDATE notifications")
      ) {
        return {
          rows: []
        };
      }

      throw new Error(
        `Unexpected SQL in low-float test:\n${text}`
      );
    });
  });

  test("targets company owners plus only managers assigned to the low-float branch", async () => {
    await sendLowFloatAlert(
      "branch-1",
      "mtn",
      125.50
    );

    const recipientQuery =
      query.mock.calls.find(([sql]) =>
        String(sql).includes(
          "SELECT DISTINCT u.id"
        )
      );

    expect(recipientQuery).toBeDefined();

    const [sql, params] = recipientQuery;

    expect(sql).toContain(
      "u.role = 'business_owner'"
    );

    expect(sql).toContain(
      "u.role = 'manager'"
    );

    expect(sql).toContain(
      "FROM branch_managers bm"
    );

    expect(sql).toContain(
      "bm.branch_id = $1"
    );

    expect(sql).toContain(
      "bm.manager_id = u.id"
    );

    expect(params).toEqual([
      "branch-1"
    ]);

    const tokenRecipients =
      query.mock.calls
        .filter(([statement]) => {
          const sql =
            String(statement);

          return (
            sql.includes(
              "SELECT fcm_token"
            ) &&
            sql.includes(
              "FROM users"
            )
          );
        })
        .map(([, tokenParams]) =>
          tokenParams[0]
        )
        .sort();

    expect(tokenRecipients).toEqual([
      "manager-1",
      "owner-1"
    ]);

    expect(mockSend).toHaveBeenCalledTimes(2);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "owner-token",
        notification: {
          title: "⚠️ Low Float Alert",
          body:
            "Accra Central MTN MoMo float is low: GH₵125.50"
        },
        data: expect.objectContaining({
          branch_id: "branch-1",
          provider: "mtn",
          balance: "125.5",
          type: "low_float"
        })
      })
    );

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "manager-token"
      })
    );
  });

  test("recipient SQL does not grant every company manager branch alerts", async () => {
    query.mockImplementationOnce(
      async () => ({
        rows: []
      })
    );

    query.mockImplementationOnce(
      async () => ({
        rows: [
          { name: "Accra Central" }
        ]
      })
    );

    await sendLowFloatAlert(
      "branch-1",
      "telecel",
      200
    );

    const [sql] = query.mock.calls[0];

    expect(sql).toContain(
      "FROM branch_managers bm"
    );

    expect(sql).not.toContain(
      "u.role IN ('business_owner', 'manager')"
    );

    expect(mockSend).not.toHaveBeenCalled();
  });
});
