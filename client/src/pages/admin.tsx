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
  FileJson,
  Info,
  CreditCard,
  HeartPulse,
  RefreshCw,
  Mail,
  Send,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

function StatsCards({ 
  stats, 
  isLoading, 
  onNavigate 
}: { 
  stats?: AdminStats; 
  isLoading: boolean;
  onNavigate: (tab: string) => void;
}) {
  const items = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, tab: "users" },
    { label: "Registered Apps", value: stats?.totalApps ?? 0, icon: AppWindow, tab: "apps" },
    { label: "Total Balance", value: formatCurrency(stats?.totalBalance ?? 0), icon: DollarSign, tab: "payment-gateways" },
    { label: "Transactions", value: stats?.totalTransactions ?? 0, icon: Activity, tab: "users" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card 
          key={item.label} 
          className="cursor-pointer transition-colors hover-elevate"
          onClick={() => onNavigate(item.tab)}
          data-testid={`stat-card-${item.tab}`}
        >
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithWallet | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [editForm, setEditForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    isAdmin: false,
  });

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

  const editMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/admin/users/${selectedUser?.id}`, {
        fullName: editForm.fullName || null,
        email: editForm.email,
        phone: editForm.phone || null,
        isAdmin: editForm.isAdmin,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User updated",
        description: `Successfully updated ${selectedUser?.email}`,
      });
      setEditDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to update user",
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

  const handleOpenEditDialog = (user: UserWithWallet) => {
    setSelectedUser(user);
    setEditForm({
      fullName: user.fullName || "",
      email: user.email,
      phone: user.phone || "",
      isAdmin: user.isAdmin,
    });
    setEditDialogOpen(true);
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
                  <TableHead>Phone</TableHead>
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
                    <TableCell className="text-muted-foreground" data-testid={`user-phone-${user.id}`}>
                      {user.phone || "—"}
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
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditDialog(user)}
                          data-testid={`button-edit-user-${user.id}`}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenCreditDialog(user)}
                          data-testid={`button-credit-user-${user.id}`}
                        >
                          <DollarSign className="h-4 w-4 mr-1" />
                          Credit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName">Full Name</Label>
              <Input
                id="edit-fullName"
                placeholder="John Doe"
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                data-testid="input-edit-fullname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="user@example.com"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone Number</Label>
              <Input
                id="edit-phone"
                type="tel"
                placeholder="+12025551234"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                data-testid="input-edit-phone"
              />
              <p className="text-xs text-muted-foreground">
                Format: +1234567890 (E.164 format)
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-isAdmin">Admin Access</Label>
              <Switch
                id="edit-isAdmin"
                checked={editForm.isAdmin}
                onCheckedChange={(checked) => setEditForm({ ...editForm, isAdmin: checked })}
                data-testid="switch-edit-admin"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => editMutation.mutate()}
              disabled={!editForm.email || editMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {editMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
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

  const quickStartChecklist = `# Work Digital Credits Hub - Integration Checklist
# ================================================

## STEP 1: Register Your App in Credits Hub (Admin > Apps)
□ Create new app with name, slug, and description
□ Add Production callback URL: https://yourdomain.com/api/auth/callback
□ Add Development callback URL: https://xxx.replit.dev/api/auth/callback
□ Note down the Client ID and Client Secret

## STEP 2: Generate API Key (Admin > API Keys)
□ Select your app from the dropdown
□ Give the key a descriptive name (e.g., "Production Key")
□ Enable scopes: balance:read, credits:debit
□ Copy and securely store the API key (shown only once!)

## STEP 3: Add Environment Variables to Your App
CREDITS_HUB_URL=${baseUrl}
CREDITS_HUB_CLIENT_ID=client_xxxxx
CREDITS_HUB_CLIENT_SECRET=xxxxx
CREDITS_HUB_API_KEY=ch_xxxxx
CREDITS_HUB_CALLBACK_URL=https://yourdomain.com/api/auth/callback

## STEP 4: Implement SSO Login in Your App
1. User clicks "Sign in with Work Digital"
2. Generate PKCE code_verifier (32 random bytes, base64url)
3. Generate code_challenge = SHA256(code_verifier) base64url
4. Store code_verifier in session
5. Redirect to: ${baseUrl}/oauth/authorize?
   - client_id=YOUR_CLIENT_ID
   - redirect_uri=YOUR_CALLBACK_URL
   - response_type=code
   - code_challenge=GENERATED_CHALLENGE
   - code_challenge_method=S256
   - scope=openid profile credits
   - state=RANDOM_CSRF_TOKEN

## STEP 5: Handle OAuth Callback
1. User lands on your callback URL with ?code=xxx&state=xxx
2. Verify state matches what you stored
3. POST to ${baseUrl}/api/oauth/token with:
   {
     "grant_type": "authorization_code",
     "code": "received_code",
     "redirect_uri": "YOUR_CALLBACK_URL",
     "client_id": "YOUR_CLIENT_ID",
     "client_secret": "YOUR_CLIENT_SECRET",
     "code_verifier": "stored_verifier"
   }
4. Response contains: access_token, user info (id, email, fullName)
5. Store user in your session, redirect to dashboard

## STEP 6: Implement Credit Operations
# Check Balance:
POST ${baseUrl}/api/v2/balance
Headers: Authorization: Bearer YOUR_API_KEY
Body: { "user_email": "user@example.com" }

# Debit Credits:
POST ${baseUrl}/api/v2/debit
Headers: Authorization: Bearer YOUR_API_KEY
Body: {
  "user_email": "user@example.com",
  "amount_cents": 100,
  "description": "Feature usage",
  "idempotency_key": "unique-id-for-this-charge"
}

## TESTING CHECKLIST
□ OAuth login flow works in development
□ OAuth login flow works in production
□ Can check user balance via API
□ Can debit credits via API
□ Handles insufficient balance (402) gracefully
□ Handles unauthorized user (403) gracefully
□ Idempotency keys prevent duplicate charges
`;

  const openApiSpec = {
    openapi: "3.0.3",
    info: {
      title: "Work Digital Credits Hub API",
      description: "OAuth2 SSO and B2B Credit Operations API for integrated services. This API allows external applications to authenticate users via OAuth2 with PKCE and manage credit operations (balance checks, debits) for authorized users.",
      version: "2.0.0",
      contact: {
        name: "Work Digital Support",
        url: baseUrl
      }
    },
    servers: [
      {
        url: baseUrl,
        description: "Credits Hub Server"
      }
    ],
    tags: [
      { name: "OAuth2", description: "OAuth2 Authorization Code flow with PKCE" },
      { name: "Credits", description: "B2B Credit operations API" }
    ],
    paths: {
      "/oauth/authorize": {
        get: {
          tags: ["OAuth2"],
          summary: "OAuth2 Authorization Endpoint",
          description: "Redirects user to login/consent page. After authorization, redirects back to redirect_uri with authorization code.",
          parameters: [
            { name: "client_id", in: "query", required: true, schema: { type: "string" }, description: "Your app's client ID" },
            { name: "redirect_uri", in: "query", required: true, schema: { type: "string", format: "uri" }, description: "Must match registered callback URL" },
            { name: "response_type", in: "query", required: true, schema: { type: "string", enum: ["code"] }, description: "Must be 'code'" },
            { name: "code_challenge", in: "query", required: true, schema: { type: "string" }, description: "Base64url SHA256 hash of code_verifier (PKCE)" },
            { name: "code_challenge_method", in: "query", required: true, schema: { type: "string", enum: ["S256"] }, description: "Must be 'S256'" },
            { name: "scope", in: "query", required: false, schema: { type: "string" }, description: "Space-separated: openid profile credits" },
            { name: "state", in: "query", required: false, schema: { type: "string" }, description: "CSRF protection token (recommended)" }
          ],
          responses: {
            "302": { description: "Redirects to login page or back to redirect_uri with code" },
            "400": { description: "Invalid request parameters" }
          }
        }
      },
      "/api/oauth/token": {
        post: {
          tags: ["OAuth2"],
          summary: "Token Exchange Endpoint",
          description: "Exchange authorization code for access token and user info",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["grant_type", "code", "redirect_uri", "client_id", "code_verifier"],
                  properties: {
                    grant_type: { type: "string", enum: ["authorization_code"], description: "Must be 'authorization_code'" },
                    code: { type: "string", description: "Authorization code received from callback" },
                    redirect_uri: { type: "string", format: "uri", description: "Must match the original redirect_uri" },
                    client_id: { type: "string", description: "Your app's client ID" },
                    client_secret: { type: "string", description: "Your app's client secret" },
                    code_verifier: { type: "string", description: "Original PKCE code_verifier (before hashing)" }
                  }
                },
                example: {
                  grant_type: "authorization_code",
                  code: "abc123...",
                  redirect_uri: "https://yourapp.com/api/auth/callback",
                  client_id: "client_xxx",
                  client_secret: "xxx",
                  code_verifier: "random-32-byte-string-base64url"
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Successful token exchange",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      access_token: { type: "string", description: "OAuth access token" },
                      token_type: { type: "string", enum: ["Bearer"] },
                      expires_in: { type: "integer", description: "Token lifetime in seconds" },
                      scope: { type: "string", nullable: true },
                      user: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          email: { type: "string", format: "email" },
                          fullName: { type: "string", nullable: true }
                        }
                      }
                    }
                  },
                  example: {
                    access_token: "abc123...",
                    token_type: "Bearer",
                    expires_in: 3600,
                    scope: "openid profile credits",
                    user: { id: "uuid", email: "user@example.com", fullName: "John Doe" }
                  }
                }
              }
            },
            "400": { description: "Invalid grant, expired code, or PKCE mismatch" },
            "401": { description: "Invalid client credentials" }
          }
        }
      },
      "/api/oauth/userinfo": {
        get: {
          tags: ["OAuth2"],
          summary: "Get User Info",
          description: "Retrieve user profile information using OAuth access token",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "User info",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      sub: { type: "string", description: "User ID" },
                      email: { type: "string", format: "email" },
                      name: { type: "string", nullable: true }
                    }
                  }
                }
              }
            },
            "401": { description: "Invalid or expired token" }
          }
        }
      },
      "/api/v2/balance": {
        post: {
          tags: ["Credits"],
          summary: "Check User Balance",
          description: "Check an authorized user's credit balance. User must have authorized your app.",
          security: [{ apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["user_email"],
                  properties: {
                    user_email: { type: "string", format: "email", description: "Email of the user to check" }
                  }
                },
                example: { user_email: "user@example.com" }
              }
            }
          },
          responses: {
            "200": {
              description: "Balance retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      user_email: { type: "string", format: "email" },
                      balance_cents: { type: "integer", description: "Current balance in cents" },
                      currency: { type: "string", enum: ["USD"] },
                      subscription_status: { type: "string", enum: ["ACTIVE", "PAUSED", "CANCELLED", "PENDING"] }
                    }
                  },
                  example: { user_email: "user@example.com", balance_cents: 5000, currency: "USD", subscription_status: "ACTIVE" }
                }
              }
            },
            "401": { description: "Invalid or missing API key" },
            "403": { description: "User has not authorized this app" },
            "404": { description: "User not found" }
          }
        }
      },
      "/api/v2/debit": {
        post: {
          tags: ["Credits"],
          summary: "Debit User Credits",
          description: "Debit credits from an authorized user's account. Supports idempotency keys to prevent duplicate charges.",
          security: [{ apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["user_email", "amount_cents", "description"],
                  properties: {
                    user_email: { type: "string", format: "email", description: "Email of the user to charge" },
                    amount_cents: { type: "integer", minimum: 1, description: "Amount to debit in cents" },
                    description: { type: "string", description: "Description of the charge" },
                    idempotency_key: { type: "string", description: "Unique key to prevent duplicate charges" }
                  }
                },
                example: { user_email: "user@example.com", amount_cents: 100, description: "Premium feature usage", idempotency_key: "unique-tx-id-123" }
              }
            }
          },
          responses: {
            "200": {
              description: "Debit successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      transaction_id: { type: "string" },
                      amount_cents: { type: "integer" },
                      new_balance_cents: { type: "integer" },
                      auto_topup: {
                        type: "object",
                        nullable: true,
                        properties: {
                          triggered: { type: "boolean" },
                          amount_cents: { type: "integer" }
                        }
                      }
                    }
                  },
                  example: { success: true, transaction_id: "txn_abc123", amount_cents: 100, new_balance_cents: 4900, auto_topup: null }
                }
              }
            },
            "401": { description: "Invalid or missing API key" },
            "402": { description: "Insufficient balance" },
            "403": { description: "User has not authorized this app" },
            "404": { description: "User not found" },
            "409": { description: "Duplicate idempotency_key" }
          }
        }
      },
      "/api/v2/check-authorization": {
        post: {
          tags: ["Credits"],
          summary: "Check User Authorization",
          description: "Check if a user has authorized your app to access their credits",
          security: [{ apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["user_email"],
                  properties: {
                    user_email: { type: "string", format: "email" }
                  }
                },
                example: { user_email: "user@example.com" }
              }
            }
          },
          responses: {
            "200": {
              description: "Authorization status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      authorized: { type: "boolean" },
                      subscription_status: { type: "string", enum: ["ACTIVE", "PAUSED", "CANCELLED", "PENDING"], nullable: true }
                    }
                  },
                  example: { authorized: true, subscription_status: "ACTIVE" }
                }
              }
            },
            "401": { description: "Invalid or missing API key" }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "OAuth2 access token from /api/oauth/token"
        },
        apiKeyAuth: {
          type: "http",
          scheme: "bearer",
          description: "App API key (generated in Admin > API Keys)"
        }
      }
    }
  };

  const openApiSpecString = JSON.stringify(openApiSpec, null, 2);

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Quick Start Checklist
          </CardTitle>
          <CardDescription>
            Copy this complete integration workflow to get started with a new service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <pre className="p-4 rounded-lg bg-background border overflow-x-auto text-xs font-mono max-h-96 overflow-y-auto whitespace-pre-wrap">
              {quickStartChecklist}
            </pre>
            <Button
              variant="default"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => copyToClipboard(quickStartChecklist, "checklist")}
              data-testid="button-copy-checklist"
            >
              {copiedField === "checklist" ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Checklist
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This checklist contains all the steps needed to integrate a new service. Select an app below to see credentials and code examples pre-filled.
          </p>
        </CardContent>
      </Card>

      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            OpenAPI Specification (Machine-Readable)
          </CardTitle>
          <CardDescription>
            Complete OpenAPI 3.0 spec for AI tools and API clients - importable into Postman, Swagger UI, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <pre className="p-4 rounded-lg bg-background border overflow-x-auto text-xs font-mono max-h-72 overflow-y-auto">
              {openApiSpecString}
            </pre>
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => copyToClipboard(openApiSpecString, "openapi")}
                data-testid="button-copy-openapi"
              >
                {copiedField === "openapi" ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy JSON
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">For Replit Agent Integration:</p>
              <p>Paste this OpenAPI spec when instructing the agent to integrate with Credits Hub. It provides exact endpoint definitions, request/response schemas, and authentication requirements that AI tools can parse precisely.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            App-Specific Integration Guide
          </CardTitle>
          <CardDescription>
            Select an app to view its credentials and pre-filled code examples
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
              Select an app above to view its credentials and code examples
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

interface OAuthAuditLog {
  id: string;
  traceId: string;
  event: string;
  clientId: string | null;
  appName: string | null;
  userId: string | null;
  userEmail: string | null;
  redirectUri: string | null;
  scope: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  durationMs: number;
  createdAt: string;
}

function OAuthAuditLogsTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [traceIdFilter, setTraceIdFilter] = useState("");
  const [clientIdFilter, setClientIdFilter] = useState("");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const { toast } = useToast();

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (clientIdFilter) params.set("client_id", clientIdFilter);
    if (traceIdFilter) params.set("trace_id", traceIdFilter);
    return params.toString();
  };

  const queryString = buildQueryString();
  const { data: logs, isLoading, isError, error } = useQuery<OAuthAuditLog[]>({
    queryKey: ["/api/admin/oauth-audit-logs", { clientIdFilter, traceIdFilter }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/oauth-audit-logs?${queryString}`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: traceLogs, isLoading: traceLoading, isError: traceError } = useQuery<OAuthAuditLog[]>({
    queryKey: ["/api/admin/oauth-audit-logs/trace", selectedTraceId],
    enabled: !!selectedTraceId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/oauth-audit-logs/trace/${selectedTraceId}`);
      return res.json();
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SUCCESS": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "FAILURE": return "bg-red-500/10 text-red-600 border-red-500/20";
      case "INFO": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      default: return "bg-gray-500/10 text-gray-600 border-gray-500/20";
    }
  };

  const getEventColor = (event: string) => {
    if (event.includes("FAILED") || event.includes("ERROR")) return "text-red-600";
    if (event.includes("SUCCESS") || event.includes("ISSUED") || event.includes("CREATED")) return "text-green-600";
    return "text-muted-foreground";
  };

  const filteredLogs = logs?.filter(log => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.traceId.toLowerCase().includes(query) ||
      log.event.toLowerCase().includes(query) ||
      log.clientId?.toLowerCase().includes(query) ||
      log.appName?.toLowerCase().includes(query) ||
      log.userEmail?.toLowerCase().includes(query) ||
      log.errorCode?.toLowerCase().includes(query) ||
      log.errorMessage?.toLowerCase().includes(query)
    );
  });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          OAuth Audit Logs
        </CardTitle>
        <CardDescription>
          Monitor OAuth authorization and token exchange flows in real-time
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-oauth-log-search"
            />
          </div>
          <Input
            placeholder="Filter by Trace ID"
            value={traceIdFilter}
            onChange={(e) => setTraceIdFilter(e.target.value)}
            className="w-48"
            data-testid="input-trace-id-filter"
          />
          <Input
            placeholder="Filter by Client ID"
            value={clientIdFilter}
            onChange={(e) => setClientIdFilter(e.target.value)}
            className="w-48"
            data-testid="input-client-id-filter"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2" data-testid="oauth-logs-loading">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-12 text-destructive" data-testid="oauth-logs-error">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Failed to load OAuth audit logs</p>
            <p className="text-sm text-muted-foreground">{error?.message || "Unknown error"}</p>
          </div>
        ) : filteredLogs?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground" data-testid="oauth-logs-empty">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No OAuth audit logs found</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Trace ID</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs?.map((log) => (
                  <TableRow key={log.id} className="text-sm">
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono truncate max-w-[100px]" title={log.traceId}>
                          {log.traceId.substring(0, 20)}...
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(log.traceId)}
                          data-testid={`button-copy-trace-${log.id}`}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setSelectedTraceId(log.traceId)}
                          data-testid={`button-view-trace-${log.id}`}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`font-medium ${getEventColor(log.event)}`}>
                        {log.event}
                      </span>
                    </TableCell>
                    <TableCell>
                      {log.appName ? (
                        <span className="truncate max-w-[100px]" title={log.appName}>
                          {log.appName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.userEmail ? (
                        <span className="truncate max-w-[120px]" title={log.userEmail}>
                          {log.userEmail}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(log.status)}>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.durationMs}ms
                    </TableCell>
                    <TableCell>
                      {log.errorCode ? (
                        <span className="text-xs text-red-600" title={log.errorMessage || ""}>
                          {log.errorCode}
                        </span>
                      ) : log.details ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            try {
                              const parsed = JSON.parse(log.details || "{}");
                              toast({
                                title: "Event Details",
                                description: JSON.stringify(parsed, null, 2),
                              });
                            } catch {
                              toast({ title: "Details", description: log.details || "" });
                            }
                          }}
                          data-testid={`button-details-${log.id}`}
                        >
                          <Info className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <Dialog open={!!selectedTraceId} onOpenChange={() => setSelectedTraceId(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-oauth-trace">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                OAuth Flow Trace
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {selectedTraceId}
              </DialogDescription>
            </DialogHeader>
            {traceLoading ? (
              <div className="space-y-2" data-testid="trace-loading">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : traceError ? (
              <div className="text-center py-6 text-destructive" data-testid="trace-error">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                <p>Failed to load trace logs</p>
              </div>
            ) : (
              <div className="space-y-4" data-testid="trace-logs">
                {traceLogs?.map((log, idx) => (
                  <Card key={log.id} className={`border-l-4 ${log.status === 'SUCCESS' ? 'border-l-green-500' : log.status === 'FAILURE' ? 'border-l-red-500' : 'border-l-blue-500'}`} data-testid={`trace-log-${log.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">{idx + 1}.</span>
                          <span className={`font-medium ${getEventColor(log.event)}`}>{log.event}</span>
                          <Badge className={getStatusColor(log.status)}>{log.status}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{log.durationMs}ms</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {log.appName && (
                          <div>
                            <span className="text-muted-foreground">App: </span>
                            <span>{log.appName}</span>
                          </div>
                        )}
                        {log.userEmail && (
                          <div>
                            <span className="text-muted-foreground">User: </span>
                            <span>{log.userEmail}</span>
                          </div>
                        )}
                        {log.clientId && (
                          <div>
                            <span className="text-muted-foreground">Client ID: </span>
                            <code className="text-xs">{log.clientId}</code>
                          </div>
                        )}
                        {log.scope && (
                          <div>
                            <span className="text-muted-foreground">Scope: </span>
                            <span>{log.scope}</span>
                          </div>
                        )}
                        {log.redirectUri && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Redirect URI: </span>
                            <code className="text-xs break-all">{log.redirectUri}</code>
                          </div>
                        )}
                        {log.errorCode && (
                          <div className="col-span-2 text-red-600">
                            <span className="font-medium">Error: </span>
                            {log.errorCode} - {log.errorMessage}
                          </div>
                        )}
                        {log.details && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Details: </span>
                            <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-x-auto">
                              {JSON.stringify(JSON.parse(log.details), null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {formatTime(log.createdAt)}
                        {log.ipAddress && ` | IP: ${log.ipAddress}`}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

interface PaymentGatewayStatus {
  gateway: "STRIPE" | "PAYPAL" | "COINBASE";
  displayName: string;
  enabled: boolean;
  configured: boolean;
  sandboxMode: boolean;
  supportedMethods: string[];
}

function PaymentGatewaysTab() {
  const { toast } = useToast();

  const { data: gateways, isLoading } = useQuery<PaymentGatewayStatus[]>({
    queryKey: ["/api/admin/payment-gateways"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ gateway, enabled, sandboxMode }: { gateway: string; enabled?: boolean; sandboxMode?: boolean }) => {
      return apiRequest("PATCH", `/api/admin/payment-gateways/${gateway}`, {
        enabled,
        sandboxMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-gateways"] });
      toast({ title: "Settings updated", description: "Payment gateway configuration saved." });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const gatewayIcons: Record<string, any> = {
    STRIPE: () => (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"/>
      </svg>
    ),
    PAYPAL: () => (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c1.91 1.8 2.52 4.66 1.15 8.04-1.527 3.77-4.976 5.757-9.77 5.757H7.88l-1.327 8.401c-.032.202.09.396.292.432.028.005.054.008.08.008h3.872c.433 0 .806-.317.867-.746l.787-4.984c.06-.429.434-.746.867-.746h.544c3.506 0 6.253-1.422 7.058-5.534.336-1.7.17-3.098-.698-4.087z"/>
      </svg>
    ),
    COINBASE: () => (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 19.5c-4.136 0-7.5-3.364-7.5-7.5S7.864 4.5 12 4.5s7.5 3.364 7.5 7.5-3.364 7.5-7.5 7.5zm3.75-10.125h-2.25v1.5h2.25v2.25h-2.25v1.5h2.25v2.25H8.25v-2.25h2.25v-1.5H8.25v-2.25h2.25v-1.5H8.25V6.375h7.5v3z"/>
      </svg>
    ),
  };

  const methodLabels: Record<string, string> = {
    CARD: "Credit/Debit Cards",
    BANK_ACH: "ACH Bank Transfer",
    PAYPAL: "PayPal",
    VENMO: "Venmo",
    CRYPTO: "Cryptocurrency",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Gateways
        </CardTitle>
        <CardDescription>
          Configure which payment methods are available for wallet funding. API keys are managed via environment variables.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {gateways?.map((gateway) => {
              const IconComponent = gatewayIcons[gateway.gateway];
              return (
                <div
                  key={gateway.gateway}
                  className="rounded-lg border p-4 space-y-4"
                  data-testid={`gateway-card-${gateway.gateway.toLowerCase()}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        {IconComponent && <IconComponent />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{gateway.displayName}</h3>
                          {gateway.configured ? (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                              <Check className="h-3 w-3 mr-1" />
                              Configured
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Not Configured
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {gateway.supportedMethods.map((m) => methodLabels[m] || m).join(", ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`enabled-${gateway.gateway}`}
                          checked={gateway.enabled}
                          disabled={!gateway.configured || updateMutation.isPending}
                          onCheckedChange={(checked) =>
                            updateMutation.mutate({ gateway: gateway.gateway, enabled: checked })
                          }
                          data-testid={`switch-enabled-${gateway.gateway.toLowerCase()}`}
                        />
                        <Label htmlFor={`enabled-${gateway.gateway}`} className="text-sm">
                          {gateway.enabled ? "Enabled" : "Disabled"}
                        </Label>
                      </div>
                    </div>
                  </div>
                  
                  {gateway.enabled && gateway.configured && (
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Mode:</span>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={gateway.sandboxMode ? "secondary" : "default"}
                            className="text-xs"
                          >
                            {gateway.sandboxMode ? "Sandbox / Test" : "Live / Production"}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`sandbox-${gateway.gateway}`} className="text-sm text-muted-foreground">
                          Sandbox Mode
                        </Label>
                        <Switch
                          id={`sandbox-${gateway.gateway}`}
                          checked={gateway.sandboxMode}
                          disabled={updateMutation.isPending}
                          onCheckedChange={(checked) =>
                            updateMutation.mutate({ gateway: gateway.gateway, sandboxMode: checked })
                          }
                          data-testid={`switch-sandbox-${gateway.gateway.toLowerCase()}`}
                        />
                      </div>
                    </div>
                  )}

                  {!gateway.configured && (
                    <div className="rounded-md bg-muted p-3 text-sm">
                      <p className="font-medium mb-1">Configuration Required</p>
                      <p className="text-muted-foreground">
                        {gateway.gateway === "STRIPE" && "Stripe is configured via Replit's Stripe connector. Enable it in the Secrets tab."}
                        {gateway.gateway === "PAYPAL" && "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables."}
                        {gateway.gateway === "COINBASE" && "Set COINBASE_COMMERCE_API_KEY environment variable."}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            {(!gateways || gateways.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                No payment gateways configured
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface IntegrationHealthData {
  summary: {
    total_apps: number;
    active_apps: number;
    quarantined_count: number;
    low_health_count: number;
  };
  quarantined_apps: AppHealthInfo[];
  low_health_apps: AppHealthInfo[];
  all_apps: AppHealthInfo[];
}

interface AppHealthInfo {
  app_id: string;
  app_name: string;
  client_id: string;
  is_active: boolean;
  health: {
    score: number;
    quarantined: boolean;
    quarantine_reason: string | null;
    quarantined_at: string | null;
    last_success: string | null;
    last_failure: string | null;
    oauth_success_rate: number | null;
    api_call_success_rate: number | null;
    webhook_success_rate: number | null;
  } | null;
  recent_errors: Array<{
    timestamp: string;
    event: string;
    error_code: string;
    error_class: string;
    trace_id: string;
  }>;
}

function IntegrationHealthTab() {
  const { toast } = useToast();
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const { data: healthData, isLoading, refetch } = useQuery<IntegrationHealthData>({
    queryKey: ["/api/admin/integration-health"],
    refetchInterval: 30000,
  });

  const unquarantineMutation = useMutation({
    mutationFn: async (appId: string) => {
      return apiRequest("POST", `/api/admin/integration-health/${appId}/unquarantine`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integration-health"] });
      toast({ title: "App unquarantined", description: "The app has been removed from quarantine and metrics reset." });
    },
    onError: (error) => {
      toast({
        title: "Failed to unquarantine app",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const getHealthScoreColor = (score: number | null): string => {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getHealthBadge = (health: AppHealthInfo["health"]) => {
    if (!health) {
      return <Badge variant="secondary">No Data</Badge>;
    }
    if (health.quarantined) {
      return <Badge variant="destructive">Quarantined</Badge>;
    }
    if (health.score >= 80) {
      return <Badge variant="default" className="bg-green-600">Healthy</Badge>;
    }
    if (health.score >= 50) {
      return <Badge variant="secondary" className="bg-amber-500 text-white">Degraded</Badge>;
    }
    return <Badge variant="destructive">Critical</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-health-title">Integration Health</h2>
          <p className="text-sm text-muted-foreground">Monitor app connection health and diagnose issues</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          data-testid="button-refresh-health"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <AppWindow className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums" data-testid="text-total-apps">
                      {healthData?.summary.total_apps ?? 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Total Apps</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/20">
                    <HeartPulse className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums text-green-600 dark:text-green-400" data-testid="text-healthy-apps">
                      {(healthData?.summary.active_apps ?? 0) - (healthData?.summary.quarantined_count ?? 0) - (healthData?.summary.low_health_count ?? 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">Healthy</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/20">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400" data-testid="text-degraded-apps">
                      {healthData?.summary.low_health_count ?? 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Degraded</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/20">
                    <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums text-red-600 dark:text-red-400" data-testid="text-quarantined-apps">
                      {healthData?.summary.quarantined_count ?? 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Quarantined</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {healthData?.quarantined_apps && healthData.quarantined_apps.length > 0 && (
            <Card className="border-red-200 dark:border-red-900">
              <CardHeader>
                <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Quarantined Apps
                </CardTitle>
                <CardDescription>These apps have been automatically quarantined due to low health scores.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {healthData.quarantined_apps.map((app) => (
                    <div key={app.app_id} className="rounded-lg border border-red-200 dark:border-red-900 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium" data-testid={`text-app-name-${app.app_id}`}>{app.app_name}</h4>
                          <p className="text-sm text-muted-foreground">Health Score: {app.health?.score ?? "N/A"}%</p>
                          {app.health?.quarantine_reason && (
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">{app.health.quarantine_reason}</p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => unquarantineMutation.mutate(app.app_id)}
                          disabled={unquarantineMutation.isPending}
                          data-testid={`button-unquarantine-${app.app_id}`}
                        >
                          {unquarantineMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Unquarantine
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All Integrations</CardTitle>
              <CardDescription>Health status for all registered apps</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>App</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health Score</TableHead>
                    <TableHead>OAuth Success</TableHead>
                    <TableHead>API Success</TableHead>
                    <TableHead>Webhooks</TableHead>
                    <TableHead>Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthData?.all_apps.map((app) => (
                    <TableRow
                      key={app.app_id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setExpandedApp(expandedApp === app.app_id ? null : app.app_id)}
                      data-testid={`row-app-${app.app_id}`}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{app.app_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{app.client_id.substring(0, 20)}...</p>
                        </div>
                      </TableCell>
                      <TableCell>{getHealthBadge(app.health)}</TableCell>
                      <TableCell>
                        <span className={`font-semibold tabular-nums ${getHealthScoreColor(app.health?.score ?? null)}`}>
                          {app.health?.score ?? "—"}%
                        </span>
                      </TableCell>
                      <TableCell>
                        {app.health?.oauth_success_rate !== null ? (
                          <span className={getHealthScoreColor(app.health?.oauth_success_rate ?? null)}>
                            {app.health?.oauth_success_rate}%
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {app.health?.api_call_success_rate !== null ? (
                          <span className={getHealthScoreColor(app.health?.api_call_success_rate ?? null)}>
                            {app.health?.api_call_success_rate}%
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {app.health?.webhook_success_rate !== null ? (
                          <span className={getHealthScoreColor(app.health?.webhook_success_rate ?? null)}>
                            {app.health?.webhook_success_rate}%
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {app.health?.last_success || app.health?.last_failure ? (
                          new Intl.DateTimeFormat("en-US", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(app.health.last_success || app.health.last_failure!))
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!healthData?.all_apps || healthData.all_apps.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No apps registered
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {expandedApp && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Errors - {healthData?.all_apps.find(a => a.app_id === expandedApp)?.app_name}</CardTitle>
                <CardDescription>Recent OAuth errors for debugging</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Error Code</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Trace ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {healthData?.all_apps
                        .find(a => a.app_id === expandedApp)
                        ?.recent_errors.map((error, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {new Intl.DateTimeFormat("en-US", {
                                dateStyle: "short",
                                timeStyle: "medium",
                              }).format(new Date(error.timestamp))}
                            </TableCell>
                            <TableCell className="font-medium">{error.event}</TableCell>
                            <TableCell>
                              <Badge variant="destructive">{error.error_code}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{error.error_class}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {error.trace_id.substring(0, 20)}...
                            </TableCell>
                          </TableRow>
                        ))}
                      {(!healthData?.all_apps.find(a => a.app_id === expandedApp)?.recent_errors.length) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                            No recent errors
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

interface EmailStatus {
  configured: boolean;
  domain: string;
  fromEmail: string;
}

function EmailTestTab() {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [lastResult, setLastResult] = useState<{ success: boolean; messageId?: string; error?: string } | null>(null);

  const { data: emailStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<EmailStatus>({
    queryKey: ["/api/admin/email/status"],
  });

  const sendTestMutation = useMutation({
    mutationFn: async (data: { to: string; subject?: string; message?: string }) => {
      const response = await apiRequest("POST", "/api/admin/email/test", data);
      return response.json();
    },
    onSuccess: (data) => {
      setLastResult({ success: true, messageId: data.messageId });
      toast({
        title: "Email Sent",
        description: `Test email sent successfully to ${to}`,
      });
    },
    onError: (error: Error) => {
      setLastResult({ success: false, error: error.message });
      toast({
        title: "Failed to Send",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    if (!to.trim()) {
      toast({
        title: "Missing Recipient",
        description: "Please enter a recipient email address",
        variant: "destructive",
      });
      return;
    }
    setLastResult(null);
    sendTestMutation.mutate({
      to: to.trim(),
      subject: subject.trim() || undefined,
      message: message.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Configuration
              </CardTitle>
              <CardDescription>
                Email service status and configuration
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => refetchStatus()}
              data-testid="button-refresh-email-status"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-64" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">Status:</span>
                {emailStatus?.configured ? (
                  <Badge className="bg-green-500/10 text-green-600 border-green-200">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Not Configured
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">Domain:</span>
                <code className="text-sm bg-muted px-2 py-1 rounded" data-testid="text-email-domain">
                  {emailStatus?.domain || "—"}
                </code>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">From Address:</span>
                <code className="text-sm bg-muted px-2 py-1 rounded" data-testid="text-from-email">
                  {emailStatus?.fromEmail || "—"}
                </code>
              </div>
              {!emailStatus?.configured && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200">
                        RESEND_API_KEY not configured
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Add the RESEND_API_KEY secret in the Secrets tab to enable email sending.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Test Email
          </CardTitle>
          <CardDescription>
            Send a test email to verify the email service is working correctly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-email-to">Recipient Email *</Label>
              <Input
                id="test-email-to"
                type="email"
                placeholder="recipient@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                data-testid="input-test-email-to"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-email-subject">Subject (optional)</Label>
              <Input
                id="test-email-subject"
                type="text"
                placeholder="Work Digital - Email Test"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                data-testid="input-test-email-subject"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-email-message">Message (optional)</Label>
              <Textarea
                id="test-email-message"
                placeholder="This is a test email from Work Digital Client Credit Portal."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                data-testid="input-test-email-message"
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={sendTestMutation.isPending || !emailStatus?.configured}
              className="w-full sm:w-auto"
              data-testid="button-send-test-email"
            >
              {sendTestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Test Email
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card className={lastResult.success ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lastResult.success ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Email Sent Successfully
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  Failed to Send Email
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastResult.success ? (
              <div className="space-y-2">
                <p className="text-muted-foreground">The test email was sent successfully.</p>
                {lastResult.messageId && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Message ID:</span>
                    <code className="text-sm bg-muted px-2 py-1 rounded" data-testid="text-message-id">
                      {lastResult.messageId}
                    </code>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-red-600 dark:text-red-400">{lastResult.error}</p>
                <p className="text-sm text-muted-foreground">
                  Check that the RESEND_API_KEY is correctly configured and the domain is verified.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("users");

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

        <StatsCards stats={stats} isLoading={statsLoading} onNavigate={setActiveTab} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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
            <TabsTrigger value="oauth-logs" className="gap-2" data-testid="tab-oauth-logs">
              <Activity className="h-4 w-4" />
              OAuth Logs
            </TabsTrigger>
            <TabsTrigger value="payment-gateways" className="gap-2" data-testid="tab-payment-gateways">
              <CreditCard className="h-4 w-4" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="integration-health" className="gap-2" data-testid="tab-integration-health">
              <HeartPulse className="h-4 w-4" />
              Health
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2" data-testid="tab-email">
              <Mail className="h-4 w-4" />
              Email
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

          <TabsContent value="oauth-logs">
            <OAuthAuditLogsTab />
          </TabsContent>

          <TabsContent value="payment-gateways">
            <PaymentGatewaysTab />
          </TabsContent>

          <TabsContent value="integration-health">
            <IntegrationHealthTab />
          </TabsContent>

          <TabsContent value="email">
            <EmailTestTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
