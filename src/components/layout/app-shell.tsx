"use client";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { useAppStore, roleCanAccess } from "@/lib/store";
import { UnauthorizedView } from "@/components/auth/unauthorized-view";
import { ModuleRouter } from "@/components/module-router";

/** Views that are publicly accessible without signing in. */
const PUBLIC_MODULE_VIEWS: string[] = [
  "module.oceanographic",
  "module.fisheries",
  "module.biodiversity",
  "module.analysis",
];

export function AppShell() {
  const user = useAppStore((s) => s.user);
  const view = useAppStore((s) => s.view);

  const isPublicModule = PUBLIC_MODULE_VIEWS.includes(view);

  // Unauthenticated users may only see public scientific modules.
  if (!user && !isPublicModule) return null;

  // For signed-in users, enforce role-based access on protected views.
  if (user && !isPublicModule && !roleCanAccess(view, user.role)) {
    return <UnauthorizedView />;
  }

  return (
    <div className="flex min-h-screen flex-col ocean-bg">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto scroll-ocean">
            <ModuleRouter />
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
