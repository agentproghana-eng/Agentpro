jest.mock(
  "../../src/services/telecelMerchantWalletService",
  () => ({
    getOrCreateTelecelMerchantWallet: jest.fn(),
  }),
);

const {
  getOrCreateTelecelMerchantWallet,
} = require(
  "../../src/services/telecelMerchantWalletService",
);

const {
  postTelecelMerchantOutgoing,
} = require(
  "../../src/services/telecelMerchantOutgoingPostingService",
);

const TYPES = [
  "airtime",
  "data_bundle",
  "send_money_same_network",
  "send_money_cross_network",
  "send_money_to_bank",
];

function transaction(type, overrides = {}) {
  return {
    id: `tx-${type}`,
    provider: "telecel",
    sim_role: "merchant",
    transaction_type: type,
    amount: "10.00",
    fee: "99.00",
    sim_iccid: "ICCID-MERCHANT",
    installation_id: "installation-1",
    sim_subscription_id: 2,
    sim_slot: 1,
    ...overrides,
  };
}

function setupWallet({
  working = "50.00",
  state = "known",
  provenance = true,
} = {}) {
  getOrCreateTelecelMerchantWallet.mockResolvedValue({
    simWallet: {
      id: "wallet-1",
      provider: "telecel",
      sim_role: "merchant",
    },
    merchantAccount: {
      id: "merchant-1",
      balance_code: "merchant_account",
      balance_state: "known",
      current_balance: "25.00",
    },
    workingAccount: {
      id: "working-1",
      balance_code: "working_account",
      balance_state: state,
      current_balance: working,
      balance_source:
        provenance ? "telecel_balance_sms" : null,
      balance_observed_at:
        provenance ? new Date() : null,
      balance_initialized_at:
        provenance ? new Date() : null,
    },
  });
}

function createClient(opening = 50) {
  let working = opening;
  const movements = [];

  const client = {
    query: jest.fn(async (sql, params = []) => {
      if (
        sql.includes(
          "UPDATE sim_wallet_balance_accounts",
        )
      ) {
        const amount = Number(params[0]);

        if (working - amount < 0) {
          return { rows: [] };
        }

        working -= amount;

        return {
          rows: [
            {
              id: "working-1",
              balance_code: "working_account",
              current_balance: working.toFixed(2),
            },
          ],
        };
      }

      if (
        sql.includes(
          "INSERT INTO sim_wallet_balance_movements",
        )
      ) {
        movements.push(params);
        return { rows: [] };
      }

      if (sql.includes("UPDATE transactions")) {
        return { rows: [{ id: params[1] }] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };

  return {
    client,
    movements,
    getWorking: () => working,
  };
}

describe(
  "Telecel Merchant outgoing posting",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test.each(TYPES)(
      "%s debits Working Account principal only",
      async (type) => {
        setupWallet();

        const state = createClient(50);

        await postTelecelMerchantOutgoing(
          state.client,
          transaction(type),
          "agent-1",
        );

        expect(state.getWorking()).toBe(40);

        expect(state.movements).toHaveLength(1);

        expect(state.movements[0]).toEqual([
          "working-1",
          `tx-${type}`,
          "merchant_outgoing_payment",
          -10,
          "40.00",
        ]);
      },
    );

    test(
      "pre-USSD fee metadata does not increase debit",
      async () => {
        setupWallet();

        const state = createClient(50);

        await postTelecelMerchantOutgoing(
          state.client,
          transaction(
            "send_money_cross_network",
            {
              amount: "10.00",
              fee: "25.00",
            },
          ),
          "agent-1",
        );

        expect(state.getWorking()).toBe(40);
        expect(state.movements[0][3]).toBe(-10);
      },
    );

    test(
      "unknown Working Account fails before mutation",
      async () => {
        setupWallet({
          state: "unknown",
          provenance: false,
        });

        const client = {
          query: jest.fn(),
        };

        await expect(
          postTelecelMerchantOutgoing(
            client,
            transaction(
              "send_money_same_network",
            ),
            "agent-1",
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "MERCHANT_WORKING_BALANCE_INITIALIZATION_REQUIRED",
        });

        expect(client.query).not.toHaveBeenCalled();
      },
    );

    test(
      "known balance without observation provenance fails closed",
      async () => {
        setupWallet({
          state: "known",
          provenance: false,
        });

        const client = {
          query: jest.fn(),
        };

        await expect(
          postTelecelMerchantOutgoing(
            client,
            transaction("send_money_to_bank"),
            "agent-1",
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code:
            "MERCHANT_WORKING_BALANCE_INITIALIZATION_REQUIRED",
        });

        expect(client.query).not.toHaveBeenCalled();
      },
    );

    test(
      "insufficient Working Account fails without ledger movement",
      async () => {
        setupWallet({
          working: "5.00",
        });

        const state = createClient(5);

        await expect(
          postTelecelMerchantOutgoing(
            state.client,
            transaction(
              "send_money_cross_network",
            ),
            "agent-1",
          ),
        ).rejects.toMatchObject({
          statusCode: 422,
          code: "INSUFFICIENT_MERCHANT_BALANCE",
        });

        expect(state.getWorking()).toBe(5);
        expect(state.movements).toHaveLength(0);
      },
    );

    test(
      "does not mutate Merchant Account, physical cash, Agent e-Float or commission",
      () => {
        const fs = require("fs");
        const path = require("path");

        const source = fs.readFileSync(
          path.join(
            __dirname,
            "../../src/services/telecelMerchantOutgoingPostingService.js",
          ),
          "utf8",
        );

        expect(source).not.toContain(
          "agent_cash_balances",
        );
        expect(source).not.toContain("cash_at_hand");
        expect(source).not.toContain(
          "agent_balance_movements",
        );
        expect(source).not.toContain(
          "e_float_balance",
        );
        expect(source).not.toContain(
          "commission_balance",
        );

        expect(source).not.toMatch(
          /balance_code\s*=\s*['"]merchant_account['"]/,
        );
      },
    );

    test(
      "rejects Agent role before wallet resolution",
      async () => {
        const tx = transaction(
          "send_money_same_network",
          { sim_role: "agent" },
        );

        await expect(
          postTelecelMerchantOutgoing(
            { query: jest.fn() },
            tx,
            "agent-1",
          ),
        ).rejects.toMatchObject({
          code: "MERCHANT_ACCOUNTING_ROLE_INVALID",
        });

        expect(
          getOrCreateTelecelMerchantWallet,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "rejects unsupported Merchant transaction type",
      async () => {
        await expect(
          postTelecelMerchantOutgoing(
            { query: jest.fn() },
            transaction("send_money"),
            "agent-1",
          ),
        ).rejects.toMatchObject({
          code: "MERCHANT_ACCOUNTING_TYPE_INVALID",
        });
      },
    );
  },
);
