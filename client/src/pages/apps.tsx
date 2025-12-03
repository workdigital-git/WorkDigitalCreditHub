import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AppWindow,
  Search,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  AlertTriangle,
  Shield,
  CreditCard,
  DollarSign,
  Link2,
  Link2Off,
  Compass,
  LayoutGrid,
  Clock,
  TrendingUp,
  CircleDot,
  Power,
  PowerOff,
} from "lucide-react";
import type { App, AppSubscription } from "@shared/schema";

interface AppsData {
  availableApps: App[];
  subscriptions: (AppSubscription & { app: App })[];
}

function formatPrice(cents: number | null): string {
  if (!cents || cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getStatusInfo(subscription?: AppSubscription) {
  if (!subscription || subscription.status === "CANCELLED" || subscription.status === "EXPIRED") {
    return {
      label: "Available",
      variant: "outline" as const,
      icon: CircleDot,
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
    };
  }

  switch (subscription.status) {
    case "ACTIVE":
      return {
        label: "Connected",
        variant: "default" as const,
        icon: CheckCircle2,
        color: "text-emerald-600 dark:text-emerald-400",
        bgColor: "bg-emerald-500/10",
      };
    case "PAUSED":
      return {
        label: "Paused",
        variant: "secondary" as const,
        icon: Clock,
        color: "text-amber-600 dark:text-amber-400",
        bgColor: "bg-amber-500/10",
      };
    default:
      return {
        label: subscription.status,
        variant: "outline" as const,
        icon: CircleDot,
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
      };
  }
}

function AuthorizationDialog({
  app,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: {
  app: App | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  const [consent, setConsent] = useState(false);

  if (!app) return null;

  const permissions = [
    {
      icon: DollarSign,
      title: "Check your credit balance",
      description: "View your current available credits",
    },
    {
      icon: CreditCard,
      title: "Debit credits from your account",
      description: "Charge your account for services you use",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) setConsent(false);
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
              <AppWindow className="h-7 w-7 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Authorize {app.name}</DialogTitle>
              <DialogDescription>
                This app wants to access your account
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  This app can charge credits to your account
                </p>
                <p className="text-muted-foreground mt-1">
                  Review the permissions below before authorizing.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              This app will be able to:
            </h4>
            {permissions.map((perm, idx) => (
              <div key={idx} className="flex items-start gap-3 pl-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <perm.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{perm.title}</p>
                  <p className="text-xs text-muted-foreground">{perm.description}</p>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Pricing</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Monthly</p>
                <p className="text-sm font-medium">{formatPrice(app.monthlyPriceCents)}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Yearly</p>
                <p className="text-sm font-medium">{formatPrice(app.yearlyPriceCents)}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Per Use</p>
                <p className="text-sm font-medium">{formatPrice(app.perUsePriceCents)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Checkbox
              id="consent"
              checked={consent}
              onCheckedChange={(c) => setConsent(c === true)}
              data-testid="checkbox-authorize-consent"
            />
            <Label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
              I understand that <span className="font-semibold">{app.name}</span> will be able to charge
              credits from my account for services I use. I can disconnect this app at any time.
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!consent || isLoading}
            data-testid="button-confirm-authorize"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Authorize {app.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisconnectDialog({
  app,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: {
  app: App | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  if (!app) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
              <Link2Off className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <DialogTitle>Disconnect {app.name}?</DialogTitle>
              <DialogDescription>
                This will revoke the app's access to your account
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            When you disconnect this app:
          </p>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <XCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <span>The app will no longer be able to check your credit balance</span>
            </li>
            <li className="flex items-start gap-2">
              <XCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <span>The app will no longer be able to charge credits from your account</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
              <span>You can reconnect the app at any time</span>
            </li>
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            data-testid="button-confirm-disconnect"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PowerOff className="h-4 w-4 mr-2" />
            )}
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppCard({
  app,
  subscription,
  onConnect,
  onDisconnect,
  isLoading,
  showDetails = false,
}: {
  app: App;
  subscription?: AppSubscription;
  onConnect: () => void;
  onDisconnect: () => void;
  isLoading: boolean;
  showDetails?: boolean;
}) {
  const statusInfo = getStatusInfo(subscription);
  const isConnected = subscription?.status === "ACTIVE" || subscription?.status === "PAUSED";
  const StatusIcon = statusInfo.icon;

  return (
    <Card className="overflow-hidden hover-elevate group">
      <CardContent className="p-0">
        <div className={`h-2 ${isConnected ? 'bg-emerald-500' : 'bg-muted'}`} />
        
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-xl shrink-0 ${statusInfo.bgColor}`}>
              <AppWindow className={`h-7 w-7 ${statusInfo.color}`} />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate" data-testid={`app-name-${app.id}`}>
                  {app.name}
                </h3>
                <Badge variant={statusInfo.variant} className="shrink-0">
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusInfo.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {app.description}
              </p>
            </div>
          </div>

          {showDetails && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Monthly</p>
                <p className="text-sm font-semibold">{formatPrice(app.monthlyPriceCents)}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Yearly</p>
                <p className="text-sm font-semibold">{formatPrice(app.yearlyPriceCents)}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Per Use</p>
                <p className="text-sm font-semibold">{formatPrice(app.perUsePriceCents)}</p>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" />
              <span>{app.pricingModel.replace(/_/g, " ")}</span>
            </div>
            {subscription?.subscribedAt && isConnected && (
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>Connected {new Date(subscription.subscribedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          <Separator className="my-4" />

          <div className="flex items-center gap-2">
            {isConnected ? (
              <Button
                variant="outline"
                className="flex-1"
                onClick={onDisconnect}
                disabled={isLoading}
                data-testid={`button-disconnect-${app.id}`}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PowerOff className="h-4 w-4 mr-2" />
                )}
                Disconnect
              </Button>
            ) : (
              <Button
                className="flex-1"
                onClick={onConnect}
                disabled={isLoading}
                data-testid={`button-connect-${app.id}`}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Power className="h-4 w-4 mr-2" />
                )}
                Connect
              </Button>
            )}
            {app.callbackUrl && (
              <Button
                variant="outline"
                size="icon"
                asChild
                data-testid={`button-visit-${app.id}`}
              >
                <a href={app.callbackUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ type, searchQuery }: { type: 'connected' | 'discover' | 'search', searchQuery?: string }) {
  const configs = {
    connected: {
      icon: Link2,
      title: "No connected apps",
      description: "Connect apps to let them use your credits. Browse available apps in the Discover tab.",
    },
    discover: {
      icon: Compass,
      title: "No apps available",
      description: "Check back later for new app integrations.",
    },
    search: {
      icon: Search,
      title: "No apps found",
      description: `No apps match "${searchQuery}". Try a different search term.`,
    },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-medium">{config.title}</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {config.description}
        </p>
      </CardContent>
    </Card>
  );
}

function StatCard({ icon: Icon, label, value, color }: { 
  icon: typeof CheckCircle2; 
  label: string; 
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function AppsPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("my-apps");
  const [authorizingApp, setAuthorizingApp] = useState<App | null>(null);
  const [disconnectingApp, setDisconnectingApp] = useState<App | null>(null);
  const [loadingAppId, setLoadingAppId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AppsData>({
    queryKey: ["/api/apps"],
  });

  const subscribeMutation = useMutation({
    mutationFn: async (appId: string) => {
      return apiRequest("POST", `/api/apps/${appId}/subscribe`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "App connected!", description: "You've granted this app permission to use your credits." });
      setAuthorizingApp(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to connect",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setLoadingAppId(null);
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (appId: string) => {
      return apiRequest("POST", `/api/apps/${appId}/unsubscribe`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "App disconnected", description: "The app has been removed from your account." });
      setDisconnectingApp(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to disconnect",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setLoadingAppId(null);
    },
  });

  const getSubscription = (appId: string) =>
    data?.subscriptions?.find((s) => s.appId === appId);

  const connectedApps = data?.availableApps?.filter((app) => {
    const sub = getSubscription(app.id);
    return sub?.status === "ACTIVE" || sub?.status === "PAUSED";
  }) ?? [];

  const availableApps = data?.availableApps?.filter((app) => {
    const sub = getSubscription(app.id);
    return !sub || sub.status === "CANCELLED" || sub.status === "EXPIRED" || sub.status === "PENDING";
  }) ?? [];

  const filteredConnectedApps = connectedApps.filter(
    (app) =>
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAvailableApps = availableApps.filter(
    (app) =>
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description.toLowerCase().includes(search.toLowerCase())
  );

  const totalApps = data?.availableApps?.length ?? 0;
  const connectedCount = connectedApps.length;
  const availableCount = availableApps.length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              App Hub
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage connected apps and discover new integrations
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatCard 
            icon={LayoutGrid} 
            label="Total Apps" 
            value={totalApps}
            color="bg-primary/10 text-primary"
          />
          <StatCard 
            icon={CheckCircle2} 
            label="Connected" 
            value={connectedCount}
            color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <StatCard 
            icon={Compass} 
            label="Available" 
            value={availableCount}
            color="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <TabsList>
              <TabsTrigger value="my-apps" className="gap-2" data-testid="tab-my-apps">
                <Link2 className="h-4 w-4" />
                My Apps
                {connectedCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {connectedCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="discover" className="gap-2" data-testid="tab-discover">
                <Compass className="h-4 w-4" />
                Discover
                {availableCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {availableCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search apps..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-apps"
              />
            </div>
          </div>

          <TabsContent value="my-apps" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-0">
                      <Skeleton className="h-2 w-full" />
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          <Skeleton className="h-14 w-14 rounded-xl shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-full" />
                          </div>
                        </div>
                        <div className="mt-4">
                          <Skeleton className="h-9 w-full" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : search && filteredConnectedApps.length === 0 ? (
              <EmptyState type="search" searchQuery={search} />
            ) : filteredConnectedApps.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredConnectedApps.map((app) => (
                  <AppCard
                    key={app.id}
                    app={app}
                    subscription={getSubscription(app.id)}
                    onConnect={() => setAuthorizingApp(app)}
                    onDisconnect={() => setDisconnectingApp(app)}
                    isLoading={loadingAppId === app.id}
                    showDetails
                  />
                ))}
              </div>
            ) : (
              <EmptyState type="connected" />
            )}
          </TabsContent>

          <TabsContent value="discover" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-0">
                      <Skeleton className="h-2 w-full" />
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          <Skeleton className="h-14 w-14 rounded-xl shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-full" />
                          </div>
                        </div>
                        <div className="mt-4">
                          <Skeleton className="h-9 w-full" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : search && filteredAvailableApps.length === 0 ? (
              <EmptyState type="search" searchQuery={search} />
            ) : filteredAvailableApps.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredAvailableApps.map((app) => (
                  <AppCard
                    key={app.id}
                    app={app}
                    subscription={getSubscription(app.id)}
                    onConnect={() => setAuthorizingApp(app)}
                    onDisconnect={() => setDisconnectingApp(app)}
                    isLoading={loadingAppId === app.id}
                    showDetails
                  />
                ))}
              </div>
            ) : (
              <EmptyState type="discover" />
            )}
          </TabsContent>
        </Tabs>

        <AuthorizationDialog
          app={authorizingApp}
          open={!!authorizingApp}
          onOpenChange={(open) => !open && setAuthorizingApp(null)}
          onConfirm={() => {
            if (authorizingApp) {
              setLoadingAppId(authorizingApp.id);
              subscribeMutation.mutate(authorizingApp.id);
            }
          }}
          isLoading={!!authorizingApp && loadingAppId === authorizingApp.id}
        />

        <DisconnectDialog
          app={disconnectingApp}
          open={!!disconnectingApp}
          onOpenChange={(open) => !open && setDisconnectingApp(null)}
          onConfirm={() => {
            if (disconnectingApp) {
              setLoadingAppId(disconnectingApp.id);
              unsubscribeMutation.mutate(disconnectingApp.id);
            }
          }}
          isLoading={!!disconnectingApp && loadingAppId === disconnectingApp.id}
        />
      </div>
    </Layout>
  );
}
