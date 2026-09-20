const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../../..', relativePath),
    'utf8'
  );
}

describe('Support Cases contracts', () => {
  test('migration creates durable support records and cursor indexes', () => {
    const migrationDir = path.join(__dirname, '../../migrations');
    const migrationName = fs
      .readdirSync(migrationDir)
      .find((name) => /^\d{3}_support_cases\.sql$/.test(name));

    expect(migrationName).toBeDefined();

    const migration = read(
      `backend/migrations/${migrationName}`
    );

    expect(migration).toContain('CREATE TABLE support_cases');
    expect(migration).toContain('CREATE TABLE support_case_messages');
    expect(migration).toContain('idx_support_cases_status_created_cursor');
    expect(migration).toContain('idx_support_case_messages_case_created');
  });

  test('authenticated users submit support cases through a dedicated API', () => {
    const routes = read('backend/src/routes/support.routes.js');
    const server = read('backend/server.js');

    expect(routes).toContain('router.use(authenticate)');
    expect(routes).toContain("'/cases'");
    expect(routes).toContain("'SUPPORT_CASE_CREATED'");
    expect(server).toContain("app.use(`${API}/support`, supportRoutes)");
  });

  test('admin support inbox remains behind fail-closed admin authorization', () => {
    const admin = read('backend/src/routes/admin.routes.js');

    expect(admin).toContain('requireAdminPortalAccess');
    expect(admin).toContain("router.get('/support/cases'");
    expect(admin).toContain("router.patch('/support/cases/:id'");
    expect(admin).toContain("router.post('/support/cases/:id/reply'");
    expect(admin).toContain("'SUPPORT_CASE_UPDATED'");
    expect(admin).toContain("'SUPPORT_CASE_REPLIED'");
  });

  test('mobile feedback is under Help and Support and no longer uses mailto', () => {
    const support = read('flutter_app/lib/features/support/support_screen.dart');
    const settings = read('flutter_app/lib/features/settings/settings_screen.dart');
    const feedback = read('flutter_app/lib/features/support/feedback_screen.dart');

    expect(support).toContain("'Complaints & Feedback'");
    expect(support).toContain("context.push('/support/feedback')");
    expect(settings).not.toContain("'Complaints & Feedback'");
    expect(feedback).toContain('ApiClient.instance.post');
    expect(feedback).toContain("'/support/cases'");
    expect(feedback).not.toContain("scheme: 'mailto'");
    expect(feedback).toContain('Do not include your PIN');

    const router = read('flutter_app/lib/core/router/app_router.dart');
    const cases = read('flutter_app/lib/features/support/support_cases_screen.dart');

    expect(support).toContain("'My Support Cases'");
    expect(support).toContain("context.push('/support/cases')");
    expect(router).toContain("path: '/support/cases'");
    expect(cases).toContain("'/support/cases'");
    expect(cases).toContain("'/support/cases/$id'");
  });

  test('admin portal mounts a separate support inbox feature', () => {
    const app = read('admin_portal/src/App.jsx');
    const panel = read('admin_portal/src/features/support/SupportCasesPanel.jsx');

    expect(app).toContain('<SupportCasesPanel />');
    expect(panel).toContain("'/admin/support/cases'");
    expect(panel).toContain('`/admin/support/cases/${selectedId}`');
    expect(panel).toContain('`/admin/support/cases/${selectedId}/reply`');
    expect(panel).toContain('Load More');
  });

  test('support reply push keeps case content off the lock screen', () => {
    const admin = read('backend/src/routes/admin.routes.js');

    expect(admin).toContain(
      'Open My Support Cases to read the response.'
    );
    expect(admin).not.toContain(
      "const preview = String(result.message.body"
    );
  });

  test('broad audit log never stores complaint or reply body values', () => {
    const userRoutes = read('backend/src/routes/support.routes.js');
    const admin = read('backend/src/routes/admin.routes.js');

    expect(userRoutes).not.toContain('newValues: {\n          message:');
    expect(admin).not.toContain('newValues: {\n          message: req.body?.message');
  });
});
