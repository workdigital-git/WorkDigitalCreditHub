import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  CreditCard,
  AppWindow,
  Activity,
  RefreshCw,
  CheckCircle2,
  CircleDot,
  Power,
  PowerOff,
  Loader2,
  ExternalLink,
  GripVertical,
} from "lucide-react";
import type { Wallet as WalletType, WalletTransaction, AppSubscription, App } from "@shared/schema";
import { useState, useEffect, useCallback } from "react";

interface DashboardData {
  wallet: WalletType | null;
  recentTransactions: (WalletTransaction & { app?: App | null })[];
  subscriptions: (AppSubscription & { app: App })[];
  allApps: App[];
  stats: {
    totalCredits: number;
    monthlySpend: number;
    activeApps: number;
    pendingTransactions: number;
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDateShort(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  isLoading,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  trend?: "up" | "down";
  trendValue?: string;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          {trend && trendValue && (
            <div
              className={`flex items-center gap-1 text-xs sm:text-sm ${
                trend === "up" ? "text-chart-2" : "text-destructive"
              }`}
            >
              {trend === "up" ? (
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              ) : (
                <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" />
              )}
              {trendValue}
            </div>
          )}
        </div>
        <div className="mt-3 sm:mt-4 space-y-0.5 sm:space-y-1">
          {isLoading ? (
            <Skeleton className="h-6 sm:h-8 w-20 sm:w-24" />
          ) : (
            <p className="text-lg sm:text-2xl font-semibold tabular-nums truncate" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
              {value}
            </p>
          )}
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CompactTransactionItem({
  transaction,
}: {
  transaction: WalletTransaction & { app?: App | null };
}) {
  const isCredit = transaction.type === "CREDIT";

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded shrink-0 ${
            isCredit ? "bg-chart-2/10" : "bg-destructive/10"
          }`}
        >
          {isCredit ? (
            <ArrowDownRight className="h-3 w-3 text-chart-2" />
          ) : (
            <ArrowUpRight className="h-3 w-3 text-destructive" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate" data-testid={`transaction-desc-${transaction.id}`}>
            {transaction.description}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {formatDateShort(transaction.createdAt)}
          </p>
        </div>
      </div>
      <p
        className={`text-xs font-semibold tabular-nums shrink-0 ml-2 ${
          isCredit ? "text-chart-2" : "text-foreground"
        }`}
        data-testid={`transaction-amount-${transaction.id}`}
      >
        {isCredit ? "+" : "-"}{formatCurrency(transaction.amountCents)}
      </p>
    </div>
  );
}

function AppCard({
  app,
  subscription,
  onConnect,
  onDisconnect,
  isLoading,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  app: App;
  subscription?: AppSubscription;
  onConnect: () => void;
  onDisconnect: () => void;
  isLoading: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const isConnected = subscription?.status === "ACTIVE" || subscription?.status === "PAUSED";

  return (
    <div 
      className={`p-4 rounded-lg border transition-all duration-200 ${
        isConnected ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'
      } ${isDragging ? 'opacity-50 scale-95 ring-2 ring-primary' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      data-testid={`dashboard-app-card-${app.id}`}
    >
      <div className="flex items-start gap-2">
        <div 
          className="flex items-center justify-center h-10 w-6 cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          data-testid={`dashboard-drag-handle-${app.id}`}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
          isConnected ? 'bg-emerald-500/20' : 'bg-destructive/20'
        }`}>
          <AppWindow className={`h-5 w-5 ${isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-sm truncate" data-testid={`dashboard-app-name-${app.id}`}>
              {app.name}
            </h4>
            <Badge 
              variant={isConnected ? "default" : "destructive"}
              className="text-xs h-5"
            >
              {isConnected ? (
                <>
                  <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                  Connected
                </>
              ) : (
                <>
                  <CircleDot className="h-2.5 w-2.5 mr-1" />
                  Disconnected
                </>
              )}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {app.description}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-3 ml-8">
        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={onDisconnect}
            disabled={isLoading}
            data-testid={`dashboard-disconnect-${app.id}`}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <PowerOff className="h-3 w-3 mr-1" />
            )}
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={onConnect}
            disabled={isLoading}
            data-testid={`dashboard-connect-${app.id}`}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Power className="h-3 w-3 mr-1" />
            )}
            Connect
          </Button>
        )}
        {app.callbackUrl && (
          <Button
            variant="default"
            size="icon"
            className="h-8 w-8"
            asChild
            data-testid={`dashboard-visit-${app.id}`}
          >
            <a href={app.callbackUrl} target="_blank" rel="noopener noreferrer" title="Open in new window">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

const APP_ORDER_KEY = "dashboard-app-order";

function getStoredAppOrder(): string[] {
  try {
    const stored = localStorage.getItem(APP_ORDER_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function storeAppOrder(order: string[]) {
  try {
    localStorage.setItem(APP_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Ignore storage errors
  }
}

export default function DashboardPage() {
  const { data, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });
  const { toast } = useToast();
  const [loadingAppId, setLoadingAppId] = useState<string | null>(null);
  const [appOrder, setAppOrder] = useState<string[]>([]);
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);

  // Initialize app order from localStorage or default to sorted order
  useEffect(() => {
    if (data?.allApps) {
      const storedOrder = getStoredAppOrder();
      const appIds = data.allApps.map(a => a.id);
      
      // Filter stored order to only include existing apps, then add any new apps
      const validStoredOrder = storedOrder.filter(id => appIds.includes(id));
      const newApps = appIds.filter(id => !validStoredOrder.includes(id));
      
      if (validStoredOrder.length > 0) {
        setAppOrder([...validStoredOrder, ...newApps]);
      } else {
        // Default order: connected apps first, then disconnected
        const connectedIds = data.allApps
          .filter(app => {
            const sub = data.subscriptions?.find(s => s.appId === app.id);
            return sub?.status === "ACTIVE" || sub?.status === "PAUSED";
          })
          .map(a => a.id);
        const disconnectedIds = appIds.filter(id => !connectedIds.includes(id));
        setAppOrder([...connectedIds, ...disconnectedIds]);
      }
    }
  }, [data?.allApps, data?.subscriptions]);

  const handleDragStart = useCallback((e: React.DragEvent, appId: string) => {
    setDraggedAppId(appId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", appId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedAppId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetAppId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    
    if (draggedId && draggedId !== targetAppId) {
      setAppOrder(prevOrder => {
        // If prevOrder is empty, use current app IDs as base
        const allAppIds = data?.allApps?.map(app => app.id) ?? [];
        const currentOrder = prevOrder.length > 0 ? prevOrder : allAppIds;
        
        if (currentOrder.length === 0) return prevOrder;
        
        const newOrder = [...currentOrder];
        const draggedIndex = newOrder.indexOf(draggedId);
        const targetIndex = newOrder.indexOf(targetAppId);
        
        if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
          newOrder.splice(draggedIndex, 1);
          newOrder.splice(targetIndex, 0, draggedId);
          storeAppOrder(newOrder);
          toast({
            title: "Apps reordered",
            description: "Your app order has been saved",
          });
          return newOrder;
        }
        
        return prevOrder;
      });
    }
    setDraggedAppId(null);
  }, [toast, data?.allApps]);

  const subscribeMutation = useMutation({
    mutationFn: async (appId: string) => {
      return apiRequest("POST", `/api/apps/${appId}/subscribe`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "App connected!", description: "You've granted this app permission to use your credits." });
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

  const allApps = data?.allApps ?? [];
  
  const connectedApps = allApps.filter((app) => {
    const sub = getSubscription(app.id);
    return sub?.status === "ACTIVE" || sub?.status === "PAUSED";
  });

  const disconnectedApps = allApps.filter((app) => {
    const sub = getSubscription(app.id);
    return !sub || sub.status === "CANCELLED" || sub.status === "EXPIRED" || sub.status === "PENDING";
  });

  // Use custom order from state (persisted in localStorage)
  const sortedApps = appOrder.length > 0
    ? appOrder
        .map(id => allApps.find(app => app.id === id))
        .filter((app): app is App => app !== undefined)
    : [...connectedApps, ...disconnectedApps];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              Welcome to Work Digital
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage your credits and connected services
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="default"
              className="flex-1 sm:flex-none"
              onClick={() => refetch()}
              disabled={isRefetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Link href="/wallet" className="flex-1 sm:flex-none">
              <Button size="default" className="w-full" data-testid="button-add-funds">
                <Plus className="h-4 w-4 mr-2" />
                Add Funds
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Current Balance"
            value={formatCurrency(data?.wallet?.balanceCents || 0)}
            icon={Wallet}
            isLoading={isLoading}
          />
          <StatCard
            title="Monthly Spend"
            value={formatCurrency(data?.stats?.monthlySpend || 0)}
            icon={Activity}
            trend="down"
            trendValue="12%"
            isLoading={isLoading}
          />
          <StatCard
            title="Connected Services"
            value={String(data?.stats?.activeApps || 0)}
            icon={AppWindow}
            isLoading={isLoading}
          />
          <StatCard
            title="Payment Methods"
            value={String(data?.stats?.pendingTransactions || 0)}
            icon={CreditCard}
            isLoading={isLoading}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Services</CardTitle>
                <CardDescription>
                  {connectedApps.length} connected, {disconnectedApps.length} available
                  <span className="hidden sm:inline"> • Drag to reorder</span>
                </CardDescription>
              </div>
              <Link href="/apps">
                <Button variant="ghost" size="sm" data-testid="link-view-all-apps">
                  Manage
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="p-4 rounded-lg border">
                      <div className="flex items-start gap-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      </div>
                      <Skeleton className="h-8 w-full mt-3" />
                    </div>
                  ))}
                </div>
              ) : sortedApps.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {sortedApps.map((app) => {
                    const subscription = getSubscription(app.id);
                    return (
                      <AppCard
                        key={app.id}
                        app={app}
                        subscription={subscription}
                        onConnect={() => {
                          setLoadingAppId(app.id);
                          subscribeMutation.mutate(app.id);
                        }}
                        onDisconnect={() => {
                          setLoadingAppId(app.id);
                          unsubscribeMutation.mutate(app.id);
                        }}
                        isLoading={loadingAppId === app.id}
                        isDragging={draggedAppId === app.id}
                        onDragStart={(e) => handleDragStart(e, app.id)}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, app.id)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                    <AppWindow className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No services available</p>
                  <p className="text-sm text-muted-foreground">
                    Check back later for new services
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <div>
                <CardTitle className="text-base">Recent Activity</CardTitle>
              </div>
              <Link href="/wallet">
                <Button variant="ghost" size="sm" className="h-7 text-xs" data-testid="link-view-all-transactions">
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-6 w-6 rounded" />
                        <div className="space-y-1">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-2 w-12" />
                        </div>
                      </div>
                      <Skeleton className="h-3 w-12" />
                    </div>
                  ))}
                </div>
              ) : data?.recentTransactions && data.recentTransactions.length > 0 ? (
                <div>
                  {data.recentTransactions.slice(0, 6).map((transaction) => (
                    <CompactTransactionItem key={transaction.id} transaction={transaction} />
                  ))}
                  {data.recentTransactions.length > 6 && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      +{data.recentTransactions.length - 6} more transactions
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium">No activity yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add funds to get started
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
