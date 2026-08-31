const fs = require("fs");
const path = require("path");

describe("Marketplace public browse contract", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/routes/marketplace.routes.js"),
    "utf8",
  );

  function extractArray(name) {
    const start = source.indexOf(`const ${name} = [`);

    expect(start).toBeGreaterThanOrEqual(0);

    const end = source.indexOf("];", start);

    expect(end).toBeGreaterThan(start);

    return source.slice(start, end);
  }

  test("defines a narrow public GET allowlist", () => {
    expect(source).toContain("const publicMarketplaceReadPatterns = [");

    expect(source).toContain("function isPublicMarketplaceRead(req)");

    expect(source).toMatch(/req\.method\s*===\s*["']GET["']/);

    expect(source).toContain("publicMarketplaceReadPatterns.some(");

    expect(source).toContain("new RegExp(`^/sellers/${UUID_PATH_SEGMENT}$`)");

    expect(source).toContain("new RegExp(`^/${UUID_PATH_SEGMENT}$`)");
  });

  test("publishes only intended fixed discovery routes", () => {
    const start = source.indexOf("const publicMarketplaceReadPatterns = [");

    const end = source.indexOf("];", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const allowlist = source.slice(start, end);

    expect(allowlist).toContain("categories");
    expect(allowlist).toContain("featured-sellers");

    for (const protectedPath of [
      "mine",
      "dashboard",
      "enquiries",
      "saved",
      "payment",
      "recommendations",
      "recently-viewed",
    ]) {
      expect(allowlist).not.toContain(protectedPath);
    }
  });

  test("keeps non-public marketplace routes authenticated", () => {
    expect(source).toContain("if (!isPublicMarketplaceRead(req))");

    expect(source).toMatch(/return authenticate\(req,\s*res,\s*next\);/);

    expect(source).toContain("mpRouter.use(marketplaceAccess);");
  });

  test("fails closed when credentials are supplied", () => {
    expect(source).toContain("const authHeader = req.headers.authorization;");

    expect(source).toContain("if (!authHeader)");
    expect(source).toContain("return next();");

    const start = source.indexOf("function marketplaceAccess(req, res, next)");

    const end = source.indexOf("const PUBLIC_AD_FIELDS", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const accessFunction = source.slice(start, end);

    const authenticateCalls =
      accessFunction.match(/authenticate\(req,\s*res,\s*next\)/g) ?? [];

    expect(authenticateCalls).toHaveLength(2);
  });

  test("uses an explicit allowlist for public advertisement fields", () => {
    const fields = extractArray("PUBLIC_AD_FIELDS");

    for (const field of [
      "id",
      "category_id",
      "title",
      "description",
      "price",
      "currency",
      "location",
      "image_urls",
      "video_url",
      "published_at",
      "expires_at",
      "views_count",
      "category_name",
      "seller_id",
      "seller_first_name",
      "seller_last_name",
      "seller_profile_image_url",
      "company_name",
      "company_logo_url",
      "seller_verified",
      "is_verified",
      "is_featured",
      "avg_rating",
      "rating_count",
      "seller_average_rating",
      "seller_review_count",
      "is_owner",
    ]) {
      expect(fields).toContain(`'${field}'`);
    }

    expect(source).toContain("return pickPublicFields(ad, PUBLIC_AD_FIELDS);");

    expect(source).toContain("data: data.rows.map(publicAd)");

    expect(source).toContain("advertisements: adsResult.rows.map(publicAd)");
  });

  test("does not publicly expose private or internal advertisement fields", () => {
    const fields = extractArray("PUBLIC_AD_FIELDS");

    for (const forbidden of [
      "contact_phone",
      "contact_email",
      "publishing_fee",
      "fee_percent",
      "rejection_reason",
      "grace_period_ends_at",
      "posted_by",
      "company_id",
      "status",
      "created_at",
      "updated_at",
    ]) {
      expect(fields).not.toContain(`'${forbidden}'`);
    }
  });

  test("uses an explicit allowlist for public seller fields", () => {
    const fields = extractArray("PUBLIC_SELLER_FIELDS");

    for (const field of [
      "seller_id",
      "first_name",
      "last_name",
      "profile_image_url",
      "company_name",
      "company_logo_url",
      "is_verified",
      "active_ad_count",
      "average_rating",
      "review_count",
    ]) {
      expect(fields).toContain(`'${field}'`);
    }

    for (const forbidden of [
      "seller_phone",
      "seller_email",
      "company_phone",
      "company_email",
      "company_status",
      "approved_at",
      "company_id",
      "company_address",
    ]) {
      expect(fields).not.toContain(`'${forbidden}'`);
    }

    expect(source).toContain(
      "return pickPublicFields(seller, PUBLIC_SELLER_FIELDS);",
    );

    expect(source).toContain("seller: publicSeller(sellerResult.rows[0])");
  });

  test("sanitizes featured sellers through an explicit public allowlist", () => {
    const fields = extractArray("PUBLIC_FEATURED_SELLER_FIELDS");

    for (const field of [
      "seller_id",
      "first_name",
      "last_name",
      "profile_image_url",
      "company_name",
      "company_logo_url",
      "active_ad_count",
      "average_rating",
      "review_count",
    ]) {
      expect(fields).toContain(`'${field}'`);
    }

    for (const forbidden of [
      "company_id",
      "company_address",
      "marketplace_featured_priority",
      "company_phone",
      "company_email",
      "seller_phone",
      "seller_email",
    ]) {
      expect(fields).not.toContain(`'${forbidden}'`);
    }

    expect(source).toContain(
      "return pickPublicFields(seller, PUBLIC_FEATURED_SELLER_FIELDS);",
    );

    expect(source).toContain("data: result.rows.map(publicFeaturedSeller)");
  });

  test("allows hidden ads only to the authenticated owner", () => {
    expect(source).toMatch(/const viewerId = req\.user\?\.id \|\| null;/);

    expect(source).toMatch(
      /const isOwner =\s*viewerId !== null && ad\.posted_by === viewerId;/,
    );

    expect(source).toMatch(/if \(!isOwner && ad\.status !== ["']active["']\)/);

    expect(source).toMatch(/message:\s*["']Ad not found["']/);
  });

  test("does not manufacture anonymous marketplace view identities", () => {
    expect(source).toContain("if (viewerId !== null && !isOwner)");

    expect(source).toContain("[req.params.ad_id, viewerId]");

    expect(source).not.toMatch(/req\.(ip|ips)\b/);
  });

  test("preserves authenticated account and write routes", () => {
    const routes = [
      ["get", "/mine"],
      ["get", "/dashboard"],
      ["get", "/reviews/received"],
      ["post", "/:ad_id/enquiries"],
      ["get", "/enquiries"],
      ["get", "/saved"],
      ["post", "/:ad_id/save"],
      ["delete", "/:ad_id/save"],
      ["get", "/recently-viewed"],
      ["get", "/recommendations"],
      ["post", "/:ad_id/payment"],
    ];

    for (const [method, routePath] of routes) {
      const escapedPath = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      expect(source).toMatch(
        new RegExp(`mpRouter\\.${method}\\(["']${escapedPath}["']`),
      );
    }

    expect(source).toMatch(
      /mpRouter\.post\(\s*["']\/["'],\s*upload\.array\(\s*["']images["'],\s*3\s*\)/,
    );
  });
});
