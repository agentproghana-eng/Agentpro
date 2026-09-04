"use strict";

const fs = require("fs");
const path = require("path");

const rateLimitPath = path.join(__dirname, "../../src/middleware/rateLimit.js");

const agentRoutePath = path.join(
  __dirname,
  "../../src/routes/agentPost.routes.js",
);

const personalRoutePath = path.join(
  __dirname,
  "../../src/routes/personalCommunity.routes.js",
);

const marketplaceRoutePath = path.join(
  __dirname,
  "../../src/routes/marketplace.routes.js",
);

describe("Upload abuse rate limiting", () => {
  test("upload limiter is dedicated, restrictive, and fail closed", () => {
    const source = fs.readFileSync(rateLimitPath, "utf8");

    const start = source.indexOf("exports.uploadLimiter");

    expect(start).toBeGreaterThan(-1);

    const section = source.slice(start);

    expect(section).toContain("5 * 60 * 1000");
    expect(section).toContain("max: 10");
    expect(section).toContain("agentpro:rate-limit:upload:");
    expect(section).toContain("passOnStoreError: false");
  });

  test("business community audio is limited before multer", () => {
    const source = fs.readFileSync(agentRoutePath, "utf8");

    expect(source).toContain(
      'const { uploadLimiter } = require("../middleware/rateLimit");',
    );

    const protectedUploads =
      source.match(/uploadLimiter,\s*upload\.single\(["']audio["']\)/g) || [];

    expect(protectedUploads).toHaveLength(2);
  });

  test("Personal community audio is limited before multer", () => {
    const source = fs.readFileSync(personalRoutePath, "utf8");

    expect(source).toContain(
      "const { uploadLimiter } = require('../middleware/rateLimit');",
    );

    const protectedUploads =
      source.match(/uploadLimiter,\s*upload\.single\(["']audio["']\)/g) || [];

    expect(protectedUploads).toHaveLength(2);
  });

  test("marketplace image submission is limited before multer", () => {
    const source = fs.readFileSync(marketplaceRoutePath, "utf8");

    expect(source).toContain(
      "const { uploadLimiter } = require('../middleware/rateLimit');",
    );

    expect(source).toMatch(
      /mpRouter\.post\(\s*["']\/["'],\s*uploadLimiter,\s*upload\.array\(["']images["'],\s*3\)/,
    );
  });
});
