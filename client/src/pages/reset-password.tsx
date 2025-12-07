import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest } from "@/lib/queryClient";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get("token");
    setToken(resetToken);
    
    if (!resetToken) {
      setIsValidating(false);
      setIsTokenValid(false);
      return;
    }

    const validateToken = async () => {
      try {
        const response = await fetch("/api/auth/verify-reset-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken }),
        });
        const data = await response.json();
        setIsTokenValid(data.valid === true);
      } catch {
        setIsTokenValid(false);
      } finally {
        setIsValidating(false);
      }
    };
    
    validateToken();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setIsSubmitted(true);
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Unable to reset password. The link may be expired or invalid.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!token || !isTokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-destructive" data-testid="text-error-title">
                Invalid Reset Link
              </h1>
              <p className="text-muted-foreground">
                This password reset link is invalid or has expired.
              </p>
            </div>
            <Link href="/forgot-password">
              <Button className="w-full" data-testid="button-request-new">
                Request a New Link
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500">
                  <CheckCircle2 className="h-7 w-7 text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-success-title">
                Password Reset Complete
              </h1>
              <p className="text-muted-foreground">
                Your password has been successfully reset. You can now log in with your new password.
              </p>
            </div>
            <Link href="/auth">
              <Button className="w-full" data-testid="button-go-to-login">
                Go to Login
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <div className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
                <Lock className="h-7 w-7 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Reset Your Password
            </h1>
            <p className="text-muted-foreground">
              Enter your new password below.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  data-testid="input-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                data-testid="input-confirm-password"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !password || !confirmPassword}
              data-testid="button-submit"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
            </Button>
          </form>

          <div className="text-center">
            <Link href="/auth">
              <Button 
                variant="ghost" 
                className="text-sm"
                data-testid="link-back-to-login"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
