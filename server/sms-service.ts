import crypto from "crypto";
import { storage } from "./storage";
import bcrypt from "bcryptjs";

const PLIVO_AUTH_ID = process.env.PLIVO_AUTH_ID;
const PLIVO_AUTH_TOKEN = process.env.PLIVO_AUTH_TOKEN;
const PLIVO_PHONE_NUMBER = process.env.PLIVO_PHONE_NUMBER;

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 3;
const RATE_LIMIT_MINUTES = 1;

interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface VerifyOtpResult {
  success: boolean;
  error?: string;
  remainingAttempts?: number;
}

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

async function verifyOtpHash(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

export async function sendSms(to: string, message: string): Promise<SendSmsResult> {
  if (!PLIVO_AUTH_ID || !PLIVO_AUTH_TOKEN || !PLIVO_PHONE_NUMBER) {
    console.error("[SMS] Plivo credentials not configured");
    return { success: false, error: "SMS service not configured" };
  }

  const formattedPhone = to.startsWith("+") ? to : `+${to}`;

  try {
    const url = `https://api.plivo.com/v1/Account/${PLIVO_AUTH_ID}/Message/`;
    const auth = Buffer.from(`${PLIVO_AUTH_ID}:${PLIVO_AUTH_TOKEN}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        src: PLIVO_PHONE_NUMBER,
        dst: formattedPhone,
        text: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[SMS] Plivo API error:", response.status, errorText);
      return { success: false, error: `SMS delivery failed: ${response.status}` };
    }

    const result = await response.json();
    console.log("[SMS] Message sent successfully:", result.message_uuid?.[0]);
    return { success: true, messageId: result.message_uuid?.[0] };
  } catch (error) {
    console.error("[SMS] Error sending SMS:", error);
    return { success: false, error: "Failed to send SMS" };
  }
}

export function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
  if (!cleaned.startsWith("+")) {
    if (cleaned.length === 10) {
      cleaned = "+1" + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
      cleaned = "+" + cleaned;
    } else {
      cleaned = "+" + cleaned;
    }
  }
  return cleaned;
}

export function validatePhoneNumber(phone: string): boolean {
  const e164Regex = /^\+[1-9]\d{9,14}$/;
  return e164Regex.test(phone);
}

export async function sendOtpCode(
  phone: string,
  purpose: "PHONE_VERIFICATION" | "TWO_FACTOR_AUTH",
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!isPlivo_configured()) {
    return { success: false, error: "SMS service not configured" };
  }

  const normalizedPhone = normalizePhoneNumber(phone);

  if (!validatePhoneNumber(normalizedPhone)) {
    return { success: false, error: "Invalid phone number format. Use E.164 format (e.g., +12025551234)" };
  }

  const recentOtp = await storage.getRecentSmsOtp(normalizedPhone, RATE_LIMIT_MINUTES);
  if (recentOtp) {
    const waitTime = Math.ceil(
      (new Date(recentOtp.createdAt).getTime() + RATE_LIMIT_MINUTES * 60 * 1000 - Date.now()) / 1000
    );
    return { success: false, error: `Please wait ${waitTime} seconds before requesting another code` };
  }

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  const message = purpose === "PHONE_VERIFICATION"
    ? `Your verification code is: ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`
    : `Your login code is: ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`;

  const result = await sendSms(normalizedPhone, message);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  await storage.createSmsOtp({
    userId: userId || null,
    phone: normalizedPhone,
    codeHash: otpHash,
    purpose,
    attempts: 0,
    maxAttempts: MAX_OTP_ATTEMPTS,
    expiresAt,
  });

  return { success: true };
}

export async function verifyOtpCode(
  phone: string,
  code: string,
  purpose: "PHONE_VERIFICATION" | "TWO_FACTOR_AUTH"
): Promise<VerifyOtpResult> {
  const normalizedPhone = normalizePhoneNumber(phone);
  const otpRecord = await storage.getValidSmsOtp(normalizedPhone, purpose);

  if (!otpRecord) {
    return { success: false, error: "No valid verification code found. Please request a new one." };
  }

  if (new Date(otpRecord.expiresAt) < new Date()) {
    return { success: false, error: "Verification code has expired. Please request a new one." };
  }

  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    return { success: false, error: "Too many failed attempts. Please request a new code." };
  }

  const isValid = await verifyOtpHash(code, otpRecord.codeHash);

  if (!isValid) {
    await storage.incrementSmsOtpAttempts(otpRecord.id);
    const remaining = otpRecord.maxAttempts - (otpRecord.attempts + 1);
    return {
      success: false,
      error: remaining > 0 ? `Invalid code. ${remaining} attempts remaining.` : "Too many failed attempts.",
      remainingAttempts: remaining,
    };
  }

  await storage.markSmsOtpUsed(otpRecord.id);
  return { success: true };
}

export function isPlivo_configured(): boolean {
  return !!(PLIVO_AUTH_ID && PLIVO_AUTH_TOKEN && PLIVO_PHONE_NUMBER);
}
