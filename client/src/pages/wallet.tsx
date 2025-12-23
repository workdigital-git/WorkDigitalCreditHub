import { useState, useEffect } from "react";
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
import { Link } from "wouter";
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
import type { Wallet as WalletType, WalletTransaction, PaymentMethod, AutoTopupRule, App, CreditPack } from "@shared/schema";

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

interface PaymentGateway {
  gateway: "STRIPE" | "PAYPAL" | "COINBASE";
  displayName: string;
  enabled: boolean;
  sandboxMode: boolean;
  supportedMethods: string[];
}

function AddFundsDialog({
  paymentMethods,
  onSuccess,
}: {
  paymentMethods: PaymentMethod[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"amount" | "method">("amount");
  const [amount, setAmount] = useState("");
  const [selectedGateway, setSelectedGateway] = useState<string>("");
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [paymentMethodType, setPaymentMethodType] = useState<string>("");
  const { toast } = useToast();

  const { data: gateways, isLoading: gatewaysLoading } = useQuery<PaymentGateway[]>({
    queryKey: ["/api/payment-gateways"],
    enabled: open,
  });

  const enabledGateways = gateways?.filter((g) => g.enabled) ?? [];

  const fundMutation = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(parseFloat(amount) * 100);
      
      if (selectedGateway === "SAVED" && selectedMethod) {
        return apiRequest("POST", "/api/wallet/fund", {
          amountCents,
          paymentMethodId: selectedMethod,
        });
      }

      return apiRequest("POST", "/api/wallet/initiate-payment", {
        amountCents,
        gateway: selectedGateway,
        paymentMethodType: paymentMethodType || undefined,
      });
    },
    onSuccess: async (response) => {
      const data = response as any;
      
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      
      if (selectedGateway !== "SAVED") {
        toast({
          title: "Payment error",
          description: "Unable to start payment process. Please try again.",
          variant: "destructive",
        });
        return;
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Funds added!", description: `${formatCurrency(parseFloat(amount) * 100)} has been added to your wallet.` });
      handleClose();
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Failed to initiate payment",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setOpen(false);
    setStep("amount");
    setAmount("");
    setSelectedGateway("");
    setSelectedMethod("");
    setPaymentMethodType("");
  };

  const quickAmounts = [10, 25, 50, 100, 250, 500];

  const gatewayIcons: Record<string, JSX.Element> = {
    STRIPE: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"/>
      </svg>
    ),
    PAYPAL: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c1.91 1.8 2.52 4.66 1.15 8.04-1.527 3.77-4.976 5.757-9.77 5.757H7.88l-1.327 8.401c-.032.202.09.396.292.432.028.005.054.008.08.008h3.872c.433 0 .806-.317.867-.746l.787-4.984c.06-.429.434-.746.867-.746h.544c3.506 0 6.253-1.422 7.058-5.534.336-1.7.17-3.098-.698-4.087z"/>
      </svg>
    ),
    COINBASE: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 19.5c-4.136 0-7.5-3.364-7.5-7.5S7.864 4.5 12 4.5s7.5 3.364 7.5 7.5-3.364 7.5-7.5 7.5zm3.75-10.125h-2.25v1.5h2.25v2.25h-2.25v1.5h2.25v2.25H8.25v-2.25h2.25v-1.5H8.25v-2.25h2.25v-1.5H8.25V6.375h7.5v3z"/>
      </svg>
    ),
    SAVED: (
      <CreditCard className="h-5 w-5" />
    ),
  };

  const methodLabels: Record<string, string> = {
    CARD: "Credit/Debit Card",
    BANK_ACH: "Bank Account (ACH)",
    PAYPAL: "PayPal Balance",
    VENMO: "Venmo",
    CRYPTO: "Cryptocurrency",
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? setOpen(true) : handleClose()}>
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
            {step === "amount" 
              ? "Choose an amount to add to your wallet" 
              : "Select how you'd like to pay"}
          </DialogDescription>
        </DialogHeader>
        
        {step === "amount" && (
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

            <Button
              className="w-full"
              disabled={!amount || parseFloat(amount) < 1}
              onClick={() => setStep("method")}
              data-testid="button-continue-to-payment"
            >
              Continue to Payment
            </Button>
          </div>
        )}

        {step === "method" && (
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <span className="text-sm font-medium">Amount to add</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatCurrency(parseFloat(amount) * 100)}
              </span>
            </div>

            {gatewaysLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 rounded-lg border bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {paymentMethods.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGateway("SAVED");
                      setPaymentMethodType("");
                    }}
                    className={`w-full p-4 rounded-lg border text-left transition-colors hover-elevate ${
                      selectedGateway === "SAVED" 
                        ? "border-primary bg-primary/5" 
                        : ""
                    }`}
                    data-testid="gateway-saved"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        {gatewayIcons.SAVED}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">Saved Payment Methods</div>
                        <div className="text-sm text-muted-foreground">
                          Use a previously saved card or bank account
                        </div>
                      </div>
                    </div>
                  </button>
                )}

                {enabledGateways.map((gateway) => (
                  <button
                    key={gateway.gateway}
                    type="button"
                    onClick={() => {
                      setSelectedGateway(gateway.gateway);
                      setSelectedMethod("");
                      setPaymentMethodType(gateway.supportedMethods[0] || "");
                    }}
                    className={`w-full p-4 rounded-lg border text-left transition-colors hover-elevate ${
                      selectedGateway === gateway.gateway 
                        ? "border-primary bg-primary/5" 
                        : ""
                    }`}
                    data-testid={`gateway-${gateway.gateway.toLowerCase()}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        {gatewayIcons[gateway.gateway]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{gateway.displayName}</span>
                          {gateway.sandboxMode && (
                            <Badge variant="secondary" className="text-xs">Test Mode</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {gateway.supportedMethods.map((m) => methodLabels[m] || m).join(", ")}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}

                {enabledGateways.length === 0 && paymentMethods.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No payment options available</p>
                    <p className="text-xs">Please contact support for assistance</p>
                  </div>
                )}
              </div>
            )}

            {selectedGateway === "SAVED" && paymentMethods.length > 0 && (
              <div className="space-y-2">
                <Label>Select payment method</Label>
                <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                  <SelectTrigger data-testid="select-payment-method">
                    <SelectValue placeholder="Choose a saved method" />
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
              </div>
            )}

            {selectedGateway && selectedGateway !== "SAVED" && (
              <div className="space-y-2">
                <Label>Payment type</Label>
                <Select value={paymentMethodType} onValueChange={setPaymentMethodType}>
                  <SelectTrigger data-testid="select-payment-type">
                    <SelectValue placeholder="Choose payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    {gateways
                      ?.find((g) => g.gateway === selectedGateway)
                      ?.supportedMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {methodLabels[method] || method}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep("amount")}
                data-testid="button-back"
              >
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={
                  !selectedGateway || 
                  (selectedGateway === "SAVED" && !selectedMethod) ||
                  (selectedGateway !== "SAVED" && !paymentMethodType) ||
                  fundMutation.isPending
                }
                onClick={() => fundMutation.mutate()}
                data-testid="button-confirm-add-funds"
              >
                {fundMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {selectedGateway === "SAVED" ? "Pay Now" : "Continue to Payment"}
              </Button>
            </div>
          </div>
        )}
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
                {paymentMethods.length > 0 ? (
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
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      No payment methods added. Add one to enable auto-topup.
                    </p>
                    <Link href="/billing">
                      <Button variant="outline" className="w-full" data-testid="button-add-payment-method-topup">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Payment Method
                      </Button>
                    </Link>
                  </div>
                )}
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

// Credit Packs Section for Stripe Checkout
function CreditPacksSection() {
  const { toast } = useToast();
  const [purchasingPack, setPurchasingPack] = useState<string | null>(null);
  
  const { data: packs, isLoading: packsLoading } = useQuery<CreditPack[]>({
    queryKey: ["/api/billing/packs"],
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packSku: string) => {
      return apiRequest("POST", "/api/billing/checkout-session", { packSku });
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Error",
          description: "Unable to start checkout. Please try again.",
          variant: "destructive",
        });
        setPurchasingPack(null);
      }
    },
    onError: (error) => {
      toast({
        title: "Purchase failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
      setPurchasingPack(null);
    },
  });

  const handlePurchase = (packSku: string) => {
    setPurchasingPack(packSku);
    purchaseMutation.mutate(packSku);
  };

  if (packsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Credit Packs
          </CardTitle>
          <CardDescription>Purchase credits for your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!packs || packs.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Credit Packs
        </CardTitle>
        <CardDescription>
          Purchase credits instantly with card, Apple Pay, or Google Pay
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {packs.map((pack) => {
            const isPurchasing = purchasingPack === pack.sku;
            const isBestValue = pack.sku === "credits_100" || pack.sku === "credits_250";
            
            return (
              <button
                key={pack.id}
                onClick={() => handlePurchase(pack.sku)}
                disabled={isPurchasing || purchaseMutation.isPending}
                className={`relative p-4 rounded-lg border text-center transition-all hover-elevate ${
                  isBestValue ? "border-primary bg-primary/5" : ""
                } ${isPurchasing ? "opacity-70" : ""}`}
                data-testid={`credit-pack-${pack.sku}`}
              >
                {isBestValue && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs">
                    Popular
                  </Badge>
                )}
                <div className="text-2xl font-bold tabular-nums">
                  {pack.creditsAmount}
                </div>
                <div className="text-sm text-muted-foreground">credits</div>
                <div className="mt-2 font-semibold text-primary">
                  ${(pack.priceCents / 100).toFixed(0)}
                </div>
                {isPurchasing && (
                  <Loader2 className="absolute bottom-2 right-2 h-4 w-4 animate-spin text-primary" />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Secure payment powered by Stripe. All major cards, Apple Pay, and Google Pay accepted.
        </p>
      </CardContent>
    </Card>
  );
}

export default function WalletPage() {
  const [filter, setFilter] = useState<"all" | "CREDIT" | "DEBIT">("all");
  const { toast } = useToast();
  const { data, isLoading, refetch, isRefetching } = useQuery<WalletData>({
    queryKey: ["/api/wallet"],
  });

  // Handle return from payment gateways (Stripe, PayPal, Coinbase)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get("payment");
    const paypalToken = urlParams.get("token"); // PayPal order ID

    const handlePayPalCapture = async (orderId: string) => {
      try {
        const response = await fetch("/api/billing/paypal/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orderId, savePaymentMethod: false }),
        });
        
        if (response.ok) {
          const data = await response.json();
          toast({
            title: "Payment successful!",
            description: `Your credits have been added to your account.`,
          });
          refetch();
        } else {
          const error = await response.json();
          toast({
            title: "Payment failed",
            description: error.message || "Unable to complete PayPal payment.",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Payment error",
          description: "An error occurred while processing your PayPal payment.",
          variant: "destructive",
        });
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    if (payment === "paypal-success" && paypalToken) {
      handlePayPalCapture(paypalToken);
    } else if (payment === "success") {
      toast({
        title: "Payment successful!",
        description: "Your credits have been added to your account.",
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Refresh to show updated balance
      refetch();
    } else if (payment === "cancelled" || payment === "cancel") {
      toast({
        title: "Payment cancelled",
        description: "Your payment was cancelled. No charges were made.",
        variant: "default",
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast, refetch]);

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

        {/* Credit Packs Section */}
        <CreditPacksSection />

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
