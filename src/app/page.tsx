"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppStore, defaultDashboardFor, roleCanAccess } from "@/lib/store";
import { api } from "@/lib/api";
import { LandingView } from "@/components/auth/landing-view";
import { SignInView } from "@/components/auth/sign-in-view";
import { SignUpView } from "@/components/auth/sign-up-view";
import { ForgotPasswordView } from "@/components/auth/forgot-password-view";
import { ResetPasswordView } from "@/components/auth/reset-password-view";
import { UnauthorizedView } from "@/components/auth/unauthorized-view";
import { AppShell } from "@/components/layout/app-shell";

const AUTH_VIEWS = ["landing", "sign-in", "sign-up", "forgot-password", "reset-password", "unauthorized"] as const;

export default function Home() {
  const user = useAppStore((s) => s.user);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const setUser = useAppStore((s) => s.setUser);
  const hydrate = useAppStore((s) => s.hydrate);
  const hydrated = useAppStore((s) => s.hydrated);
  const [booting, setBooting] = useState(true);

  // Hydrate session on first load (session persistence).
  // The cookie is the source of truth; localStorage only mirrors it for UX.
  // If the session is gone server-side, clear the stale local user so we never
  // render an app shell with broken (401) data.
  useEffect(() => {
    let active = true;
    api
      .me()
      .then((r) => {
        if (!active) return;
        setUser(r.user ?? null);
        if (!r.user) {
          // session expired — reset to landing so we don't show a broken shell
          const cur = useAppStore.getState().view;
          if (!(AUTH_VIEWS as readonly string[]).includes(cur)) setView("landing");
        }
        hydrate();
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setView("landing");
          hydrate();
        }
      })
      .finally(() => active && setBooting(false));
    return () => { active = false; };
  }, []);

  // Role-based redirect: ensure a signed-in user lands on an allowed view.
  useEffect(() => {
    if (!hydrated || booting) return;
    if (user) {
      // If on an auth view or an unauthorized view, route to role dashboard.
      const isAuthView = (AUTH_VIEWS as readonly string[]).includes(view);
      if (isAuthView || !roleCanAccess(view as never, user.role)) {
        setView(defaultDashboardFor(user.role));
      }
    } else {
      // Not signed in — allow scientific module exploration or auth views
      const isAuthView = (AUTH_VIEWS as readonly string[]).includes(view);
      const isModuleView = [
        "module.oceanographic",
        "module.fisheries",
        "module.biodiversity",
        "module.analysis",
      ].includes(view);
      if (!isAuthView && !isModuleView) setView("landing");
    }
  }, [hydrated, booting, user]);

  if (booting || !hydrated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center ocean-bg">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Loading Marine Intelligence Platform…</p>
      </div>
    );
  }

  // Not signed in → auth views or public module exploration
  if (!user) {
    switch (view) {
      case "sign-in": return <SignInView />;
      case "sign-up": return <SignUpView />;
      case "forgot-password": return <ForgotPasswordView />;
      case "reset-password": return <ResetPasswordView />;
      case "unauthorized": return <UnauthorizedView />;
      case "module.oceanographic":
      case "module.fisheries":
      case "module.biodiversity":
      case "module.analysis":
        return <AppShell />;
      default: return <LandingView />;
    }
  }

  // Signed in → app shell (AppShell enforces per-view access itself)
  return <AppShell />;
}
