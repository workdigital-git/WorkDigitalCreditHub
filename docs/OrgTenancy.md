# Organization Multi-Tenancy Model

## Overview

This document describes the multi-tenant organization model for CreditHub, enabling many-to-many relationships between Users and Organizations while maintaining full backward compatibility with existing single-user flows.

## Current State (Before Multi-Org)

### Database Schema

#### Users Table (`users`)
- `id` (varchar/UUID) - Primary key
- `email` (text) - Unique email
- `passwordHash`, `fullName`, `isAdmin`, etc.
- Users have a 1:1 relationship with wallets (via `userId`)

#### Wallets Table (`wallets`)
- `id` (varchar/UUID) - Primary key
- `userId` (varchar) - FK to users.id (1:1 relationship)
- `balanceCents` (bigint) - Current balance in cents
- `currency` (text) - Default "USD"

#### Wallet Transactions (`wallet_transactions`)
- `id`, `walletId`, `type` (CREDIT/DEBIT), `source`, `amountCents`
- Mutable transaction log for wallet operations

#### Wallet Ledger (`wallet_ledger`)
- `id`, `userId`, `walletId`, `type`, `creditsDelta`, `amountCents`
- `idempotencyKey` (unique) - Enables idempotent credit operations
- Immutable ledger for credit grants and debits

### Existing API Endpoints

#### User Wallet APIs (JWT Auth Required)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wallet` | GET | Get user's wallet with transactions |
| `/api/wallet/fund` | POST | Fund wallet (via payment gateway) |
| `/api/wallet/auto-topup` | POST | Configure auto-topup rules |
| `/api/wallet/initiate-payment` | POST | Initiate Stripe checkout |
| `/api/credits/balance` | GET | Get credit balance |

#### External/B2B APIs (API Key Auth)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/external/balance` | GET | Get user balance via API key |
| `/api/external/debit` | POST | Debit credits from user wallet |
| `/api/v2/balance` | POST | App-scoped balance check |
| `/api/v2/debit` | POST | App-scoped debit with enhanced logging |

### Auth Context Extraction
- JWT middleware extracts `userId` from `req.user.id`
- API key auth looks up `apiKey.userId` for external APIs
- App API keys look up via OAuth tokens for per-user context

---

## New Multi-Org Model

### Core Concepts

1. **Organizations**: Groups that own resources (wallets, credits)
2. **Memberships**: Links users to organizations with roles
3. **Org Wallets**: Credits are owned by organizations, not individual users
4. **Personal Org**: Each user has an implicit "Personal" organization for backward compatibility

### New Database Tables

#### Organizations (`organizations`)
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
name            text NOT NULL
slug            text NOT NULL UNIQUE
created_by_user_id  uuid NOT NULL REFERENCES users(id)
created_at      timestamp DEFAULT now()
updated_at      timestamp DEFAULT now()
```

#### Organization Memberships (`organization_memberships`)
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
organization_id uuid NOT NULL REFERENCES organizations(id)
user_id         uuid NOT NULL REFERENCES users(id)
role            text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER'))
status          text NOT NULL CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED'))
created_at      timestamp DEFAULT now()
updated_at      timestamp DEFAULT now()
UNIQUE(organization_id, user_id)
```

#### Organization Wallets (`org_wallets`)
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
organization_id uuid NOT NULL REFERENCES organizations(id)
type            text NOT NULL DEFAULT 'CREDITS'
balance_cents   bigint DEFAULT 0
status          text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED'))
created_at      timestamp DEFAULT now()
updated_at      timestamp DEFAULT now()
UNIQUE(organization_id, type)
```

#### Credit Ledger (`org_credit_ledger`)
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
wallet_id       uuid NOT NULL REFERENCES org_wallets(id)
direction       text NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT'))
amount          integer NOT NULL
product         text NOT NULL
feature         text
external_ref    text NOT NULL
performed_by_user_id  uuid REFERENCES users(id)
metadata_json   jsonb
created_at      timestamp DEFAULT now()
UNIQUE(wallet_id, external_ref)
```

### Compatibility Strategy

#### Personal Organization Backfill
When multi-org is enabled, each existing user gets:
1. A "Personal" organization created automatically
2. An OWNER membership in that organization
3. An org_wallet seeded with their current wallet balance

#### Legacy API Behavior
All v1 endpoints continue to work identically:
1. Resolve user from JWT/API key
2. Get or create Personal Organization for that user
3. Operate on Personal Org's wallet
4. Return same response format

#### New v2 Endpoints
New endpoints accept optional `org_id` parameter:
- If `org_id` provided: validate membership, operate on org wallet
- If `org_id` omitted: fall back to Personal Organization

### Authorization Rules

| Role | Can View Org | Can Burn Credits | Can Add Users | Can Remove Users | Can Delete Org |
|------|--------------|------------------|---------------|------------------|----------------|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ (not owners) | ❌ |
| MEMBER | ✅ | ✅ | ❌ | ❌ | ❌ |
| INVITED | ❌ | ❌ | ❌ | ❌ | ❌ |
| SUSPENDED | ❌ | ❌ | ❌ | ❌ | ❌ |

### Idempotency

Credit burns use `external_ref` as idempotency key:
- Unique constraint on `(wallet_id, external_ref)`
- Duplicate burn requests with same `external_ref` return existing ledger entry
- No double-debit possible

---

## Migration Plan

### Phase 1: Schema Addition
- Add new tables (additive only)
- No changes to existing tables

### Phase 2: Backfill Script
- Create Personal Org for each user
- Create org_wallet with current balance
- Link via OWNER membership

### Phase 3: Tenancy Service
- Wrapper functions for org resolution
- Compatibility shim for v1 endpoints

### Phase 4: v2 Endpoints
- New endpoints under `/api/v2/`
- Accept `org_id` parameter
- Full audit logging

### Phase 5: Testing
- Regression tests for v1 endpoints
- Multi-org happy path tests
- Permission boundary tests

---

## Compatibility Statement

The following v1 endpoints remain **completely unchanged**:
- `GET /api/wallet` - Returns Personal Org wallet
- `POST /api/wallet/fund` - Funds Personal Org wallet
- `GET /api/external/balance` - Returns Personal Org balance
- `POST /api/external/debit` - Debits from Personal Org wallet
- All OAuth endpoints
- All admin endpoints

No client changes required for existing integrations.
