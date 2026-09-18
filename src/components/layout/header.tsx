"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  LogOut,
  Menu,
  User as UserIcon,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { navForRole } from "@/components/layout/sidebar";
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

  useEffect(() => {
    let active = true;
    api.listNotifications()
      .then((r) => active && setNotifs((r.notifications as NotifItem[]) ?? []))
      .catch(() => {});
    const t = setInterval(() => {
      api.listNotifications()
        .then((r) => active && setNotifs((r.notifications as NotifItem[]) ?? []))
        .catch(() => {});
    }, 30000);
    return () => { active = false; clearInterval(t); };
  }, []);

  const unread = notifs.filter((n) => !n.isRead).length;

  async function handleLogout() {
    try {
      await api.signOut();
    } catch { /* ignore */ }
    logoutClient();
    toast.success("Signed out");
  }

  async function markAllRead() {
    for (const n of notifs.filter((x) => !x.isRead)) {
      try { await api.markNotificationRead(n.id); } catch { /* ignore */ }
    }
    setNotifs((p) => p.map((n) => ({ ...n, isRead: true })));
  }

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const mobileNav = navForRole(user?.role ?? "FISHERMAN");

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
      {/* Mobile menu */}
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
          <nav className="p-3">
            <ul className="space-y-1">
              {mobileNav.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={item.soon}
                      onClick={() => { setView(item.id); setMobileOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                        view === item.id ? "bg-primary/15 text-primary" : "hover:bg-accent",
                        item.soon && "cursor-not-allowed opacity-55"
                      )}
                    >
                      <Icon className="size-4.5" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.soon && <Badge variant="secondary" className="text-[9px]">Soon</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-2">
        <BrandLockup />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-amber-950">
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
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              ) : (
                notifs.slice(0, 12).map((n) => (
                  <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5 px-3 py-2.5">
                    <div className="flex w-full items-center gap-2">
                      <span className={cn("size-2 shrink-0 rounded-full", n.isRead ? "bg-muted-foreground/30" : "bg-primary")} />
                      <span className="text-sm font-medium">{n.title}</span>
                    </div>
                    <p className="pl-4 text-xs text-muted-foreground">{n.message}</p>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {user && <RoleBadge role={user.role} className="hidden sm:inline-flex" />}

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-1.5 sm:px-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{user?.name}</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-1">
              <span className="text-sm">{user?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
              <RoleBadge role={user!.role} className="mt-1 w-fit" />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView("fisherman.profile")}>
              <UserIcon className="mr-2 size-4" /> Profile & Settings
            </DropdownMenuItem>
            {user?.role === "ADMIN" && (
              <DropdownMenuItem onClick={() => setView("admin.settings")}>
                <ShieldCheck className="mr-2 size-4" /> System Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
