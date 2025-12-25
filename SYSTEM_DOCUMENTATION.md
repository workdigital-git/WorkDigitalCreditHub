# Work Digital Client Credit Portal - System Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Authentication System](#authentication-system)
4. [Wallet & Credit Management](#wallet--credit-management)
5. [Payment Gateway Integration](#payment-gateway-integration)
6. [OAuth2/SSO System](#oauth2sso-system)
7. [B2B Integration API](#b2b-integration-api)
8. [Admin Panel](#admin-panel)
9. [Referral Program](#referral-program)
10. [Database Schema](#database-schema)
11. [API Reference](#api-reference)
12. [Environment Variables](#environment-variables)
13. [Deployment Guide](#deployment-guide)
14. [Security Considerations](#security-considerations)

---

## System Overview

The Work Digital Client Credit Portal is a production-grade, full-stack membership and billing platform designed to:

- Provide Single Sign-On (SSO) authentication for integrated applications
- Manage user credit balances with multi-gateway payment support
- Handle billing and debits across integrated Work Digital services
- Maintain service anonymity for users across multiple applications

### Core Capabilities

| Feature | Description |
|---------|-------------|
| Dual Authentication | JWT-based auth with 2FA (TOTP/SMS) + Google OAuth via Replit Auth |
| Wallet Management | Credit balances, transaction history, auto-topup |
| Multi-Gateway Payments | Stripe, PayPal, Coinbase Commerce |
| OAuth2/OIDC SSO | PKCE-enabled SSO for external applications |
| B2B Integration | App API keys for server-to-server operations |
| Admin Dashboard | User management, analytics, payment gateway config |
| Referral System | Configurable referral bonuses and tracking |

---

## Architecture

### Technology Stack

**Backend:**
- Node.js with TypeScript
- Express.js HTTP framework
- Drizzle ORM with PostgreSQL
- JWT for authentication
- bcrypt for password hashing
- Zod for validation

**Frontend:**
- React 18 with Vite
- TypeScript
- TanStack Query (React Query v5)
- Shadcn UI components
- Tailwind CSS
- Wouter for routing

**External Services:**
- PostgreSQL database (Neon-backed)
- Plivo SMS gateway (2FA)
- Resend email service
- Stripe, PayPal, Coinbase payment gateways

### Directory Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route page components
│   │   ├── lib/            # Utilities (auth, queryClient)
│   │   └── hooks/          # Custom React hooks
├── server/                 # Backend Express application
│   ├── routes.ts           # API route definitions
│   ├── storage.ts          # Database operations
│   ├── payments/           # Payment gateway services
│   ├── email-service.ts    # Email sending logic
│   └── background-jobs.ts  # Scheduled job processor
├── shared/                 # Shared code
│   └── schema.ts           # Drizzle schema + Zod schemas
└── db/                     # Database migrations
```

---

## Authentication System

### JWT Token Flow

The platform uses a dual-token JWT authentication system:

1. **Access Token**: Short-lived (15 minutes), stored in HTTP-only cookie
2. **Refresh Token**: Long-lived (7 days), stored in HTTP-only cookie

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Login     │────▶│ Validate    │────▶│ Generate    │
│   Request   │     │ Credentials │     │ Tokens      │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                           ┌───────────────────┼───────────────────┐
                           ▼                   ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │ Access      │     │ Refresh     │     │ Set HTTP    │
                    │ Token (15m) │     │ Token (7d)  │     │ Only Cookies│
                    └─────────────┘     └─────────────┘     └─────────────┘
```

### Two-Factor Authentication (2FA)

**TOTP (Time-based One-Time Password):**
- Uses `speakeasy` library
- QR code generation for authenticator apps
- 6-digit codes with 30-second windows

**SMS 2FA:**
- Uses Plivo SMS gateway
- E.164 phone number format required
- Rate-limited OTP sending (max 3 attempts)
- 5-minute OTP expiration

### Password Reset Flow

1. User requests reset via email
2. System generates secure token (32 bytes, SHA-256 hashed)
3. Token valid for 30 minutes
4. Email sent via Resend service
5. Token invalidated after use
6. All existing sessions revoked on password change

### OAuth Identity Linking

Users can link external OAuth providers (Replit, Google) to their account:

```typescript
// OAuth identity structure
{
  provider: "REPLIT" | "GOOGLE",
  providerUserId: string,
  email: string,
  profileImageUrl?: string,
  firstName?: string,
  lastName?: string
}
```

---

## Wallet & Credit Management

### Wallet Structure

Each user has one wallet with:
- Balance stored in cents (integer)
- USD currency (default)
- Linked to user via `userId`

### Transaction Types

| Type | Description |
|------|-------------|
| CREDIT | Funds added to wallet |
| DEBIT | Funds deducted from wallet |

### Transaction Sources

- `STRIPE`, `PAYPAL`, `COINBASE` - Payment gateway deposits
- `ADMIN` - Manual admin credits
- `AUTO_TOPUP` - Automatic top-up triggers
- `SUBSCRIPTION` - Recurring subscription billing
- `APP_DEBIT` - External app usage charges
- `REFERRAL_BONUS` - Referral rewards

### Auto-Topup System

The platform has two auto-topup systems:

**Legacy Auto-Topup Rules** (`autoTopupRules` table):
```typescript
{
  thresholdCents: number,        // Trigger when balance falls below (in cents)
  topupAmountCents: number,      // Amount to add (in cents)
  paymentMethodId: string,       // Saved payment method
  active: boolean                // Rule enabled/disabled
}
```

**Enhanced Autopay Settings** (`autopaySettings` table):
```typescript
{
  enabled: boolean,
  thresholdCredits: number,      // Trigger when credits fall below
  topupPackSku: string,          // Credit pack to purchase
  paymentMethodId: string,       // Saved payment method
  maxTopupsPerDay: number,       // Rate limiting (default: 2)
  maxTopupsPerWeek: number,      // Weekly limit (default: 6)
  cooldownMinutes: number        // Minimum time between topups (default: 30)
}
```

### Credit Packs

Pre-defined purchase options:

| SKU | Price | Credits |
|-----|-------|---------|
| `credits_10` | $10.00 | 1000 |
| `credits_25` | $25.00 | 2500 |
| `credits_50` | $50.00 | 5000 |
| `credits_100` | $100.00 | 10000 |

---

## Payment Gateway Integration

### Stripe

**Configuration:**
- **Replit Mode**: Automatic via Replit connector
- **Portable Mode**: Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`

**Supported Features:**
- Checkout Sessions for credit purchases
- Setup Intents for saving payment methods
- Automatic webhook handling
- Payment Intent confirmation

**Webhook Events Handled:**
- `checkout.session.completed`
- `payment_intent.succeeded`
- `setup_intent.succeeded`

### PayPal

**Configuration:**
```bash
PAYPAL_CLIENT_ID=your_client_id
PAYPAL_SECRET=your_secret
PAYPAL_SANDBOX_USERNAME=sandbox_buyer@example.com  # Optional
PAYPAL_SANDBOX_PASSWORD=sandbox_password            # Optional
```

**Supported Features:**
- Order creation and capture
- Saved payment methods (vaulting)
- Sandbox mode for testing

### Coinbase Commerce

**Configuration:**
```bash
COINBASE_COMMERCE_API_KEY=your_api_key
# OR for CDP JWT auth:
COINBASE_API_KEYNAME=your_key_name
COINBASE_PRIVATE_KEY=your_private_key
```

**Supported Features:**
- Cryptocurrency payments
- Charge creation with hosted checkout

### Gateway Administration

Gateways must be enabled by an admin before users can use them:

1. Navigate to Admin Panel → Payment Gateways
2. Toggle gateway enabled/disabled
3. Configure sandbox/production mode
4. Set display order for user interface

---

## OAuth2/SSO System

### Overview

The platform implements OAuth2 with PKCE (Proof Key for Code Exchange) for secure SSO:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  External   │────▶│  Authorize  │────▶│  User       │────▶│  Callback   │
│  App        │     │  Endpoint   │     │  Consent    │     │  with Code  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                   │
                                                                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Userinfo   │◀────│  Access     │◀────│  Token      │◀────│  Exchange   │
│  Response   │     │  Token      │     │  Endpoint   │     │  Code+PKCE  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### Authorization Endpoint

`GET /api/oauth/authorize`

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `client_id` | Yes | App's client ID |
| `redirect_uri` | Yes | Registered callback URL |
| `response_type` | Yes | Must be `code` |
| `scope` | No | Space-separated scopes |
| `state` | Recommended | CSRF protection |
| `code_challenge` | PKCE | Base64-URL encoded challenge |
| `code_challenge_method` | PKCE | Must be `S256` |

### Token Endpoint

`POST /api/oauth/token`

**Request (Authorization Code Grant):**
```json
{
  "grant_type": "authorization_code",
  "code": "auth_code_here",
  "redirect_uri": "https://app.example.com/callback",
  "client_id": "client_xxx",
  "client_secret": "secret_xxx",
  "code_verifier": "pkce_verifier"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "profile wallet:read"
}
```

### Userinfo Endpoint

`GET /api/oauth/userinfo`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "name": "John Doe",
  "email_verified": true
}
```

### Supported Scopes

| Scope | Description |
|-------|-------------|
| `openid` | Required for OIDC |
| `profile` | User profile information |
| `email` | Email address |
| `wallet:read` | View wallet balance |
| `wallet:debit` | Debit from wallet |

### App Registration

Apps are registered in the admin panel with:
- `name` - Display name
- `slug` - URL-safe identifier
- `callbackUrl` - Primary OAuth callback
- `allowedCallbackUrls` - Additional valid callbacks
- `pricingModel` - Subscription pricing type
- `billingCycle` - MONTHLY, YEARLY, or PER_USE

---

## B2B Integration API

### Authentication

External applications use App API Keys for server-to-server communication:

```
Authorization: Bearer app_xxx...
```

### Balance Check

`POST /api/v2/balance`

**Request:**
```json
{
  "userId": "user_uuid"
}
```

**Response:**
```json
{
  "success": true,
  "balanceCents": 5000,
  "currency": "USD"
}
```

### Debit Operation

`POST /api/v2/debit`

**Request:**
```json
{
  "userId": "user_uuid",
  "amountCents": 100,
  "description": "Service usage charge",
  "idempotencyKey": "unique_request_id"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "txn_uuid",
  "newBalanceCents": 4900
}
```

### Authorization Check

`POST /api/v2/check-authorization`

**Request:**
```json
{
  "accessToken": "oauth_access_token"
}
```

**Response:**
```json
{
  "valid": true,
  "userId": "user_uuid",
  "email": "user@example.com",
  "scopes": ["profile", "wallet:read"]
}
```

### Usage Tracking

`POST /api/external/track-usage`

For per-use billing applications:
```json
{
  "userId": "user_uuid",
  "appId": "app_uuid",
  "usageCount": 1
}
```

---

## Admin Panel

### Access Control

Admin access requires `isAdmin: true` on the user record. Admin endpoints are protected by the `adminMiddleware` function.

### Admin Features

1. **Dashboard Statistics**
   - Total users, active users
   - Total wallet balance across platform
   - Transaction volume
   - App subscription counts

2. **User Management**
   - Search/filter members by email, name, phone
   - Balance tier filtering (zero, low, medium, high)
   - Payment method and 2FA status filtering
   - Manual credit adjustments
   - Admin role assignment
   - Account deletion

3. **App Management**
   - Create/edit/delete OAuth applications
   - Regenerate client secrets
   - Configure pricing models
   - Manage allowed callback URLs

4. **Payment Gateway Configuration**
   - Enable/disable gateways
   - Toggle sandbox mode
   - View gateway status
   - Configure display order

5. **Referral Program Settings**
   - Qualification threshold
   - Referrer/referred bonus amounts
   - Expiration period
   - Enable/disable program

6. **Audit Logs**
   - View all platform activity
   - Filter by event type, user, date
   - OAuth flow diagnostics

7. **Background Jobs**
   - View job status
   - Manual job triggers
   - Subscription billing processing
   - Webhook retry processing

---

## Referral Program

### How It Works

1. **Code Generation**: Users receive unique referral code (format: `REF-XXXXXX`)
2. **Registration**: New users enter code during signup
3. **Tracking**: Referral record created with pending status
4. **Qualification**: Referred user funds wallet above threshold
5. **Rewards**: Both parties receive configured bonus credits

### Configuration (Admin)

| Setting | Default | Description |
|---------|---------|-------------|
| `qualificationThresholdCents` | 2000 ($20) | Minimum funding to qualify |
| `referrerBonusCents` | 500 ($5) | Bonus for referrer |
| `referredBonusCents` | 500 ($5) | Bonus for new user |
| `expirationDays` | 90 | Days until referral expires |
| `maxReferralsPerUser` | 100 | Maximum referrals per user |
| `isActive` | true | Program enabled/disabled |

### Referral Statuses

| Status | Description |
|--------|-------------|
| `PENDING` | Referred user registered but hasn't funded |
| `QUALIFIED` | Referred user met funding threshold |
| `REWARDED` | Bonuses have been paid |
| `EXPIRED` | Referral expired without qualification |

---

## Database Schema

### Core Tables

#### users
| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(36) | Primary key (UUID) |
| `email` | text | Unique email address |
| `phone` | text | Phone number (E.164) |
| `phoneVerified` | boolean | Phone verification status |
| `passwordHash` | text | bcrypt password hash |
| `fullName` | text | Display name |
| `isAdmin` | boolean | Admin role flag |
| `twoFactorEnabled` | boolean | 2FA enabled |
| `twoFactorMethod` | enum | TOTP or SMS |
| `twoFactorSecret` | text | TOTP secret key |
| `referralCode` | text | User's referral code |
| `referredByUserId` | varchar(36) | Who referred this user |

#### wallets
| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(36) | Primary key |
| `userId` | varchar(36) | Foreign key to users |
| `currency` | text | Currency code (USD) |
| `balanceCents` | bigint | Balance in cents |

#### payment_methods
| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(36) | Primary key |
| `userId` | varchar(36) | Foreign key to users |
| `type` | enum | CARD, BANK_ACH, PAYPAL, etc. |
| `provider` | text | Payment provider name |
| `externalId` | text | Provider's reference ID |
| `last4` | text | Last 4 digits |
| `brand` | text | Card brand (Visa, etc.) |
| `isDefault` | boolean | Default payment method |

#### apps
| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(36) | Primary key |
| `name` | text | App display name |
| `slug` | text | URL-safe identifier |
| `callbackUrl` | text | Primary OAuth callback |
| `allowedCallbackUrls` | text[] | Additional callbacks |
| `clientId` | text | OAuth client ID |
| `clientSecret` | text | OAuth client secret |
| `pricingModel` | text | Pricing type |
| `billingCycle` | enum | MONTHLY, YEARLY, PER_USE |

#### wallet_transactions
| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(36) | Primary key |
| `walletId` | varchar(36) | Foreign key to wallets |
| `type` | enum | CREDIT or DEBIT |
| `source` | text | Transaction source |
| `appId` | varchar(36) | Associated app (if any) |
| `amountCents` | bigint | Transaction amount |
| `description` | text | Transaction description |
| `status` | enum | PENDING, COMPLETED, FAILED |

### OAuth Tables

- `oauth_authorization_codes` - Temporary auth codes
- `oauth_access_tokens` - Issued access tokens
- `oauth_audit_logs` - Detailed OAuth flow logging

### Webhook Tables

- `webhook_events` - Event queue with retry logic
- `webhook_deliveries` - Delivery attempts and responses
- `integration_health_metrics` - App health scores

### Payment Tables

- `stripe_customers` - Stripe customer mappings
- `stripe_events` - Webhook idempotency tracking
- `credit_packs` - Purchasable credit options
- `wallet_ledger` - Immutable transaction log
- `autopay_settings` - Auto-topup configuration
- `autopay_attempts` - Auto-topup attempt history
- `checkout_sessions` - Pending checkout sessions

---

## API Reference

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/logout` | End session |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/verify-reset-token` | Validate reset token |
| POST | `/api/auth/reset-password` | Set new password |
| POST | `/api/auth/2fa/resend-sms` | Resend SMS 2FA code |
| GET | `/api/auth/me` | Get current user |

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | `/api/user/profile` | Update profile |
| POST | `/api/user/change-password` | Change password |
| POST | `/api/user/2fa/setup` | Start 2FA setup |
| POST | `/api/user/2fa/confirm` | Confirm 2FA setup |
| POST | `/api/user/2fa/disable` | Disable 2FA |
| POST | `/api/user/2fa/method` | Change 2FA method |
| GET | `/api/user/2fa/sms/status` | Check SMS 2FA status |
| POST | `/api/user/phone/add` | Add phone number |
| POST | `/api/user/phone/verify` | Verify phone |
| POST | `/api/user/phone/resend` | Resend phone verification |
| GET | `/api/user/audit-logs` | Get user's audit logs |

### Wallet & Dashboard Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wallet` | Get wallet details |
| POST | `/api/wallet/fund` | Add funds (legacy) |
| POST | `/api/wallet/auto-topup` | Configure auto-topup |
| POST | `/api/wallet/initiate-payment` | Start payment flow |
| GET | `/api/dashboard` | Dashboard summary |

### Billing & Payment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/packs` | List credit packs |
| POST | `/api/billing/checkout-session` | Create Stripe checkout |
| GET | `/api/billing/config` | Get Stripe public key |
| POST | `/api/billing/setup-intent` | Save payment method |
| GET | `/api/billing/payment-method` | Get default payment method |
| GET | `/api/billing/autopay-settings` | Get autopay config |
| PATCH | `/api/billing/autopay-settings` | Update autopay config |
| GET | `/api/billing/stripe/status` | Check Stripe availability |
| POST | `/api/billing/stripe/customer` | Create Stripe customer |
| GET | `/api/billing/stripe/customer` | Get Stripe customer |
| GET | `/api/billing/credits` | Get credit balance |
| GET | `/api/payment-methods` | List payment methods |
| POST | `/api/payment-methods` | Add payment method |
| DELETE | `/api/payment-methods/:id` | Remove payment method |
| PATCH | `/api/payment-methods/:id/default` | Set default |
| POST | `/api/payments/create-intent` | Create payment intent |
| POST | `/api/payments/confirm` | Confirm payment |
| GET | `/api/payment-gateways` | List all gateways |
| GET | `/api/payment-gateways/enabled` | List enabled gateways |

### PayPal Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/paypal/status` | Check PayPal availability |
| POST | `/api/billing/paypal/create-order` | Create PayPal order |
| POST | `/api/billing/paypal/capture-order` | Capture payment |
| POST | `/api/billing/paypal/charge-saved` | Charge saved method |

### Coinbase Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/coinbase/status` | Check availability |
| POST | `/api/billing/coinbase/create-charge` | Create charge |

### Apps & Subscriptions Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/apps` | List available apps |
| POST | `/api/apps/:id/subscribe` | Subscribe to app |
| POST | `/api/apps/:id/unsubscribe` | Unsubscribe from app |
| DELETE | `/api/apps/:id` | Delete app (admin) |

### API Keys Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-keys` | List user API keys |
| POST | `/api/api-keys` | Create API key |
| DELETE | `/api/api-keys/:id` | Revoke API key |

### OAuth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/oauth/authorize` | Authorization endpoint |
| POST | `/api/oauth/token` | Token endpoint |
| POST | `/api/oauth/introspect` | Token introspection |
| POST | `/api/oauth/revoke` | Token revocation |
| GET | `/api/oauth/userinfo` | Get user info |
| GET | `/api/oauth/app-info` | Get app details |
| POST | `/api/sso/authorize` | SSO authorization |

### Referral Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/referrals/code` | Get user's referral code |
| GET | `/api/referrals/my-referrals` | List user's referrals |
| GET | `/api/referrals/stats` | Get referral statistics |
| GET | `/api/referrals/validate/:code` | Validate referral code |
| POST | `/api/referrals/process-qualified` | Process qualified referrals |

### Diagnostics Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/diagnostics/trace/:traceId` | Get OAuth trace logs |
| GET | `/api/diagnostics/app/:appId` | Get app diagnostics |
| GET | `/api/diagnostics/validate-redirect-uri` | Validate redirect URI |
| GET | `/api/diagnostics/validate-pkce` | Validate PKCE params |

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/stripe` | Stripe webhook handler |
| POST | `/api/webhooks/simulate-payment` | Simulate payment (dev) |
| POST | `/api/webhooks/process-pending` | Process pending webhooks |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Platform statistics |
| GET | `/api/admin/members` | Search/list members |
| GET | `/api/admin/users` | List all users |
| PATCH | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Delete user |
| POST | `/api/admin/credit-user` | Credit user wallet |
| GET | `/api/admin/apps` | List apps |
| POST | `/api/admin/apps` | Create app |
| PATCH | `/api/admin/apps/:id` | Update app |
| DELETE | `/api/admin/apps/:id` | Delete app |
| POST | `/api/admin/apps/:id/regenerate-secret` | Regenerate client secret |
| GET | `/api/admin/app-api-keys` | List app API keys |
| POST | `/api/admin/app-api-keys` | Create app API key |
| DELETE | `/api/admin/app-api-keys/:id` | Revoke app API key |
| GET | `/api/admin/payment-gateways` | List gateways |
| PATCH | `/api/admin/payment-gateways/:gateway` | Update gateway |
| GET | `/api/admin/merchant-settings` | Get merchant config |
| PATCH | `/api/admin/merchant-settings` | Update merchant config |
| GET | `/api/admin/referral-settings` | Get referral config |
| PATCH | `/api/admin/referral-settings` | Update referral config |
| GET | `/api/admin/referrals` | List all referrals |
| GET | `/api/admin/audit-logs` | View all audit logs |
| GET | `/api/admin/oauth-audit-logs` | View OAuth audit logs |
| GET | `/api/admin/oauth-audit-logs/trace/:traceId` | Get trace details |
| GET | `/api/admin/webhook-events` | List webhook events |
| GET | `/api/admin/integration-health` | Get app health metrics |
| POST | `/api/admin/integration-health/:appId/unquarantine` | Unquarantine app |
| GET | `/api/admin/background-jobs/status` | Get job status |
| POST | `/api/admin/background-jobs/run` | Trigger background job |
| GET | `/api/admin/email/status` | Check email service |
| POST | `/api/admin/email/test` | Send test email |

### External API (B2B)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v2/balance` | Check user balance |
| POST | `/api/v2/debit` | Debit user wallet |
| POST | `/api/v2/check-authorization` | Validate OAuth token |
| POST | `/api/external/balance` | Legacy balance check |
| POST | `/api/external/debit` | Legacy debit operation |
| POST | `/api/external/track-usage` | Track app usage |

---

## Environment Variables

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Express session secret |

### Authentication

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | JWT signing secret (auto-generated if not set) |

### Email Service (Resend)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key for emails |

### SMS Service (Plivo)

| Variable | Description |
|----------|-------------|
| `PLIVO_AUTH_ID` | Plivo authentication ID |
| `PLIVO_AUTH_TOKEN` | Plivo authentication token |
| `PLIVO_PHONE_NUMBER` | Sender phone number |

### Stripe

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature secret |

### PayPal

| Variable | Description |
|----------|-------------|
| `PAYPAL_CLIENT_ID` | PayPal client ID |
| `PAYPAL_SECRET` | PayPal client secret |
| `PAYPAL_SANDBOX_USERNAME` | Sandbox buyer email |
| `PAYPAL_SANDBOX_PASSWORD` | Sandbox buyer password |

### Coinbase

| Variable | Description |
|----------|-------------|
| `COINBASE_COMMERCE_API_KEY` | Coinbase Commerce API key |
| `COINBASE_API_KEYNAME` | CDP key name (alternative) |
| `COINBASE_PRIVATE_KEY` | CDP private key (alternative) |

---

## Deployment Guide

### Prerequisites

1. Node.js 18+ installed
2. PostgreSQL database accessible
3. Environment variables configured

### Replit Deployment

1. Fork or import the repository
2. Configure secrets in Replit Secrets panel
3. Click "Run" to start the application
4. Use "Deployments" for production publishing

### External Server Deployment

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd work-digital-portal
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. **Initialize Database**
   ```bash
   npm run db:push
   ```

5. **Build Application**
   ```bash
   npm run build
   ```

6. **Start Production Server**
   ```bash
   npm start
   ```

### Webhook Configuration

For Stripe webhooks in production:

1. Create webhook endpoint in Stripe Dashboard
2. Point to: `https://yourdomain.com/api/webhooks/stripe`
3. Subscribe to events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `setup_intent.succeeded`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

---

## Security Considerations

### Password Security

- Passwords hashed with bcrypt (12 rounds)
- Minimum 8 characters required
- No password reuse validation (consider implementing)

### Token Security

- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- All tokens stored as SHA-256 hashes
- HTTP-only cookies prevent XSS access
- SameSite=Lax prevents CSRF

### Rate Limiting

- Login attempts: 10 per 15 minutes per IP/email
- SMS OTP: 5 per hour per phone number
- API endpoints: Consider implementing per-user limits

### Input Validation

- All inputs validated with Zod schemas
- SQL injection prevented by Drizzle ORM
- XSS prevented by React's default escaping

### OAuth Security

- PKCE required for public clients
- State parameter recommended for CSRF protection
- Authorization codes expire in 10 minutes
- Redirect URIs must be pre-registered

### Audit Logging

All security-relevant events are logged:
- Authentication attempts
- Password changes
- 2FA enable/disable
- Wallet transactions
- Admin actions
- OAuth flows

### Recommendations

1. Enable 2FA for admin accounts
2. Regularly rotate API keys
3. Monitor audit logs for suspicious activity
4. Keep dependencies updated
5. Use HTTPS in production
6. Implement IP allowlisting for admin access
7. Set up alerting for failed login attempts

---

## Support & Troubleshooting

### Common Issues

**"Invalid refresh token"**
- Token expired or already used
- User logged out from another session
- Clear cookies and log in again

**"SMS 2FA not configured"**
- Verify Plivo credentials are set
- Check phone number format (E.164)
- Ensure phone is verified before enabling SMS 2FA

**"Payment gateway not available"**
- Gateway not enabled by admin
- Missing API credentials
- Check gateway status in admin panel

**"OAuth authorization failed"**
- Verify client_id matches registered app
- Check redirect_uri is in allowed list
- Ensure PKCE verifier matches challenge

### Diagnostic Tools

- **OAuth Trace Logs**: `/api/diagnostics/trace/:traceId`
- **App Health Metrics**: `/api/admin/integration-health`
- **Redirect URI Validator**: `/api/diagnostics/validate-redirect-uri`
- **PKCE Validator**: `/api/diagnostics/validate-pkce`

---

*Last Updated: December 2024*
*Version: 1.0.0*
