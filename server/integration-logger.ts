import crypto from "crypto";
import { storage } from "./storage";
import type { InsertOauthAuditLog, InsertWebhookDelivery } from "@shared/schema";

export type OAuthStage = "AUTHORIZATION" | "TOKEN_EXCHANGE" | "TOKEN_REFRESH" | "API_CALL" | "WEBHOOK_DELIVERY" | "CLIENT_REGISTRATION";
export type ErrorClass = "CLIENT" | "SERVER" | "NETWORK" | "VALIDATION" | "RATE_LIMIT" | "AUTHENTICATION" | "AUTHORIZATION";

interface LogContext {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  stage?: OAuthStage;
  clientId?: string;
  appId?: string;
  appName?: string;
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface ValidationError {
  field: string;
  message: string;
  code: string;
  hint?: string;
}

interface TroubleshootingInfo {
  errorClass: ErrorClass;
  hint: string;
  documentationUrl?: string;
  suggestedActions?: string[];
}

const ERROR_TROUBLESHOOTING: Record<string, TroubleshootingInfo> = {
  "invalid_redirect_uri": {
    errorClass: "VALIDATION",
    hint: "The redirect_uri does not match any registered URIs for this application. Check the registered redirect URIs in your app settings.",
    documentationUrl: "/api-docs#oauth-redirect-uris",
    suggestedActions: [
      "Verify the redirect_uri matches exactly (including trailing slashes)",
      "Check for HTTP vs HTTPS mismatch",
      "Ensure the URI is registered in app settings"
    ]
  },
  "invalid_client": {
    errorClass: "AUTHENTICATION",
    hint: "The client_id is not recognized or the client credentials are invalid.",
    documentationUrl: "/api-docs#oauth-authentication",
    suggestedActions: [
      "Verify the client_id is correct",
      "Check if the app is still active",
      "Regenerate client credentials if needed"
    ]
  },
  "invalid_grant": {
    errorClass: "CLIENT",
    hint: "The authorization code is invalid, expired, or has already been used.",
    documentationUrl: "/api-docs#oauth-token-exchange",
    suggestedActions: [
      "Authorization codes expire after 10 minutes",
      "Codes can only be used once",
      "Ensure the code_verifier matches the original code_challenge"
    ]
  },
  "invalid_scope": {
    errorClass: "VALIDATION",
    hint: "One or more requested scopes are invalid or not permitted for this application.",
    documentationUrl: "/api-docs#oauth-scopes",
    suggestedActions: [
      "Review available scopes in documentation",
      "Check app permissions settings",
      "Use only allowed scopes for your app"
    ]
  },
  "access_denied": {
    errorClass: "AUTHORIZATION",
    hint: "The user denied the authorization request or lacks required permissions.",
    documentationUrl: "/api-docs#oauth-authorization",
    suggestedActions: [
      "User must explicitly approve access",
      "Check if user has required roles",
      "Verify app is not blocked"
    ]
  },
  "rate_limit_exceeded": {
    errorClass: "RATE_LIMIT",
    hint: "Too many requests. Check the Retry-After header for when to retry.",
    documentationUrl: "/api-docs#rate-limits",
    suggestedActions: [
      "Implement exponential backoff",
      "Cache tokens and reuse them",
      "Check Retry-After header value"
    ]
  },
  "insufficient_balance": {
    errorClass: "CLIENT",
    hint: "The user's wallet does not have sufficient credits for this operation.",
    documentationUrl: "/api-docs#wallet-operations",
    suggestedActions: [
      "Check user balance before debit",
      "Prompt user to add funds",
      "Handle insufficient balance gracefully"
    ]
  },
  "webhook_delivery_failed": {
    errorClass: "NETWORK",
    hint: "Failed to deliver webhook to the configured endpoint.",
    documentationUrl: "/api-docs#webhooks",
    suggestedActions: [
      "Verify endpoint URL is accessible",
      "Check SSL certificate validity",
      "Ensure endpoint returns 2xx status",
      "Check for firewall/proxy issues"
    ]
  },
  "invalid_pkce": {
    errorClass: "VALIDATION",
    hint: "PKCE verification failed. The code_verifier does not match the code_challenge.",
    documentationUrl: "/api-docs#oauth-pkce",
    suggestedActions: [
      "Use S256 challenge method (recommended)",
      "Ensure code_verifier is 43-128 characters",
      "Verify base64url encoding is correct"
    ]
  },
  "token_expired": {
    errorClass: "CLIENT",
    hint: "The access token has expired. Use the refresh token to obtain a new one.",
    documentationUrl: "/api-docs#oauth-refresh",
    suggestedActions: [
      "Check token expiration before use",
      "Implement proactive token refresh",
      "Handle token refresh in error handlers"
    ]
  }
};

export function generateTraceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function generateSpanId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function hashPayload(payload: unknown): string {
  const str = typeof payload === "string" ? payload : JSON.stringify(payload);
  return crypto.createHash("sha256").update(str).digest("hex").substring(0, 16);
}

export function getTroubleshootingInfo(errorCode: string): TroubleshootingInfo | undefined {
  return ERROR_TROUBLESHOOTING[errorCode];
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return JSON.stringify(errors);
}

export class IntegrationLogger {
  private context: LogContext;
  private startTime: number;

  constructor(context: Partial<LogContext> = {}) {
    this.context = {
      traceId: context.traceId || generateTraceId(),
      spanId: context.spanId || generateSpanId(),
      ...context,
    };
    this.startTime = Date.now();
  }

  getTraceId(): string {
    return this.context.traceId;
  }

  getSpanId(): string | undefined {
    return this.context.spanId;
  }

  getCorrelationHeaders(): Record<string, string> {
    return {
      "X-Trace-Id": this.context.traceId,
      "X-Span-Id": this.context.spanId || "",
      "X-Request-Id": this.context.traceId,
    };
  }

  createChildLogger(stage?: OAuthStage): IntegrationLogger {
    return new IntegrationLogger({
      ...this.context,
      parentSpanId: this.context.spanId,
      spanId: generateSpanId(),
      stage,
    });
  }

  getDurationMs(): number {
    return Date.now() - this.startTime;
  }

  async logSuccess(params: {
    event: string;
    stage?: OAuthStage;
    details?: string;
    redirectUri?: string;
    scope?: string;
    requestMethod?: string;
    requestPath?: string;
    requestPayload?: unknown;
    responseStatus?: number;
    responsePayload?: unknown;
  }): Promise<void> {
    const log: InsertOauthAuditLog = {
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this.context.parentSpanId,
      stage: params.stage || this.context.stage,
      event: params.event,
      clientId: this.context.clientId,
      appId: this.context.appId,
      appName: this.context.appName,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      redirectUri: params.redirectUri,
      scope: params.scope,
      status: "SUCCESS",
      requestMethod: params.requestMethod,
      requestPath: params.requestPath,
      requestHash: params.requestPayload ? hashPayload(params.requestPayload) : undefined,
      responseStatus: params.responseStatus,
      responseHash: params.responsePayload ? hashPayload(params.responsePayload) : undefined,
      details: params.details,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      durationMs: this.getDurationMs(),
    };

    try {
      await storage.createOauthAuditLog(log);
    } catch (error) {
      console.error("[IntegrationLogger] Failed to save audit log:", error);
    }

    console.log(`[OAuth] ${params.event} SUCCESS`, {
      traceId: this.context.traceId,
      clientId: this.context.clientId,
      appId: this.context.appId,
      durationMs: this.getDurationMs(),
    });
  }

  async logError(params: {
    event: string;
    stage?: OAuthStage;
    errorCode: string;
    errorMessage: string;
    errorDetails?: string;
    validationErrors?: ValidationError[];
    redirectUri?: string;
    scope?: string;
    requestMethod?: string;
    requestPath?: string;
    requestPayload?: unknown;
    responseStatus?: number;
  }): Promise<TroubleshootingInfo | undefined> {
    const troubleshooting = getTroubleshootingInfo(params.errorCode);
    
    const log: InsertOauthAuditLog = {
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this.context.parentSpanId,
      stage: params.stage || this.context.stage,
      event: params.event,
      clientId: this.context.clientId,
      appId: this.context.appId,
      appName: this.context.appName,
      userId: this.context.userId,
      userEmail: this.context.userEmail,
      redirectUri: params.redirectUri,
      scope: params.scope,
      status: "ERROR",
      errorClass: troubleshooting?.errorClass || "SERVER",
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      errorDetails: params.errorDetails,
      validationErrors: params.validationErrors ? formatValidationErrors(params.validationErrors) : undefined,
      requestMethod: params.requestMethod,
      requestPath: params.requestPath,
      requestHash: params.requestPayload ? hashPayload(params.requestPayload) : undefined,
      responseStatus: params.responseStatus,
      details: troubleshooting?.suggestedActions?.join("; "),
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      durationMs: this.getDurationMs(),
      troubleshootingHint: troubleshooting?.hint,
      documentationUrl: troubleshooting?.documentationUrl,
    };

    try {
      await storage.createOauthAuditLog(log);
    } catch (error) {
      console.error("[IntegrationLogger] Failed to save audit log:", error);
    }

    console.error(`[OAuth] ${params.event} ERROR: ${params.errorCode}`, {
      traceId: this.context.traceId,
      clientId: this.context.clientId,
      appId: this.context.appId,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      troubleshootingHint: troubleshooting?.hint,
      durationMs: this.getDurationMs(),
    });

    return troubleshooting;
  }

  async logRateLimitHit(params: {
    remaining: number;
    resetTime: Date;
    requestPath: string;
  }): Promise<void> {
    const log: InsertOauthAuditLog = {
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      stage: "API_CALL",
      event: "RATE_LIMIT_HIT",
      clientId: this.context.clientId,
      appId: this.context.appId,
      appName: this.context.appName,
      userId: this.context.userId,
      status: "WARNING",
      errorClass: "RATE_LIMIT",
      requestPath: params.requestPath,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      durationMs: this.getDurationMs(),
      rateLimitRemaining: params.remaining,
      rateLimitReset: params.resetTime,
      troubleshootingHint: "Approaching rate limit. Consider reducing request frequency.",
    };

    try {
      await storage.createOauthAuditLog(log);
    } catch (error) {
      console.error("[IntegrationLogger] Failed to save audit log:", error);
    }

    console.warn(`[OAuth] RATE_LIMIT approaching`, {
      traceId: this.context.traceId,
      remaining: params.remaining,
      resetTime: params.resetTime.toISOString(),
    });
  }
}

export class WebhookDeliveryLogger {
  private logger: IntegrationLogger;

  constructor(logger: IntegrationLogger) {
    this.logger = logger;
  }

  async logDeliveryAttempt(params: {
    webhookEventId?: string;
    appId: string;
    endpointUrl: string;
    attemptNumber: number;
    requestHeaders: Record<string, string>;
    requestBody: string;
  }): Promise<string> {
    const delivery: InsertWebhookDelivery = {
      webhookEventId: params.webhookEventId,
      appId: params.appId,
      endpointUrl: params.endpointUrl,
      status: "PENDING",
      attemptNumber: params.attemptNumber,
      requestHeaders: JSON.stringify(params.requestHeaders),
      requestBody: params.requestBody,
    };

    try {
      const created = await storage.createWebhookDelivery(delivery);
      return created.id;
    } catch (error) {
      console.error("[WebhookDeliveryLogger] Failed to create delivery record:", error);
      return "";
    }
  }

  async logDeliverySuccess(params: {
    deliveryId: string;
    responseStatus: number;
    responseHeaders: Record<string, string>;
    responseBody: string;
    responseTimeMs: number;
  }): Promise<void> {
    try {
      await storage.updateWebhookDelivery(params.deliveryId, {
        status: "SUCCESS",
        responseStatus: params.responseStatus,
        responseHeaders: JSON.stringify(params.responseHeaders),
        responseBody: params.responseBody.substring(0, 4000),
        responseTimeMs: params.responseTimeMs,
        completedAt: new Date(),
      });
    } catch (error) {
      console.error("[WebhookDeliveryLogger] Failed to update delivery:", error);
    }

    console.log(`[Webhook] Delivery SUCCESS`, {
      deliveryId: params.deliveryId,
      responseStatus: params.responseStatus,
      responseTimeMs: params.responseTimeMs,
    });
  }

  async logDeliveryFailure(params: {
    deliveryId: string;
    errorClass: ErrorClass;
    errorMessage: string;
    responseStatus?: number;
    responseBody?: string;
    responseTimeMs?: number;
  }): Promise<TroubleshootingInfo> {
    const troubleshooting = getTroubleshootingInfo("webhook_delivery_failed") || {
      errorClass: params.errorClass,
      hint: params.errorMessage,
    };

    const status = params.responseStatus 
      ? (params.responseStatus >= 400 && params.responseStatus < 500 ? "INVALID_RESPONSE" : "FAILED")
      : "TIMEOUT";

    try {
      await storage.updateWebhookDelivery(params.deliveryId, {
        status,
        errorClass: params.errorClass,
        errorMessage: params.errorMessage,
        responseStatus: params.responseStatus,
        responseBody: params.responseBody?.substring(0, 4000),
        responseTimeMs: params.responseTimeMs,
        troubleshootingHint: troubleshooting.hint,
        completedAt: new Date(),
      });
    } catch (error) {
      console.error("[WebhookDeliveryLogger] Failed to update delivery:", error);
    }

    console.error(`[Webhook] Delivery FAILED`, {
      deliveryId: params.deliveryId,
      errorClass: params.errorClass,
      errorMessage: params.errorMessage,
    });

    return troubleshooting;
  }
}

export function buildErrorResponse(params: {
  error: string;
  errorDescription: string;
  traceId: string;
  troubleshooting?: TroubleshootingInfo;
  state?: string;
}): {
  error: string;
  error_description: string;
  trace_id: string;
  troubleshooting?: {
    hint: string;
    documentation_url?: string;
    suggested_actions?: string[];
  };
  state?: string;
} {
  return {
    error: params.error,
    error_description: params.errorDescription,
    trace_id: params.traceId,
    troubleshooting: params.troubleshooting ? {
      hint: params.troubleshooting.hint,
      documentation_url: params.troubleshooting.documentationUrl,
      suggested_actions: params.troubleshooting.suggestedActions,
    } : undefined,
    state: params.state,
  };
}

export function extractCorrelationFromRequest(req: { 
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}): Partial<LogContext> {
  const getHeader = (name: string): string | undefined => {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    traceId: getHeader("x-trace-id") || getHeader("x-request-id") || generateTraceId(),
    spanId: getHeader("x-span-id"),
    parentSpanId: getHeader("x-parent-span-id"),
    ipAddress: req.ip || getHeader("x-forwarded-for")?.split(",")[0].trim(),
    userAgent: getHeader("user-agent"),
  };
}
