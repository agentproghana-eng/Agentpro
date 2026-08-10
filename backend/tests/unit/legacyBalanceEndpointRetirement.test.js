jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  authorize: () => (req, res, next) => next(),
}));

const balanceController = require('../../src/controllers/balanceController');
const balanceRouter = require('../../src/routes/balance.routes');

function registeredRoutes(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));
}

describe('Legacy provider-aggregate balance endpoint retirement', () => {
  test('getAgentBalances controller is no longer exported', () => {
    expect(balanceController.getAgentBalances).toBeUndefined();
  });

  test('legacy optional agent balance route is no longer registered', () => {
    const routes = registeredRoutes(balanceRouter);

    expect(routes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/:agent_id?',
        }),
      ])
    );
  });

  test('canonical cash drawer and SIM wallet reads remain registered', () => {
    const routes = registeredRoutes(balanceRouter);

    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/cash-drawer',
          methods: expect.arrayContaining(['get']),
        }),
        expect.objectContaining({
          path: '/sim-wallet',
          methods: expect.arrayContaining(['get']),
        }),
      ])
    );
  });
});
