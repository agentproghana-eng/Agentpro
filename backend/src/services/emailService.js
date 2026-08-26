const { Resend } = require("resend");
const { logger } = require("../utils/logger");

const BRAND = Object.freeze({
  name: "AgentPro",
  country: "GHANA",
  tagline: "One App. Every Business.",
  company: "Intellicore Technology",
  supportEmail: "support@agentproghana.com",
  teal: "#006B5E",
  tealDark: "#004C43",
  gold: "#E0B43C",
  background: "#F3F6F5",
  surface: "#FFFFFF",
  text: "#17211F",
  muted: "#66726F",
  border: "#DCE5E2",
});

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// A verified custom sending domain can override this with EMAIL_FROM.
// Until then, keep Resend's test sender while presenting the AgentPro
// brand consistently in the display name.
const FROM =
  process.env.EMAIL_FROM ||
  "AgentPro <onboarding@resend.dev>";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateGh(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "your current expiry date";
  }

  return date.toLocaleDateString("en-GH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "the verified amount";
  }

  return `GH₵${amount.toFixed(2)}`;
}

function renderEmail({
  preheader,
  eyebrow,
  title,
  bodyHtml,
  cta = null,
}) {
  const safePreheader =
    escapeHtml(preheader);

  const safeEyebrow =
    escapeHtml(eyebrow);

  const safeTitle =
    escapeHtml(title);

  const ctaHtml = cta
    ? `
      <table
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
        width="100%"
        style="margin: 28px 0 6px;"
      >
        <tr>
          <td align="center">
            <a
              href="${escapeHtml(cta.href)}"
              style="
                display: inline-block;
                background: ${BRAND.teal};
                color: #FFFFFF;
                text-decoration: none;
                font-size: 15px;
                line-height: 20px;
                font-weight: 700;
                padding: 14px 24px;
                border-radius: 10px;
                border: 1px solid ${BRAND.teal};
              "
            >
              ${escapeHtml(cta.label)}
            </a>
          </td>
        </tr>
      </table>
    `
    : "";

  return `
<!doctype html>
<html>
  <body
    style="
      margin: 0;
      padding: 0;
      background: ${BRAND.background};
      font-family:
        Inter,
        -apple-system,
        BlinkMacSystemFont,
        'Segoe UI',
        Arial,
        sans-serif;
      color: ${BRAND.text};
    "
  >
    <div
      style="
        display: none;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        color: transparent;
      "
    >
      ${safePreheader}
    </div>

    <table
      role="presentation"
      cellspacing="0"
      cellpadding="0"
      border="0"
      width="100%"
      style="background: ${BRAND.background};"
    >
      <tr>
        <td
          align="center"
          style="padding: 28px 12px;"
        >
          <table
            role="presentation"
            cellspacing="0"
            cellpadding="0"
            border="0"
            width="100%"
            style="
              max-width: 620px;
              background: ${BRAND.surface};
              border: 1px solid ${BRAND.border};
              border-radius: 18px;
              overflow: hidden;
              box-shadow:
                0 8px 24px rgba(0, 76, 67, 0.08);
            "
          >
            <tr>
              <td
                align="center"
                style="
                  background: ${BRAND.teal};
                  border-bottom:
                    4px solid ${BRAND.gold};
                  padding: 30px 24px 26px;
                "
              >
                <div
                  style="
                    margin: 0;
                    font-size: 31px;
                    line-height: 36px;
                    font-weight: 800;
                    letter-spacing: -0.8px;
                  "
                >
                  <span style="color: #FFFFFF;">Agent</span><span style="color: ${BRAND.gold};">Pro</span>
                </div>

                <div
                  style="
                    margin-top: 3px;
                    color: #D7EBE7;
                    font-size: 10px;
                    line-height: 14px;
                    font-weight: 700;
                    letter-spacing: 3px;
                  "
                >
                  ${BRAND.country}
                </div>

                <div
                  style="
                    margin-top: 10px;
                    color: #D7EBE7;
                    font-size: 13px;
                    line-height: 18px;
                    font-weight: 500;
                  "
                >
                  ${BRAND.tagline}
                </div>
              </td>
            </tr>

            <tr>
              <td
                style="
                  padding: 38px 38px 32px;
                  background: ${BRAND.surface};
                "
              >
                <div
                  style="
                    margin-bottom: 10px;
                    color: ${BRAND.teal};
                    font-size: 11px;
                    line-height: 16px;
                    font-weight: 800;
                    letter-spacing: 1.5px;
                    text-transform: uppercase;
                  "
                >
                  ${safeEyebrow}
                </div>

                <h1
                  style="
                    margin: 0 0 20px;
                    color: ${BRAND.text};
                    font-size: 27px;
                    line-height: 34px;
                    font-weight: 750;
                    letter-spacing: -0.4px;
                  "
                >
                  ${safeTitle}
                </h1>

                ${bodyHtml}
                ${ctaHtml}
              </td>
            </tr>

            <tr>
              <td
                style="
                  padding: 24px 32px 28px;
                  background: #F8FAF9;
                  border-top: 1px solid ${BRAND.border};
                  text-align: center;
                "
              >
                <p
                  style="
                    margin: 0 0 8px;
                    color: ${BRAND.muted};
                    font-size: 12px;
                    line-height: 18px;
                  "
                >
                  Need help?
                  <a
                    href="mailto:${BRAND.supportEmail}"
                    style="
                      color: ${BRAND.teal};
                      text-decoration: none;
                      font-weight: 700;
                    "
                  >
                    ${BRAND.supportEmail}
                  </a>
                </p>

                <p
                  style="
                    margin: 0 0 6px;
                    color: ${BRAND.muted};
                    font-size: 11px;
                    line-height: 17px;
                  "
                >
                  AgentPro is a product of
                  <strong>${BRAND.company}</strong>.
                </p>

                <p
                  style="
                    margin: 0;
                    color: #89928F;
                    font-size: 11px;
                    line-height: 17px;
                  "
                >
                  &copy; ${new Date().getFullYear()}
                  ${BRAND.company}. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

function textFooter() {
  return [
    "",
    "—",
    BRAND.name,
    BRAND.tagline,
    `Support: ${BRAND.supportEmail}`,
    `${BRAND.name} is a product of ${BRAND.company}.`,
  ].join("\n");
}

async function sendEmail({
  to,
  subject,
  html,
  text,
}) {
  if (!resend) {
    logger.warn(
      "Email skipped because RESEND_API_KEY is not configured",
    );

    return {
      skipped: true,
    };
  }

  try {
    const {
      data,
      error,
    } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      throw new Error(
        error.message ||
          JSON.stringify(error),
      );
    }

    logger.info(
      "Email sent successfully",
    );

    return (
      data || {
        sent: true,
      }
    );
  } catch (error) {
    logger.error(
      "Email send error:",
      error,
    );

    throw error;
  }
}

async function sendPasswordResetEmail(
  email,
  firstName,
  resetUrl,
) {
  const safeName =
    escapeHtml(firstName);

  const html = renderEmail({
    preheader:
      "Securely reset your AgentPro password.",
    eyebrow:
      "SECURITY",
    title:
      "Reset your password",
    bodyHtml: `
      <p
        style="
          margin: 0 0 16px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        Hello ${safeName},
      </p>

      <p
        style="
          margin: 0 0 16px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        We received a request to reset the password
        for your AgentPro account.
        Use the secure button below within
        <strong>1 hour</strong>.
      </p>

      <div
        style="
          margin-top: 22px;
          padding: 16px 18px;
          background: #FFF8E6;
          border: 1px solid #F0D68B;
          border-radius: 10px;
          color: #624D13;
          font-size: 13px;
          line-height: 20px;
        "
      >
        If you did not request this,
        no action is required.
        Never share your AgentPro password
        or Mobile Money PIN with anyone.
      </div>
    `,
    cta: {
      href: resetUrl,
      label:
        "Reset Password",
    },
  });

  const text = [
    `Hello ${firstName},`,
    "",
    "We received a request to reset your AgentPro password.",
    "This secure reset link expires in 1 hour:",
    resetUrl,
    "",
    "If you did not request this, no action is required.",
    "Never share your AgentPro password or Mobile Money PIN.",
    textFooter(),
  ].join("\n");

  return sendEmail({
    to: email,
    subject:
      "AgentPro — Reset Your Password",
    html,
    text,
  });
}

async function sendWelcomeEmail(
  email,
  firstName,
  companyName,
) {
  const safeName =
    escapeHtml(firstName);

  const safeCompany =
    escapeHtml(companyName);

  const html = renderEmail({
    preheader:
      `Your AgentPro Business workspace for ${companyName} is active.`,
    eyebrow:
      "BUSINESS ACCOUNT ACTIVATED",
    title:
      "Welcome to AgentPro",
    bodyHtml: `
      <p
        style="
          margin: 0 0 16px;
          color: ${BRAND.text};
          font-size: 16px;
          line-height: 25px;
        "
      >
        Akwaaba, <strong>${safeName}</strong>.
      </p>

      <p
        style="
          margin: 0 0 22px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        Your AgentPro Business workspace for
        <strong>${safeCompany}</strong>
        has been approved and activated.
      </p>

      <div
        style="
          margin: 0 0 24px;
          padding: 18px 20px;
          background: #EDF7F5;
          border-left: 4px solid ${BRAND.teal};
          border-radius: 10px;
        "
      >
        <div
          style="
            color: ${BRAND.tealDark};
            font-size: 12px;
            line-height: 18px;
            font-weight: 800;
            letter-spacing: 0.7px;
            text-transform: uppercase;
          "
        >
          Business access is active
        </div>

        <div
          style="
            margin-top: 6px;
            color: ${BRAND.text};
            font-size: 14px;
            line-height: 22px;
          "
        >
          You can now run supported Mobile Money
          operations, manage balances and float,
          review commissions, generate reports,
          and use AgentPro business tools.
        </div>
      </div>

      <p
        style="
          margin: 0;
          color: ${BRAND.muted};
          font-size: 13px;
          line-height: 21px;
        "
      >
        Sign in to AgentPro with your registered
        account to continue.
      </p>
    `,
  });

  const text = [
    `Akwaaba, ${firstName}.`,
    "",
    `Your AgentPro Business workspace for ${companyName} has been approved and activated.`,
    "",
    "Your Business access is now active.",
    "Sign in to AgentPro with your registered account to continue.",
    textFooter(),
  ].join("\n");

  return sendEmail({
    to: email,
    subject:
      "Welcome to AgentPro — Your Business Is Ready",
    html,
    text,
  });
}

async function sendSubscriptionRenewalEmail(
  email,
  firstName,
  companyName,
  amount,
  expiryDate,
) {
  const safeName =
    escapeHtml(firstName);

  const safeCompany =
    escapeHtml(companyName);

  const amountLabel =
    formatMoney(amount);

  const expiryLabel =
    formatDateGh(expiryDate);

  const html = renderEmail({
    preheader:
      `Your AgentPro Business Plan is renewed through ${expiryLabel}.`,
    eyebrow:
      "PAYMENT VERIFIED",
    title:
      "Business Plan renewed",
    bodyHtml: `
      <p
        style="
          margin: 0 0 16px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        Hello <strong>${safeName}</strong>,
      </p>

      <p
        style="
          margin: 0 0 22px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        The AgentPro Business Plan for
        <strong>${safeCompany}</strong>
        has been renewed successfully.
      </p>

      <table
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
        width="100%"
        style="
          margin: 0 0 22px;
          background: #EDF7F5;
          border: 1px solid #CDE5E0;
          border-radius: 12px;
        "
      >
        <tr>
          <td
            style="
              padding: 16px 18px 8px;
              color: ${BRAND.muted};
              font-size: 12px;
              line-height: 18px;
              font-weight: 700;
            "
          >
            VERIFIED PAYMENT
          </td>
          <td
            align="right"
            style="
              padding: 16px 18px 8px;
              color: ${BRAND.text};
              font-size: 14px;
              line-height: 18px;
              font-weight: 800;
            "
          >
            ${escapeHtml(amountLabel)}
          </td>
        </tr>

        <tr>
          <td
            style="
              padding: 8px 18px 16px;
              color: ${BRAND.muted};
              font-size: 12px;
              line-height: 18px;
              font-weight: 700;
            "
          >
            ACTIVE UNTIL
          </td>
          <td
            align="right"
            style="
              padding: 8px 18px 16px;
              color: ${BRAND.tealDark};
              font-size: 14px;
              line-height: 18px;
              font-weight: 800;
            "
          >
            ${escapeHtml(expiryLabel)}
          </td>
        </tr>
      </table>

      <p
        style="
          margin: 0;
          color: ${BRAND.muted};
          font-size: 13px;
          line-height: 21px;
        "
      >
        No further action is required.
        Your Business access remains active.
      </p>
    `,
  });

  const text = [
    `Hello ${firstName},`,
    "",
    `The AgentPro Business Plan for ${companyName} has been renewed successfully.`,
    `Verified payment: ${amountLabel}`,
    `Active until: ${expiryLabel}`,
    "",
    "No further action is required.",
    textFooter(),
  ].join("\n");

  return sendEmail({
    to: email,
    subject:
      "AgentPro — Business Plan Renewed",
    html,
    text,
  });
}

async function sendSubscriptionReminderEmail(
  email,
  firstName,
  daysLeft,
  expiryDate,
) {
  const safeName =
    escapeHtml(firstName);

  const expiryLabel =
    formatDateGh(expiryDate);

  const days =
    Number(daysLeft);

  const dayLabel =
    `${days} day${days === 1 ? "" : "s"}`;

  const html = renderEmail({
    preheader:
      `Your AgentPro Business Plan expires in ${dayLabel}.`,
    eyebrow:
      "SUBSCRIPTION REMINDER",
    title:
      `Business Plan expires in ${dayLabel}`,
    bodyHtml: `
      <p
        style="
          margin: 0 0 16px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        Hello <strong>${safeName}</strong>,
      </p>

      <p
        style="
          margin: 0 0 20px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        Your AgentPro Business Plan is currently
        scheduled to expire on
        <strong>${escapeHtml(expiryLabel)}</strong>.
      </p>

      <div
        style="
          padding: 17px 19px;
          background: #FFF8E6;
          border: 1px solid #F0D68B;
          border-radius: 10px;
          color: #624D13;
          font-size: 13px;
          line-height: 21px;
        "
      >
        Open AgentPro to review the current
        seat-based renewal amount and choose
        your preferred payment method.
      </div>
    `,
  });

  const text = [
    `Hello ${firstName},`,
    "",
    `Your AgentPro Business Plan expires in ${dayLabel}.`,
    `Expiry date: ${expiryLabel}`,
    "",
    "Open AgentPro to review the current seat-based renewal amount and choose your preferred payment method.",
    textFooter(),
  ].join("\n");

  return sendEmail({
    to: email,
    subject:
      `AgentPro — Business Plan Expires in ${dayLabel}`,
    html,
    text,
  });
}

async function sendNewEmployeeEmail(
  email,
  firstName,
  lastName,
  role,
  companyName,
  setupUrl,
) {
  const roleLabel = String(role || "")
    .split("_")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");

  const safeName =
    escapeHtml(firstName);

  const safeCompany =
    escapeHtml(companyName);

  const safeRole =
    escapeHtml(roleLabel);

  const html = renderEmail({
    preheader:
      `${companyName} invited you to AgentPro.`,
    eyebrow:
      "TEAM INVITATION",
    title:
      "Set up your AgentPro access",
    bodyHtml: `
      <p
        style="
          margin: 0 0 16px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        Akwaaba, <strong>${safeName}</strong>.
      </p>

      <p
        style="
          margin: 0 0 18px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        <strong>${safeCompany}</strong>
        has added you to AgentPro as a
        <strong>${safeRole}</strong>.
      </p>

      <p
        style="
          margin: 0 0 18px;
          color: ${BRAND.text};
          font-size: 15px;
          line-height: 24px;
        "
      >
        For your security, no password has been
        created or shared on your behalf.
        Choose your own password using the
        secure setup button below.
      </p>

      <div
        style="
          margin-top: 22px;
          padding: 16px 18px;
          background: #FFF8E6;
          border: 1px solid #F0D68B;
          border-radius: 10px;
          color: #624D13;
          font-size: 13px;
          line-height: 20px;
        "
      >
        This one-time setup link expires in
        <strong>1 hour</strong>.
        Do not forward or share it.
      </div>
    `,
    cta: {
      href: setupUrl,
      label:
        "Set Your Password",
    },
  });

  const text = [
    `Akwaaba, ${firstName}.`,
    "",
    `${companyName} has added you to AgentPro as a ${roleLabel}.`,
    "For security, choose your own password using this one-time setup link:",
    setupUrl,
    "",
    "This one-time setup link expires in 1 hour. Do not forward or share it.",
    `If it expires, use Forgot Password with ${email}.`,
    textFooter(),
  ].join("\n");

  return sendEmail({
    to: email,
    subject:
      `AgentPro — Set Up Your ${roleLabel} Access`,
    html,
    text,
  });
}

module.exports = {
  BRAND,
  escapeHtml,
  formatDateGh,
  formatMoney,
  renderEmail,
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendSubscriptionRenewalEmail,
  sendSubscriptionReminderEmail,
  sendNewEmployeeEmail,
};
