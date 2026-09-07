const fs = require("fs");
const path = require("path");

function source(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../..",
      relativePath
    ),
    "utf8"
  );
}

describe(
  "Business Hub reviewed pricing UI contracts",
  () => {
    const admin = source(
      "admin_portal/src/App.jsx"
    );

    const marketplace = source(
      "backend/src/routes/marketplace.routes.js"
    );

    const flutterAd = source(
      "flutter_app/lib/features/marketplace/ad_detail_screen.dart"
    );

    const flutterNotifications =
      source(
        "flutter_app/lib/core/services/notification_service.dart"
      );

    const notificationsScreen =
      source(
        "flutter_app/lib/features/notifications/notifications_screen.dart"
      );

    test(
      "Admin can review value and issue authoritative amount",
      () => {
        expect(admin).toContain(
          "Admin assessed value"
        );

        expect(admin).toContain(
          "Final amount to pay"
        );

        expect(admin).toContain(
          "pricing_adjustment_reason"
        );

        expect(admin).toContain(
          "Approve & Request"
        );

        expect(admin).toContain(
          "Waiting for user payment"
        );
      }
    );

    test(
      "Admin separates waiting-for-payment from submitted-payment work",
      () => {
        expect(admin).toContain(
          "awaitingUserPaymentCount"
        );

        expect(admin).toContain(
          "paymentSubmittedCount"
        );

        expect(admin).toContain(
          "Verify Payment"
        );
      }
    );

    test(
      "owner detail exposes whether payment is already awaiting verification",
      () => {
        expect(marketplace).toContain(
          "payment_reference_submitted"
        );

        expect(marketplace).toContain(
          "payment_submitted_at"
        );

        expect(flutterAd).toContain(
          "payment_reference_submitted"
        );

        expect(flutterAd).toContain(
          "Manual payment Transaction ID submitted"
        );
      }
    );

    test(
      "Flutter uses administrator-approved amount due",
      () => {
        expect(flutterAd).toContain(
          "ad['amount_due'] ?? ad['publishing_fee']"
        );

        expect(flutterAd).toContain(
          "_ad?['amount_due']"
        );
      }
    );

    test(
      "Business Hub payment notifications route to the exact listing",
      () => {
        expect(
          flutterNotifications
        ).toContain(
          "case 'ad_payment_required':"
        );

        expect(
          flutterNotifications
        ).toContain(
          "case 'ad_payment_confirmed':"
        );

        expect(
          flutterNotifications
        ).toContain(
          "'/marketplace/ads/"
        );

        expect(
          flutterNotifications
        ).toContain(
          "message.data['ad_id']"
        );

        expect(
          notificationsScreen
        ).toContain(
          "adId: data['ad_id']"
        );
      }
    );
  }
);
