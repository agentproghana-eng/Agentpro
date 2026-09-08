const fs = require("fs");
const path = require("path");

describe("Business Hub owner ad removal contract", () => {
  const routeSource = fs.readFileSync(
    path.join(
      __dirname,
      "../../src/routes/marketplace.routes.js",
    ),
    "utf8",
  );

  const migrationSource = fs.readFileSync(
    path.join(
      __dirname,
      "../../migrations/117_business_hub_owner_ad_removal.sql",
    ),
    "utf8",
  );

  test("adds a dedicated removed lifecycle status", () => {
    expect(migrationSource).toContain(
      "ALTER TYPE ad_status",
    );

    expect(migrationSource).toContain(
      "ADD VALUE IF NOT EXISTS 'removed'",
    );
  });

  test("removes only the authenticated owner's active unexpired ad", () => {
    const start = routeSource.indexOf(
      "mpRouter.delete('/:ad_id',",
    );

    const end = routeSource.indexOf(
      "// Submit an ad.",
      start,
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const removeRoute = routeSource.slice(
      start,
      end,
    );

    expect(removeRoute).toContain(
      "SET status = 'removed'",
    );

    expect(removeRoute).toContain(
      "posted_by = $2",
    );

    expect(removeRoute).toContain(
      "status = 'active'",
    );

    expect(removeRoute).toContain(
      "expires_at IS NOT NULL",
    );

    expect(removeRoute).toContain(
      "expires_at > NOW()",
    );

    expect(removeRoute).toContain(
      "[req.params.ad_id, req.user.id]",
    );
  });

  test("soft-removes instead of deleting advertisement history", () => {
    const start = routeSource.indexOf(
      "mpRouter.delete('/:ad_id',",
    );

    const end = routeSource.indexOf(
      "// Submit an ad.",
      start,
    );

    const removeRoute = routeSource.slice(
      start,
      end,
    );

    expect(removeRoute).not.toContain(
      "DELETE FROM advertisements",
    );

    expect(removeRoute).toContain(
      "BUSINESS_HUB_AD_REMOVED",
    );

    expect(removeRoute).toContain(
      "Only active, unexpired listings can be removed",
    );
  });
});
