"use client";

import { useState } from "react";
import { ArrowLeft, Lock, Loader2, CheckCircle2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function ResetPasswordView() {
  const setView = useAppStore((s) => s.setView);
  const resetToken = useAppStore((s) => s.resetToken);
  const [token, setToken] = useState(resetToken ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ token?: string; password?: string; confirm?: string }>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (!token) e.token = "Reset token is required";
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
      await api.resetPassword(token, password);
      setDone(true);
      toast.success("Password updated — you can sign in now");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <button onClick={() => setView("landing")} className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to home
      </button>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Reset password</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose a new password for your account.</p>
        </div>
        {done ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="size-7" />
            </div>
            <p className="text-sm text-muted-foreground">Your password has been updated.</p>
            <Button className="w-full" onClick={() => setView("sign-in")}>Sign in</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="token">Reset token</Label>
              <Input id="token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your reset token" className="font-mono text-xs" />
              {errors.token && <p className="text-xs text-destructive">{errors.token}</p>}
              {!resetToken && (
                <p className="text-[11px] text-muted-foreground">
                  No token? Use the forgot-password flow to generate one (demo).
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
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
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
