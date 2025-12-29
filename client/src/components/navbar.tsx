import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Wallet,
  AppWindow,
  CreditCard,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  Book,
  Gift,
} from "lucide-react";
import { WorkDigitalLogo } from "@/components/work-digital-logo";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/wallet", label: "Credits", icon: Wallet },
  { href: "/apps", label: "Services", icon: AppWindow },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/referrals", label: "Referrals", icon: Gift },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getInitials = (name?: string | null, email?: string) => {
    if (name) {
      return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || "U";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <WorkDigitalLogo variant="full" size="md" />
          <div className="hidden sm:block border-l border-border pl-3">
            <span className="text-xs text-muted-foreground font-medium" data-testid="text-logo">
              Credit Portal
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Button>
              </Link>
            );
          })}
          {user?.isAdmin && (
            <Link href="/admin">
              <Button
                variant={location.startsWith("/admin") ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                data-testid="nav-admin"
              >
                <Shield className="h-4 w-4" />
                <span className="hidden lg:inline">Admin</span>
              </Button>
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full"
                data-testid="button-user-menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {getInitials(user?.fullName, user?.email)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <div className="flex items-center gap-2 p-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(user?.fullName, user?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-medium" data-testid="text-user-name">
                    {user?.fullName || "User"}
                  </span>
                  <span className="text-xs text-muted-foreground" data-testid="text-user-email">
                    {user?.email}
                  </span>
                </div>
              </div>
              <DropdownMenuSeparator />
              <Link href="/settings">
                <DropdownMenuItem className="cursor-pointer" data-testid="menu-settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </Link>
              <Link href="/api-docs">
                <DropdownMenuItem className="cursor-pointer" data-testid="menu-api-docs">
                  <Book className="mr-2 h-4 w-4" />
                  API Docs
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={logout}
                data-testid="menu-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="md:hidden border-t bg-background p-3">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className="w-full justify-start gap-3 h-12 text-base"
                    data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
            {user?.isAdmin && (
              <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                <Button
                  variant={location.startsWith("/admin") ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3 h-12 text-base"
                  data-testid="mobile-nav-admin"
                >
                  <Shield className="h-5 w-5" />
                  Admin
                </Button>
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
