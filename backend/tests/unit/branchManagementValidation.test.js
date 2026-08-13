const express = require('express');
const request = require('supertest');

const mockBranchController = {
  listBranches: jest.fn((req, res) =>
    res.json({ success: true, data: [] })
  ),
  createBranch: jest.fn((req, res) =>
    res.status(201).json({ success: true, data: {} })
  ),
  getBranch: jest.fn((req, res) =>
    res.json({ success: true, data: {} })
  ),
  updateBranch: jest.fn((req, res) =>
    res.json({ success: true, data: {} })
  ),
};

jest.mock(
  '../../src/controllers/branchController',
  () => mockBranchController
);

let mockAuthenticatedUser = {
  id: 'owner-1',
  role: 'business_owner',
  company_id: '11111111-1111-4111-8111-111111111111',
};

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = mockAuthenticatedUser;
    next();
  },
  authorize: () => (req, res, next) => next(),
  requireActiveSubscription: (req, res, next) => next(),
}));

const branchRoutes =
  require('../../src/routes/branch.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/branches', branchRoutes);
  return app;
}

describe('Branch Management route validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthenticatedUser = {
      id: 'owner-1',
      role: 'business_owner',
      company_id: '11111111-1111-4111-8111-111111111111',
    };
  });

  test('branch creation rejects a missing name', async () => {
    const response = await request(makeApp())
      .post('/branches')
      .send({
        location: 'Accra',
        phone: '0240000000',
      });

    expect(response.status).toBe(422);
    expect(mockBranchController.createBranch)
      .not.toHaveBeenCalled();
  });

  test('branch creation rejects a blank name', async () => {
    const response = await request(makeApp())
      .post('/branches')
      .send({
        name: '   ',
      });

    expect(response.status).toBe(422);
    expect(mockBranchController.createBranch)
      .not.toHaveBeenCalled();
  });

  test('branch detail rejects a malformed branch UUID', async () => {
    const response = await request(makeApp())
      .get('/branches/not-a-uuid');

    expect(response.status).toBe(422);
    expect(mockBranchController.getBranch)
      .not.toHaveBeenCalled();
  });

  test('branch update rejects a malformed branch UUID', async () => {
    const response = await request(makeApp())
      .patch('/branches/not-a-uuid')
      .send({
        name: 'Updated Branch',
      });

    expect(response.status).toBe(422);
    expect(mockBranchController.updateBranch)
      .not.toHaveBeenCalled();
  });

  test('branch update rejects an unknown status', async () => {
    const response = await request(makeApp())
      .patch(
        '/branches/11111111-1111-4111-8111-111111111111'
      )
      .send({
        status: 'deleted',
      });

    expect(response.status).toBe(422);
    expect(mockBranchController.updateBranch)
      .not.toHaveBeenCalled();
  });

  test('superuser branch list rejects a malformed company_id', async () => {
    mockAuthenticatedUser = {
      id: 'superuser-1',
      role: 'superuser',
    };

    const response = await request(makeApp())
      .get('/branches?company_id=not-a-uuid');

    expect(response.status).toBe(422);
    expect(mockBranchController.listBranches)
      .not.toHaveBeenCalled();
  });

});
