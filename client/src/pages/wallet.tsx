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
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Download,
  RefreshCw,
  Zap,
  CreditCard,
  Loader2,
  ChevronDown,
  Settings2,
} from "lucide-react";
import type { Wallet as WalletType, WalletTransaction, PaymentMethod, AutoTopupRule, App } from "@shared/schema";

interface WalletData {
  wallet: WalletType | null;
  transactions: (WalletTransaction & { app?: App | null })[];
  paymentMethods: PaymentMethod[];
  autoTopupRule: AutoTopupRule | null;
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
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function getPaymentMethodIcon(type: string): string {
  switch (type) {
    case "CARD":
      return "💳";
    case "BANK_ACH":
      return "🏦";
    case "PAYPAL":
      return "🅿️";
    case "CRYPTO":
      return "₿";
    default:
      return "💵";
  }
}

function TransactionRow({
  transaction,
}: {
  transaction: WalletTransaction & { app?: App | null };
}) {
  const isCredit = transaction.type === "CREDIT";

  return (
    <div className="flex items-center justify-between py-4 border-b last:border-0">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            isCredit ? "bg-chart-2/10" : "bg-destructive/10"
          }`}
        >
          {isCredit ? (
            <ArrowDownRight className="h-5 w-5 text-chart-2" />
          ) : (
            <ArrowUpRight className="h-5 w-5 text-destructive" />
          )}
        </div>
        <div>
          <p className="font-medium" data-testid={`transaction-desc-${transaction.id}`}>
            {transaction.description}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{transaction.app?.name || transaction.source.replace(/_/g, " ")}</span>
            <span>•</span>
            <span>{formatDate(transaction.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p
          className={`font-semibold tabular-nums ${
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

function AddFundsDialog({
  paymentMethods,
  onSuccess,
}: {
  paymentMethods: PaymentMethod[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const { toast } = useToast();

  const fundMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/wallet/fund", {
        amountCents: Math.round(parseFloat(amount) * 100),
        paymentMethodId: selectedMethod,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Funds added!", description: `${formatCurrency(parseFloat(amount) * 100)} has been added to your wallet.` });
      setOpen(false);
      setAmount("");
      setSelectedMethod("");
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Failed to add funds",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const quickAmounts = [10, 25, 50, 100, 250, 500];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-funds">
          <Plus className="h-4 w-4 mr-2" />
          Add Funds
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Funds to Wallet</DialogTitle>
          <DialogDescription>
            Choose an amount and payment method to add credits
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>Quick amounts</Label>
            <div className="grid grid-cols-3 gap-2">
              {quickAmounts.map((quickAmount) => (
                <Button
                  key={quickAmount}
                  variant={amount === String(quickAmount) ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAmount(String(quickAmount))}
                  data-testid={`button-quick-amount-${quickAmount}`}
                >
                  ${quickAmount}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-amount">Custom amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="custom-amount"
                type="number"
                min="1"
                step="0.01"
                placeholder="0.00"
                className="pl-7"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="input-custom-amount"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payment method</Label>
            {paymentMethods.length > 0 ? (
              <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue placeholder="Select a payment method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      <div className="flex items-center gap-2">
                        <span>{getPaymentMethodIcon(method.type)}</span>
                        <span>
                          {method.brand || method.type} •••• {method.last4}
                        </span>
                        {method.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No payment methods added. Add one in Billing Methods.
              </p>
            )}
          </div>

          <Button
            className="w-full"
            disabled={!amount || !selectedMethod || fundMutation.isPending}
            onClick={() => fundMutation.mutate()}
            data-testid="button-confirm-add-funds"
          >
            {fundMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add {amount ? formatCurrency(parseFloat(amount) * 100) : "$0.00"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AutoTopupDialog({
  paymentMethods,
  currentRule,
  walletId,
}: {
  paymentMethods: PaymentMethod[];
  currentRule: AutoTopupRule | null;
  walletId: string;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(currentRule?.active ?? false);
  const [threshold, setThreshold] = useState(currentRule?.thresholdCents ?? 1000);
  const [topupAmount, setTopupAmount] = useState(currentRule?.topupAmountCents ?? 5000);
  const [selectedMethod, setSelectedMethod] = useState(currentRule?.paymentMethodId ?? "");
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/wallet/auto-topup", {
        thresholdCents: threshold,
        topupAmountCents: topupAmount,
        paymentMethodId: selectedMethod,
        active: enabled,
        walletId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      toast({ title: "Auto-topup saved", description: "Your auto-topup settings have been updated." });
      setOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-auto-topup">
          <Zap className="h-4 w-4 mr-2" />
          Auto-Topup
          {currentRule?.active && (
            <Badge variant="default" className="ml-2 text-xs">
              On
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Auto-Topup</DialogTitle>
          <DialogDescription>
            Automatically add funds when your balance is low
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Auto-Topup</Label>
              <p className="text-sm text-muted-foreground">
                Automatically add funds when balance is low
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="switch-auto-topup"
            />
          </div>

          {enabled && (
            <>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>When balance falls below</Label>
                  <span className="text-sm font-medium">{formatCurrency(threshold)}</span>
                </div>
                <Slider
                  value={[threshold]}
                  onValueChange={(value) => setThreshold(value[0])}
                  min={100}
                  max={10000}
                  step={100}
                  data-testid="slider-threshold"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Top up amount</Label>
                  <span className="text-sm font-medium">{formatCurrency(topupAmount)}</span>
                </div>
                <Slider
                  value={[topupAmount]}
                  onValueChange={(value) => setTopupAmount(value[0])}
                  min={500}
                  max={50000}
                  step={500}
                  data-testid="slider-topup-amount"
                />
              </div>

              <div className="space-y-2">
                <Label>Payment method</Label>
                <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                  <SelectTrigger data-testid="select-topup-payment-method">
                    <SelectValue placeholder="Select a payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.id} value={method.id}>
                        <div className="flex items-center gap-2">
                          <span>{getPaymentMethodIcon(method.type)}</span>
                          <span>
                            {method.brand || method.type} •••• {method.last4}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Button
            className="w-full"
            disabled={enabled && !selectedMethod || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            data-testid="button-save-auto-topup"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WalletPage() {
  const [filter, setFilter] = useState<"all" | "CREDIT" | "DEBIT">("all");
  const { data, isLoading, refetch, isRefetching } = useQuery<WalletData>({
    queryKey: ["/api/wallet"],
  });

  const filteredTransactions = data?.transactions?.filter(
    (t) => filter === "all" || t.type === filter
  ) ?? [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              Wallet & Credits
            </h1>
            <p className="text-muted-foreground">
              Manage your credits and view transaction history
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
            {data?.wallet && (
              <AutoTopupDialog
                paymentMethods={data.paymentMethods}
                currentRule={data.autoTopupRule}
                walletId={data.wallet.id}
              />
            )}
            <AddFundsDialog
              paymentMethods={data?.paymentMethods ?? []}
              onSuccess={() => refetch()}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Wallet className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-32" />
                  ) : (
                    <p className="text-3xl font-semibold tabular-nums" data-testid="text-balance">
                      {formatCurrency(data?.wallet?.balanceCents || 0)}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Currency</span>
                  <span className="font-medium">{data?.wallet?.currency || "USD"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Auto-Topup</span>
                  <Badge variant={data?.autoTopupRule?.active ? "default" : "secondary"}>
                    {data?.autoTopupRule?.active ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                {data?.autoTopupRule?.active && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Threshold</span>
                      <span className="font-medium">
                        {formatCurrency(data.autoTopupRule.thresholdCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Top-up Amount</span>
                      <span className="font-medium">
                        {formatCurrency(data.autoTopupRule.topupAmountCents)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Transaction History</CardTitle>
                <CardDescription>
                  {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-filter">
                      <Filter className="h-4 w-4 mr-2" />
                      {filter === "all" ? "All" : filter === "CREDIT" ? "Credits" : "Debits"}
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setFilter("all")}>
                      All Transactions
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilter("CREDIT")}>
                      Credits Only
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilter("DEBIT")}>
                      Debits Only
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" data-testid="button-export">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <Skeleton className="h-4 w-20 ml-auto" />
                        <Skeleton className="h-5 w-16 ml-auto" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredTransactions.length > 0 ? (
                <div>
                  {filteredTransactions.map((transaction) => (
                    <TransactionRow key={transaction.id} transaction={transaction} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                    <CreditCard className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No transactions found</p>
                  <p className="text-sm text-muted-foreground">
                    {filter !== "all"
                      ? "Try changing your filter"
                      : "Add funds to your wallet to get started"}
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
