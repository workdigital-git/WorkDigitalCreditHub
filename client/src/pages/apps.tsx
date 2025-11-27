import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  Clock,
  Star,
} from "lucide-react";
import type { App, AppSubscription } from "@shared/schema";

interface AppsData {
  availableApps: App[];
  subscriptions: (AppSubscription & { app: App })[];
}

function AppCard({
  app,
  subscription,
  onSubscribe,
  onUnsubscribe,
  isLoading,
}: {
  app: App;
  subscription?: AppSubscription;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
  isLoading: boolean;
}) {
  const isSubscribed = subscription?.status === "active";

  return (
    <Card className="overflow-hidden hover-elevate">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <AppWindow className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate" data-testid={`app-name-${app.id}`}>
                {app.name}
              </h3>
              {isSubscribed && (
                <Badge variant="default" className="shrink-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {app.description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Zap className="h-4 w-4" />
            <span>{app.pricingModel.replace(/_/g, " ")}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {isSubscribed ? (
            <Button
              variant="outline"
              className="flex-1"
              onClick={onUnsubscribe}
              disabled={isLoading}
              data-testid={`button-unsubscribe-${app.id}`}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={onSubscribe}
              disabled={isLoading}
              data-testid={`button-subscribe-${app.id}`}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Connect App
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
      </CardContent>
    </Card>
  );
}

function AppDetailsDialog({
  app,
  subscription,
  open,
  onOpenChange,
}: {
  app: App;
  subscription?: AppSubscription;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isSubscribed = subscription?.status === "active";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
              <AppWindow className="h-7 w-7 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">{app.name}</DialogTitle>
              <DialogDescription>
                {app.slug}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">{app.description}</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Pricing Model</p>
              <p className="font-medium">{app.pricingModel.replace(/_/g, " ")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={isSubscribed ? "default" : "secondary"}>
                {isSubscribed ? "Connected" : "Not Connected"}
              </Badge>
            </div>
          </div>

          {isSubscribed && subscription && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Connected since</p>
              <p className="font-medium">
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                }).format(new Date(subscription.subscribedAt))}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AppsPage() {
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
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
      toast({ title: "App connected!", description: "The app is now connected to your account." });
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

  const filteredApps = data?.availableApps?.filter(
    (app) =>
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const getSubscription = (appId: string) =>
    data?.subscriptions?.find((s) => s.appId === appId);

  const activeCount = data?.subscriptions?.filter((s) => s.status === "active").length ?? 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              My Apps
            </h1>
            <p className="text-muted-foreground">
              Connect apps to use your credits
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="text-sm">
              {activeCount} active
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
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

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="mt-4">
                    <Skeleton className="h-9 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredApps.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                subscription={getSubscription(app.id)}
                onSubscribe={() => {
                  setLoadingAppId(app.id);
                  subscribeMutation.mutate(app.id);
                }}
                onUnsubscribe={() => {
                  setLoadingAppId(app.id);
                  unsubscribeMutation.mutate(app.id);
                }}
                isLoading={loadingAppId === app.id}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                <AppWindow className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">
                {search ? "No apps found" : "No apps available"}
              </p>
              <p className="text-sm text-muted-foreground">
                {search
                  ? "Try adjusting your search"
                  : "Check back later for new integrations"}
              </p>
            </CardContent>
          </Card>
        )}

        {selectedApp && (
          <AppDetailsDialog
            app={selectedApp}
            subscription={getSubscription(selectedApp.id)}
            open={!!selectedApp}
            onOpenChange={(open) => !open && setSelectedApp(null)}
          />
        )}
      </div>
    </Layout>
  );
}
