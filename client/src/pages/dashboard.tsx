import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
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
} from "lucide-react";
import type { Wallet as WalletType, WalletTransaction, AppSubscription, App } from "@shared/schema";

interface DashboardData {
  wallet: WalletType | null;
  recentTransactions: (WalletTransaction & { app?: App | null })[];
  subscriptions: (AppSubscription & { app: App })[];
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
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          {trend && trendValue && (
            <div
              className={`flex items-center gap-1 text-sm ${
                trend === "up" ? "text-chart-2" : "text-destructive"
              }`}
            >
              {trend === "up" ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {trendValue}
            </div>
          )}
        </div>
        <div className="mt-4 space-y-1">
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
              {value}
            </p>
          )}
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TransactionItem({
  transaction,
}: {
  transaction: WalletTransaction & { app?: App | null };
}) {
  const isCredit = transaction.type === "CREDIT";

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            isCredit ? "bg-chart-2/10" : "bg-destructive/10"
          }`}
        >
          {isCredit ? (
            <ArrowDownRight className="h-4 w-4 text-chart-2" />
          ) : (
            <ArrowUpRight className="h-4 w-4 text-destructive" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium" data-testid={`transaction-desc-${transaction.id}`}>
            {transaction.description}
          </p>
          <p className="text-xs text-muted-foreground">
            {transaction.app?.name || transaction.source.replace(/_/g, " ")} • {formatDate(transaction.createdAt)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-semibold tabular-nums ${
            isCredit ? "text-chart-2" : "text-foreground"
          }`}
          data-testid={`transaction-amount-${transaction.id}`}
        >
          {isCredit ? "+" : "-"}{formatCurrency(transaction.amountCents)}
        </p>
        <Badge
          variant={
            transaction.status === "COMPLETED"
              ? "default"
              : transaction.status === "PENDING"
              ? "secondary"
              : "destructive"
          }
          className="text-xs"
        >
          {transaction.status.toLowerCase()}
        </Badge>
      </div>
    </div>
  );
}

function SubscriptionItem({ subscription }: { subscription: AppSubscription & { app: App } }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <AppWindow className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium" data-testid={`subscription-name-${subscription.id}`}>
            {subscription.app.name}
          </p>
          <p className="text-xs text-muted-foreground">{subscription.app.pricingModel}</p>
        </div>
      </div>
      <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
        {subscription.status}
      </Badge>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              Dashboard
            </h1>
            <p className="text-muted-foreground">
              Overview of your credits and activity
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Link href="/wallet">
              <Button size="sm" data-testid="button-add-funds">
                <Plus className="h-4 w-4 mr-2" />
                Add Funds
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            title="Active Apps"
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
                <CardTitle className="text-lg">Recent Transactions</CardTitle>
                <CardDescription>Your latest credit activity</CardDescription>
              </div>
              <Link href="/wallet">
                <Button variant="ghost" size="sm" data-testid="link-view-all-transactions">
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-lg" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <Skeleton className="h-4 w-16 ml-auto" />
                        <Skeleton className="h-5 w-20 ml-auto" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : data?.recentTransactions && data.recentTransactions.length > 0 ? (
                <div>
                  {data.recentTransactions.map((transaction) => (
                    <TransactionItem key={transaction.id} transaction={transaction} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                    <Activity className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No transactions yet</p>
                  <p className="text-sm text-muted-foreground">
                    Add funds to your wallet to get started
                  </p>
                  <Link href="/wallet">
                    <Button className="mt-4" size="sm" data-testid="button-add-funds-empty">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Funds
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Active Subscriptions</CardTitle>
                <CardDescription>Connected apps</CardDescription>
              </div>
              <Link href="/apps">
                <Button variant="ghost" size="sm" data-testid="link-view-all-apps">
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-lg" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      <Skeleton className="h-5 w-16" />
                    </div>
                  ))}
                </div>
              ) : data?.subscriptions && data.subscriptions.length > 0 ? (
                <div>
                  {data.subscriptions.map((subscription) => (
                    <SubscriptionItem key={subscription.id} subscription={subscription} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                    <AppWindow className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No active apps</p>
                  <p className="text-sm text-muted-foreground">
                    Browse available apps to connect
                  </p>
                  <Link href="/apps">
                    <Button className="mt-4" size="sm" data-testid="button-browse-apps-empty">
                      Browse Apps
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
