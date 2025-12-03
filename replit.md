# Membership & Credits Hub

A production-grade, full-stack membership and billing platform that manages users, authentication, 2FA, wallets/credits, funding sources, auto-topups, and app subscriptions.

## Overview

This is a **standalone membership + billing platform** that other apps can plug into. The core purpose is to manage:
- Single Sign-On (SSO) authentication
- Credits balance checks
- Billing / debits across integrated apps

## Tech Stack

### Backend
- Node.js + TypeScript
- Express for HTTP API
- Drizzle ORM with PostgreSQL
- JSON Web Tokens (JWT) for auth (access + refresh tokens)
- bcrypt for password hashing
- Zod for request validation
- speakeasy for TOTP 2FA
- qrcode for 2FA QR code generation

### Frontend
- React + Vite
- TypeScript
- TanStack Query (React Query) for data fetching
- Shadcn UI components
- Tailwind CSS for styling
- Wouter for routing

### Database
- PostgreSQL (Neon-backed via DATABASE_URL)
- Drizzle migrations via `npm run db:push`

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   └── ui/         # Shadcn UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities, auth context, theme
│   │   ├── pages/          # Page components
│   │   └── App.tsx         # Main app component with routing
│   └── index.html
├── server/                 # Backend Express server
│   ├── db.ts               # Database connection
│   ├── routes.ts           # API routes
│   ├── storage.ts          # Data access layer
│   └── index.ts            # Server entry point
└── shared/
    └── schema.ts           # Database schemas & types
```

## Data Models

1. **User** - User accounts with email, password, 2FA settings
2. **Wallet** - Per-user credit balance (in cents for precision)
3. **PaymentMethod** - CARD, BANK_ACH, PAYPAL, VENMO, ZELLE, CRYPTO
4. **WalletTransaction** - CREDIT/DEBIT transaction history
5. **AutoTopupRule** - Auto-topup configuration when balance is low
6. **App** - Registered apps that use this platform
7. **AppSubscription** - User subscriptions to apps
8. **ApiKey** - API keys for programmatic access
9. **RefreshToken** - JWT refresh token storage

## API Routes

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login (supports 2FA)
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout and clear tokens
- `GET /api/auth/me` - Get current user

### User Profile
- `PATCH /api/user/profile` - Update profile
- `POST /api/user/change-password` - Change password
- `POST /api/user/2fa/setup` - Initialize 2FA setup
- `POST /api/user/2fa/confirm` - Confirm 2FA with code
- `POST /api/user/2fa/disable` - Disable 2FA

### Wallet
- `GET /api/wallet` - Get wallet, transactions, payment methods
- `POST /api/wallet/fund` - Add funds to wallet
- `POST /api/wallet/auto-topup` - Configure auto-topup

### Payment Methods
- `GET /api/payment-methods` - List payment methods
- `POST /api/payment-methods` - Add payment method
- `PATCH /api/payment-methods/:id/default` - Set as default
- `DELETE /api/payment-methods/:id` - Remove payment method

### Apps
- `GET /api/apps` - List available apps and subscriptions
- `POST /api/apps/:id/subscribe` - Connect to app
- `POST /api/apps/:id/unsubscribe` - Disconnect from app

### API Keys
- `GET /api/api-keys` - List API keys
- `POST /api/api-keys` - Create new API key
- `DELETE /api/api-keys/:id` - Revoke API key

### Admin (Admin only)
- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/users` - List all users
- `GET /api/admin/apps` - List all apps
- `POST /api/admin/apps` - Register new app

### External API (for integrated apps)
- `POST /api/external/balance` - Check user balance (API key auth)
- `POST /api/external/debit` - Debit credits (API key auth)
- `POST /api/sso/authorize` - SSO authorization endpoint

## Development

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start development server
npm run dev
```

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - JWT signing secret (defaults to fallback if not set)

## Features

- JWT-based authentication with access/refresh tokens
- Two-Factor Authentication (TOTP) with QR code setup
- Wallet management with transaction history
- Multiple payment method types
- Auto-topup rules for automatic balance top-ups (triggers when balance falls below threshold after debit)
- App registry with SSO capabilities
- API key generation for programmatic access
- Role-based admin panel
- Dark/Light theme support
- Responsive design with mobile support

## Auto-Topup System

The auto-topup feature automatically adds funds when the wallet balance drops below a configured threshold:

1. **Configuration**: Users set a threshold amount and top-up amount via `/api/wallet/auto-topup`
2. **Trigger**: Auto-topup executes when:
   - An external debit (`/api/external/debit`) reduces balance below threshold
3. **Execution**: System uses the configured payment method to add the top-up amount
4. **Response**: The debit API returns `autoTopup` field when triggered, showing the amount and transaction ID

## Audit Logging System

Comprehensive audit logging for all financial transactions and authentication events:

**Event Types:**
- `AUTH_LOGIN`, `AUTH_LOGOUT`, `AUTH_REGISTER`, `AUTH_PASSWORD_CHANGE`, `AUTH_2FA_ENABLE`, `AUTH_2FA_DISABLE`
- `WALLET_FUND`, `WALLET_DEBIT`, `WALLET_AUTO_TOPUP`
- `PAYMENT_METHOD_ADD`, `PAYMENT_METHOD_REMOVE`, `PAYMENT_METHOD_SET_DEFAULT`
- `API_KEY_CREATE`, `API_KEY_REVOKE`
- `APP_SUBSCRIBE`, `APP_UNSUBSCRIBE`
- `ADMIN_ACTION`

**API Endpoints:**
- `GET /api/admin/audit-logs` - Admin view all audit logs
- `GET /api/user/audit-logs` - User view their own audit logs

**Log Details:**
- User ID, event type, entity type/ID
- Action description, JSON details
- IP address, user agent, timestamp

## User Preferences

- Design follows Stripe-inspired minimal aesthetic
- Inter font family for typography
- Blue primary color scheme
- Subtle shadows and borders for card elements

## Integration Notes

- **Stripe Integration**: User chose to skip Stripe integration (dismissed connector setup on 2025-12-03). Currently using simulated payment processing. To enable real payments in the future, user can provide STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY secrets.
