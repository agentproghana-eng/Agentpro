jest.mock("../../src/config/database", () => ({
  query: jest.fn(),
  withTransaction: jest.fn()
}));

jest.mock("../../src/services/auditService", () => ({
  auditLog: jest.fn()
}));

jest.mock("../../src/services/notificationService", () => ({
  sendLowFloatAlert: jest.fn()
}));

const {
  query,
  withTransaction
} = require("../../src/config/database");

const {
  auditLog
} = require("../../src/services/auditService");

const floatController =
  require("../../src/controllers/floatController");

const branchController =
  require("../../src/controllers/branchController");

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe("business branch float security", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("superuser float overview requires explicit company_id", async () => {
    const req = {
      user: {
        id: "super-1",
        role: "superuser",
        company_id: null
      },
      query: {}
    };

    const res = makeResponse();

    await floatController.getFloatOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "company_id is required"
    });

    expect(query).not.toHaveBeenCalled();
  });

  test("manager cannot top up a branch they do not manage", async () => {
    query.mockResolvedValueOnce({
      rows: []
    });

    const req = {
      user: {
        id: "manager-1",
        role: "manager",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-other",
        provider: "mtn",
        amount: 100,
        client_operation_id: "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
      }
    };

    const res = makeResponse();

    await floatController.topUpFloat(req, res);

    expect(res.status).toHaveBeenCalledWith(403);

    expect(withTransaction).not.toHaveBeenCalled();

    const [sql, params] = query.mock.calls[0];

    expect(sql).toContain("FROM branch_managers bm");
    expect(sql).toContain("bm.manager_id");

    expect(params).toEqual([
      "branch-other",
      "company-1",
      "manager-1"
    ]);
  });

  test("authorized top up uses PostgreSQL decimal arithmetic and records idempotency key", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "branch-1",
          company_id: "company-1",
          name: "Accra"
        }
      ]
    });

    const client = {
      query: jest.fn()
    };

    client.query
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "float-1",
            branch_id: "branch-1",
            provider: "mtn",
            current_balance: "500.00"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "float-1",
            branch_id: "branch-1",
            provider: "mtn",
            current_balance: "600.00"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    withTransaction.mockImplementation(
      async (callback) => callback(client)
    );

    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        amount: 100,
        reference: "TOP-001",
        notes: "Treasury refill",
        client_operation_id: "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
      },
      ip: "127.0.0.1",
      requestId: "req-1"
    };

    const res = makeResponse();

    await floatController.topUpFloat(
      req,
      res
    );

    expect(withTransaction)
      .toHaveBeenCalledTimes(1);

    const lockSql =
      client.query.mock.calls[1][0];

    expect(lockSql).toContain(
      "FROM float_accounts"
    );

    expect(lockSql).toContain(
      "FOR UPDATE"
    );

    const replayLookupSql =
      client.query.mock.calls[2][0];

    expect(replayLookupSql).toContain(
      "client_operation_id"
    );

    const updateSql =
      client.query.mock.calls[3][0];

    expect(updateSql).toContain(
      "current_balance + $1::numeric"
    );

    expect(
      client.query.mock.calls[3][1]
    ).toEqual([
      "100.00",
      "float-1"
    ]);

    const movementSql =
      client.query.mock.calls[4][0];

    expect(movementSql).toContain(
      "INSERT INTO float_movements"
    );

    expect(movementSql).toContain(
      "client_operation_id"
    );

    expect(
      client.query.mock.calls[4][1]
    ).toEqual([
      "float-1",
      "100.00",
      "500.00",
      "600.00",
      "TOP-001",
      "Treasury refill",
      "owner-1",
      "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
    ]);

    expect(auditLog)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "owner-1",
          companyId: "company-1",
          action: "FLOAT_TOP_UP",
          entityType: "float_account",
          entityId: "float-1"
        })
      );

    expect(res.json)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message:
            "Float topped up successfully",
          idempotent_replay: false
        })
      );
  });

  test("top up rejects invalid money before database access", async () => {
    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        amount: -5
      }
    };

    const res = makeResponse();

    await floatController.topUpFloat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(query).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  test("top up rejects money with more than two decimal places", async () => {
    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        amount: 100.001,
        client_operation_id:
          "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
      }
    };

    const res = makeResponse();

    await floatController.topUpFloat(
      req,
      res
    );

    expect(res.status)
      .toHaveBeenCalledWith(400);

    expect(query).not.toHaveBeenCalled();
    expect(withTransaction)
      .not.toHaveBeenCalled();
  });

  test("top up requires a valid client operation UUID before database access", async () => {
    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        amount: 100,
        client_operation_id: "not-a-uuid"
      }
    };

    const res = makeResponse();

    await floatController.topUpFloat(
      req,
      res
    );

    expect(res.status)
      .toHaveBeenCalledWith(400);

    expect(query).not.toHaveBeenCalled();
    expect(withTransaction)
      .not.toHaveBeenCalled();
  });

  test.each([
    null,
    true,
    false,
    "",
    "   "
  ])("top up rejects coercive money input %p", async (badAmount) => {
    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        amount: badAmount,
        client_operation_id:
          "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
      }
    };

    const res = makeResponse();

    await floatController.topUpFloat(
      req,
      res
    );

    expect(res.status)
      .toHaveBeenCalledWith(400);

    expect(query).not.toHaveBeenCalled();
    expect(withTransaction)
      .not.toHaveBeenCalled();
  });

  test("same top up operation replays without changing balance again", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "branch-1",
          company_id: "company-1",
          name: "Accra"
        }
      ]
    });

    const client = {
      query: jest.fn()
    };

    client.query
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "float-1",
            branch_id: "branch-1",
            provider: "mtn",
            current_balance: "600.00"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "float-1",
            branch_id: "branch-1",
            provider: "mtn",
            current_balance: "600.00",
            movement_id: "movement-1",
            movement_type: "top_up",
            movement_amount: "100.00",
            movement_reference: "TOP-001",
            movement_notes: "Treasury refill",
            client_operation_id:
              "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
          }
        ]
      });

    withTransaction.mockImplementation(
      async (callback) => callback(client)
    );

    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        amount: 100,
        reference: "TOP-001",
        notes: "Treasury refill",
        client_operation_id:
          "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
      }
    };

    const res = makeResponse();

    await floatController.topUpFloat(
      req,
      res
    );

    expect(client.query)
      .toHaveBeenCalledTimes(3);

    expect(
      client.query.mock.calls.some(
        ([sql]) =>
          String(sql).includes(
            "UPDATE float_accounts"
          )
      )
    ).toBe(false);

    expect(
      client.query.mock.calls.some(
        ([sql]) =>
          String(sql).includes(
            "INSERT INTO float_movements"
          )
      )
    ).toBe(false);

    expect(auditLog)
      .not.toHaveBeenCalled();

    expect(res.json)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          idempotent_replay: true
        })
      );
  });

  test("reusing top up operation ID with different payload is rejected", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "branch-1",
          company_id: "company-1",
          name: "Accra"
        }
      ]
    });

    const client = {
      query: jest.fn()
    };

    client.query
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "float-1",
            branch_id: "branch-1",
            provider: "mtn",
            current_balance: "600.00"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "float-1",
            branch_id: "branch-1",
            provider: "mtn",
            current_balance: "600.00",
            movement_id: "movement-1",
            movement_type: "top_up",
            movement_amount: "50.00",
            movement_reference: "TOP-001",
            movement_notes: "Treasury refill",
            client_operation_id:
              "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
          }
        ]
      });

    withTransaction.mockImplementation(
      async (callback) => callback(client)
    );

    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        amount: 100,
        reference: "TOP-001",
        notes: "Treasury refill",
        client_operation_id:
          "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
      }
    };

    const res = makeResponse();

    await floatController.topUpFloat(
      req,
      res
    );

    expect(res.status)
      .toHaveBeenCalledWith(409);

    expect(res.json)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code:
            "CLIENT_OPERATION_CONFLICT"
        })
      );

    expect(
      client.query.mock.calls.some(
        ([sql]) =>
          String(sql).includes(
            "UPDATE float_accounts"
          )
      )
    ).toBe(false);
  });

  test("concurrent top up retry resolves committed winner after unique conflict", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "branch-1",
            company_id: "company-1",
            name: "Accra"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "float-1",
            branch_id: "branch-1",
            provider: "mtn",
            current_balance: "600.00",
            movement_id: "movement-1",
            movement_type: "top_up",
            movement_amount: "100.00",
            movement_reference: "TOP-001",
            movement_notes: "Treasury refill",
            client_operation_id:
              "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
          }
        ]
      });

    const duplicate = new Error(
      "duplicate key"
    );

    duplicate.code = "23505";
    duplicate.constraint =
      "idx_float_movements_performer_client_operation";

    withTransaction
      .mockRejectedValueOnce(duplicate);

    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        amount: 100,
        reference: "TOP-001",
        notes: "Treasury refill",
        client_operation_id:
          "8e42a5ce-21de-4ba9-8aca-6d308cf88e11"
      }
    };

    const res = makeResponse();

    await floatController.topUpFloat(
      req,
      res
    );

    expect(res.json)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          idempotent_replay: true
        })
      );

    expect(auditLog)
      .not.toHaveBeenCalled();
  });

  test("manager cannot change threshold for an unmanaged branch", async () => {
    query.mockResolvedValueOnce({
      rows: []
    });

    const req = {
      user: {
        id: "manager-1",
        role: "manager",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-other",
        provider: "telecel",
        threshold: 250
      }
    };

    const res = makeResponse();

    await floatController.updateThreshold(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes(
          "UPDATE float_accounts"
        )
      )
    ).toBe(false);
  });

  test("threshold cannot be negative", async () => {
    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        threshold: -1
      }
    };

    const res = makeResponse();

    await floatController.updateThreshold(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(query).not.toHaveBeenCalled();
  });

  test("agent float request list is restricted to own assigned branches", async () => {
    query
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [
          {
            count: "0"
          }
        ]
      });

    const req = {
      user: {
        id: "agent-1",
        role: "agent",
        company_id: "company-1"
      },
      query: {
        status: "pending"
      }
    };

    const res = makeResponse();

    await floatController.listFloatRequests(
      req,
      res
    );

    expect(query).toHaveBeenCalledTimes(2);

    for (const [sql, params] of query.mock.calls) {
      expect(String(sql)).toContain(
        "b.company_id"
      );

      expect(String(sql)).toContain(
        "fr.requested_by"
      );

      expect(String(sql)).toContain(
        "FROM agent_branches ab"
      );

      expect(params).toContain(
        "company-1"
      );

      expect(params).toContain(
        "agent-1"
      );

      expect(params).toContain(
        "pending"
      );
    }
  });

  test("manager float request list is restricted to managed branches", async () => {
    query
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [
          {
            count: "0"
          }
        ]
      });

    const req = {
      user: {
        id: "manager-1",
        role: "manager",
        company_id: "company-1"
      },
      query: {}
    };

    const res = makeResponse();

    await floatController.listFloatRequests(
      req,
      res
    );

    expect(query).toHaveBeenCalledTimes(2);

    for (const [sql, params] of query.mock.calls) {
      expect(String(sql)).toContain(
        "FROM branch_managers bm"
      );

      expect(params).toContain(
        "company-1"
      );

      expect(params).toContain(
        "manager-1"
      );
    }
  });

  test("business owner float request list is scoped to own company", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "request-1",
            branch_id: "branch-1",
            branch_name: "Accra",
            requested_by: "agent-1",
            requested_by_name: "Ama Mensah",
            provider: "mtn",
            amount_requested: "500.00",
            status: "pending"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            count: "1"
          }
        ]
      });

    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      query: {
        status: "pending"
      }
    };

    const res = makeResponse();

    await floatController.listFloatRequests(
      req,
      res
    );

    expect(query).toHaveBeenCalledTimes(2);

    for (const [sql, params] of query.mock.calls) {
      expect(String(sql)).toContain(
        "b.company_id"
      );

      expect(params).toContain(
        "company-1"
      );

      expect(params).toContain(
        "pending"
      );

      expect(String(sql)).not.toContain(
        "FROM branch_managers bm"
      );

      expect(String(sql)).not.toContain(
        "FROM agent_branches ab"
      );
    }

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: "request-1",
            branch_name: "Accra",
            requested_by_name: "Ama Mensah"
          })
        ]),
        meta: expect.objectContaining({
          total: 1,
          page: 1,
          limit: 30,
          total_pages: 1
        })
      })
    );
  });

  test("float request list rejects unknown status", async () => {
    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      query: {
        status: "completed"
      }
    };

    const res = makeResponse();

    await floatController.listFloatRequests(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(query).not.toHaveBeenCalled();
  });

  test("agent cannot submit a float request for an unassigned branch", async () => {
    query.mockResolvedValueOnce({
      rows: []
    });

    const req = {
      user: {
        id: "agent-1",
        role: "agent",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-other",
        provider: "at_money",
        amount_requested: 500,
        reason: "Low treasury float"
      }
    };

    const res = makeResponse();

    await floatController.submitFloatRequest(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);

    const [sql, params] = query.mock.calls[0];

    expect(sql).toContain(
      "FROM agent_branches ab"
    );

    expect(params).toEqual([
      "branch-other",
      "company-1",
      "agent-1"
    ]);

    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes(
          "INSERT INTO float_requests"
        )
      )
    ).toBe(false);
  });

  test("assigned agent can submit float request", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "branch-1",
            company_id: "company-1",
            name: "Accra"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "request-1",
            branch_id: "branch-1",
            requested_by: "agent-1",
            provider: "mtn",
            amount_requested: "400.00",
            status: "pending"
          }
        ]
      });

    const req = {
      user: {
        id: "agent-1",
        role: "agent",
        company_id: "company-1"
      },
      body: {
        branch_id: "branch-1",
        provider: "mtn",
        amount_requested: 400,
        reason: "Need treasury float"
      }
    };

    const res = makeResponse();

    await floatController.submitFloatRequest(
      req,
      res
    );

    expect(query.mock.calls[1][0]).toContain(
      "INSERT INTO float_requests"
    );

    expect(query.mock.calls[1][1]).toEqual([
      "branch-1",
      "agent-1",
      "mtn",
      400,
      "Need treasury float"
    ]);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("manager cannot review request outside managed branches", async () => {
    query.mockResolvedValueOnce({
      rows: []
    });

    const req = {
      user: {
        id: "manager-1",
        role: "manager",
        company_id: "company-1"
      },
      params: {
        request_id: "request-other"
      },
      body: {
        status: "approved",
        review_notes: "Approved"
      }
    };

    const res = makeResponse();

    await floatController.reviewFloatRequest(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);

    const [sql, params] = query.mock.calls[0];

    expect(sql).toContain(
      "FROM branch_managers bm"
    );

    expect(params).toEqual([
      "request-other",
      "company-1",
      "manager-1"
    ]);

    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes(
          "UPDATE float_requests"
        )
      )
    ).toBe(false);
  });

  test("review accepts only approved or rejected states", async () => {
    const req = {
      user: {
        id: "manager-1",
        role: "manager",
        company_id: "company-1"
      },
      params: {
        request_id: "request-1"
      },
      body: {
        status: "completed"
      }
    };

    const res = makeResponse();

    await floatController.reviewFloatRequest(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(query).not.toHaveBeenCalled();
  });

  test("manager float history is restricted to managed branches", async () => {
    query
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [
          {
            count: "0"
          }
        ]
      });

    const req = {
      user: {
        id: "manager-1",
        role: "manager",
        company_id: "company-1"
      },
      query: {}
    };

    const res = makeResponse();

    await floatController.getFloatHistory(
      req,
      res
    );

    expect(query).toHaveBeenCalledTimes(2);

    for (const [sql, params] of query.mock.calls) {
      expect(String(sql)).toContain(
        "FROM branch_managers bm"
      );

      expect(params).toContain(
        "company-1"
      );

      expect(params).toContain(
        "manager-1"
      );
    }
  });

  test("branch float read checks access before reading treasury accounts", async () => {
    query.mockResolvedValueOnce({
      rows: []
    });

    const req = {
      user: {
        id: "manager-1",
        role: "manager",
        company_id: "company-1"
      },
      params: {
        branch_id: "branch-other"
      }
    };

    const res = makeResponse();

    await floatController.getBranchFloat(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes(
          "SELECT fa.*"
        )
      )
    ).toBe(false);
  });
});


describe("branch list float aggregation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("agent branch list is restricted to assigned branches", async () => {
    query.mockResolvedValue({
      rows: []
    });

    const req = {
      user: {
        id: "agent-1",
        role: "agent",
        company_id: "company-1"
      },
      query: {}
    };

    const res = makeResponse();

    await branchController.listBranches(
      req,
      res
    );

    expect(query).toHaveBeenCalledTimes(1);

    const [sql, params] = query.mock.calls[0];

    expect(String(sql)).toContain(
      "SELECT branch_id FROM agent_branches"
    );

    expect(String(sql)).toContain(
      "agent_id"
    );

    expect(params).toEqual([
      "company-1",
      "agent-1"
    ]);
  });

  test("aggregates treasury float before joining agents and managers", async () => {
    query.mockResolvedValue({
      rows: []
    });

    const req = {
      user: {
        id: "owner-1",
        role: "business_owner",
        company_id: "company-1"
      },
      query: {}
    };

    const res = makeResponse();

    await branchController.listBranches(req, res);

    const sql = query.mock.calls[0][0];

    expect(sql).toContain(
      "SELECT branch_id, SUM(current_balance) as total_float"
    );

    expect(sql).toContain(
      "COALESCE(MAX(fa.total_float), 0)"
    );

    expect(sql).not.toContain(
      "SUM(fa.current_balance)"
    );
  });
});
