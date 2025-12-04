import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Redirect, Link } from "wouter";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  AppWindow,
  Activity,
  Plus,
  Search,
  Shield,
  Copy,
  Check,
  Loader2,
  Eye,
  DollarSign,
  Key,
  Trash2,
  AlertTriangle,
  BookOpen,
  Code,
  ExternalLink,
  Terminal,
  ArrowRight,
  Edit,
  Globe,
} from "lucide-react";
import type { User, App, Wallet } from "@shared/schema";

interface AppApiKey {
  id: string;
  appId: string;
  appName: string;
  appSlug: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  totalApps: number;
  totalBalance: number;
  totalTransactions: number;
}

interface UserWithWallet extends User {
  wallet?: Wallet | null;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function StatsCards({ stats, isLoading }: { stats?: AdminStats; isLoading: boolean }) {
  const items = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users },
    { label: "Registered Apps", value: stats?.totalApps ?? 0, icon: AppWindow },
    { label: "Total Balance", value: formatCurrency(stats?.totalBalance ?? 0), icon: Activity },
    { label: "Transactions", value: stats?.totalTransactions ?? 0, icon: Activity },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-6 w-16" />
                ) : (
                  <p className="text-xl font-semibold tabular-nums">{item.value}</p>
                )}
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithWallet | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  const { data: users, isLoading } = useQuery<UserWithWallet[]>({
    queryKey: ["/api/admin/users"],
  });

  const creditMutation = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(parseFloat(creditAmount) * 100);
      return apiRequest("POST", "/api/admin/credit-user", {
        userId: selectedUser?.id,
        amountCents,
        reason: creditReason || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Credits added",
        description: `Successfully credited $${creditAmount} to ${selectedUser?.email}`,
      });
      setCreditDialogOpen(false);
      setSelectedUser(null);
      setCreditAmount("");
      setCreditReason("");
    },
    onError: (error) => {
      toast({
        title: "Failed to credit user",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleOpenCreditDialog = (user: UserWithWallet) => {
    setSelectedUser(user);
    setCreditAmount("");
    setCreditReason("");
    setCreditDialogOpen(true);
  };

  const filteredUsers = users?.filter(
    (user) =>
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      user.fullName?.toLowerCase().includes(search.toLowerCase())
  );

  const isValidAmount = creditAmount && parseFloat(creditAmount) > 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>Manage platform users</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-users"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium" data-testid={`user-email-${user.id}`}>
                          {user.email}
                        </p>
                        {user.fullName && (
                          <p className="text-sm text-muted-foreground">{user.fullName}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(user.wallet?.balanceCents ?? 0)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.twoFactorEnabled ? "default" : "secondary"}>
                        {user.twoFactorEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isAdmin ? "default" : "outline"}>
                        {user.isAdmin ? (
                          <>
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </>
                        ) : (
                          "User"
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                      }).format(new Date(user.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenCreditDialog(user)}
                        data-testid={`button-credit-user-${user.id}`}
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Credit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Credit User Account</DialogTitle>
            <DialogDescription>
              Add credits directly to {selectedUser?.email}'s wallet. This bypasses payment processing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Balance</Label>
              <p className="text-lg font-semibold tabular-nums">
                {formatCurrency(selectedUser?.wallet?.balanceCents ?? 0)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit-amount">Amount to Credit (USD)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="credit-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  className="pl-9"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  data-testid="input-credit-amount"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit-reason">Reason (Optional)</Label>
              <Textarea
                id="credit-reason"
                placeholder="e.g., Promotional credit, Refund, Customer support..."
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                data-testid="input-credit-reason"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => creditMutation.mutate()}
              disabled={!isValidAmount || creditMutation.isPending}
              data-testid="button-confirm-credit"
            >
              {creditMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Credit ${creditAmount || "0.00"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AppsTab() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewCredentials, setViewCredentials] = useState<App | null>(null);
  const [editApp, setEditApp] = useState<App | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    callbackUrl: "",
    additionalCallbackUrls: [""],
    pricingModel: "per_call",
  });

  const [editFormData, setEditFormData] = useState({
    callbackUrl: "",
    additionalCallbackUrls: [""] as string[],
    description: "",
    pricingModel: "",
  });

  const { data: apps, isLoading } = useQuery<App[]>({
    queryKey: ["/api/admin/apps"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const allCallbackUrls = [
        formData.callbackUrl,
        ...formData.additionalCallbackUrls.filter(url => url.trim())
      ].filter((url, idx, arr) => url && arr.indexOf(url) === idx);
      
      return apiRequest("POST", "/api/admin/apps", {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        callbackUrl: formData.callbackUrl,
        allowedCallbackUrls: allCallbackUrls,
        pricingModel: formData.pricingModel,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "App created", description: "The new app has been registered." });
      setCreateDialogOpen(false);
      setFormData({
        name: "",
        slug: "",
        description: "",
        callbackUrl: "",
        additionalCallbackUrls: [""],
        pricingModel: "per_call",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create app",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editApp) throw new Error("No app selected");
      const allCallbackUrls = [
        editFormData.callbackUrl,
        ...editFormData.additionalCallbackUrls.filter(url => url.trim())
      ].filter((url, idx, arr) => url && arr.indexOf(url) === idx);
      
      return apiRequest("PATCH", `/api/admin/apps/${editApp.id}`, {
        callbackUrl: editFormData.callbackUrl,
        allowedCallbackUrls: allCallbackUrls,
        description: editFormData.description,
        pricingModel: editFormData.pricingModel,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/apps"] });
      toast({ title: "App updated", description: "The app settings have been saved." });
      setEditApp(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to update app",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const openEditDialog = (app: App) => {
    const additionalUrls = (app.allowedCallbackUrls || []).filter(url => url !== app.callbackUrl);
    setEditFormData({
      callbackUrl: app.callbackUrl,
      additionalCallbackUrls: additionalUrls.length > 0 ? additionalUrls : [""],
      description: app.description || "",
      pricingModel: app.pricingModel,
    });
    setEditApp(app);
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Registered Apps</CardTitle>
            <CardDescription>Manage apps that use this platform</CardDescription>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-app">
                <Plus className="h-4 w-4 mr-2" />
                Register App
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Register New App</DialogTitle>
                <DialogDescription>
                  Create a new app that can use this platform for authentication and billing
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">App Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="My App"
                      data-testid="input-app-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug</Label>
                    <Input
                      id="slug"
                      value={formData.slug}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                        })
                      }
                      placeholder="my-app"
                      data-testid="input-app-slug"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe what this app does..."
                    data-testid="input-app-description"
                  />
                </div>

                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Globe className="h-4 w-4" />
                    OAuth Callback URLs
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add callback URLs for both production and development environments. The OAuth flow will accept redirects to any of these URLs.
                  </p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="callbackUrl" className="flex items-center gap-2">
                      <Badge variant="default" className="text-xs">Production</Badge>
                      Callback URL
                    </Label>
                    <Input
                      id="callbackUrl"
                      value={formData.callbackUrl}
                      onChange={(e) => setFormData({ ...formData, callbackUrl: e.target.value })}
                      placeholder="https://yourapp.com/api/auth/callback"
                      data-testid="input-app-callback"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your live production domain (e.g., https://yourapp.com/api/auth/callback)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">Development</Badge>
                        Additional URLs
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFormData({
                          ...formData,
                          additionalCallbackUrls: [...formData.additionalCallbackUrls, ""]
                        })}
                        data-testid="button-add-callback-url"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add URL
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Add your Replit dev URL or staging environment URLs for testing
                    </p>
                    {formData.additionalCallbackUrls.map((url, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={url}
                          onChange={(e) => {
                            const newUrls = [...formData.additionalCallbackUrls];
                            newUrls[index] = e.target.value;
                            setFormData({ ...formData, additionalCallbackUrls: newUrls });
                          }}
                          placeholder="https://xxx.replit.dev/api/auth/callback"
                          data-testid={`input-additional-callback-${index}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newUrls = formData.additionalCallbackUrls.filter((_, i) => i !== index);
                            setFormData({
                              ...formData,
                              additionalCallbackUrls: newUrls.length > 0 ? newUrls : [""]
                            });
                          }}
                          data-testid={`button-remove-callback-${index}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Pricing Model</Label>
                  <Select
                    value={formData.pricingModel}
                    onValueChange={(v) => setFormData({ ...formData, pricingModel: v })}
                  >
                    <SelectTrigger data-testid="select-pricing-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_call">Per API Call</SelectItem>
                      <SelectItem value="per_minute">Per Minute</SelectItem>
                      <SelectItem value="per_request">Per Request</SelectItem>
                      <SelectItem value="subscription">Subscription</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={
                    !formData.name ||
                    !formData.slug ||
                    !formData.description ||
                    !formData.callbackUrl ||
                    createMutation.isPending
                  }
                  data-testid="button-confirm-create-app"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Register App
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps?.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                          <AppWindow className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`app-name-${app.id}`}>
                            {app.name}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                            {app.description}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm">{app.slug}</code>
                    </TableCell>
                    <TableCell>{app.pricingModel.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge variant={app.isActive ? "default" : "secondary"}>
                        {app.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(app)}
                          data-testid={`button-edit-app-${app.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewCredentials(app)}
                          data-testid={`button-view-credentials-${app.id}`}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Credentials
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {apps?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No apps registered yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewCredentials} onOpenChange={(open) => !open && setViewCredentials(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>App Credentials</DialogTitle>
            <DialogDescription>
              Use these credentials to integrate {viewCredentials?.name} with this platform
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Client ID</Label>
              <div className="flex gap-2">
                <Input
                  value={viewCredentials?.clientId || ""}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(viewCredentials?.clientId || "", "clientId")}
                >
                  {copiedField === "clientId" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Client Secret</Label>
              <div className="flex gap-2">
                <Input
                  value={viewCredentials?.clientSecret || ""}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(viewCredentials?.clientSecret || "", "clientSecret")}
                >
                  {copiedField === "clientSecret" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Callback URL</Label>
              <Input value={viewCredentials?.callbackUrl || ""} readOnly />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editApp} onOpenChange={(open) => !open && setEditApp(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit App Settings</DialogTitle>
            <DialogDescription>
              Update settings for {editApp?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe className="h-4 w-4" />
                OAuth Callback URLs
              </div>
              <p className="text-xs text-muted-foreground">
                Add callback URLs for both production and development environments.
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="edit-callback-url" className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">Production</Badge>
                  Callback URL
                </Label>
                <Input
                  id="edit-callback-url"
                  value={editFormData.callbackUrl}
                  onChange={(e) => setEditFormData({ ...editFormData, callbackUrl: e.target.value })}
                  placeholder="https://yourapp.com/api/auth/callback"
                  data-testid="input-edit-callback-url"
                />
                <p className="text-xs text-muted-foreground">
                  Your live production domain
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Development</Badge>
                    Additional URLs
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditFormData({
                      ...editFormData,
                      additionalCallbackUrls: [...editFormData.additionalCallbackUrls, ""]
                    })}
                    data-testid="button-edit-add-callback-url"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add URL
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add your Replit dev URL or staging environment URLs
                </p>
                {editFormData.additionalCallbackUrls.map((url, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={url}
                      onChange={(e) => {
                        const newUrls = [...editFormData.additionalCallbackUrls];
                        newUrls[index] = e.target.value;
                        setEditFormData({ ...editFormData, additionalCallbackUrls: newUrls });
                      }}
                      placeholder="https://xxx.replit.dev/api/auth/callback"
                      data-testid={`input-edit-additional-callback-${index}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newUrls = editFormData.additionalCallbackUrls.filter((_, i) => i !== index);
                        setEditFormData({
                          ...editFormData,
                          additionalCallbackUrls: newUrls.length > 0 ? newUrls : [""]
                        });
                      }}
                      data-testid={`button-edit-remove-callback-${index}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                placeholder="Describe what this app does..."
                data-testid="input-edit-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Pricing Model</Label>
              <Select
                value={editFormData.pricingModel}
                onValueChange={(value) => setEditFormData({ ...editFormData, pricingModel: value })}
                data-testid="select-edit-pricing-model"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_call">Per API Call</SelectItem>
                  <SelectItem value="per_minute">Per Minute</SelectItem>
                  <SelectItem value="per_request">Per Request</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              onClick={() => updateMutation.mutate()}
              disabled={!editFormData.callbackUrl || updateMutation.isPending}
              data-testid="button-save-app-changes"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CodeBlock({ code, language = "javascript", testId }: { code: string; language?: string; testId?: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="p-4 rounded-lg bg-muted/50 border overflow-x-auto text-sm" data-testid={testId ? `code-${testId}` : undefined}>
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2"
        onClick={copyToClipboard}
        data-testid={testId ? `button-copy-${testId}` : "button-copy-code"}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function IntegrationGuideTab() {
  const { toast } = useToast();
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: apps, isLoading } = useQuery<App[]>({
    queryKey: ["/api/admin/apps"],
  });

  const selectedApp = apps?.find((app) => app.id === selectedAppId);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getNodeJsExample = (app: App) => `// Work Digital SSO Integration - ${app.name}
// Install: npm install crypto

const crypto = require('crypto');

// Configuration
const CLIENT_ID = '${app.clientId}';
const CLIENT_SECRET = '${app.clientSecret}';
const REDIRECT_URI = '${app.callbackUrl}';
const AUTH_BASE_URL = '${baseUrl}';

// Generate PKCE codes
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

// Step 1: Redirect user to authorization
function getAuthorizationUrl(state) {
  const { verifier, challenge } = generatePKCE();
  // Store verifier in session for later use
  
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'openid profile credits',
    state: state,
  });
  
  return {
    url: \`\${AUTH_BASE_URL}/oauth/authorize?\${params}\`,
    verifier, // Store this in session
  };
}

// Step 2: Exchange code for tokens
async function exchangeCodeForToken(code, codeVerifier) {
  const response = await fetch(\`\${AUTH_BASE_URL}/api/oauth/token\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: codeVerifier,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Token exchange failed');
  }
  
  return response.json();
  // Returns: { access_token, token_type, expires_in, user: { id, email, fullName } }
}

// Example Express.js callback handler
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  const codeVerifier = req.session.codeVerifier; // Retrieve stored verifier
  
  try {
    const tokens = await exchangeCodeForToken(code, codeVerifier);
    req.session.user = tokens.user;
    req.session.accessToken = tokens.access_token;
    res.redirect('/dashboard');
  } catch (error) {
    res.redirect('/login?error=auth_failed');
  }
});`;

  const getApiExample = (app: App) => `// ${app.name} - Credit Operations API
// Use your App API Key (generated in Admin > API Keys)

const API_KEY = 'your_app_api_key_here';
const BASE_URL = '${baseUrl}';

// Check user's credit balance
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
      // User hasn't authorized this app yet
      // Redirect them to: ${baseUrl}/apps to authorize
      throw new Error('User has not authorized this app');
    }
    throw new Error(error.message);
  }
  
  return response.json();
  // Returns: { user_email, balance_cents, currency, subscription_status }
}

// Debit credits from user's account
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
      idempotency_key: \`\${Date.now()}-\${Math.random().toString(36)}\`,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    if (response.status === 402) {
      throw new Error('Insufficient balance');
    }
    if (response.status === 403) {
      throw new Error('User has not authorized this app');
    }
    throw new Error(error.message);
  }
  
  return response.json();
  // Returns: { success, transaction_id, amount_cents, new_balance_cents, auto_topup }
}

// Example usage
async function handlePremiumFeature(userEmail) {
  try {
    // Check balance first
    const { balance_cents } = await checkBalance(userEmail);
    
    if (balance_cents < 100) {
      return { error: 'Insufficient credits', balance: balance_cents };
    }
    
    // Debit $1.00 (100 cents) for the feature
    const result = await debitCredits(userEmail, 100, 'Premium feature access');
    
    return { 
      success: true, 
      newBalance: result.new_balance_cents,
      transactionId: result.transaction_id,
    };
  } catch (error) {
    return { error: error.message };
  }
}`;

  const getPythonExample = (app: App) => `# ${app.name} - Python Integration
import hashlib
import base64
import secrets
import requests

# Configuration
CLIENT_ID = '${app.clientId}'
CLIENT_SECRET = '${app.clientSecret}'
REDIRECT_URI = '${app.callbackUrl}'
AUTH_BASE_URL = '${baseUrl}'

def generate_pkce():
    """Generate PKCE code verifier and challenge"""
    verifier = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b'=').decode()
    return verifier, challenge

def get_authorization_url(state):
    """Generate OAuth authorization URL with PKCE"""
    verifier, challenge = generate_pkce()
    params = {
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
        'scope': 'openid profile credits',
        'state': state,
    }
    url = f"{AUTH_BASE_URL}/oauth/authorize?" + "&".join(f"{k}={v}" for k, v in params.items())
    return url, verifier

def exchange_code_for_token(code, code_verifier):
    """Exchange authorization code for access token"""
    response = requests.post(f"{AUTH_BASE_URL}/api/oauth/token", json={
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': REDIRECT_URI,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'code_verifier': code_verifier,
    })
    response.raise_for_status()
    return response.json()

# Credit Operations with App API Key
API_KEY = 'your_app_api_key_here'

def check_balance(user_email):
    """Check user's credit balance"""
    response = requests.post(f"{AUTH_BASE_URL}/api/v2/balance",
        headers={'Authorization': f'Bearer {API_KEY}'},
        json={'user_email': user_email}
    )
    response.raise_for_status()
    return response.json()

def debit_credits(user_email, amount_cents, description):
    """Debit credits from user's account"""
    response = requests.post(f"{AUTH_BASE_URL}/api/v2/debit",
        headers={'Authorization': f'Bearer {API_KEY}'},
        json={
            'user_email': user_email,
            'amount_cents': amount_cents,
            'description': description,
            'idempotency_key': f"{secrets.token_hex(16)}",
        }
    )
    response.raise_for_status()
    return response.json()`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Integration Guide
          </CardTitle>
          <CardDescription>
            Complete setup instructions for external apps to integrate with the Work Digital membership platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Select App</Label>
            <Select value={selectedAppId} onValueChange={setSelectedAppId}>
              <SelectTrigger className="w-full" data-testid="select-integration-app">
                <SelectValue placeholder="Choose an app to view its integration guide..." />
              </SelectTrigger>
              <SelectContent>
                {apps?.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name} ({app.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {!selectedApp && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              Select an app above to view its integration guide
            </div>
          )}
        </CardContent>
      </Card>

      {selectedApp && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                {selectedApp.name} - Credentials
              </CardTitle>
              <CardDescription>
                OAuth2 credentials for Single Sign-On integration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <div className="flex gap-2">
                    <Input
                      value={selectedApp.clientId}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(selectedApp.clientId, "clientId")}
                      data-testid="button-copy-client-id"
                    >
                      {copiedField === "clientId" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <div className="flex gap-2">
                    <Input
                      value={selectedApp.clientSecret}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(selectedApp.clientSecret, "clientSecret")}
                      data-testid="button-copy-client-secret"
                    >
                      {copiedField === "clientSecret" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="font-medium" data-testid="text-oauth-endpoints">OAuth2 Endpoints</h3>
                <div className="space-y-2">
                  {[
                    { label: "Authorization URL", value: `${baseUrl}/oauth/authorize`, testId: "auth-url" },
                    { label: "Token Endpoint", value: `${baseUrl}/api/oauth/token`, testId: "token-url" },
                    { label: "User Info", value: `${baseUrl}/api/oauth/userinfo`, testId: "userinfo-url" },
                    { label: "Registered Callback", value: selectedApp.callbackUrl, testId: "callback-url" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50" data-testid={`endpoint-${item.testId}`}>
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <code className="text-xs text-muted-foreground break-all" data-testid={`text-${item.testId}`}>{item.value}</code>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(item.value, item.label)}
                        data-testid={`button-copy-${item.testId}`}
                      >
                        {copiedField === item.label ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5" />
                SSO Flow Overview
              </CardTitle>
              <CardDescription>
                OAuth 2.0 Authorization Code flow with PKCE (required)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-medium mb-1">Security Requirement</h3>
                    <p className="text-sm text-muted-foreground">
                      PKCE (Proof Key for Code Exchange) with S256 is required for all OAuth flows. 
                      This prevents authorization code interception attacks.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 text-sm">1</div>
                  <div className="space-y-1">
                    <h3 className="font-medium">User Clicks "Sign in with Work Digital"</h3>
                    <p className="text-sm text-muted-foreground">
                      Your app generates PKCE code_verifier and code_challenge, then redirects to the authorization URL
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 text-sm">2</div>
                  <div className="space-y-1">
                    <h3 className="font-medium">User Authenticates</h3>
                    <p className="text-sm text-muted-foreground">
                      User logs in (if needed) and sees the consent screen to authorize your app
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 text-sm">3</div>
                  <div className="space-y-1">
                    <h3 className="font-medium">Redirect with Authorization Code</h3>
                    <p className="text-sm text-muted-foreground">
                      User is redirected to your callback URL with <code className="px-1 bg-muted rounded">?code=xxx&state=xxx</code>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 text-sm">4</div>
                  <div className="space-y-1">
                    <h3 className="font-medium">Exchange Code for Token</h3>
                    <p className="text-sm text-muted-foreground">
                      Your server exchanges the code + code_verifier for an access token and user info
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="font-medium">Required Authorization Parameters</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Parameter</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell><code className="text-xs">client_id</code></TableCell>
                        <TableCell><Badge variant="default">Yes</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">Your app's client ID</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code className="text-xs">redirect_uri</code></TableCell>
                        <TableCell><Badge variant="default">Yes</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">Must match registered callback URL</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code className="text-xs">response_type</code></TableCell>
                        <TableCell><Badge variant="default">Yes</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">Must be "code"</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code className="text-xs">code_challenge</code></TableCell>
                        <TableCell><Badge variant="default">Yes</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">Base64url SHA256 of code_verifier</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code className="text-xs">code_challenge_method</code></TableCell>
                        <TableCell><Badge variant="default">Yes</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">Must be "S256"</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code className="text-xs">scope</code></TableCell>
                        <TableCell><Badge variant="secondary">Optional</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">Space-separated: openid, profile, credits</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code className="text-xs">state</code></TableCell>
                        <TableCell><Badge variant="secondary">Recommended</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">CSRF protection token</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                B2B Credit Operations API
              </CardTitle>
              <CardDescription>
                Use these endpoints to check balances and debit credits from authorized users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium mb-1">App API Key Required</h3>
                    <p className="text-sm text-muted-foreground">
                      These endpoints require an App API Key (not OAuth tokens). Generate one in the "API Keys" tab above.
                      Users must also authorize your app before you can access their credits.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg border" data-testid="endpoint-balance">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-green-600">POST</Badge>
                    <code className="text-sm font-semibold" data-testid="text-endpoint-balance">/api/v2/balance</code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">Check a user's credit balance</p>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Request Body:</p>
                    <CodeBlock code={`{ "user_email": "user@example.com" }`} testId="balance-request" />
                    <p className="text-xs font-medium text-muted-foreground">Response:</p>
                    <CodeBlock code={`{
  "user_email": "user@example.com",
  "balance_cents": 5000,
  "currency": "USD",
  "subscription_status": "ACTIVE"
}`} testId="balance-response" />
                  </div>
                </div>

                <div className="p-4 rounded-lg border" data-testid="endpoint-debit">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-green-600">POST</Badge>
                    <code className="text-sm font-semibold" data-testid="text-endpoint-debit">/api/v2/debit</code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">Debit credits from a user's account</p>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Request Body:</p>
                    <CodeBlock code={`{
  "user_email": "user@example.com",
  "amount_cents": 100,
  "description": "Premium feature usage",
  "idempotency_key": "unique-transaction-id"
}`} testId="debit-request" />
                    <p className="text-xs font-medium text-muted-foreground">Response:</p>
                    <CodeBlock code={`{
  "success": true,
  "transaction_id": "txn_123abc",
  "amount_cents": 100,
  "new_balance_cents": 4900,
  "auto_topup": {
    "triggered": true,
    "amount_cents": 1000
  }
}`} testId="debit-response" />
                  </div>
                </div>

                <div className="p-4 rounded-lg border" data-testid="endpoint-check-auth">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-green-600">POST</Badge>
                    <code className="text-sm font-semibold" data-testid="text-endpoint-check-auth">/api/v2/check-authorization</code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">Check if a user has authorized your app</p>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Request Body:</p>
                    <CodeBlock code={`{ "user_email": "user@example.com" }`} testId="check-auth-request" />
                    <p className="text-xs font-medium text-muted-foreground">Response:</p>
                    <CodeBlock code={`{
  "authorized": true,
  "subscription_status": "ACTIVE"
}`} testId="check-auth-response" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Code Examples
              </CardTitle>
              <CardDescription>
                Ready-to-use integration code for {selectedApp.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs defaultValue="nodejs">
                <TabsList>
                  <TabsTrigger value="nodejs" data-testid="tab-code-nodejs">Node.js</TabsTrigger>
                  <TabsTrigger value="api" data-testid="tab-code-api">API Client</TabsTrigger>
                  <TabsTrigger value="python" data-testid="tab-code-python">Python</TabsTrigger>
                </TabsList>

                <TabsContent value="nodejs" className="mt-4">
                  <div className="space-y-2">
                    <h3 className="font-medium" data-testid="text-nodejs-title">Full SSO Implementation</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Complete OAuth2 + PKCE flow with Express.js
                    </p>
                    <CodeBlock code={getNodeJsExample(selectedApp)} language="javascript" testId="nodejs-sso" />
                  </div>
                </TabsContent>

                <TabsContent value="api" className="mt-4">
                  <div className="space-y-2">
                    <h3 className="font-medium" data-testid="text-api-title">Credit Operations API Client</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      JavaScript client for balance checks and debits
                    </p>
                    <CodeBlock code={getApiExample(selectedApp)} language="javascript" testId="api-client" />
                  </div>
                </TabsContent>

                <TabsContent value="python" className="mt-4">
                  <div className="space-y-2">
                    <h3 className="font-medium" data-testid="text-python-title">Python Integration</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Full SSO and API implementation in Python
                    </p>
                    <CodeBlock code={getPythonExample(selectedApp)} language="python" testId="python" />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Error Handling & Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-medium">Common Error Codes</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell><Badge variant="outline">401</Badge></TableCell>
                        <TableCell>Invalid API Key</TableCell>
                        <TableCell className="text-sm text-muted-foreground">The API key is missing, invalid, or expired</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><Badge variant="outline">402</Badge></TableCell>
                        <TableCell>Insufficient Balance</TableCell>
                        <TableCell className="text-sm text-muted-foreground">User doesn't have enough credits for the debit</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><Badge variant="outline">403</Badge></TableCell>
                        <TableCell>Not Authorized</TableCell>
                        <TableCell className="text-sm text-muted-foreground">User hasn't authorized this app - redirect them to authorize</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><Badge variant="outline">404</Badge></TableCell>
                        <TableCell>User Not Found</TableCell>
                        <TableCell className="text-sm text-muted-foreground">No user with this email exists in the system</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><Badge variant="outline">409</Badge></TableCell>
                        <TableCell>Duplicate Transaction</TableCell>
                        <TableCell className="text-sm text-muted-foreground">An idempotency_key was reused</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="font-medium">Security Best Practices</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <h4 className="font-medium text-sm mb-1">Store Keys Securely</h4>
                    <p className="text-xs text-muted-foreground">
                      Never expose API keys in client-side code or version control
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <h4 className="font-medium text-sm mb-1">Use HTTPS</h4>
                    <p className="text-xs text-muted-foreground">
                      All API requests must be made over HTTPS
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <h4 className="font-medium text-sm mb-1">Validate State Parameter</h4>
                    <p className="text-xs text-muted-foreground">
                      Always validate the state parameter in OAuth callbacks
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <h4 className="font-medium text-sm mb-1">Use Idempotency Keys</h4>
                    <p className="text-xs text-muted-foreground">
                      Prevent duplicate charges by using unique idempotency keys
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function AppApiKeysTab() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    appId: "",
    name: "",
    scopes: ["balance:read", "credits:debit"],
    expiresInDays: 0,
  });

  const { data: apps } = useQuery<App[]>({
    queryKey: ["/api/admin/apps"],
  });

  const { data: apiKeys, isLoading } = useQuery<AppApiKey[]>({
    queryKey: ["/api/admin/app-api-keys"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/app-api-keys", {
        appId: formData.appId,
        name: formData.name,
        scopes: formData.scopes,
        expiresInDays: formData.expiresInDays > 0 ? formData.expiresInDays : undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/app-api-keys"] });
      setNewApiKey(data.key);
      setCreateDialogOpen(false);
      setNewKeyDialogOpen(true);
      setFormData({
        appId: "",
        name: "",
        scopes: ["balance:read", "credits:debit"],
        expiresInDays: 0,
      });
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
      return apiRequest("DELETE", `/api/admin/app-api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/app-api-keys"] });
      toast({ title: "API key revoked" });
      setDeleteConfirmId(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to revoke API key",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const toggleScope = (scope: string) => {
    setFormData((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>App API Keys</CardTitle>
            <CardDescription>
              Manage API keys for external apps to access user credits
            </CardDescription>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-api-key">
                <Plus className="h-4 w-4 mr-2" />
                Create API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create App API Key</DialogTitle>
                <DialogDescription>
                  Generate an API key for an app to use the V2 API endpoints
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Select App</Label>
                  <Select
                    value={formData.appId}
                    onValueChange={(v) => setFormData({ ...formData, appId: v })}
                  >
                    <SelectTrigger data-testid="select-app">
                      <SelectValue placeholder="Choose an app..." />
                    </SelectTrigger>
                    <SelectContent>
                      {apps?.map((app) => (
                        <SelectItem key={app.id} value={app.id}>
                          {app.name} ({app.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="key-name">Key Name</Label>
                  <Input
                    id="key-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Production API Key"
                    data-testid="input-api-key-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Scopes</Label>
                  <div className="flex flex-wrap gap-2">
                    {["balance:read", "credits:debit"].map((scope) => (
                      <Badge
                        key={scope}
                        variant={formData.scopes.includes(scope) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleScope(scope)}
                        data-testid={`badge-scope-${scope.replace(":", "-")}`}
                      >
                        {scope}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click to toggle scopes. balance:read allows checking user balance, credits:debit allows debiting credits.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expires">Expires In (Days)</Label>
                  <Input
                    id="expires"
                    type="number"
                    min="0"
                    value={formData.expiresInDays || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, expiresInDays: parseInt(e.target.value) || 0 })
                    }
                    placeholder="0 for no expiration"
                    data-testid="input-expires-days"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty or 0 for keys that never expire
                  </p>
                </div>

                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={
                    !formData.appId ||
                    !formData.name ||
                    formData.scopes.length === 0 ||
                    createMutation.isPending
                  }
                  data-testid="button-confirm-create-api-key"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create API Key
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Key Name</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys?.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{key.appName}</p>
                        <p className="text-xs text-muted-foreground">{key.appSlug}</p>
                      </div>
                    </TableCell>
                    <TableCell>{key.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{key.keyPrefix}...</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.lastUsedAt
                        ? new Intl.DateTimeFormat("en-US", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(key.lastUsedAt))
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.expiresAt
                        ? new Intl.DateTimeFormat("en-US", {
                            dateStyle: "medium",
                          }).format(new Date(key.expiresAt))
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      {deleteConfirmId === key.id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteMutation.mutate(key.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-confirm-revoke-${key.id}`}
                          >
                            {deleteMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Confirm"
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(key.id)}
                          data-testid={`button-revoke-${key.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {apiKeys?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No API keys created yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={newKeyDialogOpen} onOpenChange={setNewKeyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Make sure to copy your API key now. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 text-amber-600 rounded-lg">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">
                Store this key securely. It provides access to user credit operations.
              </p>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={newApiKey || ""}
                  readOnly
                  className="font-mono text-sm"
                  data-testid="input-new-api-key"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(newApiKey || "")}
                  data-testid="button-copy-api-key"
                >
                  {copiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setNewKeyDialogOpen(false);
                setNewApiKey(null);
              }}
              data-testid="button-close-api-key-dialog"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminPage() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: !!user?.isAdmin,
  });

  if (!user?.isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Admin Panel
          </h1>
          <p className="text-muted-foreground">
            Manage users, apps, and platform settings
          </p>
        </div>

        <StatsCards stats={stats} isLoading={statsLoading} />

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="users" className="gap-2" data-testid="tab-users">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="apps" className="gap-2" data-testid="tab-apps">
              <AppWindow className="h-4 w-4" />
              Apps
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="gap-2" data-testid="tab-api-keys">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="integration" className="gap-2" data-testid="tab-integration">
              <BookOpen className="h-4 w-4" />
              Integration Guide
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UsersTab />
          </TabsContent>

          <TabsContent value="apps">
            <AppsTab />
          </TabsContent>

          <TabsContent value="api-keys">
            <AppApiKeysTab />
          </TabsContent>

          <TabsContent value="integration">
            <IntegrationGuideTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
