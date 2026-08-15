const request = require('supertest');
const express = require('express');

jest.mock('../../src/middleware/auth', () => {
  const actual = jest.requireActual('../../src/middleware/auth');

  return {
    ...actual,
    authenticate: (req, _res, next) => {
      req.user = {
        id: 'owner-1',
        company_id: 'company-1',
        role: 'business_owner',
      };
      next();
    },
  };
});

jest.mock('../../src/controllers/userController', () => {
  const noContent = (_req, res) => res.status(204).end();

  return {
    listUsers: noContent,
    createUser: noContent,
    changePassword: noContent,
    updateMySettings: noContent,
    getMyQuickActionCatalog: noContent,
    getMyQuickActions: noContent,
    updateMyQuickActions: noContent,
    getFeatureFlags: noContent,
    getUser: noContent,
    updateUser: noContent,
    reassignBranch: noContent,
  };
});

const userRouter =
  require('../../src/routes/user.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', userRouter);
  return app;
}

const validStaff = {
  first_name: 'Ama',
  last_name: 'Mensah',
  email: 'ama@example.com',
  phone: '0240000000',
  role: 'agent',
  branch_id: '11111111-1111-4111-8111-111111111111',
};

describe('Staff Management input validation', () => {
  const app = makeApp();

  test.each([
    ['first_name', { ...validStaff, first_name: '' }],
    ['last_name', { ...validStaff, last_name: '' }],
    ['email', { ...validStaff, email: 'not-an-email' }],
    ['phone', { ...validStaff, phone: '' }],
  ])(
    'staff creation rejects invalid %s',
    async (field, payload) => {
      const response = await request(app)
        .post('/users')
        .send(payload);

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);

      expect(
        response.body.errors.some(
          (error) => error.field === field
        )
      ).toBe(true);
    }
  );

  test(
    'staff creation rejects malformed branch_id',
    async () => {
      const response = await request(app)
        .post('/users')
        .send({
          ...validStaff,
          branch_id: 'not-a-uuid',
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);

      expect(
        response.body.errors.some(
          (error) => error.field === 'branch_id'
        )
      ).toBe(true);
    }
  );

  test(
    'staff status update rejects an unknown status',
    async () => {
      const response = await request(app)
        .patch(
          '/users/22222222-2222-4222-8222-222222222222'
        )
        .send({
          status: 'deleted_forever',
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);

      expect(
        response.body.errors.some(
          (error) => error.field === 'status'
        )
      ).toBe(true);
    }
  );

  test(
    'branch reassignment rejects malformed branch_id',
    async () => {
      const response = await request(app)
        .patch(
          '/users/22222222-2222-4222-8222-222222222222/reassign-branch'
        )
        .send({
          branch_id: 'not-a-uuid',
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);

      expect(
        response.body.errors.some(
          (error) => error.field === 'branch_id'
        )
      ).toBe(true);
    }
  );

  test(
    'valid staff creation still reaches controller',
    async () => {
      const response = await request(app)
        .post('/users')
        .send(validStaff);

      expect(response.status).toBe(204);
    }
  );

  test(
    'valid staff status update still reaches controller',
    async () => {
      const response = await request(app)
        .patch(
          '/users/22222222-2222-4222-8222-222222222222'
        )
        .send({
          status: 'suspended',
        });

      expect(response.status).toBe(204);
    }
  );
});
