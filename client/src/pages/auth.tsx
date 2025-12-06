import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Eye, 
  EyeOff, 
  Loader2, 
  Shield, 
  Sparkles, 
  Palette, 
  Wallet, 
  ArrowRight,
  CheckCircle2,
  Globe,
  Lock,
  Zap
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ email: "", password: "", fullName: "" });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await login(loginForm.email, loginForm.password);
      if (result.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setPendingCredentials({ email: loginForm.email, password: loginForm.password });
      } else {
        toast({ title: "Welcome back!", description: "You've successfully logged in." });
        setLocation("/dashboard");
      }
    } catch (error) {
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Please check your credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwoFactor = async () => {
    if (!pendingCredentials || totpCode.length !== 6) return;
    setIsLoading(true);

    try {
      await login(pendingCredentials.email, pendingCredentials.password, totpCode);
      toast({ title: "Welcome back!", description: "You've successfully logged in." });
      setLocation("/dashboard");
    } catch (error) {
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Invalid code",
        variant: "destructive",
      });
      setTotpCode("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await register(registerForm.email, registerForm.password, registerForm.fullName || undefined);
      toast({ title: "Account created!", description: "Welcome to Work Digital." });
      setLocation("/dashboard");
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (requiresTwoFactor) {
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
                  <Shield className="h-7 w-7 text-primary-foreground" />
                </div>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Two-Factor Authentication</h1>
              <p className="text-muted-foreground">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={totpCode}
                onChange={setTotpCode}
                data-testid="input-totp"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="space-y-3">
              <Button
                className="w-full"
                onClick={handleTwoFactor}
                disabled={isLoading || totpCode.length !== 6}
                data-testid="button-verify-totp"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setRequiresTwoFactor(false);
                  setPendingCredentials(null);
                  setTotpCode("");
                }}
                data-testid="button-back-to-login"
              >
                Back to login
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Left Side - Branding & Benefits */}
      <div className="lg:w-1/2 bg-primary text-primary-foreground p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <Globe className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Work Digital</span>
          </div>

          {/* Hero Text */}
          <div className="space-y-4 mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight tracking-tight">
              One Account,<br />
              All Your Credits
            </h1>
            <p className="text-lg text-primary-foreground/80 max-w-md">
              Fund your Work Digital account once and use credits across all our powerful platforms.
            </p>
          </div>

          {/* Connected Apps */}
          <div className="space-y-6">
            <p className="text-sm font-medium uppercase tracking-wider text-primary-foreground/60">
              Unlock Access To
            </p>

            {/* WorkDigitalAI Card */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">WorkDigitalAI.com</h3>
                    <ArrowRight className="h-4 w-4 text-primary-foreground/60" />
                  </div>
                  <p className="text-sm text-primary-foreground/70">
                    AI-powered content generation, automation workflows, and intelligent business tools.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> AI Content Writer
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Smart Automation
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Data Analysis
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* WorkDigitalBrand Card */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600">
                  <Palette className="h-6 w-6 text-white" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">WorkDigitalBrand.com</h3>
                    <ArrowRight className="h-4 w-4 text-primary-foreground/60" />
                  </div>
                  <p className="text-sm text-primary-foreground/70">
                    Professional brand identity, logo design, and marketing asset creation platform.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Logo Design
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Brand Kit
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Marketing Assets
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Features */}
        <div className="relative z-10 mt-12 pt-8 border-t border-white/20">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <Lock className="h-5 w-5 mx-auto mb-2 text-primary-foreground/80" />
              <p className="text-xs font-medium">Bank-Grade Security</p>
            </div>
            <div className="text-center">
              <Wallet className="h-5 w-5 mx-auto mb-2 text-primary-foreground/80" />
              <p className="text-xs font-medium">Unified Balance</p>
            </div>
            <div className="text-center">
              <Zap className="h-5 w-5 mx-auto mb-2 text-primary-foreground/80" />
              <p className="text-xs font-medium">Instant Access</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center space-y-2 mb-8">
            <div className="flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Globe className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-auth-title">
              Work Digital
            </h1>
            <p className="text-sm text-muted-foreground">
              Client Credit Portal
            </p>
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:block space-y-2">
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-auth-title">
              Welcome
            </h2>
            <p className="text-muted-foreground">
              Sign in to your account or create a new one to get started.
            </p>
          </div>

          <Card className="border-0 shadow-lg lg:shadow-xl">
            <CardContent className="p-6 lg:p-8">
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login" data-testid="tab-login">Sign in</TabsTrigger>
                  <TabsTrigger value="register" data-testid="tab-register">Create account</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@example.com"
                        value={loginForm.email}
                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                        required
                        className="h-11"
                        data-testid="input-login-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                          required
                          className="h-11 pr-10"
                          data-testid="input-login-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-11 w-11"
                          onClick={() => setShowPassword(!showPassword)}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={isLoading} data-testid="button-login">
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign in
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register" className="space-y-4">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-name">Full Name</Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="John Doe"
                        value={registerForm.fullName}
                        onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                        className="h-11"
                        data-testid="input-register-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="you@example.com"
                        value={registerForm.email}
                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                        required
                        className="h-11"
                        data-testid="input-register-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="register-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Create a strong password"
                          value={registerForm.password}
                          onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                          required
                          className="h-11 pr-10"
                          data-testid="input-register-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-11 w-11"
                          onClick={() => setShowPassword(!showPassword)}
                          data-testid="button-toggle-password-register"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Must be at least 8 characters
                      </p>
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={isLoading} data-testid="button-register">
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create account
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            By continuing, you agree to Work Digital's{" "}
            <a href="#" className="font-medium text-primary hover:underline">Terms of Service</a>
            {" "}and{" "}
            <a href="#" className="font-medium text-primary hover:underline">Privacy Policy</a>
          </p>

          <p className="text-center text-xs text-muted-foreground">
            Powered by{" "}
            <a 
              href="https://www.workdigital.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Work Digital LLC
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
