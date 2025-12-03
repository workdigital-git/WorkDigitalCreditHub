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

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await storage.createUser({
        email,
        passwordHash,
        fullName: fullName || null,
        phone: phone || null,
        isAdmin: false,
        twoFactorEnabled: false,
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

      const { passwordHash: _, twoFactorSecret: __, ...safeUser } = user;
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

      const { email, password, totpCode } = validation.data;
      const user = await storage.getUserByEmail(email);

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.twoFactorEnabled && user.twoFactorSecret) {
        if (!totpCode) {
          return res.status(200).json({ requiresTwoFactor: true });
        }

        const isValid = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: "base32",
          token: totpCode,
        });

        if (!isValid) {
          return res.status(401).json({ message: "Invalid 2FA code" });
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

      await createAuditLog(req, "AUTH_LOGIN", "User logged in", user.id, "user", user.id, { email: user.email, twoFactorUsed: user.twoFactorEnabled });

      const { passwordHash: _, twoFactorSecret: __, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
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

      const { passwordHash: _, twoFactorSecret: __, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  app.patch("/api/user/profile", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { fullName, phone } = req.body;
      const user = await storage.updateUser(req.user!.id, {
        fullName: fullName || null,
        phone: phone || null,
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { passwordHash: _, twoFactorSecret: __, ...safeUser } = user;
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

      await storage.updateUser(req.user!.id, { twoFactorEnabled: true });

      await createAuditLog(req, "AUTH_2FA_ENABLE", "Two-factor authentication enabled", req.user!.id, "user", req.user!.id);

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
      });

      await createAuditLog(req, "AUTH_2FA_DISABLE", "Two-factor authentication disabled", req.user!.id, "user", req.user!.id);

      res.json({ success: true });
    } catch (error) {
      console.error("2FA disable error:", error);
      res.status(500).json({ message: "Failed to disable 2FA" });
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

      const activeSubscriptions = subscriptions.filter((s) => s.status === "active");

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
      if (existing && existing.status === "active") {
        return res.status(400).json({ message: "Already subscribed" });
      }

      if (existing) {
        await storage.createAppSubscription({
          userId: req.user!.id,
          appId: req.params.id,
          status: "active",
          cancelledAt: null,
        });
      } else {
        await storage.createAppSubscription({
          userId: req.user!.id,
          appId: req.params.id,
          status: "active",
          cancelledAt: null,
        });
      }

      await createAuditLog(req, "APP_SUBSCRIBE", "Subscribed to app", req.user!.id, "app", req.params.id, { appName: app.name });

      res.json({ success: true });
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
          const { passwordHash: _, twoFactorSecret: __, ...safeUser } = user;
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
      const app = await storage.createApp({
        ...validation.data,
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

  app.post("/api/sso/authorize", async (req, res) => {
    try {
      const { clientId, redirectUri, userId } = req.body;

      const app = await storage.getAppByClientId(clientId);
      if (!app) {
        return res.status(404).json({ message: "App not found" });
      }

      if (!app.callbackUrl.startsWith(redirectUri)) {
        return res.status(400).json({ message: "Invalid redirect URI" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, appId: app.id },
        JWT_SECRET,
        { expiresIn: "5m" }
      );

      res.json({ token, redirectUrl: `${redirectUri}?token=${token}` });
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

  return httpServer;
}
