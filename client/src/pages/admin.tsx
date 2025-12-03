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
import { Redirect } from "wouter";
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
} from "lucide-react";
import type { User, App, Wallet } from "@shared/schema";

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
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    callbackUrl: "",
    pricingModel: "per_call",
  });

  const { data: apps, isLoading } = useQuery<App[]>({
    queryKey: ["/api/admin/apps"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/apps", formData);
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

                <div className="space-y-2">
                  <Label htmlFor="callbackUrl">Callback URL</Label>
                  <Input
                    id="callbackUrl"
                    value={formData.callbackUrl}
                    onChange={(e) => setFormData({ ...formData, callbackUrl: e.target.value })}
                    placeholder="https://myapp.com/auth/callback"
                    data-testid="input-app-callback"
                  />
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewCredentials(app)}
                        data-testid={`button-view-credentials-${app.id}`}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Credentials
                      </Button>
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
          <TabsList>
            <TabsTrigger value="users" className="gap-2" data-testid="tab-users">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="apps" className="gap-2" data-testid="tab-apps">
              <AppWindow className="h-4 w-4" />
              Apps
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UsersTab />
          </TabsContent>

          <TabsContent value="apps">
            <AppsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
