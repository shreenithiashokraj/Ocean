"use client";

import { ArrowRight, Waves, ShieldAlert, Sparkles, MapPin } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useAppStore, defaultDashboardFor } from "@/lib/store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useState } from "react";

const DEMO = [
  { role: "ADMIN", email: "admin@fisherman.dev", password: "Admin@123", color: "from-amber-500/20 to-amber-500/5 text-amber-400" },
  { role: "RESEARCHER", email: "researcher@fisherman.dev", password: "Research@123", color: "from-purple-500/20 to-purple-500/5 text-purple-400" },
  { role: "FISHERMAN", email: "fisher@fisherman.dev", password: "Fisher@123", color: "from-cyan-500/20 to-cyan-500/5 text-cyan-400" },
] as const;

export function LandingView() {
  const setView = useAppStore((s) => s.setView);
  const setUser = useAppStore((s) => s.setUser);
  const [loading, setLoading] = useState<string | null>(null);

  async function quickDemo(email: string, password: string, key: string) {
    setLoading(key);
    try {
      const { user } = await api.signIn(email, password);
      setUser(user);
      useAppStore.setState({ view: defaultDashboardFor(user.role) });
      toast.success(`Welcome, ${user.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <AuthShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Welcome to Fisherman Module</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to access your role-based portal, or create a new account.
          </p>
        </div>

        <div className="grid gap-2">
          <Button onClick={() => setView("sign-in")} size="lg" className="w-full">
            Sign in <ArrowRight className="size-4" />
          </Button>
          <Button onClick={() => setView("sign-up")} size="lg" variant="outline" className="w-full">
            Create an account
          </Button>
          <Button onClick={() => setView("forgot-password")} variant="link" size="sm" className="w-full">
            Forgot password?
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              One-click demo accounts
            </span>
          </div>
        </div>

        <div className="grid gap-2">
          {DEMO.map((d) => (
            <button
              key={d.role}
              onClick={() => quickDemo(d.email, d.password, d.role)}
              disabled={loading !== null}
              className={`flex items-center justify-between rounded-lg border border-border/60 bg-gradient-to-r ${d.color} px-4 py-2.5 text-left transition hover:scale-[1.01] disabled:opacity-60`}
            >
              <div>
                <div className="text-sm font-semibold">{d.role}</div>
                <div className="text-[11px] text-muted-foreground">{d.email}</div>
              </div>
              {loading === d.role ? (
                <span className="text-xs">Signing in…</span>
              ) : (
                <ArrowRight className="size-4" />
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-muted-foreground sm:grid-cols-4">
          <Feature icon={Waves} label="Sea data" />
          <Feature icon={ShieldAlert} label="Alerts" />
          <Feature icon={Sparkles} label="AI analysis" />
          <Feature icon={MapPin} label="Maps" />
        </div>
      </div>
    </AuthShell>
  );
}

function Feature({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/40 p-2">
      <Icon className="size-4 text-primary" />
      <span>{label}</span>
    </div>
  );
}
