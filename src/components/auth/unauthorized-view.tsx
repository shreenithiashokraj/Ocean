"use client";

import { ShieldX, ArrowLeft } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

export function UnauthorizedView() {
  const setView = useAppStore((s) => s.setView);
  const user = useAppStore((s) => s.user);
  return (
    <AuthShell>
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <ShieldX className="size-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Access denied</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You don&apos;t have permission to view this page.
            {user && (
              <> You are signed in as <span className="font-medium text-foreground">{user.role}</span>.</>
            )}
          </p>
        </div>
        <Button className="w-full" onClick={() => setView("landing")}>
          <ArrowLeft className="size-4" /> Back to home
        </Button>
      </div>
    </AuthShell>
  );
}
