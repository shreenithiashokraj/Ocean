"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  LogOut,
  Menu,
  User as UserIcon,
  ChevronDown,
  ShieldCheck,
  Sun,
  Moon,
  Home,
  Waves,
  Fish,
  Dna,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAppStore } from "@/lib/store";
import { navForRole, SCIENTIFIC_MODULES_NAV } from "@/components/layout/sidebar";
import { BrandLockup } from "@/components/brand";
import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface NotifItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export function Header() {
  const user = useAppStore((s) => s.user);
  const setView = useAppStore((s) => s.setView);
  const view = useAppStore((s) => s.view);
  const logoutClient = useAppStore((s) => s.logoutClient);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!user) return;
    let active = true;
    api
      .listNotifications()
      .then((r) => active && setNotifs((r.notifications as NotifItem[]) ?? []))
      .catch(() => {});
    const t = setInterval(() => {
      api
        .listNotifications()
        .then((r) => active && setNotifs((r.notifications as NotifItem[]) ?? []))
        .catch(() => {});
    }, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [user]);

  const unread = notifs.filter((n) => !n.isRead).length;

  async function handleLogout() {
    try {
      await api.signOut();
    } catch {
      /* ignore */
    }
    logoutClient();
    toast.success("Signed out");
  }

  async function markAllRead() {
    for (const n of notifs.filter((x) => !x.isRead)) {
      try {
        await api.markNotificationRead(n.id);
      } catch {
        /* ignore */
      }
    }
    setNotifs((p) => p.map((n) => ({ ...n, isRead: true })));
  }

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const mobileRoleNav = navForRole(user?.role);

  return (
    <header className="sticky top-0 z-40 flex h-14 sm:h-16 items-center gap-3 border-b border-border/80 bg-background/95 px-4 backdrop-blur-xl">
      {/* Mobile menu trigger */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center border-b px-4">
            <BrandLockup />
          </div>
          <nav className="p-3 space-y-4">
            <div>
              <button
                type="button"
                onClick={() => {
                  setView("landing");
                  setMobileOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold",
                  view === "landing" ? "bg-primary/15 text-primary" : "hover:bg-accent"
                )}
              >
                <Home className="size-4" />
                <span>Main Platform Dashboard</span>
              </button>
            </div>

            <div>
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Scientific Domains
              </div>
              <ul className="space-y-1">
                {SCIENTIFIC_MODULES_NAV.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setView(item.id);
                          setMobileOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium",
                          view === item.id ? "bg-primary/15 text-primary font-bold" : "hover:bg-accent"
                        )}
                      >
                        <Icon className="size-4" />
                        <span className="flex-1 text-left">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {mobileRoleNav.length > 0 && (
              <div>
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {user?.role} Portal
                </div>
                <ul className="space-y-1">
                  {mobileRoleNav.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setView(item.id);
                            setMobileOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium",
                            view === item.id ? "bg-primary/15 text-primary" : "hover:bg-accent"
                          )}
                        >
                          <Icon className="size-4" />
                          <span className="flex-1 text-left">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Brand logo */}
      <button
        onClick={() => setView("landing")}
        className="flex items-center gap-2 text-left hover:opacity-90 transition"
      >
        <BrandLockup />
      </button>

      {/* Quick Nav Shortcut on Desktop */}
      <div className="hidden xl:flex items-center gap-1 border-l pl-4 ml-2">
        <Button
          variant={view === "module.oceanographic" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("module.oceanographic")}
          className="text-xs h-8 gap-1.5"
        >
          <Waves className="size-3.5 text-sky-600" />
          Oceanographic
        </Button>
        <Button
          variant={view === "module.fisheries" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("module.fisheries")}
          className="text-xs h-8 gap-1.5"
        >
          <Fish className="size-3.5 text-emerald-600" />
          Fisheries
        </Button>
        <Button
          variant={view === "module.biodiversity" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("module.biodiversity")}
          className="text-xs h-8 gap-1.5"
        >
          <Dna className="size-3.5 text-purple-600" />
          Biodiversity
        </Button>
        <Button
          variant={view === "module.analysis" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("module.analysis")}
          className="text-xs h-8 gap-1.5"
        >
          <Sparkles className="size-3.5 text-indigo-600" />
          AI Analysis
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Main Dashboard Return Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView("landing")}
          className="text-xs h-8 hidden sm:flex gap-1.5"
        >
          <Home className="size-3.5" />
          Main Dashboard
        </Button>

        {/* Theme Toggle (Light / Dark) */}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          title="Toggle Light/Dark Theme"
        >
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-sky-400" />
        </Button>

        {/* Notifications (if signed in) */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 relative" aria-label="Notifications">
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-amber-950">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold">Notifications</span>
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-80 overflow-y-auto scroll-ocean">
                {notifs.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
                ) : (
                  notifs.slice(0, 10).map((n) => (
                    <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5 px-3 py-2 text-xs">
                      <div className="flex w-full items-center gap-2 font-medium">
                        <span className={cn("size-2 shrink-0 rounded-full", n.isRead ? "bg-muted-foreground/30" : "bg-primary")} />
                        <span>{n.title}</span>
                      </div>
                      <p className="pl-4 text-muted-foreground">{n.message}</p>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* User profile or Guest Auth buttons */}
        {user ? (
          <>
            <RoleBadge role={user.role} className="hidden sm:inline-flex" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-1.5 sm:px-2 h-8">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-xs font-medium sm:inline">{user.name}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 text-xs">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold">{user.name}</span>
                  <span className="font-normal text-muted-foreground">{user.email}</span>
                  <RoleBadge role={user.role} className="mt-1 w-fit" />
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView("fisherman.profile")}>
                  <UserIcon className="mr-2 size-3.5" /> Profile & Settings
                </DropdownMenuItem>
                {user.role === "ADMIN" && (
                  <DropdownMenuItem onClick={() => setView("admin.settings")}>
                    <ShieldCheck className="mr-2 size-3.5" /> Admin Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 size-3.5" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setView("sign-in")} className="text-xs h-8">
              Sign In
            </Button>
            <Button size="sm" onClick={() => setView("sign-up")} className="text-xs h-8">
              Sign Up
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
