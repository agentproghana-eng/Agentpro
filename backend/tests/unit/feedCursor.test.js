const {
  InvalidFeedCursorError,
  encodeFeedCursor,
  decodeFeedCursor,
} = require("../../src/utils/feedCursor");

describe("feedCursor", () => {
  test("round trips cursor objects", () => {
    const value = {
      created_at: "2026-09-15T10:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    };

    const encoded = encodeFeedCursor(value);

    expect(typeof encoded).toBe("string");
    expect(decodeFeedCursor(encoded)).toEqual(value);
  });

  test("empty cursor means first page", () => {
    expect(decodeFeedCursor(undefined)).toBeNull();
    expect(decodeFeedCursor(null)).toBeNull();
    expect(decodeFeedCursor("")).toBeNull();
  });

  test("rejects malformed cursor payloads", () => {
    expect(() => decodeFeedCursor("%%%"))
      .toThrow(InvalidFeedCursorError);

    expect(() =>
      decodeFeedCursor(
        Buffer.from("[]").toString("base64url")
      )
    ).toThrow(InvalidFeedCursorError);
  });
});
