# Credits Hub Integration Guide

## Overview

This document provides complete instructions for integrating your Replit application with **Work Digital Credits Hub** - a centralized membership and billing platform that provides:

- **Credit/Wallet Management** for user balances
- **B2B API Integration** for balance checks and debits
- **User Subscription Management** across multiple apps

Credits Hub acts as a central billing authority where users maintain a single credit balance that can be consumed across multiple integrated applications.

> **Note**: This guide covers B2B API integration for checking balances and debiting credits. Your app identifies users by their email address registered in Credits Hub.

---

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Your App          │         │   Credits Hub       │
│   (Client App)      │◄───────►│   (Auth + Billing)  │
│                     │   API   │                     │
│   - Uses credits    │         │   - Manages users   │
│   - Checks balance  │         │   - Manages wallets │
│   - Debits users    │         │   - Tracks usage    │
└─────────────────────┘         └─────────────────────┘
```

---

## Step 1: Register Your App in Credits Hub

Before integration, your app must be registered in Credits Hub by an admin.

### Admin Actions Required:

1. Log in to Credits Hub at `https://membership-credits-hub.replit.app`
2. Navigate to **Admin → Apps**
3. Click **"Add New App"**
4. Complete the registration form:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Display name for your app | `MyAwesomeApp` |
| **Redirect URI** | OAuth callback URL | `https://your-app.replit.app/auth/callback` |
| **Description** | Brief description of your app | `AI-powered content generator` |

5. After saving, you will receive:
   - **Client ID**: `client_xxxxxxxxxxxxxxxxxx` (public identifier)
   - **Client Secret**: `secret_xxxxxxxxxxxxxxxxxx` (keep secure!)

### Generate API Key:

1. Go to **Apps** (user dashboard view)
2. Find your newly registered app
3. Click **"Generate API Key"**
4. **IMPORTANT**: Copy the full API key immediately - it is only displayed once!
5. API key format: `app_xxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyy`

---

## Step 2: Configure Environment Variables

Add these secrets to your Replit app's environment:

```env
# Credits Hub Connection
CREDITS_HUB_URL=https://membership-credits-hub.replit.app

# API Key for B2B Operations (from Step 1)
CREDITS_HUB_API_KEY=app_xxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyy
```

### In Replit:
1. Click the **"Secrets"** tab (lock icon) in the Tools panel
2. Add each variable with its corresponding value
3. Click **"Add Secret"** for each one

> **Minimum Required**: For B2B API integration, you only need `CREDITS_HUB_URL` and `CREDITS_HUB_API_KEY`. The Client ID and Client Secret are only needed if implementing OAuth SSO login.

---

## Step 3: Implement API Integration

### 3.1 Check User Balance

Before performing billable operations, check if the user has sufficient credits.

**Endpoint:** `POST /api/v2/balance`

**Authentication:** Bearer token in Authorization header

**Request:**
```javascript
async function checkUserBalance(userEmail) {
  const response = await fetch(`${process.env.CREDITS_HUB_URL}/api/v2/balance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CREDITS_HUB_API_KEY}`
    },
    body: JSON.stringify({
      user_email: userEmail
    })
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

**Response (Error - HTTP 401):**
```json
{
  "error": "invalid_api_key",
  "message": "Invalid or revoked API key",
  "trace_id": "abc123xyz"
}
```

**Response (Error - HTTP 400):**
```json
{
  "error": "user_not_found",
  "message": "User not found or not subscribed to this app",
  "trace_id": "abc123xyz"
}
```

---

### 3.2 Debit User Credits

Charge credits from a user's wallet after they use your service.

**Endpoint:** `POST /api/v2/debit`

**Authentication:** Bearer token in Authorization header

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
const result = await debitUserCredits(
  'user@example.com',
  5.00,
  'Generated 1 AI image'
);
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

**Response (Error - Insufficient Funds - HTTP 400):**
```json
{
  "error": "insufficient_balance",
  "message": "Insufficient balance",
  "current_balance": 3.00,
  "required_amount": 5.00,
  "trace_id": "abc123xyz"
}
```

---

### 3.3 Complete Integration Example

Here's a full example of a credits-aware service function:

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

// In your API route handler
app.post('/api/generate-image', async (req, res) => {
  const { prompt, userEmail } = req.body;
  
  try {
    const image = await creditsHub.executeWithCredits(
      userEmail,
      5.00,  // cost in credits
      `Generated image: ${prompt.substring(0, 50)}`,
      async () => {
        // Your actual image generation logic
        return await generateImage(prompt);
      }
    );
    
    res.json({ success: true, image });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
```

---

## Step 4: User Subscription Flow

Users must subscribe to your app in Credits Hub before they can use credits.

### How Users Subscribe:

1. User logs into Credits Hub
2. Navigates to **Apps** section
3. Finds your app in the list
4. Clicks **"Subscribe"**
5. Now they can use credits in your app

### Handling Unsubscribed Users:

If a user tries to use your app but isn't subscribed, the balance check will return (HTTP 400):

```json
{
  "error": "not_subscribed",
  "message": "User not subscribed to this app",
  "trace_id": "abc123xyz"
}
```

Using the error handler from Section 3.3, this error will be caught and you can display a friendly message:

```javascript
// The CreditsHubClient throws errors with a 'code' property
if (error.code === 'not_subscribed' || error.code === 'user_not_found') {
  return res.status(403).json({
    error: 'Please subscribe to this app in Credits Hub first',
    credits_hub_url: 'https://membership-credits-hub.replit.app/apps'
  });
}
```

---

## Step 5: Error Handling

### API Error Codes

| HTTP Status | Error Code | Cause |
|-------------|------------|-------|
| 401 | `missing_api_key` | No Authorization header provided |
| 401 | `invalid_api_key` | API key is incorrect or has been revoked |
| 401 | `expired_api_key` | API key has passed its expiration date |
| 403 | `insufficient_scope` | API key lacks required permission (e.g., `balance:read`) |
| 400 | `missing_user_email` | Request body missing `user_email` field |
| 400 | `user_not_found` | User email not registered in Credits Hub |
| 400 | `not_subscribed` | User hasn't subscribed to your app |
| 400 | `insufficient_balance` | User doesn't have enough credits |
| 500 | Server error | Credits Hub internal error |

### Robust Error Handler

```javascript
function handleCreditsHubError(error, res) {
  const code = error.code || 'unknown_error';
  const message = error.message || 'Unknown error';
  const traceId = error.traceId;
  
  // Log trace ID for debugging
  if (traceId) {
    console.error(`Credits Hub error [${traceId}]: ${code} - ${message}`);
  }
  
  switch (code) {
    case 'invalid_api_key':
    case 'missing_api_key':
    case 'expired_api_key':
      console.error('API Key issue - check CREDITS_HUB_API_KEY secret');
      return res.status(500).json({ 
        error: 'Service configuration error. Please contact support.',
        trace_id: traceId
      });
      
    case 'not_subscribed':
    case 'user_not_found':
      return res.status(403).json({
        error: 'You need to subscribe to this app in Credits Hub first.',
        action: 'subscribe',
        url: `${process.env.CREDITS_HUB_URL}/apps`
      });
      
    case 'insufficient_balance':
      return res.status(400).json({
        error: 'You don\'t have enough credits for this action.',
        action: 'add_funds',
        url: `${process.env.CREDITS_HUB_URL}/wallet`,
        current_balance: error.currentBalance
      });
      
    default:
      return res.status(500).json({ 
        error: message,
        trace_id: traceId 
      });
  }
}
```

---

## Step 6: Testing Your Integration

### Test Checklist

- [ ] Environment variables are set correctly
- [ ] Balance check returns user's credit balance
- [ ] Debit operation reduces balance correctly
- [ ] Error handling works for insufficient funds
- [ ] Error handling works for unsubscribed users

### Manual Testing

```bash
# Test balance check (replace with actual values)
curl -X POST https://your-app.replit.app/api/test-balance \
  -H "Content-Type: application/json" \
  -d '{"email": "jking@workdigital.com"}'

# Expected: { "success": true, "balance": 150.00, ... }
```

### Debug API Key Issues

If you get `invalid_api_key` errors:

1. Verify `CREDITS_HUB_API_KEY` is set in Secrets
2. Check the key prefix matches in Credits Hub (Admin → OAuth Audit Logs)
3. Regenerate the API key if needed:
   - Delete old key in Credits Hub
   - Generate new key
   - Update your app's secrets
   - Re-deploy

---

## API Reference Summary

### Base URL
```
https://membership-credits-hub.replit.app
```

### Endpoints

| Method | Endpoint | Description | Required Scope |
|--------|----------|-------------|----------------|
| POST | `/api/v2/balance` | Check user's credit balance | `balance:read` |
| POST | `/api/v2/debit` | Debit credits from user's wallet | `balance:write` |

### Authentication

All API calls require a Bearer token in the `Authorization` header:

```
Authorization: Bearer app_xxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyy
```

### Request/Response Format

- All requests use `Content-Type: application/json`
- All responses include a `trace_id` field for debugging
- Error responses include `error` (code) and `message` (human-readable) fields

---

## Troubleshooting

### "invalid_api_key" Error

1. Check that `CREDITS_HUB_API_KEY` secret is set
2. Verify the key hasn't been revoked in Credits Hub
3. Ensure the full key was copied (not just the prefix)
4. Check OAuth Audit Logs in Credits Hub Admin for details

### "User not subscribed" Error

1. User needs to subscribe to your app in Credits Hub
2. Direct them to: `https://membership-credits-hub.replit.app/apps`

### Balance Not Updating

1. Debits are logged - check Credits Hub transaction history
2. Verify your app is sending the correct user email
3. Check for transaction errors in your server logs

---

## Security Best Practices

1. **Never expose API keys** in client-side code
2. **Always validate** user email before making API calls
3. **Log transactions** on your side for reconciliation
4. **Handle errors gracefully** without exposing internal details
5. **Use HTTPS** for all API calls (automatic on Replit)

---

## Support

For integration issues:
- Check OAuth Audit Logs in Credits Hub Admin panel
- Review server logs for detailed error messages
- Contact Work Digital support for API key issues

---

## Quick Start Checklist

- [ ] App registered in Credits Hub Admin (get Client ID)
- [ ] Generated API Key for the app (copy full key immediately - shown only once!)
- [ ] Added `CREDITS_HUB_URL` secret to your Replit app
- [ ] Added `CREDITS_HUB_API_KEY` secret to your Replit app
- [ ] Implemented balance check using `Authorization: Bearer <API_KEY>`
- [ ] Implemented debit using `Authorization: Bearer <API_KEY>`
- [ ] User has subscribed to your app in Credits Hub
- [ ] Tested end-to-end flow with real user email

---

*Last updated: December 2024*
*Credits Hub Version: 1.0*
