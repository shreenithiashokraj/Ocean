"use client";

import { useState } from "react";
import { ArrowLeft, Mail, Loader2, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function ForgotPasswordView() {
  const setView = useAppStore((s) => s.setView);
  const setResetToken = useAppStore((s) => s.setResetToken);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Enter a valid email");
      return;
    }
    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      if (res.resetToken) {
        // sandbox demo: backend returns the reset token directly
        setResetToken(res.resetToken);
        toast.success("Reset link generated (demo flow)");
        setDone(true);
      } else {
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
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
          <h2 className="text-2xl font-bold">Forgot password</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ll generate a secure reset link for your account.
          </p>
        </div>
        {done ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <MailCheck className="size-7" />
            </div>
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, a reset link has been generated.
            </p>
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-500">
              Demo flow: in production this link would be emailed. Here you can continue directly to reset your password.
            </p>
            <Button className="w-full" onClick={() => setView("reset-password")}>
              Continue to reset
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="you@example.com" />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <button onClick={() => setView("sign-in")} className="font-medium text-primary hover:underline">Sign in</button>
        </p>
      </div>
    </AuthShell>
  );
}
