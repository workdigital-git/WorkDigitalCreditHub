import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Book,
  Code,
  Copy,
  Check,
  Key,
  Shield,
  DollarSign,
  Users,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Globe,
} from "lucide-react";

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copyToClipboard}
        data-testid="button-copy-code"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

function EndpointCard({
  method,
  path,
  description,
  auth,
  requestBody,
  responseExample,
  errorCodes,
}: {
  method: "GET" | "POST";
  path: string;
  description: string;
  auth: string;
  requestBody?: string;
  responseExample: string;
  errorCodes?: { code: number; description: string }[];
}) {
  const methodColors = {
    GET: "bg-green-500/10 text-green-600 dark:text-green-400",
    POST: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className={methodColors[method]}>{method}</Badge>
          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{path}</code>
        </div>
        <CardDescription className="mt-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Key className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Auth:</span>
          <code className="text-xs bg-muted px-2 py-0.5 rounded">{auth}</code>
        </div>

        {requestBody && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Request Body</p>
            <CodeBlock code={requestBody} language="json" />
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Response</p>
          <CodeBlock code={responseExample} language="json" />
        </div>

        {errorCodes && errorCodes.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Error Codes</p>
            <div className="space-y-1">
              {errorCodes.map((error) => (
                <div key={error.code} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{error.code}</Badge>
                  <span className="text-muted-foreground">{error.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ApiDocsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              API Documentation
            </h1>
            <p className="text-muted-foreground">
              Integrate with the Credits Hub to manage user credits
            </p>
          </div>
          <Badge variant="secondary" className="w-fit">
            <Globe className="h-3 w-3 mr-1" />
            v2.0
          </Badge>
        </div>

        <Tabs defaultValue="quickstart" className="space-y-4">
          <TabsList>
            <TabsTrigger value="quickstart" data-testid="tab-quickstart">
              <Zap className="h-4 w-4 mr-2" />
              Quick Start
            </TabsTrigger>
            <TabsTrigger value="auth" data-testid="tab-auth">
              <Key className="h-4 w-4 mr-2" />
              Authentication
            </TabsTrigger>
            <TabsTrigger value="endpoints" data-testid="tab-endpoints">
              <Terminal className="h-4 w-4 mr-2" />
              Endpoints
            </TabsTrigger>
            <TabsTrigger value="examples" data-testid="tab-examples">
              <Code className="h-4 w-4 mr-2" />
              Examples
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quickstart" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Getting Started
                </CardTitle>
                <CardDescription>
                  Follow these steps to integrate your app with the Credits Hub
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
                      1
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-medium">Register Your App</h3>
                      <p className="text-sm text-muted-foreground">
                        Contact the platform administrator to register your application. You'll receive
                        an App ID and will be able to generate API keys.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
                      2
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-medium">Get API Key</h3>
                      <p className="text-sm text-muted-foreground">
                        Your platform admin will generate an API key for your app with the required
                        scopes (balance:read, credits:debit).
                      </p>
                      <CodeBlock code={`# Store your API key securely
export CREDITS_HUB_API_KEY="your_api_key_here"`} />
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
                      3
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-medium">User Authorization</h3>
                      <p className="text-sm text-muted-foreground">
                        Users must authorize your app before you can access their credits. Direct
                        users to connect your app from their "My Apps" page.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
                      4
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-medium">Make API Calls</h3>
                      <p className="text-sm text-muted-foreground">
                        Use the API endpoints to check user balance and debit credits.
                      </p>
                      <CodeBlock code={`# Check a user's balance
curl -X POST "https://your-domain.com/api/v2/balance" \\
  -H "Authorization: Bearer $CREDITS_HUB_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"user_email": "user@example.com"}'`} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="hover-elevate">
                <CardContent className="pt-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-medium mb-1">Secure by Default</h3>
                  <p className="text-sm text-muted-foreground">
                    All API calls require authentication and user authorization
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardContent className="pt-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-medium mb-1">Precise Billing</h3>
                  <p className="text-sm text-muted-foreground">
                    Credits stored in cents for precision, with auto-topup support
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardContent className="pt-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-medium mb-1">User-Controlled</h3>
                  <p className="text-sm text-muted-foreground">
                    Users can connect or disconnect apps at any time
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="auth" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Key Authentication
                </CardTitle>
                <CardDescription>
                  Authenticate your API requests using your app's API key
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium">Bearer Token</h3>
                  <p className="text-sm text-muted-foreground">
                    Include your API key in the Authorization header of every request:
                  </p>
                  <CodeBlock code={`Authorization: Bearer your_api_key_here`} />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-medium">API Key Scopes</h3>
                  <p className="text-sm text-muted-foreground">
                    API keys can have different scopes that determine what operations they can perform:
                  </p>
                  <div className="grid gap-2">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Badge variant="outline">balance:read</Badge>
                      <span className="text-sm text-muted-foreground">
                        Check user credit balance
                      </span>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Badge variant="outline">credits:debit</Badge>
                      <span className="text-sm text-muted-foreground">
                        Debit credits from user accounts
                      </span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    User Authorization
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Before you can access a user's credits, they must authorize your app. This happens
                    when users connect to your app from their "My Apps" dashboard.
                  </p>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-600 dark:text-amber-400">
                          Authorization Required
                        </p>
                        <p className="text-muted-foreground mt-1">
                          If a user hasn't authorized your app, API calls will return a 403 error
                          with <code>authorization_required: true</code>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="endpoints" className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="h-5 w-5" />
              <h2 className="text-xl font-semibold">API Endpoints</h2>
            </div>

            <EndpointCard
              method="POST"
              path="/api/v2/balance"
              description="Check a user's current credit balance. Requires the user to have authorized your app."
              auth="Bearer Token (App API Key with balance:read scope)"
              requestBody={`{
  "user_email": "user@example.com"
}`}
              responseExample={`{
  "user_email": "user@example.com",
  "balance_cents": 5000,
  "currency": "USD",
  "subscription_status": "ACTIVE"
}`}
              errorCodes={[
                { code: 401, description: "Invalid or missing API key" },
                { code: 403, description: "User hasn't authorized this app" },
                { code: 404, description: "User or wallet not found" },
              ]}
            />

            <EndpointCard
              method="POST"
              path="/api/v2/debit"
              description="Debit credits from a user's account. Requires user authorization and credits:debit scope."
              auth="Bearer Token (App API Key with credits:debit scope)"
              requestBody={`{
  "user_email": "user@example.com",
  "amount_cents": 100,
  "description": "Premium feature usage",
  "idempotency_key": "unique-transaction-id"
}`}
              responseExample={`{
  "success": true,
  "transaction_id": "txn_123abc",
  "amount_cents": 100,
  "new_balance_cents": 4900,
  "user_email": "user@example.com",
  "app_name": "Your App",
  "auto_topup": {
    "triggered": true,
    "amount_cents": 1000,
    "transaction_id": "txn_456def",
    "balance_after_topup": 5900
  }
}`}
              errorCodes={[
                { code: 401, description: "Invalid or missing API key" },
                { code: 402, description: "Insufficient balance" },
                { code: 403, description: "User hasn't authorized this app" },
                { code: 404, description: "User or wallet not found" },
              ]}
            />
          </TabsContent>

          <TabsContent value="examples" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Code Examples
                </CardTitle>
                <CardDescription>
                  Ready-to-use code snippets for common integrations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium">Node.js / JavaScript</h3>
                  <CodeBlock
                    code={`const API_KEY = process.env.CREDITS_HUB_API_KEY;
const BASE_URL = 'https://your-domain.com';

// Check user balance
async function checkBalance(userEmail) {
  const response = await fetch(\`\${BASE_URL}/api/v2/balance\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_email: userEmail }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    if (error.authorization_required) {
      throw new Error('User has not authorized this app');
    }
    throw new Error(error.message);
  }
  
  return response.json();
}

// Debit credits
async function debitCredits(userEmail, amountCents, description) {
  const response = await fetch(\`\${BASE_URL}/api/v2/debit\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_email: userEmail,
      amount_cents: amountCents,
      description: description,
      idempotency_key: \`\${Date.now()}-\${Math.random()}\`,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return response.json();
}

// Usage
async function handlePremiumFeature(userEmail) {
  try {
    // Check if user has enough credits
    const { balance_cents } = await checkBalance(userEmail);
    
    if (balance_cents < 50) {
      return { error: 'Insufficient credits' };
    }
    
    // Debit 50 cents for the feature
    const result = await debitCredits(userEmail, 50, 'Premium feature access');
    
    return { success: true, newBalance: result.new_balance_cents };
  } catch (error) {
    return { error: error.message };
  }
}`}
                    language="javascript"
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-medium">Python</h3>
                  <CodeBlock
                    code={`import os
import requests

API_KEY = os.environ.get('CREDITS_HUB_API_KEY')
BASE_URL = 'https://your-domain.com'

def check_balance(user_email: str) -> dict:
    """Check a user's credit balance."""
    response = requests.post(
        f'{BASE_URL}/api/v2/balance',
        headers={
            'Authorization': f'Bearer {API_KEY}',
            'Content-Type': 'application/json',
        },
        json={'user_email': user_email},
    )
    
    if not response.ok:
        error = response.json()
        if error.get('authorization_required'):
            raise Exception('User has not authorized this app')
        raise Exception(error.get('message', 'Unknown error'))
    
    return response.json()


def debit_credits(user_email: str, amount_cents: int, description: str) -> dict:
    """Debit credits from a user's account."""
    response = requests.post(
        f'{BASE_URL}/api/v2/debit',
        headers={
            'Authorization': f'Bearer {API_KEY}',
            'Content-Type': 'application/json',
        },
        json={
            'user_email': user_email,
            'amount_cents': amount_cents,
            'description': description,
        },
    )
    
    if not response.ok:
        error = response.json()
        raise Exception(error.get('message', 'Unknown error'))
    
    return response.json()


# Usage example
def handle_premium_feature(user_email: str):
    try:
        # Check balance
        balance = check_balance(user_email)
        
        if balance['balance_cents'] < 50:
            return {'error': 'Insufficient credits'}
        
        # Charge 50 cents
        result = debit_credits(user_email, 50, 'Premium feature access')
        
        return {'success': True, 'new_balance': result['new_balance_cents']}
    except Exception as e:
        return {'error': str(e)}`}
                    language="python"
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-medium">cURL</h3>
                  <CodeBlock
                    code={`# Check balance
curl -X POST "https://your-domain.com/api/v2/balance" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"user_email": "user@example.com"}'

# Debit credits
curl -X POST "https://your-domain.com/api/v2/debit" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_email": "user@example.com",
    "amount_cents": 100,
    "description": "API usage charge"
  }'`}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Best Practices
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Always check balance before debiting</p>
                      <p className="text-xs text-muted-foreground">
                        Verify the user has sufficient credits to avoid declined transactions.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Use idempotency keys for debits</p>
                      <p className="text-xs text-muted-foreground">
                        Prevent duplicate charges by using unique transaction IDs.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Handle authorization errors gracefully</p>
                      <p className="text-xs text-muted-foreground">
                        If a user hasn't authorized your app, direct them to connect via their dashboard.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Store API keys securely</p>
                      <p className="text-xs text-muted-foreground">
                        Never expose your API key in client-side code or version control.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
