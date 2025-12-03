import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import {
  insertUserSchema,
  loginSchema,
  fundWalletSchema,
  insertPaymentMethodSchema,
  insertAppSchema,
} from "@shared/schema";
import { sendOtpCode, verifyOtpCode, isPlivo_configured, normalizePhoneNumber, validatePhoneNumber } from "./sms-service";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required for JWT authentication");
}

const JWT_SECRET = process.env.SESSION_SECRET;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    isAdmin: boolean;
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateAccessToken(userId: string, email: string, isAdmin: boolean): string {
  return jwt.sign({ userId, email, isAdmin }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken(): string {
  return randomBytes(64).toString("hex");
}

function generateApiKey(): string {
  return `ch_${randomBytes(32).toString("hex")}`;
}

function generateClientCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: `client_${randomBytes(16).toString("hex")}`,
    clientSecret: randomBytes(32).toString("hex"),
  };
}

function prepareSafeUserResponse(user: { 
  id: string; 
  email: string; 
  fullName: string | null; 
  phone: string | null; 
  phoneVerified: boolean;
  isAdmin: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  passwordHash?: string;
  twoFactorSecret?: string | null;
}) {
  const { passwordHash, twoFactorSecret, phone, ...rest } = user;
  let maskedPhone = null;
  if (phone) {
    const normalizedPhone = normalizePhoneNumber(phone);
    if (validatePhoneNumber(normalizedPhone)) {
      maskedPhone = rest.phoneVerified ? normalizedPhone : `***${normalizedPhone.slice(-4)}`;
    } else {
      maskedPhone = "***invalid";
    }
  }
  return { ...rest, phone: maskedPhone };
}

async function checkAndExecuteAutoTopup(userId: string, walletId: string): Promise<{ triggered: boolean; newBalance?: number; transactionId?: string; amountCents?: number }> {
  try {
    const wallet = await storage.getWallet(walletId);
    if (!wallet) {
      console.log(`Auto-topup skipped: Wallet ${walletId} not found`);
      return { triggered: false };
    }
    
    const rule = await storage.getAutoTopupRuleByUserId(userId);
    
    if (!rule || !rule.active) {
      return { triggered: false };
    }
    
    if (wallet.balanceCents >= rule.thresholdCents) {
      return { triggered: false };
    }
    
    const paymentMethod = await storage.getPaymentMethod(rule.paymentMethodId);
    if (!paymentMethod) {
      console.log(`Auto-topup skipped: Payment method ${rule.paymentMethodId} not found`);
      return { triggered: false };
    }
    
    if (paymentMethod.userId !== userId) {
      console.log(`Auto-topup skipped: Payment method ${rule.paymentMethodId} does not belong to user ${userId}`);
      return { triggered: false };
    }
    
    const transaction = await storage.createTransaction({
      walletId: wallet.id,
      type: "CREDIT",
      source: "AUTO_TOPUP",
      amountCents: rule.topupAmountCents,
      description: `Auto top-up via ${paymentMethod.brand || paymentMethod.type}`,
      status: "COMPLETED",
      appId: null,
    });
    
    const updatedWallet = await storage.updateWalletBalance(wallet.id, rule.topupAmountCents);
    
    console.log(`Auto-topup executed: ${rule.topupAmountCents} cents added to wallet ${wallet.id}`);
    
    return {
      triggered: true,
      newBalance: updatedWallet?.balanceCents,
      transactionId: transaction.id,
      amountCents: rule.topupAmountCents,
    };
  } catch (error) {
    console.error("Auto-topup execution error:", error);
    return { triggered: false };
  }
}

async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; isAdmin: boolean };
    req.user = { id: decoded.userId, email: decoded.email, isAdmin: decoded.isAdmin };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

async function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

type AuditEventType = 
  | "AUTH_LOGIN" | "AUTH_LOGOUT" | "AUTH_REGISTER" | "AUTH_PASSWORD_CHANGE" | "AUTH_2FA_ENABLE" | "AUTH_2FA_DISABLE"
  | "WALLET_FUND" | "WALLET_DEBIT" | "WALLET_AUTO_TOPUP"
  | "PAYMENT_METHOD_ADD" | "PAYMENT_METHOD_REMOVE" | "PAYMENT_METHOD_SET_DEFAULT"
  | "API_KEY_CREATE" | "API_KEY_REVOKE"
  | "APP_SUBSCRIBE" | "APP_UNSUBSCRIBE"
  | "ADMIN_ACTION";

async function createAuditLog(
  req: Request,
  eventType: AuditEventType,
  action: string,
  userId: string | null,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await storage.createAuditLog({
      userId,
      eventType,
      entityType: entityType || null,
      entityId: entityId || null,
      action,
      details: details ? JSON.stringify(details) : null,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validation = insertUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }

      const { email, password, fullName, phone } = validation.data;

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      let normalizedPhone = null;
      if (phone) {
        normalizedPhone = normalizePhoneNumber(phone);
        if (!validatePhoneNumber(normalizedPhone)) {
          return res.status(400).json({ message: "Invalid phone number format. Use format: +12025551234" });
        }
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await storage.createUser({
        email,
        passwordHash,
        fullName: fullName || null,
        phone: normalizedPhone,
        phoneVerified: false,
        isAdmin: false,
        twoFactorEnabled: false,
        twoFactorMethod: "TOTP",
        twoFactorSecret: null,
      });

      await storage.createWallet({
        userId: user.id,
        currency: "USD",
        balanceCents: 0,
      });

      const accessToken = generateAccessToken(user.id, user.email, user.isAdmin);
      const refreshToken = generateRefreshToken();
      const refreshTokenHash = hashToken(refreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await storage.createRefreshToken(user.id, refreshTokenHash, expiresAt);

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await createAuditLog(req, "AUTH_REGISTER", "User registered", user.id, "user", user.id, { email: user.email });

      const safeUser = prepareSafeUserResponse(user);
      res.status(201).json({ user: safeUser });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }

      const { email, password, totpCode, smsCode } = validation.data;
      const user = await storage.getUserByEmail(email);

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.twoFactorEnabled) {
        const method = user.twoFactorMethod || "TOTP";

        if (method === "TOTP") {
          if (!user.twoFactorSecret) {
            return res.status(403).json({ 
              message: "Your 2FA is misconfigured. Please contact support to reset your account." 
            });
          }
          
          if (!totpCode) {
            return res.status(200).json({ requiresTwoFactor: true, method: "TOTP" });
          }

          const isValid = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: "base32",
            token: totpCode,
          });

          if (!isValid) {
            return res.status(401).json({ message: "Invalid 2FA code" });
          }
        } else if (method === "SMS") {
          if (!user.phone || !user.phoneVerified) {
            return res.status(403).json({ 
              message: "Your SMS 2FA is misconfigured. Please contact support to reset your account." 
            });
          }
          
          if (!isPlivo_configured()) {
            return res.status(503).json({ 
              message: "SMS service not available. Please contact support to reset your 2FA method." 
            });
          }

          if (!smsCode) {
            const sendResult = await sendOtpCode(user.phone, "TWO_FACTOR_AUTH", user.id);
            if (!sendResult.success) {
              return res.status(500).json({ message: sendResult.error || "Failed to send SMS code" });
            }
            const normalizedPhone = normalizePhoneNumber(user.phone);
            return res.status(200).json({ 
              requiresTwoFactor: true, 
              method: "SMS",
              phoneLast4: normalizedPhone.slice(-4),
            });
          }

          const verifyResult = await verifyOtpCode(user.phone, smsCode, "TWO_FACTOR_AUTH");
          if (!verifyResult.success) {
            return res.status(401).json({ message: verifyResult.error || "Invalid SMS code" });
          }
        } else {
          return res.status(403).json({ 
            message: "Your 2FA method is not recognized. Please contact support to reset your account." 
          });
        }
      }

      const accessToken = generateAccessToken(user.id, user.email, user.isAdmin);
      const refreshToken = generateRefreshToken();
      const refreshTokenHash = hashToken(refreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await storage.createRefreshToken(user.id, refreshTokenHash, expiresAt);

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await createAuditLog(req, "AUTH_LOGIN", "User logged in", user.id, "user", user.id, { email: user.email, twoFactorUsed: user.twoFactorEnabled, twoFactorMethod: user.twoFactorMethod });

      const safeUser = prepareSafeUserResponse(user);
      res.json({ user: safeUser });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/2fa/resend-sms", async (req, res) => {
    try {
      if (!isPlivo_configured()) {
        return res.status(503).json({ message: "SMS service is not configured" });
      }

      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);

      if (!user || !user.twoFactorEnabled || user.twoFactorMethod !== "SMS" || !user.phone || !user.phoneVerified) {
        return res.status(400).json({ message: "SMS 2FA not configured for this account" });
      }

      const result = await sendOtpCode(user.phone, "TWO_FACTOR_AUTH", user.id);

      if (!result.success) {
        return res.status(429).json({ message: result.error });
      }

      res.json({ success: true, message: "Verification code sent" });
    } catch (error) {
      console.error("2FA resend error:", error);
      res.status(500).json({ message: "Failed to resend code" });
    }
  });

  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ message: "Refresh token required" });
      }

      const tokenHash = hashToken(refreshToken);
      const storedToken = await storage.getRefreshTokenByHash(tokenHash);

      if (!storedToken || storedToken.expiresAt < new Date()) {
        return res.status(401).json({ message: "Invalid or expired refresh token" });
      }

      const user = await storage.getUser(storedToken.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      await storage.deleteRefreshToken(storedToken.id);

      const accessToken = generateAccessToken(user.id, user.email, user.isAdmin);
      const newRefreshToken = generateRefreshToken();
      const newRefreshTokenHash = hashToken(newRefreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await storage.createRefreshToken(user.id, newRefreshTokenHash, expiresAt);

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Refresh error:", error);
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  app.post("/api/auth/logout", async (req: AuthRequest, res) => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken) {
        const tokenHash = hashToken(refreshToken);
        const storedToken = await storage.getRefreshTokenByHash(tokenHash);
        if (storedToken) {
          await storage.deleteRefreshToken(storedToken.id);
        }
      }

      let userId: string | null = null;
      try {
        const accessToken = req.cookies?.accessToken;
        if (accessToken) {
          const decoded = jwt.verify(accessToken, JWT_SECRET) as { userId: string };
          userId = decoded.userId;
        }
      } catch {}

      if (userId) {
        await createAuditLog(req, "AUTH_LOGOUT", "User logged out", userId, "user", userId);
      }

      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const safeUser = prepareSafeUserResponse(user);
      res.json({ user: safeUser });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  app.patch("/api/user/profile", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { fullName, phone } = req.body;
      
      let normalizedPhone = null;
      if (phone) {
        normalizedPhone = normalizePhoneNumber(phone);
        if (!validatePhoneNumber(normalizedPhone)) {
          return res.status(400).json({ message: "Invalid phone number format. Use format: +12025551234" });
        }
      }
      
      const user = await storage.updateUser(req.user!.id, {
        fullName: fullName || null,
        phone: normalizedPhone,
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const safeUser = prepareSafeUserResponse(user);
      res.json({ user: safeUser });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/user/change-password", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(req.user!.id, { passwordHash });

      await createAuditLog(req, "AUTH_PASSWORD_CHANGE", "Password changed", req.user!.id, "user", req.user!.id);

      res.json({ success: true });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.post("/api/user/2fa/setup", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const secret = speakeasy.generateSecret({
        name: `Credits Hub (${user.email})`,
        issuer: "Credits Hub",
      });

      await storage.updateUser(req.user!.id, { twoFactorSecret: secret.base32 });

      const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

      res.json({ secret: secret.base32, qrCode });
    } catch (error) {
      console.error("2FA setup error:", error);
      res.status(500).json({ message: "Failed to setup 2FA" });
    }
  });

  app.post("/api/user/2fa/confirm", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { code } = req.body;
      const user = await storage.getUser(req.user!.id);

      if (!user || !user.twoFactorSecret) {
        return res.status(400).json({ message: "2FA not initialized" });
      }

      const isValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: code,
      });

      if (!isValid) {
        return res.status(400).json({ message: "Invalid verification code" });
      }

      await storage.updateUser(req.user!.id, { 
        twoFactorEnabled: true,
        twoFactorMethod: "TOTP",
      });

      await createAuditLog(req, "AUTH_2FA_ENABLE", "Two-factor authentication enabled", req.user!.id, "user", req.user!.id, { method: "TOTP" });

      res.json({ success: true });
    } catch (error) {
      console.error("2FA confirm error:", error);
      res.status(500).json({ message: "Failed to confirm 2FA" });
    }
  });

  app.post("/api/user/2fa/disable", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.updateUser(req.user!.id, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorMethod: null,
      });

      await createAuditLog(req, "AUTH_2FA_DISABLE", "Two-factor authentication disabled", req.user!.id, "user", req.user!.id);

      res.json({ success: true });
    } catch (error) {
      console.error("2FA disable error:", error);
      res.status(500).json({ message: "Failed to disable 2FA" });
    }
  });

  app.get("/api/user/2fa/sms/status", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let maskedPhone = null;
      if (user.phone) {
        const normalizedPhone = normalizePhoneNumber(user.phone);
        maskedPhone = `***${normalizedPhone.slice(-4)}`;
      }

      res.json({
        smsConfigured: isPlivo_configured(),
        phoneVerified: user.phoneVerified,
        phone: maskedPhone,
        twoFactorMethod: user.twoFactorMethod,
        twoFactorEnabled: user.twoFactorEnabled,
      });
    } catch (error) {
      console.error("2FA SMS status error:", error);
      res.status(500).json({ message: "Failed to get SMS 2FA status" });
    }
  });

  app.post("/api/user/phone/add", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { phone } = req.body;

      if (!phone || typeof phone !== "string") {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!isPlivo_configured()) {
        return res.status(503).json({ message: "SMS service is not configured. Please contact support." });
      }

      const normalizedPhone = normalizePhoneNumber(phone);

      if (!validatePhoneNumber(normalizedPhone)) {
        return res.status(400).json({ message: "Invalid phone number format. Use format: +12025551234" });
      }

      await storage.updateUser(req.user!.id, {
        phone: normalizedPhone,
        phoneVerified: false,
      });

      const result = await sendOtpCode(normalizedPhone, "PHONE_VERIFICATION", req.user!.id);

      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to send verification code" });
      }

      res.json({ success: true, message: "Verification code sent to your phone" });
    } catch (error) {
      console.error("Phone add error:", error);
      res.status(500).json({ message: "Failed to add phone number" });
    }
  });

  app.post("/api/user/phone/verify", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { code } = req.body;
      const user = await storage.getUser(req.user!.id);

      if (!user || !user.phone) {
        return res.status(400).json({ message: "No phone number to verify" });
      }

      const result = await verifyOtpCode(user.phone, code, "PHONE_VERIFICATION");

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      await storage.updateUser(req.user!.id, { phoneVerified: true });

      res.json({ success: true, message: "Phone number verified successfully" });
    } catch (error) {
      console.error("Phone verify error:", error);
      res.status(500).json({ message: "Failed to verify phone number" });
    }
  });

  app.post("/api/user/phone/resend", authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (!isPlivo_configured()) {
        return res.status(503).json({ message: "SMS service is not configured" });
      }

      const user = await storage.getUser(req.user!.id);

      if (!user || !user.phone) {
        return res.status(400).json({ message: "No phone number to verify" });
      }

      const result = await sendOtpCode(user.phone, "PHONE_VERIFICATION", req.user!.id);

      if (!result.success) {
        return res.status(429).json({ message: result.error });
      }

      res.json({ success: true, message: "Verification code sent" });
    } catch (error) {
      console.error("Phone resend error:", error);
      res.status(500).json({ message: "Failed to resend verification code" });
    }
  });

  app.post("/api/user/2fa/sms/setup", authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (!isPlivo_configured()) {
        return res.status(503).json({ message: "SMS service is not configured. Please use authenticator app instead." });
      }

      const user = await storage.getUser(req.user!.id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.phone || !user.phoneVerified) {
        return res.status(400).json({ message: "Please verify your phone number first" });
      }

      await storage.updateUser(req.user!.id, {
        twoFactorEnabled: true,
        twoFactorMethod: "SMS",
      });

      await createAuditLog(req, "AUTH_2FA_ENABLE", "SMS two-factor authentication enabled", req.user!.id, "user", req.user!.id, { method: "SMS" });

      res.json({ success: true, message: "SMS 2FA enabled successfully" });
    } catch (error) {
      console.error("SMS 2FA setup error:", error);
      res.status(500).json({ message: "Failed to setup SMS 2FA" });
    }
  });

  app.post("/api/user/2fa/method", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { method } = req.body;

      if (!["TOTP", "SMS"].includes(method)) {
        return res.status(400).json({ message: "Invalid 2FA method" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.twoFactorEnabled) {
        return res.status(400).json({ message: "2FA is not enabled" });
      }

      if (method === "SMS") {
        if (!isPlivo_configured()) {
          return res.status(503).json({ message: "SMS service is not configured. Please use authenticator app." });
        }
        if (!user.phone || !user.phoneVerified) {
          return res.status(400).json({ message: "Please verify your phone number first" });
        }
      }

      if (method === "TOTP" && !user.twoFactorSecret) {
        return res.status(400).json({ message: "Please set up TOTP first" });
      }

      await storage.updateUser(req.user!.id, { twoFactorMethod: method });

      res.json({ success: true, method });
    } catch (error) {
      console.error("2FA method change error:", error);
      res.status(500).json({ message: "Failed to change 2FA method" });
    }
  });

  app.get("/api/dashboard", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const wallet = await storage.getWalletByUserId(req.user!.id);
      const subscriptions = await storage.getAppSubscriptionsByUserId(req.user!.id);
      const paymentMethodsCount = (await storage.getPaymentMethodsByUserId(req.user!.id)).length;

      let recentTransactions: any[] = [];
      if (wallet) {
        const transactions = await storage.getTransactionsByWalletId(wallet.id, 10);
        recentTransactions = transactions;
      }

      const activeSubscriptions = subscriptions.filter((s) => s.status === "ACTIVE");

      res.json({
        wallet,
        recentTransactions,
        subscriptions: activeSubscriptions,
        stats: {
          totalCredits: wallet?.balanceCents || 0,
          monthlySpend: 0,
          activeApps: activeSubscriptions.length,
          pendingTransactions: paymentMethodsCount,
        },
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Failed to load dashboard" });
    }
  });

  app.get("/api/wallet", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const wallet = await storage.getWalletByUserId(req.user!.id);
      const paymentMethods = await storage.getPaymentMethodsByUserId(req.user!.id);
      const autoTopupRule = await storage.getAutoTopupRuleByUserId(req.user!.id);

      let transactions: any[] = [];
      if (wallet) {
        transactions = await storage.getTransactionsByWalletId(wallet.id, 100);
      }

      res.json({
        wallet,
        transactions,
        paymentMethods,
        autoTopupRule,
      });
    } catch (error) {
      console.error("Wallet error:", error);
      res.status(500).json({ message: "Failed to load wallet" });
    }
  });

  app.post("/api/wallet/fund", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const validation = fundWalletSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }

      const { amountCents, paymentMethodId } = validation.data;

      const paymentMethod = await storage.getPaymentMethod(paymentMethodId);
      if (!paymentMethod || paymentMethod.userId !== req.user!.id) {
        return res.status(404).json({ message: "Payment method not found" });
      }

      const wallet = await storage.getWalletByUserId(req.user!.id);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      const transaction = await storage.createTransaction({
        walletId: wallet.id,
        type: "CREDIT",
        source: "USER_DEPOSIT",
        amountCents,
        description: `Added funds via ${paymentMethod.brand || paymentMethod.type}`,
        status: "COMPLETED",
        appId: null,
      });

      await storage.updateWalletBalance(wallet.id, amountCents);
      await storage.updateTransactionStatus(transaction.id, "COMPLETED");

      await createAuditLog(req, "WALLET_FUND", "Added funds to wallet", req.user!.id, "wallet", wallet.id, { amountCents, transactionId: transaction.id, paymentMethodId });

      res.json({ transaction });
    } catch (error) {
      console.error("Fund wallet error:", error);
      res.status(500).json({ message: "Failed to fund wallet" });
    }
  });

  app.post("/api/wallet/auto-topup", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { thresholdCents, topupAmountCents, paymentMethodId, active, walletId } = req.body;

      const wallet = await storage.getWallet(walletId);
      if (!wallet || wallet.userId !== req.user!.id) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      if (active && paymentMethodId) {
        const paymentMethod = await storage.getPaymentMethod(paymentMethodId);
        if (!paymentMethod || paymentMethod.userId !== req.user!.id) {
          return res.status(404).json({ message: "Payment method not found" });
        }
      }

      const existingRule = await storage.getAutoTopupRuleByUserId(req.user!.id);

      if (existingRule) {
        const updated = await storage.updateAutoTopupRule(existingRule.id, {
          thresholdCents,
          topupAmountCents,
          paymentMethodId: paymentMethodId || existingRule.paymentMethodId,
          active,
        });
        res.json({ rule: updated });
      } else if (active && paymentMethodId) {
        const created = await storage.createAutoTopupRule({
          userId: req.user!.id,
          walletId,
          paymentMethodId,
          thresholdCents,
          topupAmountCents,
          active,
        });
        res.json({ rule: created });
      } else {
        res.json({ rule: null });
      }
    } catch (error) {
      console.error("Auto-topup error:", error);
      res.status(500).json({ message: "Failed to update auto-topup" });
    }
  });

  app.get("/api/payment-methods", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const methods = await storage.getPaymentMethodsByUserId(req.user!.id);
      res.json(methods);
    } catch (error) {
      console.error("Get payment methods error:", error);
      res.status(500).json({ message: "Failed to get payment methods" });
    }
  });

  app.post("/api/payment-methods", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { type, provider, externalId, last4, brand, nickname } = req.body;

      const existingMethods = await storage.getPaymentMethodsByUserId(req.user!.id);
      const isDefault = existingMethods.length === 0;

      const method = await storage.createPaymentMethod({
        userId: req.user!.id,
        type,
        provider,
        externalId,
        last4: last4 || null,
        brand: brand || null,
        nickname: nickname || null,
        isDefault,
      });

      await createAuditLog(req, "PAYMENT_METHOD_ADD", "Payment method added", req.user!.id, "paymentMethod", method.id, { type, brand, last4 });

      res.status(201).json(method);
    } catch (error) {
      console.error("Create payment method error:", error);
      res.status(500).json({ message: "Failed to create payment method" });
    }
  });

  app.patch("/api/payment-methods/:id/default", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const method = await storage.getPaymentMethod(req.params.id);
      if (!method || method.userId !== req.user!.id) {
        return res.status(404).json({ message: "Payment method not found" });
      }

      await storage.setDefaultPaymentMethod(req.user!.id, req.params.id);

      await createAuditLog(req, "PAYMENT_METHOD_SET_DEFAULT", "Payment method set as default", req.user!.id, "paymentMethod", req.params.id);

      res.json({ success: true });
    } catch (error) {
      console.error("Set default payment method error:", error);
      res.status(500).json({ message: "Failed to set default" });
    }
  });

  app.delete("/api/payment-methods/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const method = await storage.getPaymentMethod(req.params.id);
      if (!method || method.userId !== req.user!.id) {
        return res.status(404).json({ message: "Payment method not found" });
      }

      await storage.deletePaymentMethod(req.params.id);

      await createAuditLog(req, "PAYMENT_METHOD_REMOVE", "Payment method removed", req.user!.id, "paymentMethod", req.params.id, { type: method.type, brand: method.brand });

      res.json({ success: true });
    } catch (error) {
      console.error("Delete payment method error:", error);
      res.status(500).json({ message: "Failed to delete payment method" });
    }
  });

  app.get("/api/apps", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const availableApps = await storage.getAllApps();
      const subscriptions = await storage.getAppSubscriptionsByUserId(req.user!.id);

      res.json({ availableApps, subscriptions });
    } catch (error) {
      console.error("Get apps error:", error);
      res.status(500).json({ message: "Failed to get apps" });
    }
  });

  app.post("/api/apps/:id/subscribe", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const app = await storage.getApp(req.params.id);
      if (!app) {
        return res.status(404).json({ message: "App not found" });
      }

      const existing = await storage.getAppSubscription(req.user!.id, req.params.id);
      if (existing && existing.status === "ACTIVE") {
        return res.status(400).json({ message: "Already subscribed" });
      }

      const { billingCycle = "MONTHLY" } = req.body;
      
      const periodStart = new Date();
      let periodEnd = new Date();
      let nextBillingDate = new Date();

      switch (billingCycle) {
        case "MONTHLY":
          periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
          nextBillingDate = periodEnd;
          break;
        case "YEARLY":
          periodEnd = new Date(periodStart.getTime() + 365 * 24 * 60 * 60 * 1000);
          nextBillingDate = periodEnd;
          break;
        case "PER_USE":
          periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
          nextBillingDate = periodEnd;
          break;
        default:
          break;
      }

      const subscription = await storage.createAppSubscription({
        userId: req.user!.id,
        appId: req.params.id,
        billingCycle: billingCycle as "MONTHLY" | "YEARLY" | "PER_USE",
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
        nextBillingDate,
        totalUsageCount: 0,
        cancelledAt: null,
        lastBilledAt: null,
      });

      await createAuditLog(req, "APP_SUBSCRIBE", "Subscribed to app", req.user!.id, "app", req.params.id, { 
        appName: app.name, 
        billingCycle,
        subscriptionId: subscription.id,
      });

      res.json({ success: true, subscription });
    } catch (error) {
      console.error("Subscribe error:", error);
      res.status(500).json({ message: "Failed to subscribe" });
    }
  });

  app.post("/api/apps/:id/unsubscribe", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.cancelAppSubscription(req.user!.id, req.params.id);

      await createAuditLog(req, "APP_UNSUBSCRIBE", "Unsubscribed from app", req.user!.id, "app", req.params.id);

      res.json({ success: true });
    } catch (error) {
      console.error("Unsubscribe error:", error);
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });

  app.post("/api/external/track-usage", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "API key required" });
      }

      const key = authHeader.slice(7);
      const keyHash = hashToken(key);
      const apiKey = await storage.getApiKeyByHash(keyHash);

      if (!apiKey) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return res.status(401).json({ message: "API key expired" });
      }

      await storage.updateApiKeyLastUsed(apiKey.id);

      const { appId } = req.body;
      if (!appId) {
        return res.status(400).json({ message: "appId is required" });
      }

      const subscription = await storage.getAppSubscription(apiKey.userId, appId);
      if (!subscription || subscription.status !== "ACTIVE") {
        return res.status(400).json({ message: "No active subscription for this app" });
      }

      await storage.incrementSubscriptionUsage(subscription.id);

      res.json({ 
        success: true,
        message: "Usage tracked",
        subscriptionId: subscription.id,
      });
    } catch (error) {
      console.error("Track usage error:", error);
      res.status(500).json({ message: "Failed to track usage" });
    }
  });

  app.get("/api/api-keys", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const keys = await storage.getApiKeysByUserId(req.user!.id);
      res.json(keys);
    } catch (error) {
      console.error("Get API keys error:", error);
      res.status(500).json({ message: "Failed to get API keys" });
    }
  });

  app.post("/api/api-keys", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, expiresAt } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const key = generateApiKey();
      const keyHash = hashToken(key);
      const keyPrefix = key.slice(0, 10);

      const apiKey = await storage.createApiKey({
        userId: req.user!.id,
        name,
        keyHash,
        keyPrefix,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        lastUsedAt: null,
      });

      await createAuditLog(req, "API_KEY_CREATE", "API key created", req.user!.id, "apiKey", apiKey.id, { name, keyPrefix });

      res.status(201).json({ key, apiKey });
    } catch (error) {
      console.error("Create API key error:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  app.delete("/api/api-keys/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const key = await storage.getApiKey(req.params.id);
      if (!key || key.userId !== req.user!.id) {
        return res.status(404).json({ message: "API key not found" });
      }

      await storage.deleteApiKey(req.params.id);

      await createAuditLog(req, "API_KEY_REVOKE", "API key revoked", req.user!.id, "apiKey", req.params.id, { name: key.name });

      res.json({ success: true });
    } catch (error) {
      console.error("Delete API key error:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });

  app.get("/api/admin/stats", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ message: "Failed to get stats" });
    }
  });

  app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const users = await storage.getAllUsers();
      const usersWithWallets = await Promise.all(
        users.map(async (user) => {
          const wallet = await storage.getWalletByUserId(user.id);
          const safeUser = prepareSafeUserResponse(user);
          return { ...safeUser, wallet };
        })
      );
      res.json(usersWithWallets);
    } catch (error) {
      console.error("Admin users error:", error);
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  app.get("/api/admin/apps", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const apps = await storage.getAllApps();
      res.json(apps);
    } catch (error) {
      console.error("Admin apps error:", error);
      res.status(500).json({ message: "Failed to get apps" });
    }
  });

  app.post("/api/admin/apps", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const validation = insertAppSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }

      const existingApp = await storage.getAppBySlug(validation.data.slug);
      if (existingApp) {
        return res.status(400).json({ message: "App slug already exists" });
      }

      const credentials = generateClientCredentials();
      const appData = validation.data;
      const app = await storage.createApp({
        name: appData.name,
        slug: appData.slug,
        description: appData.description,
        callbackUrl: appData.callbackUrl,
        pricingModel: appData.pricingModel,
        billingCycle: appData.billingCycle || null,
        monthlyPriceCents: appData.monthlyPriceCents || 0,
        yearlyPriceCents: appData.yearlyPriceCents || 0,
        perUsePriceCents: appData.perUsePriceCents || 0,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        iconUrl: null,
        isActive: true,
      });

      res.status(201).json(app);
    } catch (error) {
      console.error("Create app error:", error);
      res.status(500).json({ message: "Failed to create app" });
    }
  });

  app.get("/api/oauth/authorize", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { 
        client_id, 
        redirect_uri, 
        response_type, 
        scope, 
        state, 
        code_challenge, 
        code_challenge_method 
      } = req.query as {
        client_id?: string;
        redirect_uri?: string;
        response_type?: string;
        scope?: string;
        state?: string;
        code_challenge?: string;
        code_challenge_method?: string;
      };

      if (!client_id || !redirect_uri) {
        return res.status(400).json({ error: "invalid_request", error_description: "client_id and redirect_uri are required" });
      }

      if (response_type !== "code") {
        return res.status(400).json({ error: "unsupported_response_type", error_description: "Only response_type=code is supported" });
      }

      const appRecord = await storage.getAppByClientId(client_id);
      if (!appRecord) {
        return res.status(400).json({ error: "invalid_client", error_description: "Unknown client_id" });
      }

      if (redirect_uri !== appRecord.callbackUrl) {
        return res.status(400).json({ error: "invalid_redirect_uri", error_description: "Redirect URI does not match registered callback" });
      }

      if (!code_challenge) {
        return res.status(400).json({ error: "invalid_request", error_description: "PKCE code_challenge is required for security" });
      }

      if (code_challenge_method !== "S256") {
        return res.status(400).json({ error: "invalid_request", error_description: "code_challenge_method must be S256" });
      }

      const authCode = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await storage.createOauthAuthorizationCode({
        code: authCode,
        userId: req.user!.id,
        appId: appRecord.id,
        redirectUri: redirect_uri,
        codeChallenge: code_challenge || null,
        codeChallengeMethod: code_challenge_method || null,
        scope: scope || null,
        state: state || null,
        expiresAt,
      });

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.append("code", authCode);
      if (state) {
        redirectUrl.searchParams.append("state", state);
      }

      const response: { redirect_uri: string; code: string; state?: string } = { 
        redirect_uri: redirectUrl.toString(),
        code: authCode,
      };
      if (state) {
        response.state = state;
      }
      res.json(response);
    } catch (error) {
      console.error("OAuth authorize error:", error);
      res.status(500).json({ error: "server_error", error_description: "Authorization failed" });
    }
  });

  app.post("/api/oauth/token", async (req, res) => {
    try {
      const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = req.body;

      if (grant_type !== "authorization_code") {
        return res.status(400).json({ error: "unsupported_grant_type", error_description: "Only authorization_code grant is supported" });
      }

      if (!code || !redirect_uri || !client_id) {
        return res.status(400).json({ error: "invalid_request", error_description: "code, redirect_uri, and client_id are required" });
      }

      const appRecord = await storage.getAppByClientId(client_id);
      if (!appRecord) {
        return res.status(401).json({ error: "invalid_client", error_description: "Unknown client_id" });
      }

      if (appRecord.clientSecret && appRecord.clientSecret !== client_secret) {
        return res.status(401).json({ error: "invalid_client", error_description: "Client authentication failed" });
      }

      const authCode = await storage.getOauthAuthorizationCode(code);
      if (!authCode) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Invalid authorization code" });
      }

      const wasMarkedUsed = await storage.markOauthCodeUsed(authCode.id);
      if (!wasMarkedUsed) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code already used" });
      }

      if (authCode.expiresAt < new Date()) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code expired" });
      }

      if (authCode.appId !== appRecord.id) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code was not issued for this client" });
      }

      if (authCode.redirectUri !== redirect_uri) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Redirect URI mismatch" });
      }

      if (!authCode.codeChallenge) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code missing PKCE challenge" });
      }

      if (!code_verifier) {
        return res.status(400).json({ error: "invalid_request", error_description: "code_verifier is required" });
      }

      const expectedChallenge = createHash("sha256")
        .update(code_verifier)
        .digest("base64url");

      if (authCode.codeChallenge !== expectedChallenge) {
        return res.status(400).json({ error: "invalid_grant", error_description: "PKCE code_verifier mismatch" });
      }

      const accessToken = randomBytes(32).toString("hex");
      const accessTokenHash = hashToken(accessToken);
      const accessTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await storage.createOauthAccessToken({
        tokenHash: accessTokenHash,
        userId: authCode.userId,
        appId: appRecord.id,
        scope: authCode.scope,
        expiresAt: accessTokenExpiresAt,
      });

      const user = await storage.getUser(authCode.userId);

      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: authCode.scope || null,
        user: user ? {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        } : null,
      });
    } catch (error) {
      console.error("OAuth token error:", error);
      res.status(500).json({ error: "server_error", error_description: "Token exchange failed" });
    }
  });

  app.post("/api/oauth/introspect", async (req, res) => {
    try {
      const { token, client_id, client_secret } = req.body;

      if (!token) {
        return res.json({ active: false });
      }

      if (client_id && client_secret) {
        const appRecord = await storage.getAppByClientId(client_id);
        if (!appRecord || appRecord.clientSecret !== client_secret) {
          return res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
        }
      }

      const tokenHash = hashToken(token);
      const accessToken = await storage.getOauthAccessTokenByHash(tokenHash);

      if (!accessToken) {
        return res.json({ active: false });
      }

      const user = await storage.getUser(accessToken.userId);
      const appRecord = await storage.getApp(accessToken.appId);

      res.json({
        active: true,
        scope: accessToken.scope || null,
        client_id: appRecord?.clientId || null,
        username: user?.email || null,
        token_type: "Bearer",
        exp: Math.floor(accessToken.expiresAt.getTime() / 1000),
        iat: Math.floor(accessToken.createdAt!.getTime() / 1000),
        sub: accessToken.userId,
        aud: accessToken.appId,
        iss: "credits-hub",
      });
    } catch (error) {
      console.error("OAuth introspect error:", error);
      res.json({ active: false });
    }
  });

  app.post("/api/oauth/revoke", async (req, res) => {
    try {
      const { token, client_id, client_secret } = req.body;

      if (!token) {
        return res.status(200).send();
      }

      if (client_id && client_secret) {
        const appRecord = await storage.getAppByClientId(client_id);
        if (!appRecord || appRecord.clientSecret !== client_secret) {
          return res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
        }
      }

      const tokenHash = hashToken(token);
      const accessToken = await storage.getOauthAccessTokenByHash(tokenHash);

      if (accessToken) {
        await storage.revokeOauthAccessToken(accessToken.id);
      }

      res.status(200).send();
    } catch (error) {
      console.error("OAuth revoke error:", error);
      res.status(200).send();
    }
  });

  app.get("/api/oauth/userinfo", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "invalid_token", error_description: "Bearer token required" });
      }

      const token = authHeader.slice(7);
      const tokenHash = hashToken(token);
      const accessToken = await storage.getOauthAccessTokenByHash(tokenHash);

      if (!accessToken) {
        return res.status(401).json({ error: "invalid_token", error_description: "Token is invalid or expired" });
      }

      const user = await storage.getUser(accessToken.userId);
      if (!user) {
        return res.status(401).json({ error: "invalid_token", error_description: "User not found" });
      }

      res.json({
        sub: user.id,
        email: user.email,
        email_verified: true,
        name: user.fullName,
        updated_at: Math.floor(user.updatedAt!.getTime() / 1000),
      });
    } catch (error) {
      console.error("OAuth userinfo error:", error);
      res.status(500).json({ error: "server_error", error_description: "Failed to get user info" });
    }
  });

  app.post("/api/sso/authorize", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { clientId, redirectUri } = req.body;

      const appRecord = await storage.getAppByClientId(clientId);
      if (!appRecord) {
        return res.status(404).json({ message: "App not found" });
      }

      if (!appRecord.callbackUrl.startsWith(redirectUri)) {
        return res.status(400).json({ message: "Invalid redirect URI" });
      }

      const authCode = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await storage.createOauthAuthorizationCode({
        code: authCode,
        userId: req.user!.id,
        appId: appRecord.id,
        redirectUri: redirectUri,
        codeChallenge: null,
        codeChallengeMethod: null,
        scope: null,
        state: null,
        expiresAt,
      });

      res.json({ 
        code: authCode, 
        redirectUrl: `${redirectUri}?code=${authCode}` 
      });
    } catch (error) {
      console.error("SSO authorize error:", error);
      res.status(500).json({ message: "SSO authorization failed" });
    }
  });

  app.post("/api/external/balance", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "API key required" });
      }

      const key = authHeader.slice(7);
      const keyHash = hashToken(key);
      const apiKey = await storage.getApiKeyByHash(keyHash);

      if (!apiKey) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return res.status(401).json({ message: "API key expired" });
      }

      await storage.updateApiKeyLastUsed(apiKey.id);

      const wallet = await storage.getWalletByUserId(apiKey.userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      res.json({
        balanceCents: wallet.balanceCents,
        currency: wallet.currency,
      });
    } catch (error) {
      console.error("External balance error:", error);
      res.status(500).json({ message: "Failed to get balance" });
    }
  });

  app.post("/api/external/debit", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "API key required" });
      }

      const key = authHeader.slice(7);
      const keyHash = hashToken(key);
      const apiKey = await storage.getApiKeyByHash(keyHash);

      if (!apiKey) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return res.status(401).json({ message: "API key expired" });
      }

      await storage.updateApiKeyLastUsed(apiKey.id);

      const { amountCents, description, appId } = req.body;

      if (!amountCents || amountCents <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      const wallet = await storage.getWalletByUserId(apiKey.userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      if (wallet.balanceCents < amountCents) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const transaction = await storage.createTransaction({
        walletId: wallet.id,
        type: "DEBIT",
        source: "APP_USAGE",
        amountCents,
        description: description || "API debit",
        status: "COMPLETED",
        appId: appId || null,
      });

      await storage.updateWalletBalance(wallet.id, -amountCents);

      await createAuditLog(req, "WALLET_DEBIT", "External API debit", apiKey.userId, "wallet", wallet.id, { amountCents, transactionId: transaction.id, appId, apiKeyId: apiKey.id });
      
      const autoTopupResult = await checkAndExecuteAutoTopup(apiKey.userId, wallet.id);

      if (autoTopupResult.triggered) {
        await createAuditLog(req, "WALLET_AUTO_TOPUP", "Auto top-up triggered", apiKey.userId, "wallet", wallet.id, { amountCents: autoTopupResult.amountCents, transactionId: autoTopupResult.transactionId });
      }

      const finalWallet = await storage.getWallet(wallet.id);
      const finalBalanceCents = finalWallet?.balanceCents ?? (wallet.balanceCents - amountCents);

      res.json({
        transactionId: transaction.id,
        newBalanceCents: finalBalanceCents,
        autoTopup: autoTopupResult.triggered ? {
          triggered: true,
          amountCents: autoTopupResult.amountCents,
          transactionId: autoTopupResult.transactionId,
          balanceAfterTopup: autoTopupResult.newBalance,
        } : undefined,
      });
    } catch (error) {
      console.error("External debit error:", error);
      res.status(500).json({ message: "Failed to process debit" });
    }
  });

  app.get("/api/admin/audit-logs", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getAuditLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  app.get("/api/user/audit-logs", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getAuditLogsByUserId(req.user!.id, limit);
      res.json(logs);
    } catch (error) {
      console.error("Get user audit logs error:", error);
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  app.post("/api/webhooks/simulate-payment", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { eventType, transactionId, status } = req.body;

      if (!eventType || !["PAYMENT_SUCCEEDED", "PAYMENT_FAILED", "PAYMENT_PENDING"].includes(eventType)) {
        return res.status(400).json({ message: "Invalid event type" });
      }

      const webhookEvent = await storage.createWebhookEvent({
        eventType,
        status: "PENDING",
        userId: req.user!.id,
        entityType: "transaction",
        entityId: transactionId,
        payload: JSON.stringify({ transactionId, status, simulatedAt: new Date() }),
        processingResult: null,
        attempts: 0,
        maxAttempts: 3,
        nextRetryAt: null,
      });

      await processWebhookEvent(webhookEvent);

      res.json({ 
        message: "Webhook event processed",
        eventId: webhookEvent.id,
      });
    } catch (error) {
      console.error("Simulate payment webhook error:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  app.get("/api/admin/webhook-events", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await storage.getWebhookEvents(limit);
      res.json(events);
    } catch (error) {
      console.error("Get webhook events error:", error);
      res.status(500).json({ message: "Failed to get webhook events" });
    }
  });

  app.post("/api/webhooks/process-pending", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const pendingEvents = await storage.getPendingWebhookEvents();
      let processed = 0;
      let failed = 0;

      for (const event of pendingEvents) {
        const result = await processWebhookEvent(event);
        if (result.success) {
          processed++;
        } else {
          failed++;
        }
      }

      res.json({ 
        message: "Webhook processing complete",
        processed,
        failed,
        total: pendingEvents.length,
      });
    } catch (error) {
      console.error("Process pending webhooks error:", error);
      res.status(500).json({ message: "Failed to process webhooks" });
    }
  });

  app.get("/api/admin/background-jobs/status", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { getJobStatus } = await import("./background-jobs");
      const status = getJobStatus();
      res.json(status);
    } catch (error) {
      console.error("Get job status error:", error);
      res.status(500).json({ message: "Failed to get job status" });
    }
  });

  app.post("/api/admin/background-jobs/run", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { runJobsManually } = await import("./background-jobs");
      const result = await runJobsManually();

      await createAuditLog(req, "ADMIN_ACTION", "Manual background job run", req.user!.id, "system", undefined, result);

      res.json({
        message: "Background jobs executed manually",
        ...result,
      });
    } catch (error) {
      console.error("Run jobs manually error:", error);
      res.status(500).json({ message: "Failed to run jobs" });
    }
  });

  return httpServer;
}

async function processWebhookEvent(event: any): Promise<{ success: boolean; message: string }> {
  try {
    await storage.updateWebhookEventStatus(event.id, "PROCESSING");

    const payload = event.payload ? JSON.parse(event.payload) : {};

    switch (event.eventType) {
      case "PAYMENT_SUCCEEDED":
        if (payload.transactionId) {
          await storage.updateTransactionStatus(payload.transactionId, "COMPLETED");
        }
        await storage.updateWebhookEventStatus(event.id, "COMPLETED", "Payment marked as completed");
        return { success: true, message: "Payment succeeded processed" };

      case "PAYMENT_FAILED":
        if (payload.transactionId) {
          await storage.updateTransactionStatus(payload.transactionId, "FAILED");
        }
        await storage.updateWebhookEventStatus(event.id, "COMPLETED", "Payment marked as failed");
        return { success: true, message: "Payment failed processed" };

      case "PAYMENT_PENDING":
        if (payload.transactionId) {
          await storage.updateTransactionStatus(payload.transactionId, "PENDING");
        }
        await storage.updateWebhookEventStatus(event.id, "COMPLETED", "Payment marked as pending");
        return { success: true, message: "Payment pending processed" };

      case "AUTO_TOPUP_TRIGGERED":
        await storage.updateWebhookEventStatus(event.id, "COMPLETED", "Auto topup event logged");
        return { success: true, message: "Auto topup event logged" };

      case "AUTO_TOPUP_FAILED":
        await storage.updateWebhookEventStatus(event.id, "COMPLETED", "Auto topup failure logged");
        return { success: true, message: "Auto topup failure logged" };

      default:
        await storage.updateWebhookEventStatus(event.id, "COMPLETED", `Event ${event.eventType} processed`);
        return { success: true, message: `Event ${event.eventType} processed` };
    }
  } catch (error: any) {
    const event_data = await storage.getWebhookEvent(event.id);
    if (event_data && event_data.attempts < event_data.maxAttempts) {
      await storage.updateWebhookEventStatus(event.id, "RETRYING", error.message);
      return { success: false, message: `Retry scheduled: ${error.message}` };
    } else {
      await storage.updateWebhookEventStatus(event.id, "FAILED", error.message);
      return { success: false, message: `Failed: ${error.message}` };
    }
  }
}
