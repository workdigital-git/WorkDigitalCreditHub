import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Gift,
  Copy,
  Check,
  DollarSign,
  Clock,
  CheckCircle2,
  ExternalLink,
  Share2,
} from "lucide-react";
import { useState } from "react";

interface ReferralStats {
  totalReferrals: number;
  qualifiedReferrals: number;
  pendingReferrals: number;
  totalEarnings: number;
  qualificationThreshold: number;
  referrerBonus: number;
  referredBonus: number;
}

interface ReferralData {
  id: string;
  referredUserId: string;
  referralCode: string;
  status: string;
  referredUserFundedCents: number;
  qualificationThresholdCents: number;
  referrerBonusCents: number;
  referredBonusCents: number;
  createdAt: string;
  qualifiedAt: string | null;
  referrerBonusPaidAt: string | null;
  expiresAt: string | null;
  referredUserEmail: string;
  referredUserName: string;
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
  }).format(new Date(date));
}

function getStatusBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge variant="secondary" data-testid="badge-status-pending"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case "QUALIFIED":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid="badge-status-qualified"><CheckCircle2 className="h-3 w-3 mr-1" />Qualified</Badge>;
    case "REWARDED":
      return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-status-rewarded"><Gift className="h-3 w-3 mr-1" />Rewarded</Badge>;
    case "EXPIRED":
      return <Badge variant="destructive" data-testid="badge-status-expired">Expired</Badge>;
    default:
      return <Badge variant="secondary" data-testid="badge-status-unknown">{status}</Badge>;
  }
}

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  isLoading,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle?: string;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
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
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReferralsPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: codeData, isLoading: codeLoading } = useQuery<{ code: string }>({
    queryKey: ["/api/referrals/code"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/referrals/stats"],
  });

  const { data: referrals, isLoading: referralsLoading } = useQuery<ReferralData[]>({
    queryKey: ["/api/referrals/my-referrals"],
  });

  const referralCode = codeData?.code || "";
  const referralLink = referralCode ? `${window.location.origin}/auth?ref=${referralCode}` : "";

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Referral link copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please copy manually",
        variant: "destructive",
      });
    }
  };

  const shareReferralLink = async () => {
    if (navigator.share && referralLink) {
      try {
        await navigator.share({
          title: "Join Work Digital Credits Hub",
          text: `Use my referral code ${referralCode} to get bonus credits when you sign up!`,
          url: referralLink,
        });
      } catch {
        copyToClipboard(referralLink);
      }
    } else {
      copyToClipboard(referralLink);
    }
  };

  return (
    <Layout>
      <div className="space-y-8 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">Referral Program</h1>
            <p className="text-muted-foreground mt-1">
              Invite friends and earn bonus credits when they fund their wallet
            </p>
          </div>
        </div>

        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Your Referral Link
            </CardTitle>
            <CardDescription>
              Share this link with friends. They get {formatCurrency(stats?.referredBonus || 500)} welcome bonus, 
              and you earn {formatCurrency(stats?.referrerBonus || 500)} when they fund {formatCurrency(stats?.qualificationThreshold || 2000)} or more!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              {codeLoading ? (
                <Skeleton className="h-10 flex-1" />
              ) : (
                <Input
                  readOnly
                  value={referralLink}
                  className="font-mono text-sm bg-background"
                  data-testid="input-referral-link"
                />
              )}
              <Button
                size="icon"
                variant="outline"
                onClick={() => copyToClipboard(referralLink)}
                disabled={!referralLink || codeLoading}
                data-testid="button-copy-link"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={shareReferralLink}
                disabled={!referralLink || codeLoading}
                data-testid="button-share-link"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Your Code: <span className="font-mono font-semibold text-foreground" data-testid="text-referral-code">{referralCode || "..."}</span></span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total Referrals"
            value={String(stats?.totalReferrals || 0)}
            icon={Users}
            isLoading={statsLoading}
          />
          <StatCard
            title="Pending"
            value={String(stats?.pendingReferrals || 0)}
            icon={Clock}
            subtitle="Awaiting first funding"
            isLoading={statsLoading}
          />
          <StatCard
            title="Qualified"
            value={String(stats?.qualifiedReferrals || 0)}
            icon={CheckCircle2}
            subtitle="Met funding threshold"
            isLoading={statsLoading}
          />
          <StatCard
            title="Total Earnings"
            value={formatCurrency(stats?.totalEarnings || 0)}
            icon={DollarSign}
            subtitle="From referral bonuses"
            isLoading={statsLoading}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Referrals</CardTitle>
            <CardDescription>
              Track the status of people you've invited
            </CardDescription>
          </CardHeader>
          <CardContent>
            {referralsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : referrals && referrals.length > 0 ? (
              <div className="space-y-3">
                {referrals.map((referral) => (
                  <div
                    key={referral.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-3"
                    data-testid={`row-referral-${referral.id}`}
                  >
                    <div className="space-y-1">
                      <div className="font-medium" data-testid="text-referral-user">{referral.referredUserName}</div>
                      <div className="text-sm text-muted-foreground">{referral.referredUserEmail}</div>
                      <div className="text-xs text-muted-foreground">
                        Joined {formatDate(referral.createdAt)}
                      </div>
                    </div>
                    <div className="flex flex-col sm:items-end gap-2">
                      {getStatusBadge(referral.status)}
                      {referral.status === "PENDING" && (
                        <div className="text-xs text-muted-foreground">
                          Funded: {formatCurrency(referral.referredUserFundedCents)} / {formatCurrency(referral.qualificationThresholdCents)}
                        </div>
                      )}
                      {referral.status === "REWARDED" && referral.referrerBonusPaidAt && (
                        <div className="text-xs text-muted-foreground">
                          Earned {formatCurrency(referral.referrerBonusCents)} on {formatDate(referral.referrerBonusPaidAt)}
                        </div>
                      )}
                      {referral.expiresAt && referral.status === "PENDING" && (
                        <div className="text-xs text-muted-foreground">
                          Expires {formatDate(referral.expiresAt)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-medium text-lg">No Referrals Yet</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Share your referral link above to start earning rewards
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  1
                </div>
                <div>
                  <h4 className="font-medium">Share Your Link</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Send your unique referral link to friends who might benefit from our services
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  2
                </div>
                <div>
                  <h4 className="font-medium">They Sign Up & Fund</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your friend creates an account and receives a {formatCurrency(stats?.referredBonus || 500)} welcome bonus instantly
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  3
                </div>
                <div>
                  <h4 className="font-medium">You Earn Rewards</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    When they fund {formatCurrency(stats?.qualificationThreshold || 2000)} or more, you earn {formatCurrency(stats?.referrerBonus || 500)} in credits
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
