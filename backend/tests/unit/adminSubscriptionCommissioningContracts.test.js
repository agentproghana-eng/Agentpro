const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(
  __dirname,
  "../../..",
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(repoRoot, relativePath),
    "utf8",
  );
}

describe("Admin subscription commissioning contracts", () => {
  const migration = read(
    "backend/migrations/103_personal_subscription_rejection_notification_type.sql",
  );

  const userController = read(
    "backend/src/controllers/userController.js",
  );

  const pages = read(
    "admin_portal/src/pages.jsx",
  );

  const app = read(
    "admin_portal/src/App.jsx",
  );

  const headers = read(
    "admin_portal/public/_headers",
  );

  test("registers the Personal rejection notification type safely", () => {
    expect(migration).toContain(
      "ALTER TYPE notification_type",
    );

    expect(migration).toContain(
      "ADD VALUE IF NOT EXISTS 'personal_subscription_rejected'",
    );

    expect(migration).not.toMatch(
      /DROP\s+TYPE/i,
    );
  });

  test("returns authoritative Business subscription state to Admin", () => {
    expect(userController).toContain(
      "business_subscription.plan as subscription_plan",
    );

    expect(userController).toContain(
      "business_subscription.status as subscription_status",
    );

    expect(userController).toContain(
      "business_subscription.expires_at as subscription_expires_at",
    );

    expect(pages).not.toContain(
      "status={row.subscription_status || 'pending'}",
    );
  });

  test("supports a dedicated Personal Users admin listing", () => {
    expect(userController).toContain(
      "personal_only",
    );

    expect(userController).toContain(
      "personal_subscriptions ps_filter",
    );

    expect(userController).toContain(
      "personal_subscription_status",
    );

    expect(pages).toContain(
      "export function PersonalUsersPage()",
    );

    expect(pages).toContain(
      "/users?personal_only=true&limit=100",
    );

    expect(app).toContain(
      "path: '/personal-users'",
    );

    expect(app).toContain(
      'path="/personal-users"',
    );
  });

  test("prevents stale Admin SPA routes after deployment", () => {
    expect(headers).toContain(
      "Cache-Control: no-store, max-age=0",
    );

    expect(headers.indexOf(
      "Cache-Control: no-store, max-age=0",
    )).toBeLessThan(
      headers.indexOf("/index.html"),
    );
  });
});
