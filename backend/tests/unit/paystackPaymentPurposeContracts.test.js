const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "../..");

function source(relativePath) {
  return fs.readFileSync(
    path.join(backendRoot, relativePath),
    "utf8",
  );
}

describe("Paystack customer payment purpose contracts", () => {
  test("business and personal subscriptions carry AgentPro purpose metadata", () => {
    const controller = source(
      "src/controllers/paystackSubscriptionController.js",
    );

    expect(controller).toContain(
      'payment_for: "AgentPro Business Subscription"',
    );
    expect(controller).toContain(
      'value: "AgentPro Business Subscription"',
    );

    expect(controller).toContain(
      'payment_for: "AgentPro Personal Subscription"',
    );
    expect(controller).toContain(
      'value: "AgentPro Personal Subscription"',
    );

    expect(controller).toContain(
      'display_name: "Payment For"',
    );
  });

  test("Marketplace listing payments carry AgentPro purpose metadata", () => {
    const marketplace = source(
      "src/routes/marketplace.routes.js",
    );

    expect(marketplace).toContain(
      'payment_kind: "business_hub"',
    );
    expect(marketplace).toContain(
      'payment_for: "AgentPro Marketplace Listing Fee"',
    );
    expect(marketplace).toContain(
      'value: "AgentPro Marketplace Listing Fee"',
    );
  });
});
