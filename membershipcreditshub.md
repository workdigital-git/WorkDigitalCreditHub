# Membership Credits Hub - Integration Reference

> Complete technical reference for integrating with the Work Digital Credits Hub OAuth and API system.

---

## 1. Credential Generation

When an admin creates a new OAuth app in Credits Hub, the following credentials are generated:

### Client ID Format
```
client_{32_hex_characters}
```
**Example:** `client_dc4156179c7aa8aeb377dd4b9acce7fc`

**Generation Code:**
```javascript
clientId: `client_${randomBytes(16).toString("hex")}`
```

### Client Secret Format
```
{64_hex_characters}
```
**Example:** `a1b2c3d4e5f6...` (64 characters total)

**Generation Code:**
```javascript
clientSecret: randomBytes(32).toString("hex")
```

### App Record Structure (Stored in Database)
```json
{
  "id": "uuid-string",
  "name": "Your App Name",
  "slug": "your-app-slug",
  "description": "App description",
  "callbackUrl": "https://yourapp.com/callback",
  "allowedCallbackUrls": ["https://yourapp.com/callback", "https://yourapp.com/auth/callback"],
  "pricingModel": "per-use|subscription|free",
  "billingCycle": "MONTHLY|YEARLY|null",
  "monthlyPriceCents": 0,
  "yearlyPriceCents": 0,
  "perUsePriceCents": 0,
  "clientId": "client_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "clientSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "iconUrl": null,
  "isActive": true,
  "createdAt": "2024-12-28T00:00:00.000Z",
  "updatedAt": "2024-12-28T00:00:00.000Z"
}
```

---

## 2. OAuth Flow

### Step 1: Authorization Request

> **IMPORTANT:** Redirect users to the **authorization page** (`/oauth/authorize`), NOT the API endpoint (`/api/oauth/authorize`). The page handles user login and consent before redirecting back to your app.

**Authorization Page URL:** `GET /oauth/authorize`

**Your App Redirects User To:**
```
https://workdigitalcredithub.com/oauth/authorize
  ?client_id=client_dc4156179c7aa8aeb377dd4b9acce7fc
  &redirect_uri=https://yourapp.com/callback
  &response_type=code
  &scope=openid profile credits
  &state=random_state_string
  &code_challenge=BASE64URL_SHA256_HASH
  &code_challenge_method=S256
```

**CORRECT:**
```
https://workdigitalcredithub.com/oauth/authorize?client_id=...
```

**WRONG (will fail with "Authentication required"):**
```
https://workdigitalcredithub.com/api/oauth/authorize?client_id=...
```

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `client_id` | string | Your app's client ID |
| `redirect_uri` | string | Must match registered callback URL |
| `response_type` | string | Must be `code` |
| `scope` | string | Space-separated: `openid profile credits` |
| `state` | string | Random string for CSRF protection |
| `code_challenge` | string | PKCE challenge (SHA256 hash, base64url encoded) |
| `code_challenge_method` | string | Must be `S256` |

**Optional Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `response_mode` | string | `json` for JSON response (SPA mode), omit for HTTP redirect (default) |

**Credits Hub Validates:**
1. `client_id` exists in `apps` table
2. `redirect_uri` matches `callbackUrl` or is in `allowedCallbackUrls`
3. App `isActive` is `true`
4. PKCE parameters are valid

### Step 2: User Authorizes

User logs in and approves the authorization. Credits Hub generates an authorization code.

**Authorization Code Format:**
```
authcode_{64_hex_characters}
```
**Example:** `authcode_a1b2c3d4e5f6...`

**Generation Code:**
```javascript
const authCode = `authcode_${randomBytes(32).toString("hex")}`;
```

### Step 3: Authorization Response

**Credits Hub Redirects To:**
```
https://yourapp.com/callback
  ?code=authcode_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  &state=random_state_string
```

**Your App Receives:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `code` | string | Authorization code (valid for 10 minutes) |
| `state` | string | Same state you sent (verify this!) |

---

## 3. Token Exchange

### Step 4: Exchange Code for Token

**Endpoint:** `POST /api/oauth/token`

**Your App Sends:**
```http
POST /api/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "authcode_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "redirect_uri": "https://yourapp.com/callback",
  "client_id": "client_dc4156179c7aa8aeb377dd4b9acce7fc",
  "client_secret": "your_client_secret_here",
  "code_verifier": "original_random_string_used_to_generate_code_challenge"
}
```

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `grant_type` | string | Must be `authorization_code` |
| `code` | string | The authorization code received |
| `redirect_uri` | string | Must match the original request |
| `client_id` | string | Your app's client ID |
| `client_secret` | string | Your app's client secret |
| `code_verifier` | string | PKCE verifier (original random string) |

**Credits Hub Validates:**
1. `client_id` exists in database (`storage.getAppByClientId(client_id)`)
2. `client_secret` matches stored secret
3. Authorization code exists and is unused
4. Authorization code not expired (10 minute TTL)
5. `redirect_uri` matches the original authorization request
6. PKCE `code_verifier` hashes to stored `code_challenge`

### Step 5: Token Response

**Credits Hub Returns (Success):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile credits",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "fullName": "John Doe"
  },
  "trace_id": "trace_abc123..."
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | JWT token for API requests (1 hour validity) |
| `token_type` | string | Always `Bearer` |
| `expires_in` | number | Token lifetime in seconds (3600 = 1 hour) |
| `scope` | string | Granted scopes |
| `user.id` | string | User's UUID |
| `user.email` | string | User's email address |
| `user.fullName` | string | User's display name (may be null) |
| `trace_id` | string | Debug trace ID for support |

**Access Token JWT Payload:**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "appId": "app-uuid",
  "scope": "openid profile credits",
  "iat": 1703808000,
  "exp": 1703811600
}
```

---

## 4. Error Responses

### Authorization Errors

**Invalid Client ID:**
```json
{
  "error": "invalid_client",
  "error_description": "Unknown client_id",
  "trace_id": "trace_xxx"
}
```

**Invalid Redirect URI:**
```json
{
  "error": "invalid_request",
  "error_description": "Invalid redirect_uri",
  "trace_id": "trace_xxx"
}
```

### Token Exchange Errors

**Unknown Client ID (Line 3649-3652 in routes.ts):**
```javascript
const appRecord = await storage.getAppByClientId(client_id);
if (!appRecord) {
  return res.status(401).json({ 
    error: "invalid_client", 
    error_description: "Unknown client_id", 
    trace_id: traceId 
  });
}
```

**Invalid Client Secret:**
```json
{
  "error": "invalid_client",
  "error_description": "Client authentication failed",
  "trace_id": "trace_xxx"
}
```

**Invalid/Expired Code:**
```json
{
  "error": "invalid_grant",
  "error_description": "Invalid authorization code",
  "trace_id": "trace_xxx"
}
```

**Code Already Used:**
```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code already used",
  "trace_id": "trace_xxx"
}
```

**PKCE Verification Failed:**
```json
{
  "error": "invalid_grant",
  "error_description": "PKCE verification failed",
  "trace_id": "trace_xxx"
}
```

**Rate Limited:**
```json
{
  "error": "rate_limit_exceeded",
  "error_description": "Too many requests. Please wait before trying again.",
  "retry_after": 60,
  "trace_id": "trace_xxx"
}
```

---

## 5. B2B API Integration

After registering your app and generating an API key, use these APIs:

### Environment Variables

```env
CREDITS_HUB_URL=https://workdigitalcredithub.com
CREDITS_HUB_API_KEY=app_xxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyy
```

### 5.1 Check User Balance

**Endpoint:** `POST /api/v2/balance`

**Request:**
```javascript
async function checkUserBalance(userEmail) {
  const response = await fetch(`${process.env.CREDITS_HUB_URL}/api/v2/balance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CREDITS_HUB_API_KEY}`
    },
    body: JSON.stringify({ user_email: userEmail })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Balance check failed');
  }
  return data;
}

// Usage
const { balance, user_id, trace_id } = await checkUserBalance('user@example.com');
console.log(`User has ${balance} credits available`);
```

**Response (Success - HTTP 200):**
```json
{
  "success": true,
  "balance": 150.00,
  "user_id": "uuid-here",
  "user_email": "user@example.com",
  "trace_id": "abc123xyz"
}
```

### 5.2 Debit User Credits

**Endpoint:** `POST /api/v2/debit`

**Request:**
```javascript
async function debitUserCredits(userEmail, amount, description) {
  const response = await fetch(`${process.env.CREDITS_HUB_URL}/api/v2/debit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CREDITS_HUB_API_KEY}`
    },
    body: JSON.stringify({
      user_email: userEmail,
      amount: amount,
      description: description
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Debit failed');
  }
  return data;
}

// Usage
const result = await debitUserCredits('user@example.com', 5.00, 'Generated 1 AI image');
console.log(`New balance: ${result.new_balance}`);
```

**Response (Success - HTTP 200):**
```json
{
  "success": true,
  "transaction_id": "txn_xxxxx",
  "amount_debited": 5.00,
  "new_balance": 145.00,
  "user_email": "user@example.com",
  "trace_id": "abc123xyz"
}
```

**Response (Insufficient Balance - HTTP 400):**
```json
{
  "error": "insufficient_balance",
  "message": "Insufficient balance",
  "current_balance": 3.00,
  "required_amount": 5.00,
  "trace_id": "abc123xyz"
}
```

### 5.3 Complete Integration Class

```javascript
// services/credits.js
const CREDITS_HUB_URL = process.env.CREDITS_HUB_URL;
const CREDITS_HUB_API_KEY = process.env.CREDITS_HUB_API_KEY;

class CreditsHubClient {
  constructor() {
    if (!CREDITS_HUB_URL || !CREDITS_HUB_API_KEY) {
      throw new Error('Credits Hub credentials not configured');
    }
  }

  async checkBalance(userEmail) {
    const response = await fetch(`${CREDITS_HUB_URL}/api/v2/balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CREDITS_HUB_API_KEY}`
      },
      body: JSON.stringify({ user_email: userEmail })
    });

    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || data.error || 'Balance check failed');
      error.code = data.error;
      error.traceId = data.trace_id;
      throw error;
    }
    return data;
  }

  async debit(userEmail, amount, description) {
    const response = await fetch(`${CREDITS_HUB_URL}/api/v2/debit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CREDITS_HUB_API_KEY}`
      },
      body: JSON.stringify({
        user_email: userEmail,
        amount: amount,
        description: description
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || data.error || 'Debit failed');
      error.code = data.error;
      error.traceId = data.trace_id;
      error.currentBalance = data.current_balance;
      throw error;
    }
    return data;
  }

  async executeWithCredits(userEmail, creditCost, description, operation) {
    // Step 1: Check balance
    const { balance } = await this.checkBalance(userEmail);
    
    if (balance < creditCost) {
      const error = new Error(`Insufficient credits. Need ${creditCost}, have ${balance}`);
      error.code = 'insufficient_balance';
      error.currentBalance = balance;
      error.requiredAmount = creditCost;
      throw error;
    }

    // Step 2: Execute the operation
    const result = await operation();

    // Step 3: Debit credits after successful operation
    await this.debit(userEmail, creditCost, description);

    return result;
  }
}

export const creditsHub = new CreditsHubClient();
```

**Usage in your app:**

```javascript
import { creditsHub } from './services/credits.js';

app.post('/api/generate-image', async (req, res) => {
  const { prompt, userEmail } = req.body;
  
  try {
    const image = await creditsHub.executeWithCredits(
      userEmail,
      5.00,
      `Generated image: ${prompt.substring(0, 50)}`,
      async () => await generateImage(prompt)
    );
    
    res.json({ success: true, image });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
```

### 5.4 B2B API Error Codes

| HTTP Status | Error Code | Cause |
|-------------|------------|-------|
| 401 | `missing_api_key` | No Authorization header provided |
| 401 | `invalid_api_key` | API key is incorrect or has been revoked |
| 401 | `expired_api_key` | API key has passed its expiration date |
| 400 | `missing_user_email` | Request body missing `user_email` field |
| 400 | `user_not_found` | User email not registered in Credits Hub |
| 400 | `not_subscribed` | User hasn't subscribed to your app |
| 400 | `insufficient_balance` | User doesn't have enough credits |

---

## 6. Database Lookup Reference

### How Credits Hub Finds Your App

**Function:** `storage.getAppByClientId(clientId)`

**SQL Query:**
```sql
SELECT * FROM apps WHERE client_id = $1 LIMIT 1
```

**Storage Implementation (server/storage.ts, line 694):**
```typescript
async getAppByClientId(clientId: string): Promise<App | undefined> {
  const [app] = await db
    .select()
    .from(apps)
    .where(eq(apps.clientId, clientId))
    .limit(1);
  return app;
}
```

### Debugging Checklist

If you get `"Unknown client_id"` error:

1. **Verify client_id format:** Must be `client_` + 32 hex characters
2. **Check exact match:** No extra spaces, correct case
3. **Verify app exists:** Query the database directly
4. **Check isActive:** App must not be deactivated
5. **Confirm environment:** Development vs Production database

**Direct Database Check:**
```sql
SELECT id, name, client_id, is_active, created_at 
FROM apps 
WHERE client_id = 'client_dc4156179c7aa8aeb377dd4b9acce7fc';
```

---

## 7. PKCE Implementation Reference

### Generate Code Verifier (Your App)
```javascript
const codeVerifier = crypto.randomBytes(32).toString('base64url');
// Example: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
```

### Generate Code Challenge (Your App)
```javascript
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');
// Send this in authorization request
```

### How Credits Hub Verifies (server/routes.ts)
```javascript
const expectedChallenge = crypto
  .createHash("sha256")
  .update(code_verifier)
  .digest("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=/g, "");

if (expectedChallenge !== authCode.codeChallenge) {
  return res.status(400).json({ 
    error: "invalid_grant", 
    error_description: "PKCE verification failed" 
  });
}
```

---

## 8. Complete Flow Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Your App      │     │  Credits Hub    │     │    Database     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. GET /authorize    │                       │
         │  (client_id, PKCE)    │                       │
         │──────────────────────>│                       │
         │                       │  2. Lookup client_id  │
         │                       │──────────────────────>│
         │                       │<──────────────────────│
         │                       │  3. Validate app      │
         │                       │                       │
         │  4. Redirect to login │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  5. User authorizes   │                       │
         │──────────────────────>│                       │
         │                       │  6. Store auth code   │
         │                       │──────────────────────>│
         │                       │                       │
         │  7. Redirect + code   │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  8. POST /token       │                       │
         │  (code, verifier)     │                       │
         │──────────────────────>│                       │
         │                       │  9. Lookup client_id  │
         │                       │──────────────────────>│
         │                       │<──────────────────────│
         │                       │ 10. Verify PKCE       │
         │                       │ 11. Generate JWT      │
         │                       │                       │
         │ 12. Token response    │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │ 13. API calls with    │                       │
         │     Bearer token      │                       │
         │──────────────────────>│                       │
         │                       │                       │
```

---

## 9. Environment Configuration

### Required Environment Variables (Credits Hub)

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=random_secure_string
JWT_SECRET=another_random_secure_string
```

### Your App Configuration

```env
CREDITS_HUB_URL=https://creditshub.workdigital.com
CREDITS_HUB_CLIENT_ID=client_dc4156179c7aa8aeb377dd4b9acce7fc
CREDITS_HUB_CLIENT_SECRET=your_64_char_secret
CREDITS_HUB_CALLBACK_URL=https://yourapp.com/callback
```

---

## 10. Troubleshooting

### "Authentication required" Error

**Cause:** You're calling the API endpoint directly instead of the authorization page.

**Solution:** Change your OAuth URL from:
```
❌ https://workdigitalcredithub.com/api/oauth/authorize?...
```
To:
```
✅ https://workdigitalcredithub.com/oauth/authorize?...
```

The `/oauth/authorize` page shows the login/consent UI. The `/api/oauth/authorize` endpoint is for internal use only.

---

### "Unknown client_id" Error

**Possible Causes:**
1. App not created in Credits Hub
2. App created in wrong environment (dev vs prod)
3. Typo in client_id
4. App was deleted or deactivated

**Debug Steps:**
1. Log into Credits Hub admin panel
2. Go to "Connected Apps" section
3. Find your app and verify the client_id matches exactly
4. Check that the app shows as "Active"
5. Use the "Credentials" button to copy the exact client_id

### "Client authentication failed" Error

**Possible Causes:**
1. Wrong client_secret
2. Secret was regenerated and old one is being used

**Debug Steps:**
1. In Credits Hub admin, click "Credentials" for your app
2. Copy the client_secret exactly
3. Update your app's environment variables

### "PKCE verification failed" Error

**Possible Causes:**
1. code_verifier doesn't match code_challenge
2. Using wrong hashing algorithm
3. Base64url encoding issues

**Debug Steps:**
1. Generate new code_verifier and code_challenge
2. Ensure using SHA256 + base64url encoding
3. Verify no padding characters (=) in challenge

---

*Last Updated: December 2024*
*Version: 1.0*
