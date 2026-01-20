import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.SESSION_SECRET || "fallback-secret";
const JWT_ACCESS_EXPIRY = "15m";
const JWT_REFRESH_EXPIRY = "7d";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function generateTokens(userId: string) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });
  const refreshToken = jwt.sign({ userId, type: "refresh" }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRY });
  return { accessToken, refreshToken };
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function findOrCreateUserFromOAuth(claims: any): Promise<{ userId: string; isNewUser: boolean }> {
  const providerUserId = claims.sub;
  const email = claims.email;
  const firstName = claims.first_name;
  const lastName = claims.last_name;
  const profileImageUrl = claims.profile_image_url;

  const existingIdentity = await storage.getOAuthIdentityByProvider("REPLIT", providerUserId);
  
  if (existingIdentity) {
    await storage.updateOAuthIdentityLastLogin(existingIdentity.id);
    return { userId: existingIdentity.userId, isNewUser: false };
  }

  if (email) {
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      await storage.createOAuthIdentity({
        userId: existingUser.id,
        provider: "REPLIT",
        providerUserId,
        email,
        profileImageUrl,
        firstName,
        lastName,
        lastLoginAt: new Date(),
      });
      return { userId: existingUser.id, isNewUser: false };
    }
  }

  const randomPassword = crypto.randomBytes(32).toString("hex");
  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(randomPassword, 10);
  
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || email?.split("@")[0] || "User";
  
  const newUser = await storage.createUser({
    email: email || `oauth-${providerUserId}@workdigital.temp`,
    passwordHash,
    fullName,
    phone: null,
    phoneVerified: false,
    isAdmin: false,
    twoFactorEnabled: false,
    twoFactorMethod: null,
    twoFactorSecret: null,
  });

  await storage.createWallet({
    userId: newUser.id,
    currency: "USD",
    balanceCents: 0,
  });

  await storage.createOAuthIdentity({
    userId: newUser.id,
    provider: "REPLIT",
    providerUserId,
    email,
    profileImageUrl,
    firstName,
    lastName,
    lastLoginAt: new Date(),
  });

  return { userId: newUser.id, isNewUser: true };
}

export async function setupReplitAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/auth/replit/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/auth/replit/login", (req, res, next) => {
    const callbackUrl = `https://${req.hostname}/api/auth/replit/callback`;
    console.log(`[OAuth] Login initiated from: ${req.hostname}`);
    console.log(`[OAuth] Expected callback URL: ${callbackUrl}`);
    console.log(`[OAuth] Full request URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/auth/replit/callback", (req, res, next) => {
    console.log(`[OAuth] Callback received at: ${req.hostname}`);
    console.log(`[OAuth] Query params:`, JSON.stringify(req.query));
    console.log(`[OAuth] Full callback URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
    
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, async (err: any, user: any) => {
      if (err || !user) {
        console.error("[OAuth] Callback error:", err);
        console.error("[OAuth] User object:", user);
        console.error("[OAuth] Request headers:", JSON.stringify(req.headers, null, 2));
        return res.redirect("/auth?error=oauth_failed");
      }

      try {
        const claims = user.claims;
        console.log(`[OAuth] Processing claims for: ${claims?.email || 'unknown'}`);
        console.log(`[OAuth] Claims sub: ${claims?.sub}`);
        
        const { userId, isNewUser } = await findOrCreateUserFromOAuth(claims);
        console.log(`[OAuth] User ${isNewUser ? 'created' : 'found'}: ${userId}`);
        
        const dbUser = await storage.getUser(userId);
        if (!dbUser) {
          console.error(`[OAuth] User not found in DB after creation: ${userId}`);
          return res.redirect("/auth?error=user_not_found");
        }

        console.log(`[OAuth] Login successful for: ${dbUser.email}`);

        if (dbUser.twoFactorEnabled) {
          const tempToken = jwt.sign(
            { userId: dbUser.id, pendingTwoFactor: true },
            JWT_SECRET,
            { expiresIn: "5m" }
          );
          return res.redirect(`/auth?require2fa=true&token=${tempToken}`);
        }

        const { accessToken, refreshToken } = generateTokens(dbUser.id);
        
        res.cookie("accessToken", accessToken, {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          maxAge: 15 * 60 * 1000,
        });
        
        res.cookie("refreshToken", refreshToken, {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.redirect("/dashboard");
      } catch (error) {
        console.error("OAuth callback processing error:", error);
        res.redirect("/auth?error=processing_failed");
      }
    })(req, res, next);
  });

  app.get("/api/auth/replit/logout", (req, res) => {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    
    req.logout(() => {
      res.redirect("/");
    });
  });
}
