# API V2 Reference - Organization Multi-Tenancy

## Overview

The V2 API introduces organization-level operations while maintaining full backward compatibility with V1 endpoints. Organizations own wallets and credits, enabling teams to share credit pools.

## Authentication

All V2 endpoints require JWT authentication via the `Authorization: Bearer <token>` header.

---

## Organization Endpoints

### List User Organizations

```http
GET /api/v2/me/orgs
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "orgs": [
    {
      "org_id": "uuid",
      "name": "My Company",
      "slug": "my-company-abc123",
      "role": "OWNER",
      "status": "ACTIVE",
      "wallet_id": "uuid",
      "balance_cents": 50000,
      "is_personal": false
    },
    {
      "org_id": "uuid",
      "name": "john Personal",
      "slug": "personal-abc12345",
      "role": "OWNER",
      "status": "ACTIVE",
      "wallet_id": "uuid",
      "balance_cents": 10000,
      "is_personal": true
    }
  ],
  "default_org_id": "uuid"
}
```

---

### Create Organization

```http
POST /api/v2/orgs
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Acme Inc"
}
```

**Response (201 Created):**
```json
{
  "org_id": "uuid",
  "wallet_id": "uuid",
  "name": "Acme Inc",
  "slug": "acme-inc-1a2b3c",
  "role": "OWNER"
}
```

---

### Get Organization Details

```http
GET /api/v2/orgs/:orgId
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "org_id": "uuid",
  "name": "Acme Inc",
  "slug": "acme-inc-1a2b3c",
  "is_personal": false,
  "wallet_id": "uuid",
  "balance_cents": 50000,
  "members": [
    {
      "user_id": "uuid",
      "email": "owner@acme.com",
      "full_name": "John Doe",
      "role": "OWNER",
      "status": "ACTIVE"
    },
    {
      "user_id": "uuid",
      "email": "dev@acme.com",
      "full_name": "Jane Smith",
      "role": "MEMBER",
      "status": "ACTIVE"
    }
  ]
}
```

**Error Responses:**
- `403 NOT_A_MEMBER` - User is not a member of this organization
- `403 MEMBERSHIP_NOT_ACTIVE` - User's membership is not active

---

### Add User to Organization

```http
POST /api/v2/orgs/:orgId/users
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "target_user_id": "uuid",
  "role": "MEMBER"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Roles:** `ADMIN`, `MEMBER` (OWNER cannot be assigned via API)

**Error Responses:**
- `403 INSUFFICIENT_PERMISSIONS` - Only OWNER/ADMIN can add users
- `404 USER_NOT_FOUND` - Target user doesn't exist
- `403 ALREADY_MEMBER` - User is already an active member

---

### Add User by Email

```http
POST /api/v2/orgs/:orgId/users/by-email
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "email": "user@example.com",
  "role": "MEMBER"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

### Remove User from Organization

```http
DELETE /api/v2/orgs/:orgId/users/:targetUserId
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "ok": true
}
```

**Error Responses:**
- `403 INSUFFICIENT_PERMISSIONS` - Only OWNER/ADMIN can remove users
- `403 CANNOT_REMOVE_SELF` - Cannot remove yourself
- `403 CANNOT_REMOVE_OWNER` - Only owners can remove other owners
- `403 NOT_A_MEMBER` - Target user is not a member

---

## Credit Operations

### Burn Credits

Burns credits from an organization wallet. This is the primary endpoint for B2B credit consumption.

```http
POST /api/v2/credits/burn
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "org_id": "uuid",
  "amount": 100,
  "product": "RECEIPTS",
  "feature": "OCR",
  "external_ref": "receipts:receipt_123:ocr:v1",
  "metadata": {
    "receipt_id": "receipt_123",
    "job_id": "job_77"
  }
}
```

**Parameters:**
- `org_id` (optional) - Organization ID. If omitted, uses Personal Organization.
- `amount` (required) - Amount of credits to burn (positive integer)
- `product` (required) - Product identifier (e.g., "RECEIPTS", "AI_BUILDER")
- `feature` (optional) - Feature within product (e.g., "OCR", "EXPORT")
- `external_ref` (required) - Unique idempotency key
- `metadata` (optional) - Additional JSON metadata

**Success Response (200):**
```json
{
  "approved": true,
  "balance": 49900,
  "ledger_id": "uuid"
}
```

**Insufficient Balance Response (402):**
```json
{
  "approved": false,
  "balance": 50,
  "error": "Insufficient balance"
}
```

**Idempotency:**
If the same `external_ref` is sent twice, the second request returns the existing ledger entry without double-debiting.

---

### Get Wallet Ledger

```http
GET /api/v2/wallets/:walletId/ledger?limit=50
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "direction": "DEBIT",
      "amount": 100,
      "product": "RECEIPTS",
      "feature": "OCR",
      "external_ref": "receipts:receipt_123:ocr:v1",
      "performed_by_user_id": "uuid",
      "metadata": { "receipt_id": "receipt_123" },
      "created_at": "2025-01-21T10:30:00Z"
    },
    {
      "id": "uuid",
      "direction": "CREDIT",
      "amount": 5000,
      "product": "TOPUP",
      "feature": null,
      "external_ref": "stripe:pi_xxx",
      "performed_by_user_id": "uuid",
      "metadata": { "pack_sku": "credits_50" },
      "created_at": "2025-01-20T15:00:00Z"
    }
  ]
}
```

---

## Role Permissions

| Role | View Org | Burn Credits | Add Users | Remove Users | Delete Org |
|------|----------|--------------|-----------|--------------|------------|
| OWNER | Yes | Yes | Yes | Yes | Yes |
| ADMIN | Yes | Yes | Yes | Yes (not owners) | No |
| MEMBER | Yes | Yes | No | No | No |

---

## V1 Compatibility

All V1 endpoints remain unchanged. For users without explicit organizations:

1. A "Personal Organization" is created automatically on first access
2. Personal Org wallet is seeded with current legacy wallet balance
3. All V1 operations transparently use the Personal Organization

**V1 Endpoints (Unchanged):**
- `GET /api/wallet` - Returns Personal Org wallet
- `POST /api/wallet/fund` - Funds Personal Org
- `GET /api/external/balance` - Returns Personal Org balance
- `POST /api/external/debit` - Debits from Personal Org

---

## Error Codes

| Code | Description |
|------|-------------|
| `NOT_A_MEMBER` | User is not a member of this organization |
| `MEMBERSHIP_NOT_ACTIVE` | Membership status is INVITED or SUSPENDED |
| `INSUFFICIENT_PERMISSIONS` | Action requires OWNER or ADMIN role |
| `USER_NOT_FOUND` | Target user does not exist |
| `ALREADY_MEMBER` | User is already an active member |
| `CANNOT_REMOVE_SELF` | Cannot remove yourself from organization |
| `CANNOT_REMOVE_OWNER` | Only owners can remove other owners |
| `ORG_NOT_FOUND` | Organization does not exist |
| `WALLET_NOT_FOUND` | Organization wallet not found |

---

## Example Workflows

### B2B Integration: Burn Credits

```javascript
// 1. Get user's organizations
const orgsRes = await fetch('/api/v2/me/orgs', {
  headers: { Authorization: `Bearer ${token}` }
});
const { orgs, default_org_id } = await orgsRes.json();

// 2. Burn credits with idempotency key
const burnRes = await fetch('/api/v2/credits/burn', {
  method: 'POST',
  headers: { 
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    org_id: default_org_id, // or specific org
    amount: 10,
    product: 'MY_APP',
    external_ref: `my_app:${jobId}:processing:v1`
  })
});

const { approved, balance, ledger_id } = await burnRes.json();
if (!approved) {
  // Handle insufficient balance - prompt user to add funds
}
```

### Team Setup

```javascript
// 1. Create organization
const createRes = await fetch('/api/v2/orgs', {
  method: 'POST',
  headers: { 
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name: 'My Team' })
});
const { org_id } = await createRes.json();

// 2. Add team members
await fetch(`/api/v2/orgs/${org_id}/users/by-email`, {
  method: 'POST',
  headers: { 
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ email: 'teammate@example.com', role: 'MEMBER' })
});
```
