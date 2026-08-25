const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../..", relativePath), "utf8");
}

describe("Paystack subscription routing contracts", () => {
  test("Business Paystack routes require authenticated Business Owner authority", () => {
    const source = readSource("src/routes/subscription.routes.js");

    expect(source).toContain("router.use(authenticate)");

    expect(source).toMatch(
      /router\.post\(\s*["']\/paystack\/initialize["'][\s\S]*?authorize\(["']business_owner["']\)[\s\S]*?paystackSubscriptionController\.initializeBusiness/,
    );

    expect(source).toMatch(
      /router\.get\(\s*["']\/paystack\/verify\/:reference["'][\s\S]*?authorize\(["']business_owner["']\)[\s\S]*?paystackSubscriptionController\.verifyBusiness/,
    );
  });

  test("Personal Paystack routes require authenticated Personal account authority", () => {
    const source = readSource("src/routes/personalSubscription.routes.js");

    expect(source).toContain("router.use(authenticate)");

    expect(source).toMatch(
      /router\.post\(\s*["']\/paystack\/initialize["'][\s\S]*?requirePersonalAccount[\s\S]*?paystackSubscriptionController\.initializePersonal/,
    );

    expect(source).toMatch(
      /router\.get\(\s*["']\/paystack\/verify\/:reference["'][\s\S]*?requirePersonalAccount[\s\S]*?paystackSubscriptionController\.verifyPersonal/,
    );
  });

  test("Paystack webhook is public and cryptographically signature protected", () => {
    const route = readSource("src/routes/paystackWebhook.routes.js");

    const controller = readSource(
      "src/controllers/paystackWebhookController.js",
    );

    expect(route).not.toContain("authenticate");

    expect(route).not.toContain("authorize(");

    expect(controller).toContain("verifyWebhookSignature");

    expect(controller).toContain("x-paystack-signature");

    expect(controller).toMatch(
      /event\?\.event\s*!==\s*["']charge\.success["']/,
    );

    expect(controller).toContain("fulfillPaystackTransaction");
  });

  test("server captures exact raw Paystack body for HMAC verification", () => {
    const server = readSource("server.js");

    expect(server).toContain("/api/v1/webhooks/paystack");

    expect(server).toContain("req.rawBody");

    expect(server).toContain("Buffer.from(buffer)");

    expect(server).toContain("paystackWebhookRoutes");
  });

  test("webhook route is mounted independently of authenticated subscription routers", () => {
    const server = readSource("server.js");

    expect(server).toMatch(
      /app\.use\(`\$\{API\}\/webhooks\/paystack`,\s*paystackWebhookRoutes\)/,
    );

    expect(server).toMatch(
      /app\.use\(`\$\{API\}\/subscriptions`,\s*subscriptionRoutes\)/,
    );

    expect(server).toMatch(
      /app\.use\(`\$\{API\}\/personal-subscription`,\s*personalSubscriptionRoutes\)/,
    );
  });
});
