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

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class OAuthRateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60 * 1000, maxRequests: number = 30) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    setInterval(() => this.cleanup(), windowMs);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetTime <= now) {
        this.limits.delete(key);
      }
    }
  }

  check(identifier: string): { allowed: boolean; remaining: number; resetTime: number; retryAfter?: number } {
    const now = Date.now();
    let entry = this.limits.get(identifier);

    if (!entry || entry.resetTime <= now) {
      entry = { count: 0, resetTime: now + this.windowMs };
      this.limits.set(identifier, entry);
    }

    entry.count++;
    const remaining = Math.max(0, this.maxRequests - entry.count);
    const retryAfter = entry.count > this.maxRequests ? Math.ceil((entry.resetTime - now) / 1000) : undefined;

    return {
      allowed: entry.count <= this.maxRequests,
      remaining,
      resetTime: entry.resetTime,
      retryAfter,
    };
  }

  getHeaders(result: { remaining: number; resetTime: number }): Record<string, string> {
    return {
      "X-RateLimit-Limit": String(this.maxRequests),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(Math.ceil(result.resetTime / 1000)),
    };
  }
}

const oauthRateLimiter = new OAuthRateLimiter(60 * 1000, 60);
const oauthTokenRateLimiter = new OAuthRateLimiter(60 * 1000, 30);
const authRateLimiter = new OAuthRateLimiter(15 * 60 * 1000, 10);

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

function generateTraceId(): string {
  return `oauth_${Date.now()}_${randomBytes(8).toString("hex")}`;
}

type OAuthStage = "AUTHORIZATION" | "TOKEN_EXCHANGE" | "TOKEN_REFRESH" | "API_CALL" | "WEBHOOK_DELIVERY" | "CLIENT_REGISTRATION";
type ErrorClass = "CLIENT" | "SERVER" | "NETWORK" | "VALIDATION" | "RATE_LIMIT" | "AUTHENTICATION" | "AUTHORIZATION";

interface OAuthAuditContext {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  startTime: number;
  stage?: OAuthStage;
  clientId?: string;
  appId?: string;
  appName?: string;
  userId?: string;
  userEmail?: string;
  redirectUri?: string;
  scope?: string;
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
}

const ERROR_CLASS_MAP: Record<string, ErrorClass> = {
  invalid_request: "VALIDATION",
  invalid_client: "AUTHENTICATION",
  invalid_grant: "CLIENT",
  invalid_redirect_uri: "VALIDATION",
  invalid_scope: "VALIDATION",
  unsupported_response_type: "VALIDATION",
  unsupported_grant_type: "VALIDATION",
  access_denied: "AUTHORIZATION",
  server_error: "SERVER",
  temporarily_unavailable: "SERVER",
  rate_limit_exceeded: "RATE_LIMIT",
  insufficient_balance: "CLIENT",
};

const TROUBLESHOOTING_HINTS: Record<string, string> = {
  invalid_request: "Check that all required parameters are provided and correctly formatted.",
  invalid_client: "Verify the client_id is correct and the app is still active.",
  invalid_grant: "Authorization codes expire after 10 minutes and can only be used once. Ensure the code_verifier matches the original code_challenge.",
  invalid_redirect_uri: "The redirect_uri must exactly match one registered in your app settings (including trailing slashes and protocol).",
  invalid_scope: "Review available scopes in the API documentation. Only request scopes your app is permitted to use.",
  unsupported_response_type: "Only response_type=code is supported for OAuth authorization.",
  unsupported_grant_type: "Only grant_type=authorization_code is supported for token exchange.",
  access_denied: "User denied authorization or lacks required permissions.",
  server_error: "An internal error occurred. Check the trace_id for debugging.",
  rate_limit_exceeded: "Too many requests. Implement exponential backoff and check the Retry-After header.",
  insufficient_balance: "User's wallet does not have sufficient credits. Prompt user to add funds.",
};

async function logOAuthEvent(
  ctx: OAuthAuditContext,
  event: string,
  status: "SUCCESS" | "FAILURE" | "INFO" | "WARNING",
  errorCode?: string,
  errorMessage?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const durationMs = Date.now() - ctx.startTime;
    const errorClass = errorCode ? ERROR_CLASS_MAP[errorCode] || "SERVER" : undefined;
    const troubleshootingHint = errorCode ? TROUBLESHOOTING_HINTS[errorCode] : undefined;
    
    await storage.createOauthAuditLog({
      traceId: ctx.traceId,
      spanId: ctx.spanId || null,
      parentSpanId: ctx.parentSpanId || null,
      stage: ctx.stage || null,
      event,
      clientId: ctx.clientId || null,
      appId: ctx.appId || null,
      appName: ctx.appName || null,
      userId: ctx.userId || null,
      userEmail: ctx.userEmail || null,
      redirectUri: ctx.redirectUri || null,
      scope: ctx.scope || null,
      status,
      errorClass: errorClass || null,
      errorCode: errorCode || null,
      errorMessage: errorMessage || null,
      errorDetails: details?.errorDetails as string || null,
      details: details ? JSON.stringify(details) : null,
      requestMethod: ctx.requestMethod || null,
      requestPath: ctx.requestPath || null,
      ipAddress: ctx.ipAddress || null,
      userAgent: ctx.userAgent || null,
      durationMs,
      troubleshootingHint: troubleshootingHint || null,
    });
    
    if (ctx.appId && status === "FAILURE") {
      await storage.incrementHealthMetricCounter(ctx.appId, "oauthFailure").catch(() => {});
    } else if (ctx.appId && status === "SUCCESS" && event.includes("SUCCESS")) {
      await storage.incrementHealthMetricCounter(ctx.appId, "oauthSuccess").catch(() => {});
    }
    
    console.log(`[OAuth Audit] ${ctx.traceId} | ${event} | ${status}${errorCode ? ` | ${errorCode}` : ''}`);
  } catch (error) {
    console.error('[OAuth Audit] Failed to log event:', error);
  }
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

function prepareAdminUserResponse(user: { 
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
  const { passwordHash, twoFactorSecret, ...rest } = user;
  return rest;
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
  const { setupReplitAuth } = await import("./replitAuth");
  await setupReplitAuth(app);

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
    const rateLimitKey = req.body.email || req.ip || "anonymous";
    const rateLimitResult = authRateLimiter.check(rateLimitKey);
    const rateLimitHeaders = authRateLimiter.getHeaders(rateLimitResult);
    
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (!rateLimitResult.allowed) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfter || 900));
      return res.status(429).json({
        message: "Too many login attempts. Please wait before trying again.",
        retry_after: rateLimitResult.retryAfter,
      });
    }

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

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      
      if (user) {
        const token = randomBytes(32).toString("hex");
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

        await storage.createPasswordResetToken({
          userId: user.id,
          tokenHash,
          expiresAt,
        });

        const { sendPasswordResetEmail } = await import("./email-service");
        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
        const host = req.headers["x-forwarded-host"] || req.get("host") || process.env.REPLIT_DEV_DOMAIN;
        const baseUrl = `${protocol}://${host}`;
        console.log(`Password reset email - Base URL: ${baseUrl}, Email: ${user.email}`);
        const emailResult = await sendPasswordResetEmail(user.email, token, baseUrl);
        if (!emailResult.success) {
          console.error(`Failed to send password reset email: ${emailResult.error}`);
        }

        await createAuditLog(
          req,
          "AUTH_PASSWORD_CHANGE",
          "Password reset requested",
          user.id,
          "user",
          user.id,
          { email: user.email }
        );
      }

      res.json({ 
        success: true, 
        message: "If an account with that email exists, a password reset link has been sent." 
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  app.post("/api/auth/verify-reset-token", async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token || typeof token !== "string") {
        return res.json({ valid: false });
      }

      const tokenHash = hashToken(token);
      const resetToken = await storage.getPasswordResetTokenByHash(tokenHash);

      if (!resetToken) {
        return res.json({ valid: false });
      }

      if (resetToken.usedAt) {
        return res.json({ valid: false });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.json({ valid: false });
      }

      res.json({ valid: true });
    } catch (error) {
      console.error("Verify reset token error:", error);
      res.json({ valid: false });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Reset token is required" });
      }
      
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const tokenHash = hashToken(token);
      const resetToken = await storage.getPasswordResetTokenByHash(tokenHash);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (resetToken.usedAt) {
        return res.status(400).json({ message: "This reset token has already been used" });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "This reset token has expired" });
      }

      const user = await storage.getUser(resetToken.userId);
      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await storage.updateUser(user.id, { passwordHash });

      await storage.markPasswordResetTokenUsed(resetToken.id);

      await storage.deleteRefreshTokensByUserId(user.id);

      await createAuditLog(
        req,
        "AUTH_PASSWORD_CHANGE",
        "Password reset completed",
        user.id,
        "user",
        user.id
      );

      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
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
      const allApps = await storage.getAllApps();

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
        allApps,
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

  app.get("/api/payment-gateways", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getPaymentGatewaySettings();
      
      const gatewayInfo: Record<string, { displayName: string; supportedMethods: string[]; configured: boolean }> = {
        STRIPE: {
          displayName: "Stripe",
          supportedMethods: ["CARD", "BANK_ACH"],
          configured: !!process.env.STRIPE_SECRET_KEY,
        },
        PAYPAL: {
          displayName: "PayPal",
          supportedMethods: ["PAYPAL", "VENMO"],
          configured: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
        },
        COINBASE: {
          displayName: "Coinbase Commerce",
          supportedMethods: ["CRYPTO"],
          configured: !!process.env.COINBASE_COMMERCE_API_KEY,
        },
      };

      const gateways = Object.entries(gatewayInfo)
        .map(([gateway, info]) => {
          const setting = settings.find((s) => s.gatewayName === gateway);
          const isEnabled = setting?.enabled ?? false;
          const sandboxMode = setting?.sandboxMode ?? true;
          const configured = info.configured;
          
          return {
            gateway,
            displayName: info.displayName,
            enabled: isEnabled && configured,
            sandboxMode,
            supportedMethods: info.supportedMethods,
          };
        })
        .filter((g) => g.enabled);

      res.json(gateways);
    } catch (error) {
      console.error("Get payment gateways error:", error);
      res.status(500).json({ message: "Failed to get payment gateways" });
    }
  });

  app.post("/api/wallet/initiate-payment", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { amountCents, gateway, paymentMethodType } = req.body;

      if (!amountCents || amountCents < 100) {
        return res.status(400).json({ message: "Minimum amount is $1.00" });
      }

      if (!gateway || !["STRIPE", "PAYPAL", "COINBASE"].includes(gateway)) {
        return res.status(400).json({ message: "Invalid payment gateway" });
      }

      const wallet = await storage.getWalletByUserId(req.user!.id);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      const gatewaySetting = await storage.getPaymentGatewaySettingsByGateway(gateway);
      if (!gatewaySetting?.enabled) {
        return res.status(400).json({ message: "This payment gateway is not available" });
      }

      const transaction = await storage.createTransaction({
        walletId: wallet.id,
        type: "CREDIT",
        source: "USER_DEPOSIT",
        amountCents,
        description: `Pending deposit via ${gateway}`,
        status: "PENDING",
        appId: null,
      });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const successUrl = `${baseUrl}/wallet?payment=success&transactionId=${transaction.id}`;
      const cancelUrl = `${baseUrl}/wallet?payment=cancelled`;

      let paymentResult: { redirectUrl?: string; clientSecret?: string; paymentId?: string } = {};

      if (gateway === "STRIPE") {
        const { createStripeCheckoutSession } = await import("./payments/stripe-service");
        const session = await createStripeCheckoutSession({
          amountCents,
          currency: "usd",
          successUrl,
          cancelUrl,
          metadata: {
            transactionId: transaction.id,
            userId: req.user!.id,
            walletId: wallet.id,
          },
        });
        if (!session.url) {
          throw new Error("Failed to create Stripe checkout session");
        }
        paymentResult = { redirectUrl: session.url, paymentId: session.id };
      } else if (gateway === "PAYPAL") {
        const { createPayPalOrder } = await import("./payments/paypal-service");
        const order = await createPayPalOrder({
          amountCents,
          currency: "USD",
          returnUrl: successUrl,
          cancelUrl,
          sandboxMode: gatewaySetting.sandboxMode,
          metadata: {
            transactionId: transaction.id,
            userId: req.user!.id,
            walletId: wallet.id,
          },
        });
        paymentResult = { redirectUrl: order.approvalUrl, paymentId: order.orderId };
      } else if (gateway === "COINBASE") {
        const { createCoinbaseCharge } = await import("./payments/coinbase-service");
        const charge = await createCoinbaseCharge({
          amountCents,
          currency: "USD",
          name: "Wallet Funding",
          description: `Add ${(amountCents / 100).toFixed(2)} USD to wallet`,
          redirectUrl: successUrl,
          cancelUrl,
          metadata: {
            transactionId: transaction.id,
            userId: req.user!.id,
            walletId: wallet.id,
          },
        });
        paymentResult = { redirectUrl: charge.hostedUrl, paymentId: charge.chargeId };
      }

      if (paymentResult.paymentId) {
        await storage.updateTransactionExternalRef(transaction.id, paymentResult.paymentId, gateway);
      }

      await createAuditLog(
        req, 
        "PAYMENT_INITIATED", 
        `Payment initiated via ${gateway}`, 
        req.user!.id, 
        "transaction", 
        transaction.id, 
        { amountCents, gateway, paymentMethodType }
      );

      res.json({
        transactionId: transaction.id,
        ...paymentResult,
      });
    } catch (error) {
      console.error("Initiate payment error:", error);
      res.status(500).json({ message: "Failed to initiate payment" });
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

      let subscription;
      
      // If there's an existing subscription (cancelled, expired, etc.), reactivate it
      if (existing) {
        subscription = await storage.updateAppSubscription(existing.id, {
          status: "ACTIVE",
          billingCycle: billingCycle as "MONTHLY" | "YEARLY" | "PER_USE",
          currentPeriodEnd: periodEnd,
          nextBillingDate,
          cancelledAt: null,
        });
        
        await createAuditLog(req, "APP_SUBSCRIBE", "Resubscribed to app", req.user!.id, "app", req.params.id, { 
          appName: app.name, 
          billingCycle,
          subscriptionId: existing.id,
          resubscribed: true,
        });
      } else {
        // Create new subscription
        subscription = await storage.createAppSubscription({
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
      }

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
          const adminUser = prepareAdminUserResponse(user);
          return { ...adminUser, wallet };
        })
      );
      res.json(usersWithWallets);
    } catch (error) {
      console.error("Admin users error:", error);
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  app.patch("/api/admin/users/:id", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { fullName, email, phone, isAdmin } = req.body;

      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const updateData: Partial<typeof existingUser> = {};

      if (fullName !== undefined) {
        updateData.fullName = fullName || null;
      }

      if (email !== undefined) {
        if (typeof email !== "string" || !email.includes("@")) {
          return res.status(400).json({ message: "Invalid email address" });
        }
        const emailUser = await storage.getUserByEmail(email.toLowerCase().trim());
        if (emailUser && emailUser.id !== id) {
          return res.status(400).json({ message: "Email already in use" });
        }
        updateData.email = email.toLowerCase().trim();
      }

      if (phone !== undefined) {
        if (phone === "" || phone === null) {
          updateData.phone = null;
          updateData.phoneVerified = false;
        } else {
          const normalizedPhone = normalizePhoneNumber(phone);
          if (!validatePhoneNumber(normalizedPhone)) {
            return res.status(400).json({ message: "Invalid phone number format. Use format: +12025551234" });
          }
          if (existingUser.phone !== normalizedPhone) {
            updateData.phone = normalizedPhone;
            updateData.phoneVerified = false;
          }
        }
      }

      if (isAdmin !== undefined) {
        if (typeof isAdmin !== "boolean") {
          return res.status(400).json({ message: "isAdmin must be a boolean" });
        }
        updateData.isAdmin = isAdmin;
      }

      const updatedUser = await storage.updateUser(id, updateData);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user" });
      }

      await createAuditLog(
        req,
        "ADMIN_USER_UPDATE",
        `Admin updated user: ${updatedUser.email}`,
        req.user!.id,
        "user",
        id,
        { changes: Object.keys(updateData) }
      );

      const wallet = await storage.getWalletByUserId(id);
      const adminUser = prepareAdminUserResponse(updatedUser);
      res.json({ ...adminUser, wallet });
    } catch (error) {
      console.error("Admin update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.get("/api/admin/email/status", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { checkEmailConfiguration } = await import("./email-service");
      const status = checkEmailConfiguration();
      res.json(status);
    } catch (error) {
      console.error("Email status error:", error);
      res.status(500).json({ message: "Failed to get email status" });
    }
  });

  app.post("/api/admin/email/test", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { to, subject, message } = req.body;
      
      if (!to || typeof to !== "string") {
        return res.status(400).json({ message: "Recipient email is required" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        return res.status(400).json({ message: "Invalid email address format" });
      }

      const { sendTestEmail } = await import("./email-service");
      const result = await sendTestEmail(to, subject, message);

      await createAuditLog(
        req,
        "ADMIN_EMAIL_TEST",
        `Admin sent test email to: ${to}`,
        req.user!.id,
        "system",
        null,
        { to, subject: subject || "Work Digital - Email Test", success: result.success }
      );

      if (result.success) {
        res.json({ 
          success: true, 
          messageId: result.messageId,
          message: `Test email sent successfully to ${to}` 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: result.error,
          message: `Failed to send email: ${result.error}` 
        });
      }
    } catch (error) {
      console.error("Email test error:", error);
      res.status(500).json({ message: "Failed to send test email" });
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
        allowedCallbackUrls: appData.allowedCallbackUrls || [appData.callbackUrl],
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

  app.patch("/api/admin/apps/:id", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { callbackUrl, allowedCallbackUrls, description, pricingModel, monthlyPriceCents, yearlyPriceCents, perUsePriceCents, isActive } = req.body;

      const existingApp = await storage.getApp(id);
      if (!existingApp) {
        return res.status(404).json({ message: "App not found" });
      }

      const updateData: Partial<typeof existingApp> = {};
      
      if (callbackUrl !== undefined) {
        if (typeof callbackUrl !== "string" || !callbackUrl.startsWith("http")) {
          return res.status(400).json({ message: "Invalid callback URL" });
        }
        updateData.callbackUrl = callbackUrl;
      }
      
      if (allowedCallbackUrls !== undefined) {
        if (!Array.isArray(allowedCallbackUrls)) {
          return res.status(400).json({ message: "allowedCallbackUrls must be an array" });
        }
        // Validate each URL
        for (const url of allowedCallbackUrls) {
          if (typeof url !== "string" || !url.startsWith("http")) {
            return res.status(400).json({ message: "Each callback URL must be a valid HTTP/HTTPS URL" });
          }
        }
        updateData.allowedCallbackUrls = allowedCallbackUrls;
      }
      
      if (description !== undefined) {
        updateData.description = description;
      }
      
      if (pricingModel !== undefined) {
        if (!["free", "subscription", "per_call", "per_request", "per_minute"].includes(pricingModel)) {
          return res.status(400).json({ message: "Invalid pricing model" });
        }
        updateData.pricingModel = pricingModel;
      }
      
      if (monthlyPriceCents !== undefined) {
        updateData.monthlyPriceCents = monthlyPriceCents;
      }
      
      if (yearlyPriceCents !== undefined) {
        updateData.yearlyPriceCents = yearlyPriceCents;
      }
      
      if (perUsePriceCents !== undefined) {
        updateData.perUsePriceCents = perUsePriceCents;
      }
      
      if (isActive !== undefined) {
        updateData.isActive = isActive;
      }

      const updatedApp = await storage.updateApp(id, updateData);

      await storage.createAuditLog({
        userId: req.user!.id,
        eventType: "ADMIN_ACTION",
        entityType: "APP",
        entityId: id,
        action: "Updated app settings",
        details: JSON.stringify({ updatedFields: Object.keys(updateData) }),
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json(updatedApp);
    } catch (error) {
      console.error("Update app error:", error);
      res.status(500).json({ message: "Failed to update app" });
    }
  });

  app.post("/api/admin/apps/:id/regenerate-secret", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const existingApp = await storage.getApp(id);
      if (!existingApp) {
        return res.status(404).json({ message: "App not found" });
      }

      const newClientSecret = randomBytes(32).toString("hex");

      const updatedApp = await storage.updateApp(id, { clientSecret: newClientSecret });

      await storage.createAuditLog({
        userId: req.user!.id,
        eventType: "ADMIN_ACTION",
        entityType: "APP",
        entityId: id,
        action: "Regenerated client secret",
        details: JSON.stringify({ appName: existingApp.name }),
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({ clientSecret: newClientSecret, app: updatedApp });
    } catch (error) {
      console.error("Regenerate secret error:", error);
      res.status(500).json({ message: "Failed to regenerate client secret" });
    }
  });

  app.get("/api/admin/oauth-audit-logs", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { limit = "100", client_id, trace_id } = req.query as { limit?: string; client_id?: string; trace_id?: string };
      const parsedLimit = Math.min(500, Math.max(1, parseInt(limit) || 100));
      
      const logs = await storage.getOauthAuditLogs(parsedLimit, client_id, trace_id);
      res.json(logs);
    } catch (error) {
      console.error("Get OAuth audit logs error:", error);
      res.status(500).json({ message: "Failed to fetch OAuth audit logs" });
    }
  });

  app.get("/api/admin/oauth-audit-logs/trace/:traceId", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { traceId } = req.params;
      const logs = await storage.getOauthAuditLogsByTraceId(traceId);
      res.json(logs);
    } catch (error) {
      console.error("Get OAuth audit logs by trace error:", error);
      res.status(500).json({ message: "Failed to fetch OAuth audit logs" });
    }
  });

  app.post("/api/admin/credit-user", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { userId, amountCents, reason } = req.body;

      if (!userId || typeof amountCents !== "number" || amountCents <= 0) {
        return res.status(400).json({ message: "userId and positive amountCents are required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let wallet = await storage.getWalletByUserId(userId);
      if (!wallet) {
        wallet = await storage.createWallet({
          userId,
          currency: "USD",
          balanceCents: 0,
        });
      }

      await storage.updateWalletBalance(wallet.id, amountCents);

      const transaction = await storage.createTransaction({
        walletId: wallet.id,
        type: "CREDIT",
        source: "ADMIN_ADJUSTMENT",
        amountCents,
        description: reason || "Admin credit",
        status: "COMPLETED",
        appId: null,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        eventType: "ADMIN_ACTION",
        entityType: "WALLET",
        entityId: wallet.id,
        action: `Admin credited ${amountCents / 100} USD to user ${user.email}`,
        details: JSON.stringify({ 
          targetUserId: userId, 
          amountCents, 
          reason: reason || "Admin credit",
          transactionId: transaction.id 
        }),
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });

      const updatedWallet = await storage.getWalletByUserId(userId);

      res.json({
        message: "Credits added successfully",
        transaction,
        newBalance: updatedWallet?.balanceCents ?? 0,
      });
    } catch (error) {
      console.error("Admin credit user error:", error);
      res.status(500).json({ message: "Failed to credit user" });
    }
  });

  app.get("/api/admin/app-api-keys", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const keys = await storage.getAllAppApiKeys();
      res.json(keys.map(k => ({
        id: k.id,
        appId: k.appId,
        appName: k.app.name,
        appSlug: k.app.slug,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        createdAt: k.createdAt,
      })));
    } catch (error) {
      console.error("Get app API keys error:", error);
      res.status(500).json({ message: "Failed to get app API keys" });
    }
  });

  app.post("/api/admin/app-api-keys", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { appId, name, scopes, expiresInDays } = req.body;

      if (!appId || !name) {
        return res.status(400).json({ message: "appId and name are required" });
      }

      const app = await storage.getApp(appId);
      if (!app) {
        return res.status(404).json({ message: "App not found" });
      }

      const rawKey = `app_${randomBytes(32).toString("hex")}`;
      const keyHash = hashToken(rawKey);
      const keyPrefix = rawKey.slice(0, 12);

      let expiresAt: Date | null = null;
      if (expiresInDays && typeof expiresInDays === "number" && expiresInDays > 0) {
        expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      }

      const apiKey = await storage.createAppApiKey({
        appId,
        name,
        keyHash,
        keyPrefix,
        scopes: scopes || ["balance:read", "credits:debit"],
        expiresAt,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        eventType: "ADMIN_ACTION",
        entityType: "APP_API_KEY",
        entityId: apiKey.id,
        action: `Created API key "${name}" for app "${app.name}"`,
        details: JSON.stringify({ appId, appName: app.name, keyPrefix, scopes }),
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });

      res.status(201).json({
        id: apiKey.id,
        appId: apiKey.appId,
        appName: app.name,
        name: apiKey.name,
        key: rawKey,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        warning: "Store this API key securely. It will not be shown again.",
      });
    } catch (error) {
      console.error("Create app API key error:", error);
      res.status(500).json({ message: "Failed to create app API key" });
    }
  });

  app.delete("/api/admin/app-api-keys/:id", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      const existingKey = await storage.getAppApiKey(id);
      if (!existingKey) {
        return res.status(404).json({ message: "API key not found" });
      }

      const app = await storage.getApp(existingKey.appId);
      
      const success = await storage.revokeAppApiKey(id);
      if (!success) {
        return res.status(404).json({ message: "API key not found" });
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        eventType: "ADMIN_ACTION",
        entityType: "APP_API_KEY",
        entityId: id,
        action: `Revoked API key "${existingKey.name}" for app "${app?.name || existingKey.appId}"`,
        details: JSON.stringify({ appId: existingKey.appId, keyPrefix: existingKey.keyPrefix }),
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({ message: "API key revoked successfully" });
    } catch (error) {
      console.error("Revoke app API key error:", error);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });

  app.get("/api/oauth/app-info", async (req, res) => {
    try {
      const { client_id } = req.query as { client_id?: string };
      
      console.log('[OAuth app-info] Request received:', { client_id, query: req.query });
      
      if (!client_id) {
        console.log('[OAuth app-info] Missing client_id');
        return res.status(400).json({ error: "client_id is required" });
      }

      const appRecord = await storage.getAppByClientId(client_id);
      if (!appRecord) {
        console.log('[OAuth app-info] Unknown client_id:', client_id);
        return res.status(404).json({ error: "Unknown client_id" });
      }

      console.log('[OAuth app-info] Found app:', { id: appRecord.id, name: appRecord.name });
      res.json({
        id: appRecord.id,
        name: appRecord.name,
        description: appRecord.description,
        logoUrl: appRecord.iconUrl,
      });
    } catch (error) {
      console.error("OAuth app-info error:", error);
      res.status(500).json({ error: "Failed to get app info" });
    }
  });

  app.get("/api/oauth/authorize", authMiddleware, async (req: AuthRequest, res) => {
    const traceId = generateTraceId();
    const spanId = randomBytes(8).toString("hex");
    const ctx: OAuthAuditContext = {
      traceId,
      spanId,
      startTime: Date.now(),
      stage: "AUTHORIZATION",
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
      userAgent: req.headers['user-agent'] || undefined,
      requestMethod: "GET",
      requestPath: "/api/oauth/authorize",
    };

    const rateLimitKey = req.user?.id || req.ip || "anonymous";
    const rateLimitResult = oauthRateLimiter.check(rateLimitKey);
    const rateLimitHeaders = oauthRateLimiter.getHeaders(rateLimitResult);
    
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (!rateLimitResult.allowed) {
      ctx.userId = req.user?.id;
      ctx.userEmail = req.user?.email;
      res.setHeader("Retry-After", String(rateLimitResult.retryAfter || 60));
      await logOAuthEvent(ctx, "RATE_LIMITED", "FAILURE", "rate_limit_exceeded", "Too many authorization requests");
      return res.status(429).json({
        error: "rate_limit_exceeded",
        error_description: "Too many authorization requests. Please wait before trying again.",
        retry_after: rateLimitResult.retryAfter,
        trace_id: traceId,
      });
    }

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

      ctx.clientId = client_id;
      ctx.redirectUri = redirect_uri;
      ctx.scope = scope;
      ctx.userId = req.user?.id;
      ctx.userEmail = req.user?.email;

      await logOAuthEvent(ctx, "AUTHORIZE_REQUEST", "INFO", undefined, undefined, {
        response_type,
        has_state: !!state,
        has_code_challenge: !!code_challenge,
        code_challenge_method,
        rate_limit_remaining: rateLimitResult.remaining,
      });

      if (!client_id || !redirect_uri) {
        await logOAuthEvent(ctx, "AUTHORIZE_FAILED", "FAILURE", "invalid_request", "client_id and redirect_uri are required");
        return res.status(400).json({ error: "invalid_request", error_description: "client_id and redirect_uri are required", trace_id: traceId });
      }

      if (response_type !== "code") {
        await logOAuthEvent(ctx, "AUTHORIZE_FAILED", "FAILURE", "unsupported_response_type", "Only response_type=code is supported");
        return res.status(400).json({ error: "unsupported_response_type", error_description: "Only response_type=code is supported", trace_id: traceId });
      }

      const appRecord = await storage.getAppByClientId(client_id);
      if (!appRecord) {
        await logOAuthEvent(ctx, "AUTHORIZE_FAILED", "FAILURE", "invalid_client", "Unknown client_id");
        return res.status(400).json({ error: "invalid_client", error_description: "Unknown client_id", trace_id: traceId });
      }

      ctx.appId = appRecord.id;
      ctx.appName = appRecord.name;
      await logOAuthEvent(ctx, "APP_RESOLVED", "INFO", undefined, undefined, { appId: appRecord.id, appName: appRecord.name });

      const normalizeUrl = (url: string): string => {
        try {
          const parsed = new URL(url);
          parsed.hostname = parsed.hostname.toLowerCase();
          if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
            parsed.pathname = parsed.pathname.slice(0, -1);
          }
          return parsed.toString();
        } catch {
          return url.toLowerCase().replace(/\/$/, '');
        }
      };

      const normalizedRedirectUri = normalizeUrl(redirect_uri);
      const allAllowedUrls = [
        appRecord.callbackUrl,
        ...(appRecord.allowedCallbackUrls || [])
      ].filter((url, index, self) => url && self.indexOf(url) === index);
      
      const isAllowed = allAllowedUrls.some(allowedUrl => {
        const normalizedAllowed = normalizeUrl(allowedUrl);
        return normalizedRedirectUri === normalizedAllowed;
      });

      if (!isAllowed) {
        await logOAuthEvent(ctx, "AUTHORIZE_FAILED", "FAILURE", "invalid_redirect_uri", "Redirect URI does not match registered callback", {
          received: redirect_uri,
          normalized: normalizedRedirectUri,
          allowed: allAllowedUrls,
        });
        return res.status(400).json({ error: "invalid_redirect_uri", error_description: "Redirect URI does not match registered callback", trace_id: traceId });
      }

      await logOAuthEvent(ctx, "REDIRECT_URI_VALIDATED", "INFO");

      if (!code_challenge) {
        await logOAuthEvent(ctx, "AUTHORIZE_FAILED", "FAILURE", "invalid_request", "PKCE code_challenge is required");
        return res.status(400).json({ error: "invalid_request", error_description: "PKCE code_challenge is required for security", trace_id: traceId });
      }

      if (code_challenge_method !== "S256") {
        await logOAuthEvent(ctx, "AUTHORIZE_FAILED", "FAILURE", "invalid_request", "code_challenge_method must be S256");
        return res.status(400).json({ error: "invalid_request", error_description: "code_challenge_method must be S256", trace_id: traceId });
      }

      await logOAuthEvent(ctx, "PKCE_VALIDATED", "INFO");

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
        authorizeTraceId: traceId,
        expiresAt,
      });

      await logOAuthEvent(ctx, "CODE_CREATED", "SUCCESS", undefined, undefined, { codePrefix: authCode.substring(0, 8) });

      // Activate app subscription when user authorizes via OAuth
      const existingSubscription = await storage.getAppSubscription(req.user!.id, appRecord.id);
      if (existingSubscription) {
        if (existingSubscription.status !== "ACTIVE") {
          await storage.updateAppSubscription(existingSubscription.id, { 
            status: "ACTIVE",
            cancelledAt: null,
          });
          await logOAuthEvent(ctx, "SUBSCRIPTION_ACTIVATED", "SUCCESS", undefined, undefined, { subscriptionId: existingSubscription.id });
        }
      } else {
        const newSubscription = await storage.createAppSubscription({
          userId: req.user!.id,
          appId: appRecord.id,
          status: "ACTIVE",
          billingCycle: "MONTHLY",
          currentPeriodEnd: null,
          nextBillingDate: null,
          lastBilledAt: null,
          totalUsageCount: 0,
          cancelledAt: null,
        });
        await logOAuthEvent(ctx, "SUBSCRIPTION_CREATED", "SUCCESS", undefined, undefined, { subscriptionId: newSubscription.id });
      }

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.append("code", authCode);
      if (state) {
        redirectUrl.searchParams.append("state", state);
      }

      const response: { redirect_uri: string; code: string; state?: string; trace_id: string } = { 
        redirect_uri: redirectUrl.toString(),
        code: authCode,
        trace_id: traceId,
      };
      if (state) {
        response.state = state;
      }

      await logOAuthEvent(ctx, "AUTHORIZE_SUCCESS", "SUCCESS");
      res.json(response);
    } catch (error) {
      await logOAuthEvent(ctx, "AUTHORIZE_ERROR", "FAILURE", "server_error", String(error));
      console.error("OAuth authorize error:", error);
      res.status(500).json({ error: "server_error", error_description: "Authorization failed", trace_id: traceId });
    }
  });

  app.post("/api/oauth/token", async (req, res) => {
    const traceId = generateTraceId();
    const spanId = randomBytes(8).toString("hex");
    const ctx: OAuthAuditContext = {
      traceId,
      spanId,
      startTime: Date.now(),
      stage: "TOKEN_EXCHANGE",
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
      userAgent: req.headers['user-agent'] || undefined,
      requestMethod: "POST",
      requestPath: "/api/oauth/token",
    };

    const rateLimitKey = req.body.client_id || req.ip || "anonymous";
    const rateLimitResult = oauthTokenRateLimiter.check(rateLimitKey);
    const rateLimitHeaders = oauthTokenRateLimiter.getHeaders(rateLimitResult);
    
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (!rateLimitResult.allowed) {
      ctx.clientId = req.body.client_id;
      res.setHeader("Retry-After", String(rateLimitResult.retryAfter || 60));
      await logOAuthEvent(ctx, "RATE_LIMITED", "FAILURE", "rate_limit_exceeded", "Too many token requests");
      return res.status(429).json({
        error: "rate_limit_exceeded",
        error_description: "Too many requests. Please wait before trying again.",
        retry_after: rateLimitResult.retryAfter,
        trace_id: traceId,
      });
    }

    try {
      const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = req.body;

      ctx.clientId = client_id;
      ctx.redirectUri = redirect_uri;

      await logOAuthEvent(ctx, "TOKEN_REQUEST", "INFO", undefined, undefined, {
        grant_type,
        has_code: !!code,
        has_client_secret: !!client_secret,
        has_code_verifier: !!code_verifier,
        rate_limit_remaining: rateLimitResult.remaining,
      });

      if (grant_type !== "authorization_code") {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "unsupported_grant_type", "Only authorization_code grant is supported");
        return res.status(400).json({ error: "unsupported_grant_type", error_description: "Only authorization_code grant is supported", trace_id: traceId });
      }

      if (!code || !redirect_uri || !client_id) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_request", "code, redirect_uri, and client_id are required");
        return res.status(400).json({ error: "invalid_request", error_description: "code, redirect_uri, and client_id are required", trace_id: traceId });
      }

      const appRecord = await storage.getAppByClientId(client_id);
      if (!appRecord) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_client", "Unknown client_id");
        return res.status(401).json({ error: "invalid_client", error_description: "Unknown client_id", trace_id: traceId });
      }

      ctx.appId = appRecord.id;
      ctx.appName = appRecord.name;
      await logOAuthEvent(ctx, "CLIENT_VALIDATED", "INFO", undefined, undefined, { appName: appRecord.name });

      if (appRecord.clientSecret && appRecord.clientSecret !== client_secret) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_client", "Client authentication failed");
        return res.status(401).json({ error: "invalid_client", error_description: "Client authentication failed", trace_id: traceId });
      }

      await logOAuthEvent(ctx, "CLIENT_SECRET_VALIDATED", "INFO");

      const authCode = await storage.getOauthAuthorizationCode(code);
      if (!authCode) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_grant", "Invalid authorization code");
        return res.status(400).json({ error: "invalid_grant", error_description: "Invalid authorization code", trace_id: traceId });
      }

      ctx.userId = authCode.userId;
      const user = await storage.getUser(authCode.userId);
      ctx.userEmail = user?.email;
      ctx.scope = authCode.scope || undefined;

      await logOAuthEvent(ctx, "CODE_FOUND", "INFO", undefined, undefined, { 
        codePrefix: code.substring(0, 8),
        authorizeTraceId: authCode.authorizeTraceId || null,
      });

      const wasMarkedUsed = await storage.markOauthCodeUsed(authCode.id);
      if (!wasMarkedUsed) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_grant", "Authorization code already used");
        return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code already used", trace_id: traceId });
      }

      if (authCode.expiresAt < new Date()) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_grant", "Authorization code expired", {
          expiresAt: authCode.expiresAt.toISOString(),
          now: new Date().toISOString(),
        });
        return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code expired", trace_id: traceId });
      }

      if (authCode.appId !== appRecord.id) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_grant", "Authorization code was not issued for this client");
        return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code was not issued for this client", trace_id: traceId });
      }

      if (authCode.redirectUri !== redirect_uri) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_grant", "Redirect URI mismatch", {
          expected: authCode.redirectUri,
          received: redirect_uri,
        });
        return res.status(400).json({ error: "invalid_grant", error_description: "Redirect URI mismatch", trace_id: traceId });
      }

      await logOAuthEvent(ctx, "CODE_VALIDATED", "INFO");

      if (!authCode.codeChallenge) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_grant", "Authorization code missing PKCE challenge");
        return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code missing PKCE challenge", trace_id: traceId });
      }

      if (!code_verifier) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_request", "code_verifier is required");
        return res.status(400).json({ error: "invalid_request", error_description: "code_verifier is required", trace_id: traceId });
      }

      const expectedChallenge = createHash("sha256")
        .update(code_verifier)
        .digest("base64url");

      if (authCode.codeChallenge !== expectedChallenge) {
        await logOAuthEvent(ctx, "TOKEN_FAILED", "FAILURE", "invalid_grant", "PKCE code_verifier mismatch");
        return res.status(400).json({ error: "invalid_grant", error_description: "PKCE code_verifier mismatch", trace_id: traceId });
      }

      await logOAuthEvent(ctx, "PKCE_VERIFIED", "INFO");

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

      await logOAuthEvent(ctx, "TOKEN_ISSUED", "SUCCESS", undefined, undefined, { tokenPrefix: accessToken.substring(0, 8) });

      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: authCode.scope || null,
        trace_id: traceId,
        user: user ? {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        } : null,
      });
    } catch (error) {
      await logOAuthEvent(ctx, "TOKEN_ERROR", "FAILURE", "server_error", String(error));
      console.error("OAuth token error:", error);
      res.status(500).json({ error: "server_error", error_description: "Token exchange failed", trace_id: traceId });
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
        authorizeTraceId: null,
        expiresAt,
      });

      // Activate app subscription when user authorizes via SSO
      const existingSubscription = await storage.getAppSubscription(req.user!.id, appRecord.id);
      if (existingSubscription) {
        if (existingSubscription.status !== "ACTIVE") {
          await storage.updateAppSubscription(existingSubscription.id, { 
            status: "ACTIVE",
            cancelledAt: null,
          });
        }
      } else {
        await storage.createAppSubscription({
          userId: req.user!.id,
          appId: appRecord.id,
          status: "ACTIVE",
          billingCycle: "MONTHLY",
          currentPeriodEnd: null,
          nextBillingDate: null,
          lastBilledAt: null,
          totalUsageCount: 0,
          cancelledAt: null,
        });
      }

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

  app.post("/api/v2/balance", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "missing_api_key", message: "API key required in Authorization header" });
      }

      const key = authHeader.slice(7);
      const keyHash = hashToken(key);
      const appApiKey = await storage.getAppApiKeyByHash(keyHash);

      if (!appApiKey) {
        return res.status(401).json({ error: "invalid_api_key", message: "Invalid or revoked API key" });
      }

      if (appApiKey.expiresAt && appApiKey.expiresAt < new Date()) {
        return res.status(401).json({ error: "expired_api_key", message: "API key has expired" });
      }

      if (!appApiKey.scopes.includes("balance:read")) {
        return res.status(403).json({ error: "insufficient_scope", message: "API key does not have balance:read scope" });
      }

      await storage.updateAppApiKeyLastUsed(appApiKey.id);

      const { user_email } = req.body;
      if (!user_email) {
        return res.status(400).json({ error: "missing_user_email", message: "user_email is required" });
      }

      const user = await storage.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ error: "user_not_found", message: "User not found" });
      }

      const subscription = await storage.getAppSubscription(user.id, appApiKey.appId);
      if (!subscription || subscription.status !== "ACTIVE") {
        return res.status(403).json({ 
          error: "user_not_authorized", 
          message: "User has not authorized this app to access their account",
          authorization_required: true
        });
      }

      const wallet = await storage.getWalletByUserId(user.id);
      if (!wallet) {
        return res.status(404).json({ error: "wallet_not_found", message: "User wallet not found" });
      }

      res.json({
        user_email,
        balance_cents: wallet.balanceCents,
        currency: wallet.currency,
        subscription_status: subscription.status,
      });
    } catch (error) {
      console.error("V2 balance error:", error);
      res.status(500).json({ error: "server_error", message: "Failed to get balance" });
    }
  });

  app.post("/api/v2/debit", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "missing_api_key", message: "API key required in Authorization header" });
      }

      const key = authHeader.slice(7);
      const keyHash = hashToken(key);
      const appApiKey = await storage.getAppApiKeyByHash(keyHash);

      if (!appApiKey) {
        return res.status(401).json({ error: "invalid_api_key", message: "Invalid or revoked API key" });
      }

      if (appApiKey.expiresAt && appApiKey.expiresAt < new Date()) {
        return res.status(401).json({ error: "expired_api_key", message: "API key has expired" });
      }

      if (!appApiKey.scopes.includes("credits:debit")) {
        return res.status(403).json({ error: "insufficient_scope", message: "API key does not have credits:debit scope" });
      }

      await storage.updateAppApiKeyLastUsed(appApiKey.id);

      const { user_email, amount_cents, description, idempotency_key } = req.body;

      if (!user_email) {
        return res.status(400).json({ error: "missing_user_email", message: "user_email is required" });
      }

      if (!amount_cents || typeof amount_cents !== "number" || amount_cents <= 0) {
        return res.status(400).json({ error: "invalid_amount", message: "amount_cents must be a positive number" });
      }

      const user = await storage.getUserByEmail(user_email);
      if (!user) {
        return res.status(404).json({ error: "user_not_found", message: "User not found" });
      }

      const subscription = await storage.getAppSubscription(user.id, appApiKey.appId);
      if (!subscription || subscription.status !== "ACTIVE") {
        return res.status(403).json({ 
          error: "user_not_authorized", 
          message: "User has not authorized this app to debit credits from their account",
          authorization_required: true
        });
      }

      const wallet = await storage.getWalletByUserId(user.id);
      if (!wallet) {
        return res.status(404).json({ error: "wallet_not_found", message: "User wallet not found" });
      }

      if (wallet.balanceCents < amount_cents) {
        return res.status(402).json({ 
          error: "insufficient_balance", 
          message: "User does not have sufficient credits",
          current_balance_cents: wallet.balanceCents,
          required_cents: amount_cents
        });
      }

      const transaction = await storage.createTransaction({
        walletId: wallet.id,
        type: "DEBIT",
        source: "APP_USAGE",
        amountCents: amount_cents,
        description: description || `${appApiKey.app.name} usage`,
        status: "COMPLETED",
        appId: appApiKey.appId,
      });

      await storage.updateWalletBalance(wallet.id, -amount_cents);

      await storage.incrementSubscriptionUsage(subscription.id);

      await createAuditLog(req, "WALLET_DEBIT", `App debit: ${appApiKey.app.name}`, user.id, "wallet", wallet.id, { 
        amount_cents, 
        transactionId: transaction.id, 
        appId: appApiKey.appId,
        appName: appApiKey.app.name,
        appApiKeyId: appApiKey.id,
        idempotency_key 
      });
      
      const autoTopupResult = await checkAndExecuteAutoTopup(user.id, wallet.id);

      if (autoTopupResult.triggered) {
        await createAuditLog(req, "WALLET_AUTO_TOPUP", "Auto top-up triggered", user.id, "wallet", wallet.id, { 
          amountCents: autoTopupResult.amountCents, 
          transactionId: autoTopupResult.transactionId 
        });
      }

      const finalWallet = await storage.getWallet(wallet.id);
      const finalBalanceCents = finalWallet?.balanceCents ?? (wallet.balanceCents - amount_cents);

      res.json({
        success: true,
        transaction_id: transaction.id,
        amount_cents,
        new_balance_cents: finalBalanceCents,
        user_email,
        app_name: appApiKey.app.name,
        auto_topup: autoTopupResult.triggered ? {
          triggered: true,
          amount_cents: autoTopupResult.amountCents,
          transaction_id: autoTopupResult.transactionId,
          balance_after_topup: autoTopupResult.newBalance,
        } : undefined,
      });
    } catch (error) {
      console.error("V2 debit error:", error);
      res.status(500).json({ error: "server_error", message: "Failed to process debit" });
    }
  });

  app.post("/api/v2/check-authorization", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "missing_api_key", message: "API key required in Authorization header" });
      }

      const key = authHeader.slice(7);
      const keyHash = hashToken(key);
      const appApiKey = await storage.getAppApiKeyByHash(keyHash);

      if (!appApiKey) {
        return res.status(401).json({ error: "invalid_api_key", message: "Invalid or revoked API key" });
      }

      if (appApiKey.expiresAt && appApiKey.expiresAt < new Date()) {
        return res.status(401).json({ error: "expired_api_key", message: "API key has expired" });
      }

      await storage.updateAppApiKeyLastUsed(appApiKey.id);

      const { user_email } = req.body;
      if (!user_email) {
        return res.status(400).json({ error: "missing_user_email", message: "user_email is required" });
      }

      const user = await storage.getUserByEmail(user_email);
      if (!user) {
        return res.json({ 
          authorized: false, 
          reason: "user_not_found",
          user_exists: false
        });
      }

      const subscription = await storage.getAppSubscription(user.id, appApiKey.appId);
      
      if (!subscription) {
        return res.json({ 
          authorized: false, 
          reason: "no_subscription",
          user_exists: true
        });
      }

      if (subscription.status !== "ACTIVE") {
        return res.json({ 
          authorized: false, 
          reason: "subscription_not_active",
          user_exists: true,
          subscription_status: subscription.status
        });
      }

      res.json({ 
        authorized: true,
        user_exists: true,
        subscription_status: subscription.status,
        subscribed_at: subscription.subscribedAt,
        billing_cycle: subscription.billingCycle
      });
    } catch (error) {
      console.error("V2 check-authorization error:", error);
      res.status(500).json({ error: "server_error", message: "Failed to check authorization" });
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

  app.get("/api/diagnostics/trace/:traceId", async (req, res) => {
    try {
      const { traceId } = req.params;
      
      if (!traceId) {
        return res.status(400).json({ 
          error: "missing_trace_id", 
          message: "trace_id is required" 
        });
      }

      const logs = await storage.getOauthAuditLogsByTraceId(traceId);
      
      if (logs.length === 0) {
        return res.status(404).json({ 
          error: "trace_not_found", 
          message: "No logs found for this trace_id. The trace may have expired or the ID is incorrect.",
          hint: "Trace IDs are returned in OAuth error responses. Check that you're using the correct trace_id."
        });
      }

      const timeline = logs.map(log => ({
        timestamp: log.createdAt,
        event: log.event,
        stage: log.stage,
        status: log.status,
        duration_ms: log.durationMs,
        error: log.errorCode ? {
          code: log.errorCode,
          message: log.errorMessage,
          class: log.errorClass,
          hint: log.troubleshootingHint,
        } : undefined,
        details: log.details ? JSON.parse(log.details) : undefined,
      }));

      const summary = {
        trace_id: traceId,
        total_events: logs.length,
        first_event: logs[0]?.createdAt,
        last_event: logs[logs.length - 1]?.createdAt,
        total_duration_ms: logs[logs.length - 1]?.durationMs,
        client_id: logs[0]?.clientId,
        app_name: logs[0]?.appName,
        user_email: logs[0]?.userEmail,
        final_status: logs[logs.length - 1]?.status,
        errors: logs.filter(l => l.status === "FAILURE").map(l => ({
          event: l.event,
          code: l.errorCode,
          message: l.errorMessage,
          hint: l.troubleshootingHint,
        })),
      };

      res.json({ summary, timeline });
    } catch (error) {
      console.error("Diagnostics trace error:", error);
      res.status(500).json({ error: "server_error", message: "Failed to retrieve trace" });
    }
  });

  app.get("/api/diagnostics/app/:appId", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ 
          error: "missing_api_key", 
          message: "App API key required in Authorization header" 
        });
      }

      const key = authHeader.slice(7);
      const keyHash = hashToken(key);
      const appApiKey = await storage.getAppApiKeyByHash(keyHash);

      if (!appApiKey) {
        return res.status(401).json({ error: "invalid_api_key", message: "Invalid or revoked API key" });
      }

      const { appId } = req.params;

      if (appApiKey.appId !== appId) {
        return res.status(403).json({ 
          error: "access_denied", 
          message: "API key does not have access to this app's diagnostics" 
        });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      
      const [recentLogs, recentErrors, healthMetrics, webhookFailures] = await Promise.all([
        storage.getOauthAuditLogsByAppId(appId, limit),
        storage.getRecentOauthErrors(appId, 20),
        storage.getIntegrationHealthMetrics(appId),
        storage.getRecentWebhookFailures(appId, 20),
      ]);

      const errorSummary: Record<string, { count: number; last_seen: Date | null; hint?: string }> = {};
      recentErrors.forEach(log => {
        if (log.errorCode) {
          if (!errorSummary[log.errorCode]) {
            errorSummary[log.errorCode] = { 
              count: 0, 
              last_seen: null,
              hint: log.troubleshootingHint || undefined,
            };
          }
          errorSummary[log.errorCode].count++;
          if (!errorSummary[log.errorCode].last_seen || 
              (log.createdAt && log.createdAt > errorSummary[log.errorCode].last_seen!)) {
            errorSummary[log.errorCode].last_seen = log.createdAt;
          }
        }
      });

      const webhookSummary = webhookFailures.map(d => ({
        id: d.id,
        endpoint: d.endpointUrl,
        status: d.status,
        response_status: d.responseStatus,
        error: d.errorMessage,
        hint: d.troubleshootingHint,
        created_at: d.createdAt,
      }));

      res.json({
        app_id: appId,
        health: healthMetrics ? {
          score: healthMetrics.healthScore,
          quarantined: healthMetrics.quarantined,
          quarantine_reason: healthMetrics.quarantineReason,
          last_success: healthMetrics.lastSuccessAt,
          last_failure: healthMetrics.lastFailureAt,
          oauth_success_count: healthMetrics.oauthSuccessCount,
          oauth_failure_count: healthMetrics.oauthFailureCount,
          api_call_success_count: healthMetrics.apiCallSuccessCount,
          api_call_failure_count: healthMetrics.apiCallFailureCount,
          webhook_success_count: healthMetrics.webhookSuccessCount,
          webhook_failure_count: healthMetrics.webhookFailureCount,
        } : null,
        error_summary: errorSummary,
        recent_webhook_failures: webhookSummary,
        recent_activity: recentLogs.slice(0, 20).map(log => ({
          timestamp: log.createdAt,
          event: log.event,
          stage: log.stage,
          status: log.status,
          trace_id: log.traceId,
          error_code: log.errorCode,
        })),
      });
    } catch (error) {
      console.error("Diagnostics app error:", error);
      res.status(500).json({ error: "server_error", message: "Failed to retrieve app diagnostics" });
    }
  });

  app.get("/api/diagnostics/validate-redirect-uri", async (req, res) => {
    try {
      const { client_id, redirect_uri } = req.query as { client_id?: string; redirect_uri?: string };

      if (!client_id || !redirect_uri) {
        return res.status(400).json({ 
          error: "missing_parameters", 
          message: "Both client_id and redirect_uri are required" 
        });
      }

      const appRecord = await storage.getAppByClientId(client_id);
      if (!appRecord) {
        return res.json({ 
          valid: false,
          error: "invalid_client",
          message: "Unknown client_id",
          hint: "Verify the client_id is correct and the app is still active."
        });
      }

      const normalizeUrl = (url: string): string => {
        try {
          const parsed = new URL(url);
          parsed.hostname = parsed.hostname.toLowerCase();
          if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
            parsed.pathname = parsed.pathname.slice(0, -1);
          }
          return parsed.toString();
        } catch {
          return url.toLowerCase().replace(/\/$/, '');
        }
      };

      const normalizedRedirectUri = normalizeUrl(redirect_uri);
      const allAllowedUrls = [
        appRecord.callbackUrl,
        ...(appRecord.allowedCallbackUrls || [])
      ].filter((url, index, self) => url && self.indexOf(url) === index);
      
      const matchResults = allAllowedUrls.map(allowedUrl => {
        const normalizedAllowed = normalizeUrl(allowedUrl);
        return {
          registered_uri: allowedUrl,
          normalized: normalizedAllowed,
          matches: normalizedRedirectUri === normalizedAllowed,
        };
      });

      const isValid = matchResults.some(r => r.matches);

      if (!isValid) {
        const possibleIssues: string[] = [];
        
        const hasHttpMismatch = allAllowedUrls.some(url => {
          const proto = new URL(url).protocol;
          try {
            const reqProto = new URL(redirect_uri).protocol;
            return proto !== reqProto;
          } catch { return false; }
        });
        if (hasHttpMismatch) {
          possibleIssues.push("HTTP/HTTPS protocol mismatch detected");
        }

        const hasTrailingSlashIssue = allAllowedUrls.some(url => {
          return url.endsWith('/') !== redirect_uri.endsWith('/');
        });
        if (hasTrailingSlashIssue) {
          possibleIssues.push("Trailing slash mismatch detected");
        }

        return res.json({
          valid: false,
          error: "invalid_redirect_uri",
          message: "Redirect URI does not match any registered URIs",
          submitted_uri: redirect_uri,
          normalized_submitted: normalizedRedirectUri,
          registered_uris: matchResults,
          possible_issues: possibleIssues,
          hint: "Ensure the redirect_uri exactly matches one of the registered URIs, including protocol (http/https) and trailing slashes."
        });
      }

      res.json({
        valid: true,
        app_name: appRecord.name,
        submitted_uri: redirect_uri,
        matched_uri: matchResults.find(r => r.matches)?.registered_uri,
      });
    } catch (error) {
      console.error("Validate redirect URI error:", error);
      res.status(500).json({ error: "server_error", message: "Failed to validate redirect URI" });
    }
  });

  app.get("/api/diagnostics/validate-pkce", (req, res) => {
    try {
      const { code_verifier, code_challenge, code_challenge_method } = req.query as {
        code_verifier?: string;
        code_challenge?: string;
        code_challenge_method?: string;
      };

      if (!code_verifier || !code_challenge) {
        return res.status(400).json({ 
          error: "missing_parameters", 
          message: "Both code_verifier and code_challenge are required" 
        });
      }

      if (code_challenge_method && code_challenge_method !== "S256") {
        return res.json({
          valid: false,
          error: "unsupported_method",
          message: "Only S256 code_challenge_method is supported",
          hint: "Use SHA-256 hashing for PKCE challenges."
        });
      }

      if (code_verifier.length < 43 || code_verifier.length > 128) {
        return res.json({
          valid: false,
          error: "invalid_verifier_length",
          message: `code_verifier must be 43-128 characters (got ${code_verifier.length})`,
          hint: "Generate a cryptographically random string between 43 and 128 characters."
        });
      }

      const computedChallenge = createHash("sha256")
        .update(code_verifier)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      const matches = computedChallenge === code_challenge;

      res.json({
        valid: matches,
        submitted_challenge: code_challenge,
        computed_challenge: computedChallenge,
        verifier_length: code_verifier.length,
        matches,
        hint: matches 
          ? "PKCE verification will succeed with these values."
          : "The code_challenge does not match the SHA-256 hash of the code_verifier. Verify your base64url encoding (no padding, use - and _ instead of + and /)."
      });
    } catch (error) {
      console.error("Validate PKCE error:", error);
      res.status(500).json({ error: "server_error", message: "Failed to validate PKCE" });
    }
  });

  app.get("/api/admin/integration-health", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const apps = await storage.getAllApps();
      
      const healthData = await Promise.all(apps.map(async (app) => {
        const metrics = await storage.getIntegrationHealthMetrics(app.id);
        const recentErrors = await storage.getRecentOauthErrors(app.id, 5);
        
        return {
          app_id: app.id,
          app_name: app.name,
          client_id: app.clientId,
          is_active: app.isActive,
          health: metrics ? {
            score: metrics.healthScore,
            quarantined: metrics.quarantined,
            quarantine_reason: metrics.quarantineReason,
            quarantined_at: metrics.quarantinedAt,
            last_success: metrics.lastSuccessAt,
            last_failure: metrics.lastFailureAt,
            oauth_success_rate: metrics.oauthSuccessCount + metrics.oauthFailureCount > 0 
              ? Math.round((metrics.oauthSuccessCount / (metrics.oauthSuccessCount + metrics.oauthFailureCount)) * 100)
              : null,
            api_call_success_rate: metrics.apiCallSuccessCount + metrics.apiCallFailureCount > 0 
              ? Math.round((metrics.apiCallSuccessCount / (metrics.apiCallSuccessCount + metrics.apiCallFailureCount)) * 100)
              : null,
            webhook_success_rate: metrics.webhookSuccessCount + metrics.webhookFailureCount > 0 
              ? Math.round((metrics.webhookSuccessCount / (metrics.webhookSuccessCount + metrics.webhookFailureCount)) * 100)
              : null,
          } : null,
          recent_errors: recentErrors.map(e => ({
            timestamp: e.createdAt,
            event: e.event,
            error_code: e.errorCode,
            error_class: e.errorClass,
            trace_id: e.traceId,
          })),
        };
      }));

      const quarantinedApps = healthData.filter(h => h.health?.quarantined);
      const lowHealthApps = healthData.filter(h => h.health && h.health.score !== null && h.health.score < 50 && !h.health.quarantined);

      res.json({
        summary: {
          total_apps: apps.length,
          active_apps: apps.filter(a => a.isActive).length,
          quarantined_count: quarantinedApps.length,
          low_health_count: lowHealthApps.length,
        },
        quarantined_apps: quarantinedApps,
        low_health_apps: lowHealthApps,
        all_apps: healthData,
      });
    } catch (error) {
      console.error("Admin integration health error:", error);
      res.status(500).json({ message: "Failed to get integration health" });
    }
  });

  app.post("/api/admin/integration-health/:appId/unquarantine", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { appId } = req.params;
      
      const metrics = await storage.getIntegrationHealthMetrics(appId);
      if (!metrics) {
        return res.status(404).json({ error: "not_found", message: "No health metrics found for this app" });
      }

      if (!metrics.quarantined) {
        return res.status(400).json({ error: "not_quarantined", message: "This app is not currently quarantined" });
      }

      await storage.updateIntegrationHealthMetrics(appId, {
        quarantined: false,
        quarantinedAt: null,
        quarantineReason: null,
        healthScore: 50,
        oauthSuccessCount: 0,
        oauthFailureCount: 0,
        apiCallSuccessCount: 0,
        apiCallFailureCount: 0,
        webhookSuccessCount: 0,
        webhookFailureCount: 0,
      });

      await createAuditLog(req, "APP_UNQUARANTINE", `App ${appId} unquarantined by admin`, req.user!.id, "app", appId, {});

      res.json({ success: true, message: "App has been unquarantined and health metrics reset" });
    } catch (error) {
      console.error("Admin unquarantine error:", error);
      res.status(500).json({ message: "Failed to unquarantine app" });
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

  app.get("/api/admin/payment-gateways", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const { getAvailablePaymentGateways } = await import("./payments");
      const gateways = await getAvailablePaymentGateways();
      res.json(gateways);
    } catch (error) {
      console.error("Get payment gateways error:", error);
      res.status(500).json({ message: "Failed to get payment gateways" });
    }
  });

  app.patch("/api/admin/payment-gateways/:gateway", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
    try {
      const gateway = req.params.gateway.toUpperCase() as "STRIPE" | "PAYPAL" | "COINBASE";
      const { enabled, sandboxMode } = req.body;

      if (!["STRIPE", "PAYPAL", "COINBASE"].includes(gateway)) {
        return res.status(400).json({ message: "Invalid gateway" });
      }

      const updateData: Record<string, any> = {};
      if (typeof enabled === "boolean") {
        updateData.enabled = enabled;
      }
      if (typeof sandboxMode === "boolean") {
        updateData.sandboxMode = sandboxMode;
      }

      const updated = await storage.updatePaymentGatewaySettings(gateway, updateData);
      if (!updated) {
        return res.status(404).json({ message: "Gateway settings not found" });
      }

      await createAuditLog(
        req, 
        "ADMIN_ACTION", 
        `Updated ${gateway} payment gateway settings`,
        req.user!.id, 
        "payment_gateway", 
        gateway, 
        updateData
      );

      const { getAvailablePaymentGateways } = await import("./payments");
      const gateways = await getAvailablePaymentGateways();
      const gatewayStatus = gateways.find(g => g.gateway === gateway);
      
      res.json(gatewayStatus);
    } catch (error) {
      console.error("Update payment gateway error:", error);
      res.status(500).json({ message: "Failed to update payment gateway" });
    }
  });

  app.get("/api/payment-gateways/enabled", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { getEnabledPaymentGateways } = await import("./payments");
      const gateways = await getEnabledPaymentGateways();
      res.json(gateways);
    } catch (error) {
      console.error("Get enabled payment gateways error:", error);
      res.status(500).json({ message: "Failed to get payment gateways" });
    }
  });

  app.get("/api/payment-gateways/config", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { getClientConfig } = await import("./payments");
      const config = await getClientConfig();
      res.json(config);
    } catch (error) {
      console.error("Get payment config error:", error);
      res.status(500).json({ message: "Failed to get payment config" });
    }
  });

  app.post("/api/payments/create-intent", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { gateway, amountCents, paymentMethodId } = req.body;
      
      if (!gateway || !amountCents || amountCents < 100) {
        return res.status(400).json({ message: "Gateway and amount (min $1.00) required" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const wallet = await storage.getWalletByUserId(req.user!.id);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      const transaction = await storage.createTransaction({
        walletId: wallet.id,
        type: "CREDIT",
        source: "FUNDING",
        amountCents,
        description: `Wallet funding via ${gateway}`,
        status: "PENDING",
        appId: null,
      });

      const { processPayment } = await import("./payments");
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000"}`;
      
      const result = await processPayment(gateway, amountCents, req.user!.id, {
        paymentMethodId,
        returnUrl: `${baseUrl}/wallet?payment=success&tx=${transaction.id}`,
        cancelUrl: `${baseUrl}/wallet?payment=cancel&tx=${transaction.id}`,
        description: `Wallet funding - $${(amountCents / 100).toFixed(2)}`,
        metadata: { transactionId: transaction.id, userId: req.user!.id },
      });

      if (!result.success) {
        await storage.updateTransactionStatus(transaction.id, "FAILED");
        return res.status(400).json({ message: result.error });
      }

      res.json({
        transactionId: transaction.id,
        externalId: result.externalId,
        clientSecret: result.clientSecret,
        redirectUrl: result.redirectUrl,
        requiresAction: result.requiresAction,
      });
    } catch (error) {
      console.error("Create payment intent error:", error);
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  app.post("/api/payments/confirm", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { gateway, externalId, transactionId } = req.body;

      if (!gateway || !externalId || !transactionId) {
        return res.status(400).json({ message: "Gateway, externalId, and transactionId required" });
      }

      const { confirmPayment } = await import("./payments");
      const result = await confirmPayment(gateway, externalId);

      if (result.success && result.status === "COMPLETED") {
        await storage.updateTransactionStatus(transactionId, "COMPLETED");
        
        const wallet = await storage.getWalletByUserId(req.user!.id);
        if (wallet) {
          const tx = await storage.getTransactionsByWalletId(wallet.id, 1);
          const matchingTx = tx.find(t => t.id === transactionId);
          if (matchingTx) {
            await storage.updateWalletBalance(wallet.id, matchingTx.amountCents);
          }
        }

        await createAuditLog(
          req,
          "WALLET_FUND",
          `Wallet funded via ${gateway}`,
          req.user!.id,
          "transaction",
          transactionId
        );
      } else {
        await storage.updateTransactionStatus(transactionId, "FAILED");
      }

      res.json(result);
    } catch (error) {
      console.error("Confirm payment error:", error);
      res.status(500).json({ message: "Failed to confirm payment" });
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
