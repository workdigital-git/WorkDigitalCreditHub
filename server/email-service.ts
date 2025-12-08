import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'noreply@workdigitalaccess.com';
const FROM_NAME = 'Work Digital';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured - logging email instead");
    console.log("=".repeat(60));
    console.log("EMAIL SERVICE - Email (No API Key)");
    console.log("=".repeat(60));
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log("-".repeat(60));
    console.log(options.text);
    console.log("=".repeat(60));
    
    return {
      success: false,
      error: "RESEND_API_KEY not configured",
    };
  }

  try {
    console.log(`[Email Service] Sending email to: ${options.to}, subject: ${options.subject}`);
    console.log(`[Email Service] From: ${FROM_NAME} <${FROM_EMAIL}>`);
    console.log(`[Email Service] API Key configured: ${!!process.env.RESEND_API_KEY}`);
    
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    console.log(`[Email Service] Resend API response:`, JSON.stringify(result, null, 2));

    if (result.error) {
      console.error("[Email Service] Resend API error:", result.error);
      return {
        success: false,
        error: result.error.message,
      };
    }

    console.log(`[Email Service] Email sent successfully to ${options.to}, ID: ${result.data?.id}`);
    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error("[Email Service] Email send exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  baseUrl: string
): Promise<EmailResult> {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  
  const text = `
Hello,

You requested to reset your password for your Work Digital account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 15 minutes.

If you did not request this password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The Work Digital Team
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: 700; color: #2563eb; }
    .content { background: #f8fafc; border-radius: 12px; padding: 30px; margin-bottom: 30px; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; font-size: 14px; color: #64748b; }
    .link { word-break: break-all; color: #2563eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Work Digital</div>
      <p>Client Credit Portal</p>
    </div>
    <div class="content">
      <h2>Reset Your Password</h2>
      <p>You requested to reset your password for your Work Digital account.</p>
      <p>Click the button below to reset your password:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <p style="font-size: 14px; color: #64748b;">
        Or copy and paste this link into your browser:<br>
        <a href="${resetUrl}" class="link">${resetUrl}</a>
      </p>
      <p style="font-size: 14px; color: #64748b;">
        This link will expire in 15 minutes.
      </p>
    </div>
    <div class="footer">
      <p>If you did not request this password reset, please ignore this email.</p>
      <p>&copy; ${new Date().getFullYear()} Work Digital LLC. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`.trim();

  return sendEmail({
    to: email,
    subject: "Reset Your Work Digital Password",
    text,
    html,
  });
}

export async function sendTestEmail(
  to: string,
  subject?: string,
  message?: string
): Promise<EmailResult> {
  const testSubject = subject || "Work Digital - Email Test";
  const testMessage = message || "This is a test email from Work Digital Client Credit Portal.";
  
  const text = `
${testMessage}

This email was sent as a test from the Work Digital admin panel.

Best regards,
The Work Digital Team
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: 700; color: #2563eb; }
    .content { background: #f8fafc; border-radius: 12px; padding: 30px; margin-bottom: 30px; }
    .footer { text-align: center; font-size: 14px; color: #64748b; }
    .badge { display: inline-block; background: #22c55e; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Work Digital</div>
      <p>Client Credit Portal</p>
    </div>
    <div class="content">
      <h2>${testSubject}</h2>
      <p>${testMessage}</p>
      <p style="margin-top: 20px;">
        <span class="badge">Test Email</span>
      </p>
      <p style="font-size: 14px; color: #64748b; margin-top: 20px;">
        This email was sent as a test from the Work Digital admin panel.
      </p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Work Digital LLC. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`.trim();

  return sendEmail({
    to,
    subject: testSubject,
    text,
    html,
  });
}

export function checkEmailConfiguration(): { configured: boolean; domain: string; fromEmail: string } {
  return {
    configured: !!process.env.RESEND_API_KEY,
    domain: 'workdigitalaccess.com',
    fromEmail: FROM_EMAIL,
  };
}
