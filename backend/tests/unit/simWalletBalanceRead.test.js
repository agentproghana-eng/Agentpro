const mockQuery = jest.fn();

const mockResolveSimRoleAssignment =
  jest.fn();

jest.mock(
  "../../src/config/database",
  () => ({
    query: (...args) =>
      mockQuery(...args),
    withTransaction: jest.fn(),
  }),
);

jest.mock(
  "../../src/services/simRoleTrustService",
  () => ({
    resolveSimRoleAssignment:
      (...args) =>
        mockResolveSimRoleAssignment(
          ...args
        ),
    verifyBusinessSimRoleAssignment:
      jest.fn(),
  }),
);

jest.mock(
  "../../src/utils/logger",
  () => ({
    logger: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  }),
);

const balanceController =
  require(
    "../../src/controllers/balanceController"
  );

function makeReq(query = {}) {
  return {
    user: {
      id: "agent-1",
      company_id: "company-1",
      role: "agent",
    },
    query,
  };
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);

  return res;
}

describe(
  "role-aware exact SIM wallet balance read",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockResolveSimRoleAssignment
        .mockResolvedValue({
          ok: true,
          role: "agent",
          sim_slot: 0,
        });
    });

    test(
      "returns Agent balance separately from legacy Agent money",
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id: "wallet-identified",
                sim_role: "agent",
                identity_status:
                  "identified",
                sim_iccid:
                  "8901000000000000001",
                installation_id: null,
                sim_subscription_id: 7,
                last_known_sim_slot: 0,
                working_balance:
                  "0.00",
                e_float_balance:
                  "120.00",
                commission_balance:
                  "25.00",
                last_updated_at:
                  "2026-08-09T12:00:00.000Z",
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id: "wallet-legacy",
                working_balance:
                  "0.00",
                e_float_balance:
                  "300.00",
                commission_balance:
                  "75.00",
                last_updated_at:
                  "2026-08-01T12:00:00.000Z",
              },
            ],
          });

        const req = makeReq({
          provider: "mtn",
          sim_iccid:
            "8901000000000000001",
          sim_slot: "0",
        });

        const res = makeRes();

        await balanceController
          .getOwnSimWalletBalance(
            req,
            res,
          );

        expect(
          mockResolveSimRoleAssignment
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "agent-1",
            provider: "mtn",
            simSlot: 0,
            simIccid:
              "8901000000000000001",
          }),
        );

        expect(
          mockQuery.mock.calls[0][0]
        ).toContain(
          "sim_role = $3"
        );

        expect(
          mockQuery.mock.calls[0][1]
        ).toEqual([
          "agent-1",
          "mtn",
          "agent",
          "8901000000000000001",
        ]);

        expect(
          mockQuery.mock.calls[1][0]
        ).toContain(
          "sim_role = 'agent'"
        );

        expect(
          res.json
        ).toHaveBeenCalledWith({
          success: true,
          data:
            expect.objectContaining({
              provider: "mtn",
              sim_role: "agent",
              balance_domain:
                "agent",
              exact_wallet_exists:
                true,
              sim_wallet_id:
                "wallet-identified",
              e_float_balance:
                "120.00",
              commission_balance:
                "25.00",
              balances:
                expect.arrayContaining([
                  expect.objectContaining({
                    balance_code:
                      "e_float_balance",
                    display_label:
                      "e-Float",
                    current_balance:
                      "120.00",
                  }),
                  expect.objectContaining({
                    balance_code:
                      "commission_balance",
                    current_balance:
                      "25.00",
                  }),
                ]),
              reconciliation_required:
                true,
              legacy_unassigned:
                expect.objectContaining({
                  sim_wallet_id:
                    "wallet-legacy",
                }),
            }),
        });
      },
    );

    test(
      "reads exact unresolved Agent wallet with role in identity",
      async () => {
        mockResolveSimRoleAssignment
          .mockResolvedValueOnce({
            ok: true,
            role: "agent",
            sim_slot: 1,
          });

        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  "wallet-unresolved",
                sim_role: "agent",
                identity_status:
                  "unresolved",
                sim_iccid: null,
                installation_id:
                  "11111111-1111-4111-8111-111111111111",
                sim_subscription_id:
                  9,
                last_known_sim_slot:
                  1,
                working_balance:
                  "20.00",
                e_float_balance:
                  "44.00",
                commission_balance:
                  "12.00",
                last_updated_at:
                  null,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        const req = makeReq({
          provider: "telecel",
          sim_slot: "1",
          installation_id:
            "11111111-1111-4111-8111-111111111111",
          sim_subscription_id:
            "9",
        });

        const res = makeRes();

        await balanceController
          .getOwnSimWalletBalance(
            req,
            res,
          );

        expect(
          mockQuery.mock.calls[0][0]
        ).toContain(
          "sim_role = $3"
        );

        expect(
          mockQuery.mock.calls[0][1]
        ).toEqual([
          "agent-1",
          "telecel",
          "agent",
          "11111111-1111-4111-8111-111111111111",
          9,
          1,
        ]);

        expect(
          res.json
        ).toHaveBeenCalledWith({
          success: true,
          data:
            expect.objectContaining({
              sim_role: "agent",
              requested_identity_status:
                "unresolved",
              e_float_balance:
                "44.00",
              commission_balance:
                "12.00",
              reconciliation_required:
                false,
            }),
        });
      },
    );

    test(
      "Merchant never receives Agent balance fields or legacy Agent money",
      async () => {
        mockResolveSimRoleAssignment
          .mockResolvedValueOnce({
            ok: true,
            role: "merchant",
            sim_slot: 0,
          });

        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  "wallet-merchant",
                sim_role:
                  "merchant",
                identity_status:
                  "identified",
                sim_iccid:
                  "MERCHANT-SIM",
                installation_id:
                  null,
                sim_subscription_id:
                  4,
                last_known_sim_slot:
                  0,
                working_balance:
                  "0.00",
                e_float_balance:
                  "0.00",
                commission_balance:
                  "0.00",
                last_updated_at:
                  null,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        const res = makeRes();

        await balanceController
          .getOwnSimWalletBalance(
            makeReq({
              provider: "mtn",
              sim_iccid:
                "MERCHANT-SIM",
              sim_slot: "0",
            }),
            res,
          );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(2);

        expect(
          mockQuery.mock.calls[0][1]
        ).toEqual([
          "agent-1",
          "mtn",
          "merchant",
          "MERCHANT-SIM",
        ]);

        expect(
          mockQuery.mock.calls[1][0]
        ).toContain(
          "sim_wallet_balance_definitions"
        );

        const payload =
          res.json.mock.calls[0][0]
            .data;

        expect(
          payload.sim_role
        ).toBe("merchant");

        expect(
          payload.balance_domain
        ).toBe("merchant");

        expect(
          payload.balances
        ).toEqual([]);

        expect(
          payload.balance_semantics_validated
        ).toBe(false);

        expect(
          payload.legacy_unassigned
        ).toBeNull();

        expect(
          Object.prototype.hasOwnProperty.call(
            payload,
            "e_float_balance",
          )
        ).toBe(false);

        expect(
          Object.prototype.hasOwnProperty.call(
            payload,
            "commission_balance",
          )
        ).toBe(false);

        expect(
          Object.prototype.hasOwnProperty.call(
            payload,
            "working_balance",
          )
        ).toBe(false);
      },
    );

    test(
      "validated non-Agent balance definitions are returned only from generic accounts",
      async () => {
        mockResolveSimRoleAssignment
          .mockResolvedValueOnce({
            ok: true,
            role: "evd",
            sim_slot: 1,
          });

        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id: "wallet-evd",
                sim_role: "evd",
                identity_status:
                  "identified",
                sim_iccid:
                  "EVD-SIM",
                installation_id:
                  null,
                sim_subscription_id:
                  8,
                last_known_sim_slot:
                  1,
                last_updated_at:
                  null,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                balance_code:
                  "airtime_stock",
                display_label:
                  "Airtime Stock",
                current_balance:
                  "700.00",
                last_updated_at:
                  "2026-08-25T00:00:00.000Z",
              },
            ],
          });

        const res = makeRes();

        await balanceController
          .getOwnSimWalletBalance(
            makeReq({
              provider: "mtn",
              sim_iccid:
                "EVD-SIM",
              sim_slot: "1",
            }),
            res,
          );

        expect(
          res.json
        ).toHaveBeenCalledWith({
          success: true,
          data:
            expect.objectContaining({
              sim_role: "evd",
              balance_domain:
                "evd",
              balances: [
                expect.objectContaining({
                  balance_code:
                    "airtime_stock",
                  display_label:
                    "Airtime Stock",
                  current_balance:
                    "700.00",
                }),
              ],
              balance_semantics_validated:
                true,
              legacy_unassigned:
                null,
              reconciliation_required:
                false,
            }),
        });
      },
    );

    test(
      "Subscriber domain is separate even when no wallet exists yet",
      async () => {
        mockResolveSimRoleAssignment
          .mockResolvedValueOnce({
            ok: true,
            role: "subscriber",
            sim_slot: 0,
          });

        mockQuery
          .mockResolvedValueOnce({
            rows: [],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        const res = makeRes();

        await balanceController
          .getOwnSimWalletBalance(
            makeReq({
              provider: "telecel",
              sim_iccid:
                "SUBSCRIBER-SIM",
              sim_slot: "0",
            }),
            res,
          );

        expect(
          res.json
        ).toHaveBeenCalledWith({
          success: true,
          data:
            expect.objectContaining({
              sim_role:
                "subscriber",
              balance_domain:
                "subscriber",
              exact_wallet_exists:
                false,
              balances: [],
              balance_semantics_validated:
                false,
              legacy_unassigned:
                null,
            }),
        });
      },
    );

    test(
      "fails closed when physical SIM role cannot be verified",
      async () => {
        mockResolveSimRoleAssignment
          .mockResolvedValueOnce({
            ok: false,
            status: 409,
            code:
              "SIM_ROLE_ASSIGNMENT_REQUIRED",
            message:
              "No verified role.",
          });

        const res = makeRes();

        await balanceController
          .getOwnSimWalletBalance(
            makeReq({
              provider: "mtn",
              sim_iccid:
                "UNKNOWN-SIM",
              sim_slot: "0",
            }),
            res,
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          409
        );

        expect(
          res.json
        ).toHaveBeenCalledWith({
          success: false,
          code:
            "SIM_ROLE_ASSIGNMENT_REQUIRED",
          message:
            "No verified role.",
        });

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(0);
      },
    );

    test(
      "refuses provider plus slot as unresolved identity before role lookup",
      async () => {
        const res = makeRes();

        await balanceController
          .getOwnSimWalletBalance(
            makeReq({
              provider: "mtn",
              sim_slot: "0",
            }),
            res,
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          422
        );

        expect(
          mockResolveSimRoleAssignment
        ).toHaveBeenCalledTimes(0);

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(0);
      },
    );
  },
);
