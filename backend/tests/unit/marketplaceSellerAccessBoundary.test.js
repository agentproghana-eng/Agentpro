const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../..",
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "Marketplace seller access boundary",
  () => {
    const controller = read(
      "backend/src/controllers/authController.js",
    );

    const middleware = read(
      "backend/src/middleware/auth.js",
    );

    const community = read(
      "backend/src/routes/agentPost.routes.js",
    );

    const reports = read(
      "backend/src/routes/report.routes.js",
    );

    const router = read(
      "flutter_app/lib/core/router/app_router.dart",
    );

    test(
      "Marketplace registration creates no MoMo role or subscription",
      () => {
        const start =
          controller.indexOf(
            "exports.registerMarketplaceSeller",
          );

        const end =
          controller.indexOf(
            "// ─── Personal Subscriber Registration",
            start,
          );

        expect(start)
          .toBeGreaterThanOrEqual(0);

        expect(end)
          .toBeGreaterThan(start);

        const source =
          controller.slice(start, end);

        expect(source).toContain(
          "'marketplace_seller'",
        );

        expect(source).not.toContain(
          "'business_owner'",
        );

        expect(source).not.toContain(
          "INSERT INTO subscriptions",
        );
      },
    );

    test(
      "Marketplace seller is excluded from MoMo operation roles",
      () => {
        const start =
          middleware.indexOf(
            "const BUSINESS_OPERATION_ROLES",
          );

        const end =
          middleware.indexOf(
            "/**\n * Require an approved",
            start,
          );

        const source =
          middleware.slice(start, end);

        expect(source).toContain(
          "'business_owner'",
        );

        expect(source).toContain(
          "'manager'",
        );

        expect(source).toContain(
          "'agent'",
        );

        expect(source).toContain(
          "'auditor'",
        );

        expect(source).not.toContain(
          "marketplace_seller",
        );
      },
    );

    test(
      "Agent Community requires role and approved company",
      () => {
        expect(community).toContain(
          "requireApprovedMomoBusiness",
        );

        expect(community).toContain(
          '"business_owner"',
        );

        expect(community).toContain(
          '"manager"',
        );

        expect(community).toContain(
          '"agent"',
        );

        expect(community).not.toContain(
          "marketplace_seller",
        );
      },
    );

    test(
      "Agents Hub reporting excludes Marketplace seller",
      () => {
        expect(reports).toContain(
          "'business_owner'",
        );

        expect(reports).toContain(
          "'manager'",
        );

        expect(reports).toContain(
          "'agent'",
        );

        expect(reports).not.toContain(
          "'marketplace_seller'",
        );
      },
    );

    test(
      "mobile seller cannot route into Agent Community or Agents Hub",
      () => {
        expect(router).toContain(
          "case 'marketplace_seller':",
        );

        expect(router).toContain(
          "return '/seller';",
        );

        expect(router).toContain(
          "agentCommunityRoles",
        );

        expect(router).toContain(
          "momoOnlyPrefixes",
        );

        expect(router).toContain(
          "path: '/agents-hub'",
        );
      },
    );
  },
);
