import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  User,
  Shield,
  Key,
  Loader2,
  Copy,
  Trash2,
  Plus,
  Check,
  Eye,
  EyeOff,
  QrCode,
  Smartphone,
} from "lucide-react";
import type { ApiKey } from "@shared/schema";

interface TwoFactorSetup {
  secret: string;
  qrCode: string;
}

function ProfileTab() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [phone, setPhone] = useState(user?.phone || "");

  const updateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", "/api/user/profile", {
        fullName: fullName || undefined,
        phone: phone || undefined,
      });
    },
    onSuccess: () => {
      refreshUser();
      toast({ title: "Profile updated", description: "Your profile has been saved." });
    },
    onError: (error) => {
      toast({
        title: "Failed to update",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={user?.email || ""}
              disabled
              className="bg-muted"
              data-testid="input-email"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              data-testid="input-full-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              data-testid="input-phone"
            />
          </div>

          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            data-testid="button-save-profile"
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

function ChangePasswordForm() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  const changeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user/change-password", {
        currentPassword,
        newPassword,
      });
    },
    onSuccess: () => {
      toast({ title: "Password changed", description: "Your password has been updated." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast({
        title: "Failed to change password",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const canSubmit =
    currentPassword && newPassword && newPassword === confirmPassword && newPassword.length >= 8;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current Password</Label>
        <div className="relative">
          <Input
            id="currentPassword"
            type={showPasswords ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            data-testid="input-current-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3"
            onClick={() => setShowPasswords(!showPasswords)}
          >
            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">New Password</Label>
        <Input
          id="newPassword"
          type={showPasswords ? "text" : "password"}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          data-testid="input-new-password"
        />
        <p className="text-xs text-muted-foreground">
          Must be at least 8 characters
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm New Password</Label>
        <Input
          id="confirmPassword"
          type={showPasswords ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          data-testid="input-confirm-password"
        />
        {confirmPassword && newPassword !== confirmPassword && (
          <p className="text-xs text-destructive">Passwords do not match</p>
        )}
      </div>

      <Button
        onClick={() => changeMutation.mutate()}
        disabled={!canSubmit || changeMutation.isPending}
        data-testid="button-change-password"
      >
        {changeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Change Password
      </Button>
    </div>
  );
}

function SecurityTab() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [setupData, setSetupData] = useState<TwoFactorSetup | null>(null);
  const [verifyCode, setVerifyCode] = useState("");

  const initSetupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/2fa/setup");
      return res.json() as Promise<TwoFactorSetup>;
    },
    onSuccess: (data) => {
      setSetupData(data);
    },
    onError: (error) => {
      toast({
        title: "Failed to initialize 2FA",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const confirmSetupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user/2fa/confirm", { code: verifyCode });
    },
    onSuccess: () => {
      refreshUser();
      toast({ title: "2FA enabled", description: "Two-factor authentication is now active." });
      setSetupDialogOpen(false);
      setSetupData(null);
      setVerifyCode("");
    },
    onError: (error) => {
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Invalid code",
        variant: "destructive",
      });
      setVerifyCode("");
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user/2fa/disable");
    },
    onSuccess: () => {
      refreshUser();
      toast({ title: "2FA disabled", description: "Two-factor authentication has been turned off." });
    },
    onError: (error) => {
      toast({
        title: "Failed to disable 2FA",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleOpenSetup = () => {
    setSetupDialogOpen(true);
    initSetupMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>
            Add an extra layer of security to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Smartphone className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Authenticator App</p>
                <p className="text-sm text-muted-foreground">
                  {user?.twoFactorEnabled
                    ? "2FA is enabled on your account"
                    : "Protect your account with TOTP"}
                </p>
              </div>
            </div>
            {user?.twoFactorEnabled ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" data-testid="button-disable-2fa">
                    Disable
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will make your account less secure. Are you sure?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disableMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {disableMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Disable 2FA
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleOpenSetup} data-testid="button-enable-2fa">
                    <Shield className="h-4 w-4 mr-2" />
                    Enable
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Set up Two-Factor Authentication</DialogTitle>
                    <DialogDescription>
                      Scan the QR code with your authenticator app
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 py-4">
                    {initSetupMutation.isPending ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : setupData ? (
                      <>
                        <div className="flex justify-center">
                          <div className="p-4 bg-white rounded-lg">
                            <img
                              src={setupData.qrCode}
                              alt="2FA QR Code"
                              className="w-48 h-48"
                              data-testid="img-2fa-qrcode"
                            />
                          </div>
                        </div>
                        <div className="space-y-2 text-center">
                          <p className="text-sm text-muted-foreground">
                            Or enter this code manually:
                          </p>
                          <code className="px-3 py-1 bg-muted rounded text-sm font-mono">
                            {setupData.secret}
                          </code>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-center block">
                            Enter the 6-digit code from your app
                          </Label>
                          <div className="flex justify-center">
                            <InputOTP
                              maxLength={6}
                              value={verifyCode}
                              onChange={setVerifyCode}
                              data-testid="input-verify-2fa"
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
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => confirmSetupMutation.mutate()}
                          disabled={verifyCode.length !== 6 || confirmSetupMutation.isPending}
                          data-testid="button-confirm-2fa"
                        >
                          {confirmSetupMutation.isPending && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          Verify and Enable
                        </Button>
                      </>
                    ) : null}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session History</CardTitle>
          <CardDescription>Your recent login activity</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Session history coming soon. You can log out of all devices from your account settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ApiKeysTab() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: apiKeys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/api-keys", { name: keyName });
      return res.json() as Promise<{ key: string; apiKey: ApiKey }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setNewKeyValue(data.key);
      setKeyName("");
    },
    onError: (error) => {
      toast({
        title: "Failed to create API key",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({ title: "API key deleted", description: "The API key has been revoked." });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Manage API keys for programmatic access
            </CardDescription>
          </div>
          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              setCreateDialogOpen(open);
              if (!open) {
                setNewKeyValue(null);
                setKeyName("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-api-key">
                <Plus className="h-4 w-4 mr-2" />
                Create Key
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {newKeyValue ? "API Key Created" : "Create API Key"}
                </DialogTitle>
                <DialogDescription>
                  {newKeyValue
                    ? "Copy your new API key now. It won't be shown again."
                    : "Create a new API key for programmatic access"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {newKeyValue ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-muted rounded-md">
                      <code className="text-sm font-mono break-all">{newKeyValue}</code>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => copyToClipboard(newKeyValue, "new")}
                      data-testid="button-copy-new-key"
                    >
                      {copiedId === "new" ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy to Clipboard
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setCreateDialogOpen(false);
                        setNewKeyValue(null);
                      }}
                    >
                      Done
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="keyName">Key Name</Label>
                      <Input
                        id="keyName"
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                        placeholder="e.g., Production API"
                        data-testid="input-key-name"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => createMutation.mutate()}
                      disabled={!keyName || createMutation.isPending}
                      data-testid="button-confirm-create-key"
                    >
                      {createMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Create API Key
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : apiKeys && apiKeys.length > 0 ? (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Key className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium" data-testid={`api-key-name-${key.id}`}>
                        {key.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {key.keyPrefix}... • Created{" "}
                        {new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                        }).format(new Date(key.createdAt))}
                      </p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-key-${key.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will immediately revoke access for any applications using this key.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(key.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Revoke Key
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mx-auto mb-4">
                <Key className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No API keys</p>
              <p className="text-sm text-muted-foreground">
                Create an API key to access your account programmatically
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Documentation</CardTitle>
          <CardDescription>Learn how to use the API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Use your API key in the <code className="px-1 py-0.5 bg-muted rounded">Authorization</code> header:
          </p>
          <pre className="p-3 bg-muted rounded-md overflow-x-auto">
            <code>Authorization: Bearer your-api-key</code>
          </pre>
          <p>
            Available endpoints for credit balance checks, debits, and more are documented in our
            developer portal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Settings
          </h1>
          <p className="text-muted-foreground">
            Manage your account settings and preferences
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="gap-2" data-testid="tab-profile">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2" data-testid="tab-security">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="gap-2" data-testid="tab-api-keys">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">API Keys</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab />
          </TabsContent>

          <TabsContent value="security">
            <SecurityTab />
          </TabsContent>

          <TabsContent value="api-keys">
            <ApiKeysTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
