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
  console.log("=".repeat(60));
  console.log("EMAIL SERVICE - Password Reset Email");
  console.log("=".repeat(60));
  console.log(`To: ${options.to}`);
  console.log(`Subject: ${options.subject}`);
  console.log("-".repeat(60));
  console.log(options.text);
  console.log("=".repeat(60));
  
  return {
    success: true,
    messageId: `local-${Date.now()}`,
  };
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

This link will expire in 30 minutes.

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
        This link will expire in 30 minutes.
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
