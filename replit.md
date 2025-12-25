# Work Digital Client Credit Portal

> **Full Documentation**: See [SYSTEM_DOCUMENTATION.md](./SYSTEM_DOCUMENTATION.md) for complete technical reference.

## Quick Start

This is a full-stack membership and billing platform providing SSO authentication, credit management, and multi-gateway payment processing for Work Digital services.

### Running the Application

```bash
npm run dev
```

The application starts an Express backend and Vite frontend on port 5000.

### Key Files

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Database schema + Zod validation |
| `server/routes.ts` | API endpoints |
| `server/storage.ts` | Database operations |
| `client/src/pages/` | React page components |
| `client/src/lib/auth.tsx` | Authentication context |

### Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session encryption

**Payment Gateways:**
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` - Stripe
- `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` - PayPal
- `COINBASE_COMMERCE_API_KEY` - Coinbase

**Services:**
- `RESEND_API_KEY` - Email service
- `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_PHONE_NUMBER` - SMS 2FA

### Tech Stack

- **Backend**: Node.js, Express, TypeScript, Drizzle ORM, PostgreSQL
- **Frontend**: React, Vite, TanStack Query, Shadcn UI, Tailwind CSS
- **Auth**: JWT with 2FA (TOTP/SMS), OAuth2/OIDC

### Design Guidelines

- Stripe-inspired minimal aesthetic
- Inter font family
- Blue primary color scheme
- Subtle shadows and borders

## Documentation Links

- [System Architecture](./SYSTEM_DOCUMENTATION.md#architecture)
- [Authentication System](./SYSTEM_DOCUMENTATION.md#authentication-system)
- [Payment Integration](./SYSTEM_DOCUMENTATION.md#payment-gateway-integration)
- [OAuth2/SSO](./SYSTEM_DOCUMENTATION.md#oauth2sso-system)
- [B2B API](./SYSTEM_DOCUMENTATION.md#b2b-integration-api)
- [Admin Panel](./SYSTEM_DOCUMENTATION.md#admin-panel)
- [Database Schema](./SYSTEM_DOCUMENTATION.md#database-schema)
- [API Reference](./SYSTEM_DOCUMENTATION.md#api-reference)
- [Environment Variables](./SYSTEM_DOCUMENTATION.md#environment-variables)
- [Deployment Guide](./SYSTEM_DOCUMENTATION.md#deployment-guide)
