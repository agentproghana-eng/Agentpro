const request = require("supertest");
const express = require("express");

jest.mock("../../src/middleware/auth", () => {
  const actual = jest.requireActual("../../src/middleware/auth");

  return {
    ...actual,

    authenticate: (req, _res, next) => {
      req.user = {
        id: "operator-1",
        company_id: "company-1",
        role: req.get("x-test-role") || "agent",
      };

      next();
    },
  };
});

jest.mock("../../src/controllers/balanceController", () => ({
  listPendingAdjustments: (_req, res) => res.status(204).end(),

  getOwnCashBalance: (_req, res) => res.status(204).end(),

  getOwnSimWalletBalance: (_req, res) => res.status(204).end(),

  recordCashOutManual: (_req, res) => res.status(204).end(),

  recordFloatReceived: (_req, res) => res.status(204).end(),

  submitCashAdjustment: (_req, res) => res.status(204).end(),

  reviewCashAdjustment: (_req, res) => res.status(204).end(),
}));

const balanceRouter = require("../../src/routes/balance.routes");

function makeApp() {
  const app = express();

  app.use(express.json());
  app.use("/balances", balanceRouter);

  return app;
}

const floatPayload = {
  provider: "mtn",
  amount: 100,
  client_operation_id: "9a38a665-7b23-4bc4-9338-b8f50bca7d03",
  sim_iccid: "ICCID-001",
  sim_slot: 0,
};

const cashOutPayload = {
  provider: "telecel",
  amount: 100,
  client_operation_id: "36a60fd7-09d5-4ae3-8c92-a9fe40effd17",
  sim_iccid: "ICCID-002",
  sim_slot: 1,
};

describe("Agent balance operator authorization", () => {
  const app = makeApp();

  test.each(["agent", "manager", "business_owner"])(
    "%s can declare own Agent SIM float",
    async (role) => {
      const response = await request(app)
        .post("/balances/float-received")
        .set("x-test-role", role)
        .send(floatPayload);

      expect(response.status).toBe(204);
    },
  );

  test.each(["agent", "manager", "business_owner"])(
    "%s can record own Agent SIM manual Cash Out",
    async (role) => {
      const response = await request(app)
        .post("/balances/cash-out-manual")
        .set("x-test-role", role)
        .send(cashOutPayload);

      expect(response.status).toBe(204);
    },
  );

  test.each([
    ["/balances/float-received", floatPayload],
    ["/balances/cash-out-manual", cashOutPayload],
  ])(
    "auditor cannot perform own Agent balance write at %s",
    async (path, payload) => {
      const response = await request(app)
        .post(path)
        .set("x-test-role", "auditor")
        .send(payload);

      expect(response.status).toBe(403);
    },
  );
  test.each([
    "agent",
    "manager",
    "business_owner",
  ])(
    "%s can adjust own cash drawer",
    async (role) => {
      const response = await request(app)
        .post("/balances/cash-adjustment")
        .set("x-test-role", role)
        .send({
          adjustment_type: "cash_set",
          amount: 100,
          reason: "Own drawer adjustment",
        });

      expect(response.status).toBe(204);
    },
  );

  test(
    "auditor cannot adjust a cash drawer",
    async () => {
      const response = await request(app)
        .post("/balances/cash-adjustment")
        .set("x-test-role", "auditor")
        .send({
          adjustment_type: "cash_set",
          amount: 100,
          reason: "Blocked adjustment",
        });

      expect(response.status).toBe(403);
    },
  );

});
