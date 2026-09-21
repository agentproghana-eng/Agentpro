const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      relativePath,
    ),
    'utf8',
  );
}

describe(
  'Admin Portal browser CORS header contract',
  () => {
    test(
      'backend permits every explicit Admin Portal login header',
      () => {
        const server = read('server.js');
        const app = read(
          '../admin_portal/src/App.jsx',
        );

        expect(app).toContain(
          "'X-AgentPro-Admin-Portal'",
        );

        expect(server).toContain(
          "'X-AgentPro-Admin-Portal'",
        );
      },
    );

    test(
      'admin elevation signal remains explicit in request body',
      () => {
        const app = read(
          '../admin_portal/src/App.jsx',
        );

        const authRoutes = read(
          'src/routes/auth.routes.js',
        );

        expect(app).toContain(
          'admin_portal: true',
        );

        expect(authRoutes).toContain(
          "body('admin_portal')",
        );
      },
    );
  },
);
