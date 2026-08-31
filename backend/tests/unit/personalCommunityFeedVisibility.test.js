const fs = require("fs");
const path = require("path");

describe("Personal Community feed visibility contract", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "../../src/controllers/personalCommunityController.js",
    ),
    "utf8",
  );

  test("feed includes active and own pending posts but excludes removed posts", () => {
    const start = source.indexOf("exports.listFeed = async");
    const end = source.indexOf(
      "async function isPersonalPostVisibleToUser",
      start,
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const feed = source.slice(start, end);

    expect(feed).toContain(
      "WHERE p.status = $2 OR (p.status = $3 AND p.author_id = $1)",
    );

    expect(feed).not.toContain('"removed"');
    expect(feed).not.toContain("p.status = $4 OR");
  });

  test("feed pagination placeholders remain aligned after removing removed status", () => {
    const start = source.indexOf("exports.listFeed = async");
    const end = source.indexOf(
      "async function isPersonalPostVisibleToUser",
      start,
    );

    const feed = source.slice(start, end);

    expect(feed).toContain("LIMIT $4 OFFSET $5");

    expect(feed).toContain(
      '[req.user.id, "active", "pending_review", parseInt(limit), offset]',
    );

    expect(feed).not.toContain("LIMIT $5 OFFSET $6");
  });
});
