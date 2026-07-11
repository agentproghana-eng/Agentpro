const { Resend } = require("resend");
const { logger } = require("../utils/logger");

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend requires a verified domain to send from a custom address.
// Until a real domain is verified in the Resend dashboard, EMAIL_FROM
// should stay as onboarding@resend.dev (the free-tier test sender).
const FROM = process.env.EMAIL_FROM || "Agent Pro Ghana <onboarding@resend.dev>";

async function sendEmail({ to, subject, html, text }) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      text,
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    logger.info(`Email sent to ${to}: ${subject} (id: ${data?.id})`);
  } catch (error) {
    logger.error("Email send error:", error);
    throw error;
  }
}

async function sendPasswordResetEmail(email, firstName, resetUrl) {
  return sendEmail({
    to: email,
    subject: 'Agent Pro Ghana — Reset Your Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #006B5E; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Agent Pro Ghana</h1>
        </div>
        <div style="padding: 32px; background: #f9f9f9;">
          <h2>Hello ${firstName},</h2>
          <p>We received a request to reset your Agent Pro Ghana password.</p>
          <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}"
               style="background: #006B5E; color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 8px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            If you did not request a password reset, please ignore this email.
            Your account is safe.
          </p>
          <p style="color: #666; font-size: 14px;">
            Never share your password or MoMo PIN with anyone.
          </p>
        </div>
        <div style="padding: 16px; text-align: center; color: #999; font-size: 12px;">
          © ${new Date().getFullYear()} Agent Pro Ghana. All rights reserved.
        </div>
      </div>
    `,
  });
}

async function sendWelcomeEmail(email, firstName, companyName) {
  return sendEmail({
    to: email,
    subject: 'Welcome to Agent Pro Ghana — Account Approved!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #006B5E; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Agent Pro Ghana</h1>
          <p style="color: #4DB6A9; margin: 4px 0 0;">One App. Every Mobile Money Business.</p>
        </div>
        <div style="padding: 32px; background: #f9f9f9;">
          <h2>Akwaaba, ${firstName}! 🎉</h2>
          <p>Your Agent Pro Ghana account for <strong>${companyName}</strong> has been approved and activated.</p>
          <p>You can now:</p>
          <ul>
            <li>Process MTN Mobile Money, Telecel Cash, and AT Money transactions</li>
            <li>Manage your float and track commissions</li>
            <li>Generate reports and analytics</li>
            <li>Access the Market Centre</li>
            <li>Use your AI-powered business assistant</li>
          </ul>
          <div style="text-align: center; margin: 32px 0;">
            <p style="color: #006B5E; font-weight: bold;">Download the Agent Pro Ghana app to get started.</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            Need help? Contact us at support@agentproghana.com
          </p>
        </div>
        <div style="padding: 16px; text-align: center; color: #999; font-size: 12px;">
          © ${new Date().getFullYear()} Agent Pro Ghana. All rights reserved.
        </div>
      </div>
    `,
  });
}

async function sendSubscriptionReminderEmail(email, firstName, daysLeft, expiryDate) {
  return sendEmail({
    to: email,
    subject: `Agent Pro Ghana — Subscription Expires in ${daysLeft} Day${daysLeft > 1 ? 's' : ''}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #006B5E; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Agent Pro Ghana</h1>
        </div>
        <div style="padding: 32px; background: #f9f9f9;">
          <h2>Hello ${firstName},</h2>
          <p>Your Agent Pro Ghana Business Plan subscription expires on
             <strong>${new Date(expiryDate).toLocaleDateString('en-GH', {
               weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
             })}</strong>
             — in <strong>${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong>.
          </p>
          <p>To continue processing Mobile Money transactions without interruption,
             please renew your subscription by paying <strong>GH₵10</strong> via MTN MoMo
             to the Agent Pro Ghana merchant number in the app.
          </p>
          <p style="color: #666; font-size: 14px;">
            Open the app → Settings → Subscription → Renew
          </p>
        </div>
        <div style="padding: 16px; text-align: center; color: #999; font-size: 12px;">
          © ${new Date().getFullYear()} Agent Pro Ghana. All rights reserved.
        </div>
      </div>
    `,
  });
}

async function sendNewEmployeeEmail(email, firstName, lastName, role, companyName, tempPassword) {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  return sendEmail({
    to: email,
    subject: `Agent Pro Ghana - You have been added as ${roleLabel} at ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #006B5E; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Agent Pro Ghana</h1>
          <p style="color: #4DB6A9; margin: 4px 0 0;">One App. Every Mobile Money Business.</p>
        </div>
        <div style="padding: 32px; background: #f9f9f9;">
          <h2>Akwaaba, ${firstName}!</h2>
          <p>You have been added by <strong>${companyName}</strong> to Agent Pro Ghana
             as a <strong>${roleLabel}</strong>. Welcome to the team!</p>
          <div style="background: white; border: 2px solid #006B5E; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <h3 style="margin-top: 0; color: #006B5E;">Your Login Details</h3>
            <p style="margin: 8px 0;"><strong>Username (Email):</strong> ${email}</p>
            <p style="margin: 8px 0;"><strong>Temporary Password:</strong> 
              <span style="font-family: monospace; background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${tempPassword}</span>
            </p>
          </div>
          <p style="color: #b00020; font-size: 14px;">
            For your security, please log in and change this password as soon as possible
            (Settings screen inside the app).
          </p>
          <p style="color: #666; font-size: 14px;">
            Download the Agent Pro Ghana app and sign in with the details above to get started.
          </p>
          <p style="color: #666; font-size: 14px;">
            Never share your password or MoMo PIN with anyone, including Agent Pro Ghana staff.
          </p>
        </div>
        <div style="padding: 16px; text-align: center; color: #999; font-size: 12px;">
          &copy; ${new Date().getFullYear()} Agent Pro Ghana. All rights reserved.
        </div>
      </div>
    `,
  });
}
module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendSubscriptionReminderEmail,
  sendNewEmployeeEmail,
};
