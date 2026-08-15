const request = require('supertest');
const express = require('express');

jest.mock('../../src/middleware/auth', () => {
  const actual = jest.requireActual('../../src/middleware/auth');

  return {
    ...actual,
    authenticate: (req, _res, next) => {
      req.user = {
        id: 'actor-1',
        company_id: 'company-1',
        role: req.get('x-test-role') || 'agent',
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

const userRouter = require('../../src/routes/user.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', userRouter);
  return app;
}

describe('Staff Management route authorization', () => {
  const app = makeApp();

  const validStaff = {
    first_name: 'Ama',
    last_name: 'Mensah',
    email: 'ama@example.com',
    phone: '0240000000',
    role: 'agent',
    branch_id: '11111111-1111-4111-8111-111111111111',
  };

  test.each([
    'superuser',
    'business_owner',
    'manager',
  ])('%s can reach staff creation route', async (role) => {
    const response = await request(app)
      .post('/users')
      .set('x-test-role', role)
      .send(validStaff);

    expect(response.status).toBe(204);
  });

  test.each([
    'agent',
    'auditor',
  ])('%s cannot reach staff creation route', async (role) => {
    const response = await request(app)
      .post('/users')
      .set('x-test-role', role)
      .send(validStaff);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      message: 'You do not have permission to access this resource',
    });
  });
});
