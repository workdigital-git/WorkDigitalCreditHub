import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Shield,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Key,
  Wallet,
  Eye,
  CreditCard,
} from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
  totpCode: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface OAuthParams {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope?: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
}

interface AppInfo {
  id: number;
  name: string;
  description: string;
  logoUrl?: string;
}

function parseOAuthParams(): OAuthParams | null {
  const params = new URLSearchParams(window.location.search);
  const client_id = params.get("client_id");
  const redirect_uri = params.get("redirect_uri");
  const response_type = params.get("response_type");
  const code_challenge = params.get("code_challenge");
  const code_challenge_method = params.get("code_challenge_method");

  if (!client_id || !redirect_uri || !response_type || !code_challenge || !code_challenge_method) {
    return null;
  }

  return {
    client_id,
    redirect_uri,
    response_type,
    scope: params.get("scope") || undefined,
    state: params.get("state") || undefined,
    code_challenge,
    code_challenge_method,
  };
}

function LoginStep({ 
  onSuccess, 
  oauthParams,
  appInfo,
}: { 
  onSuccess: () => void;
  oauthParams: OAuthParams;
  appInfo: AppInfo | null;
}) {
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<string | null>(null);
  const [tempToken, setTempToken] = useState<string | null>(null);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      totpCode: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          requires2FA && tempToken
            ? { email: data.email, password: data.password, tempToken, totpCode: data.totpCode }
            : { email: data.email, password: data.password }
        ),
      });
      
      const responseData = await response.json();
      if (!response.ok && !responseData.requires2FA) {
        throw new Error(responseData.message || "Login failed");
      }
      return responseData;
    },
    onSuccess: async (response: any) => {
      if (response.requires2FA) {
        setRequires2FA(true);
        setTwoFAMethod(response.method);
        setTempToken(response.tempToken);
        toast({
          title: "Two-factor authentication required",
          description: response.method === "SMS" 
            ? "A code has been sent to your phone" 
            : "Enter the code from your authenticator app",
        });
        return;
      }

      await refreshUser();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle>Sign in to Work Digital</CardTitle>
        <CardDescription>
          {appInfo ? (
            <>
              <span className="font-medium text-foreground">{appInfo.name}</span> wants to access your account
            </>
          ) : (
            "Sign in to continue with authorization"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="you@example.com"
                      data-testid="input-oauth-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder="Enter your password"
                      data-testid="input-oauth-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {requires2FA && (
              <FormField
                control={form.control}
                name="totpCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {twoFAMethod === "SMS" ? "SMS Code" : "Authenticator Code"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                        data-testid="input-oauth-2fa"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
              data-testid="button-oauth-login"
            >
              {loginMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {requires2FA ? "Verify" : "Sign In"}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don't have an account?{" "}
          <a href="/auth" className="text-primary hover:underline">
            Sign up
          </a>
        </p>
      </CardFooter>
    </Card>
  );
}

function ConsentStep({
  oauthParams,
  appInfo,
  onAuthorize,
  onCancel,
  isAuthorizing,
}: {
  oauthParams: OAuthParams;
  appInfo: AppInfo;
  onAuthorize: () => void;
  onCancel: () => void;
  isAuthorizing: boolean;
}) {
  const scopes = oauthParams.scope?.split(" ") || ["openid", "profile", "credits"];

  const scopeDescriptions: Record<string, { icon: React.ReactNode; label: string; description: string }> = {
    openid: {
      icon: <Key className="h-4 w-4" />,
      label: "OpenID",
      description: "Verify your identity",
    },
    profile: {
      icon: <Eye className="h-4 w-4" />,
      label: "Profile",
      description: "Read your profile information (name, email)",
    },
    credits: {
      icon: <Wallet className="h-4 w-4" />,
      label: "Credits",
      description: "Check your credit balance",
    },
    "credits:debit": {
      icon: <CreditCard className="h-4 w-4" />,
      label: "Debit Credits",
      description: "Charge your account for services",
    },
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center items-center gap-4 mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <div className="flex h-6 w-6 items-center justify-center">
            <Shield className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            {appInfo.logoUrl ? (
              <img src={appInfo.logoUrl} alt={appInfo.name} className="h-10 w-10 rounded-full" />
            ) : (
              <span className="text-xl font-bold text-muted-foreground">
                {appInfo.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>
        <CardTitle>Authorize {appInfo.name}</CardTitle>
        <CardDescription>
          This application wants to access your Work Digital account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">This will allow {appInfo.name} to:</p>
          <div className="space-y-2">
            {scopes.map((scope) => {
              const info = scopeDescriptions[scope] || {
                icon: <CheckCircle2 className="h-4 w-4" />,
                label: scope,
                description: `Access ${scope}`,
              };
              return (
                <div key={scope} className="flex items-start gap-3 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted shrink-0">
                    {info.icon}
                  </div>
                  <div>
                    <p className="font-medium">{info.label}</p>
                    <p className="text-muted-foreground text-xs">{info.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              By authorizing, you allow this app to access your credits. You can revoke access anytime from your Services page.
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button
          className="w-full"
          onClick={onAuthorize}
          disabled={isAuthorizing}
          data-testid="button-oauth-authorize"
        >
          {isAuthorizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Authorize {appInfo.name}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={onCancel}
          disabled={isAuthorizing}
          data-testid="button-oauth-cancel"
        >
          Cancel
        </Button>
      </CardFooter>
    </Card>
  );
}

function ErrorState({ message, redirectUri }: { message: string; redirectUri?: string }) {
  const handleCancel = () => {
    if (redirectUri) {
      const url = new URL(redirectUri);
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("error_description", message);
      window.location.href = url.toString();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>
        <CardTitle>Authorization Error</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button className="w-full" onClick={handleCancel} data-testid="button-oauth-error-cancel">
          Go Back
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function OAuthAuthorizePage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [oauthParams, setOAuthParams] = useState<OAuthParams | null>(null);
  const [step, setStep] = useState<"loading" | "login" | "consent" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const params = parseOAuthParams();
    if (!params) {
      setErrorMessage("Missing required OAuth parameters. Please check client_id, redirect_uri, response_type, code_challenge, and code_challenge_method.");
      setStep("error");
      return;
    }
    if (params.response_type !== "code") {
      setErrorMessage("Only response_type=code is supported");
      setStep("error");
      return;
    }
    if (params.code_challenge_method !== "S256") {
      setErrorMessage("Only code_challenge_method=S256 is supported");
      setStep("error");
      return;
    }
    setOAuthParams(params);
  }, []);

  const { data: appInfo, isLoading: isAppLoading, error: appError } = useQuery<AppInfo>({
    queryKey: ["/api/oauth/app-info", oauthParams?.client_id],
    queryFn: async () => {
      const response = await fetch(`/api/oauth/app-info?client_id=${oauthParams?.client_id}`);
      if (!response.ok) {
        throw new Error("Invalid client_id");
      }
      return response.json();
    },
    enabled: !!oauthParams?.client_id,
  });

  useEffect(() => {
    if (!oauthParams) return;
    if (isAuthLoading || isAppLoading) {
      setStep("loading");
      return;
    }
    if (appError) {
      setErrorMessage("Unknown application. The client_id is not registered.");
      setStep("error");
      return;
    }
    if (!user) {
      setStep("login");
      return;
    }
    setStep("consent");
  }, [user, isAuthLoading, isAppLoading, appError, oauthParams]);

  const authorizeMutation = useMutation({
    mutationFn: async () => {
      const searchParams = new URLSearchParams({
        client_id: oauthParams!.client_id,
        redirect_uri: oauthParams!.redirect_uri,
        response_type: oauthParams!.response_type,
        code_challenge: oauthParams!.code_challenge,
        code_challenge_method: oauthParams!.code_challenge_method,
        ...(oauthParams!.scope && { scope: oauthParams!.scope }),
        ...(oauthParams!.state && { state: oauthParams!.state }),
      });

      const response = await fetch(`/api/oauth/authorize?${searchParams.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error_description || "Authorization failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      window.location.href = data.redirect_uri;
    },
    onError: (error: any) => {
      toast({
        title: "Authorization failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCancel = () => {
    if (oauthParams?.redirect_uri) {
      const url = new URL(oauthParams.redirect_uri);
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("error_description", "User denied the authorization request");
      if (oauthParams.state) {
        url.searchParams.set("state", oauthParams.state);
      }
      window.location.href = url.toString();
    } else {
      setLocation("/");
    }
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <ErrorState message={errorMessage} redirectUri={oauthParams?.redirect_uri} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {step === "login" && oauthParams && (
        <LoginStep
          oauthParams={oauthParams}
          appInfo={appInfo || null}
          onSuccess={() => setStep("consent")}
        />
      )}

      {step === "consent" && oauthParams && appInfo && (
        <ConsentStep
          oauthParams={oauthParams}
          appInfo={appInfo}
          onAuthorize={() => authorizeMutation.mutate()}
          onCancel={handleCancel}
          isAuthorizing={authorizeMutation.isPending}
        />
      )}
    </div>
  );
}
