import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  CreditCard,
  Plus,
  Building2,
  Trash2,
  Star,
  Loader2,
  Wallet,
  Bitcoin,
} from "lucide-react";
import { SiPaypal, SiVenmo } from "react-icons/si";
import type { PaymentMethod } from "@shared/schema";

type PaymentMethodType = "CARD" | "BANK_ACH" | "PAYPAL" | "VENMO" | "ZELLE" | "CRYPTO";

const paymentMethodIcons: Record<PaymentMethodType, React.ReactNode> = {
  CARD: <CreditCard className="h-5 w-5" />,
  BANK_ACH: <Building2 className="h-5 w-5" />,
  PAYPAL: <SiPaypal className="h-5 w-5" />,
  VENMO: <SiVenmo className="h-5 w-5" />,
  ZELLE: <Wallet className="h-5 w-5" />,
  CRYPTO: <Bitcoin className="h-5 w-5" />,
};

const paymentMethodLabels: Record<PaymentMethodType, string> = {
  CARD: "Credit/Debit Card",
  BANK_ACH: "Bank Account (ACH)",
  PAYPAL: "PayPal",
  VENMO: "Venmo",
  ZELLE: "Zelle",
  CRYPTO: "Cryptocurrency",
};

function PaymentMethodCard({
  method,
  onSetDefault,
  onDelete,
  isSettingDefault,
  isDeleting,
}: {
  method: PaymentMethod;
  onSetDefault: () => void;
  onDelete: () => void;
  isSettingDefault: boolean;
  isDeleting: boolean;
}) {
  const Icon = paymentMethodIcons[method.type as PaymentMethodType];

  return (
    <Card className="hover-elevate">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              {Icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold" data-testid={`payment-method-name-${method.id}`}>
                  {method.brand || paymentMethodLabels[method.type as PaymentMethodType]}
                </p>
                {method.isDefault && (
                  <Badge variant="default" className="text-xs">
                    <Star className="h-3 w-3 mr-1" />
                    Default
                  </Badge>
                )}
              </div>
              {method.last4 && (
                <p className="text-sm text-muted-foreground">
                  •••• {method.last4}
                </p>
              )}
              {method.nickname && (
                <p className="text-xs text-muted-foreground mt-1">
                  {method.nickname}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {!method.isDefault && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSetDefault}
              disabled={isSettingDefault}
              data-testid={`button-set-default-${method.id}`}
            >
              {isSettingDefault ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Star className="h-4 w-4 mr-2" />
              )}
              Set as Default
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={isDeleting}
                data-testid={`button-delete-${method.id}`}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove payment method?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove this payment method from your account. Any auto-topup
                  rules using this method will be disabled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function AddPaymentMethodDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PaymentMethodType>("CARD");
  const [last4, setLast4] = useState("");
  const [brand, setBrand] = useState("");
  const [nickname, setNickname] = useState("");
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/payment-methods", {
        type,
        provider: type === "CARD" ? "stripe" : type.toLowerCase(),
        externalId: `mock_${Date.now()}`,
        last4: last4 || undefined,
        brand: brand || undefined,
        nickname: nickname || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      toast({ title: "Payment method added", description: "Your new payment method is ready to use." });
      setOpen(false);
      resetForm();
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Failed to add payment method",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setType("CARD");
    setLast4("");
    setBrand("");
    setNickname("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-payment-method">
          <Plus className="h-4 w-4 mr-2" />
          Add Payment Method
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
          <DialogDescription>
            Add a new payment method to fund your wallet
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Payment Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PaymentMethodType)}>
              <SelectTrigger data-testid="select-payment-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(paymentMethodLabels) as [PaymentMethodType, string][]).map(
                  ([key, label]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        {paymentMethodIcons[key]}
                        <span>{label}</span>
                      </div>
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {(type === "CARD" || type === "BANK_ACH") && (
            <>
              <div className="space-y-2">
                <Label htmlFor="last4">Last 4 digits</Label>
                <Input
                  id="last4"
                  placeholder="1234"
                  maxLength={4}
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                  data-testid="input-last4"
                />
              </div>
              {type === "CARD" && (
                <div className="space-y-2">
                  <Label htmlFor="brand">Card Brand</Label>
                  <Select value={brand} onValueChange={setBrand}>
                    <SelectTrigger data-testid="select-brand">
                      <SelectValue placeholder="Select card brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Visa">Visa</SelectItem>
                      <SelectItem value="Mastercard">Mastercard</SelectItem>
                      <SelectItem value="American Express">American Express</SelectItem>
                      <SelectItem value="Discover">Discover</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="nickname">Nickname (optional)</Label>
            <Input
              id="nickname"
              placeholder="e.g., Personal Card"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              data-testid="input-nickname"
            />
          </div>

          <Button
            className="w-full"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending}
            data-testid="button-confirm-add-method"
          >
            {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Payment Method
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BillingPage() {
  const [actionMethodId, setActionMethodId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: paymentMethods, isLoading } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods"],
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/payment-methods/${id}/default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "Default updated", description: "Your default payment method has been changed." });
    },
    onError: (error) => {
      toast({
        title: "Failed to update",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setActionMethodId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/payment-methods/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      toast({ title: "Payment method removed", description: "The payment method has been deleted." });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setActionMethodId(null);
    },
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              Billing Methods
            </h1>
            <p className="text-muted-foreground">
              Manage your payment methods for adding funds
            </p>
          </div>
          <AddPaymentMethodDialog onSuccess={() => {}} />
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Skeleton className="h-8 w-28" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : paymentMethods && paymentMethods.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paymentMethods.map((method) => (
              <PaymentMethodCard
                key={method.id}
                method={method}
                onSetDefault={() => {
                  setActionMethodId(method.id);
                  setDefaultMutation.mutate(method.id);
                }}
                onDelete={() => {
                  setActionMethodId(method.id);
                  deleteMutation.mutate(method.id);
                }}
                isSettingDefault={actionMethodId === method.id && setDefaultMutation.isPending}
                isDeleting={actionMethodId === method.id && deleteMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                <CreditCard className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">No payment methods</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                Add a payment method to start funding your wallet and using credits across your apps.
              </p>
              <AddPaymentMethodDialog onSuccess={() => {}} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Security Information</CardTitle>
            <CardDescription>
              How we keep your payment information safe
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Your payment information is encrypted and securely stored. We never store your
              full card number or bank account details on our servers.
            </p>
            <p>
              We use industry-standard tokenization through trusted payment providers like
              Stripe, PayPal, and others to process your transactions.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
