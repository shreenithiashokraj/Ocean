"use client";

import { useState } from "react";
import { ArrowLeft, Mail, Lock, User, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore, defaultDashboardFor, type Role } from "@/lib/store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ROLES: { id: Role; title: string; desc: string }[] = [
  { id: "FISHERMAN", title: "Fisherman", desc: "Sea conditions, alerts, AI analysis, maps" },
  { id: "RESEARCHER", title: "Researcher", desc: "Permitted marine & fishing data" },
  { id: "ADMIN", title: "Admin", desc: "Full system management" },
];

export function SignUpView() {
  const setView = useAppStore((s) => s.setView);
  const setUser = useAppStore((s) => s.setUser);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<Role>("FISHERMAN");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!name || name.length < 2) e.name = "Enter your full name";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = "Enter a valid email";
    if (password.length < 8) e.password = "Min 8 characters";
    if (confirm !== password) e.confirm = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { user } = await api.signUp({ name, email, password, role, phone: phone || undefined });
      setUser(user);
      useAppStore.setState({ view: defaultDashboardFor(user.role) });
      toast.success(`Account created — welcome, ${user.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <button onClick={() => setView("landing")} className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to home
      </button>
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold">Create account</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick a role to access the matching portal.</p>
        </div>

        <div className="space-y-2">
          <Label>Role</Label>
          <div className="grid gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition",
                  role === r.id ? "border-primary bg-primary/10" : "border-border/60 hover:bg-accent"
                )}
              >
                <div>
                  <div className="text-sm font-semibold">{r.title}</div>
                  <div className="text-[11px] text-muted-foreground">{r.desc}</div>
                </div>
                <span className={cn("size-4 rounded-full border-2", role === r.id ? "border-primary bg-primary" : "border-muted-foreground/40")} />
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="pl-9" placeholder="Your name" />
            </div>
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="you@example.com" />
              </div>
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0100" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" placeholder="Min 8 characters" />
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="pl-9" placeholder="Re-enter password" />
            </div>
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button onClick={() => setView("sign-in")} className="font-medium text-primary hover:underline">Sign in</button>
        </p>
      </div>
    </AuthShell>
  );
}
